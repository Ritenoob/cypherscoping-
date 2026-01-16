/**
 * DataAgent - Data Acquisition & WebSocket Management
 * 
 * Handles all external data: WebSocket streams, REST API calls,
 * rate limiting, circuit breaker, candle buffering.
 */

const { AgentBase, AgentUtils, Decimal } = require('./agent-base');
const WebSocket = require('ws');
const axios = require('axios');
const crypto = require('crypto');

const KUCOIN_FUTURES_API = 'https://api-futures.kucoin.com';
const KUCOIN_FUTURES_WS = 'wss://ws-api-futures.kucoin.com';

class DataAgent extends AgentBase {
  constructor(config = {}) {
    super({
      id: 'data-agent',
      name: 'Data Agent',
      options: config
    });

    // API config
    this.apiKey = config.apiKey || process.env.KUCOIN_API_KEY;
    this.apiSecret = config.apiSecret || process.env.KUCOIN_API_SECRET;
    this.apiPassphrase = config.apiPassphrase || process.env.KUCOIN_API_PASSPHRASE;

    // WebSocket state
    this.ws = null;
    this.wsConnected = false;
    this.wsToken = null;
    this.wsEndpoint = null;
    this.pingInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.subscriptions = new Set();

    // Rate limiter (token bucket)
    this.rateLimiter = {
      tokens: 30,
      maxTokens: 30,
      refillRate: 10, // per second
      lastRefill: Date.now()
    };

    // Circuit breaker
    this.circuitBreaker = {
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failures: 0,
      threshold: 5,
      resetTimeout: 60000,
      lastFailure: null
    };

    // Data buffers
    this.candleBuffers = new Map(); // symbol:timeframe -> candles[]
    this.tickerCache = new Map();
    this.orderBookCache = new Map();

    // Callbacks
    this.onCandle = config.onCandle || (() => {});
    this.onTicker = config.onTicker || (() => {});
    this.onOrderBook = config.onOrderBook || (() => {});
  }

  async initialize() {
    this.log('Initializing Data Agent');

    // Message handlers
    this.onMessage('FETCH_CANDLES', this._handleFetchCandles.bind(this));
    this.onMessage('SUBSCRIBE', this._handleSubscribe.bind(this));
    this.onMessage('UNSUBSCRIBE', this._handleUnsubscribe.bind(this));
    this.onMessage('GET_TICKER', this._handleGetTicker.bind(this));
    this.onMessage('GET_INSTRUMENTS', this._handleGetInstruments.bind(this));

    return { ok: true, value: null };
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Connect WebSocket
   */
  async connectWebSocket() {
    try {
      // Get token
      const tokenResult = await this._getWsToken();
      if (!tokenResult.ok) return tokenResult;

      this.wsToken = tokenResult.value.token;
      this.wsEndpoint = tokenResult.value.endpoint;

      // Connect
      return this._connectWs();
    } catch (error) {
      return { ok: false, error: { code: 'WS_CONNECT_FAILED', message: error.message } };
    }
  }

  /**
   * Subscribe to candle stream
   */
  subscribeCandles(symbol, timeframe) {
    const topic = `/contractMarket/limitCandle:${symbol}_${timeframe}`;
    return this._subscribe(topic);
  }

  /**
   * Subscribe to ticker
   */
  subscribeTicker(symbol) {
    const topic = `/contractMarket/tickerV2:${symbol}`;
    return this._subscribe(topic);
  }

  /**
   * Subscribe to order book (level 2)
   */
  subscribeOrderBook(symbol) {
    const topic = `/contractMarket/level2:${symbol}`;
    return this._subscribe(topic);
  }

  /**
   * Fetch historical candles (REST)
   */
  async fetchCandles(symbol, timeframe, limit = 200) {
    const granularity = this._timeframeToGranularity(timeframe);
    const endpoint = `/api/v1/kline/query?symbol=${symbol}&granularity=${granularity}&from=${Date.now() - limit * granularity * 60000}&to=${Date.now()}`;
    
    const result = await this._apiRequest('GET', endpoint);
    if (!result.ok) return result;

    const candles = result.value.map(c => ({
      ts: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5])
    }));

    // Buffer
    const key = `${symbol}:${timeframe}`;
    this.candleBuffers.set(key, candles);

    return { ok: true, value: candles };
  }

  /**
   * Fetch all active contracts
   */
  async fetchInstruments() {
    const result = await this._apiRequest('GET', '/api/v1/contracts/active');
    if (!result.ok) return result;

    return { ok: true, value: result.value };
  }

  /**
   * Fetch ticker for symbol
   */
  async fetchTicker(symbol) {
    const result = await this._apiRequest('GET', `/api/v1/ticker?symbol=${symbol}`);
    if (!result.ok) return result;

    const ticker = {
      symbol,
      price: parseFloat(result.value.price),
      bestBid: parseFloat(result.value.bestBidPrice),
      bestAsk: parseFloat(result.value.bestAskPrice),
      volume24h: parseFloat(result.value.size),
      timestamp: Date.now()
    };

    this.tickerCache.set(symbol, ticker);
    return { ok: true, value: ticker };
  }

  /**
   * Fetch order book
   */
  async fetchOrderBook(symbol, depth = 20) {
    const result = await this._apiRequest('GET', `/api/v1/level2/snapshot?symbol=${symbol}`);
    if (!result.ok) return result;

    const orderBook = {
      symbol,
      bids: result.value.bids.slice(0, depth).map(([price, size]) => ({
        price: parseFloat(price),
        size: parseFloat(size)
      })),
      asks: result.value.asks.slice(0, depth).map(([price, size]) => ({
        price: parseFloat(price),
        size: parseFloat(size)
      })),
      timestamp: Date.now()
    };

    this.orderBookCache.set(symbol, orderBook);
    return { ok: true, value: orderBook };
  }

  /**
   * Get cached candles
   */
  getCandles(symbol, timeframe) {
    return this.candleBuffers.get(`${symbol}:${timeframe}`) || [];
  }

  /**
   * Get cached ticker
   */
  getTicker(symbol) {
    return this.tickerCache.get(symbol);
  }

  // ===========================================================================
  // WEBSOCKET
  // ===========================================================================

  async _getWsToken() {
    const result = await this._apiRequest('POST', '/api/v1/bullet-public');
    if (!result.ok) return result;

    const server = result.value.instanceServers[0];
    return {
      ok: true,
      value: {
        token: result.value.token,
        endpoint: `${server.endpoint}?token=${result.value.token}`
      }
    };
  }

  _connectWs() {
    return new Promise((resolve) => {
      this.ws = new WebSocket(this.wsEndpoint);

      this.ws.on('open', () => {
        this.wsConnected = true;
        this.reconnectAttempts = 0;
        this.log('WebSocket connected');

        // Start ping
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ id: Date.now(), type: 'ping' }));
          }
        }, 20000);

        // Resubscribe
        for (const topic of this.subscriptions) {
          this._sendSubscribe(topic);
        }

        resolve({ ok: true, value: { connected: true } });
      });

      this.ws.on('message', (data) => {
        this._handleWsMessage(data);
      });

      this.ws.on('close', () => {
        this.wsConnected = false;
        this.log('WebSocket closed');
        clearInterval(this.pingInterval);
        this._attemptReconnect();
      });

      this.ws.on('error', (error) => {
        this.logError('WebSocket error', error);
        this.wsConnected = false;
      });

      // Timeout
      setTimeout(() => {
        if (!this.wsConnected) {
          resolve({ ok: false, error: { code: 'WS_TIMEOUT', message: 'Connection timeout' } });
        }
      }, 10000);
    });
  }

  _handleWsMessage(data) {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'pong') return;
      if (msg.type === 'welcome') return;
      if (msg.type === 'ack') return;

      if (msg.type === 'message' && msg.topic) {
        const { topic, data: payload } = msg;

        // Candle
        if (topic.includes('/limitCandle:')) {
          const [symbol, tf] = topic.split(':')[1].split('_');
          const candle = {
            ts: payload.time,
            open: parseFloat(payload.open),
            high: parseFloat(payload.high),
            low: parseFloat(payload.low),
            close: parseFloat(payload.close),
            volume: parseFloat(payload.volume)
          };
          this._updateCandleBuffer(symbol, tf, candle);
          this.onCandle(symbol, tf, candle);
          this.emit('candle', { symbol, timeframe: tf, candle });
        }

        // Ticker
        if (topic.includes('/tickerV2:')) {
          const symbol = topic.split(':')[1];
          const ticker = {
            symbol,
            price: parseFloat(payload.price),
            bestBid: parseFloat(payload.bestBidPrice),
            bestAsk: parseFloat(payload.bestAskPrice),
            timestamp: Date.now()
          };
          this.tickerCache.set(symbol, ticker);
          this.onTicker(symbol, ticker);
          this.emit('ticker', ticker);
        }

        // Order book
        if (topic.includes('/level2:')) {
          const symbol = topic.split(':')[1];
          this.emit('orderbook', { symbol, data: payload });
        }
      }
    } catch (error) {
      this.logError('WS message parse error', error);
    }
  }

  _updateCandleBuffer(symbol, timeframe, candle) {
    const key = `${symbol}:${timeframe}`;
    let buffer = this.candleBuffers.get(key) || [];

    // Update or append
    if (buffer.length > 0 && buffer[buffer.length - 1].ts === candle.ts) {
      buffer[buffer.length - 1] = candle;
    } else {
      buffer.push(candle);
      if (buffer.length > 1000) buffer.shift();
    }

    this.candleBuffers.set(key, buffer);
  }

  _subscribe(topic) {
    this.subscriptions.add(topic);
    if (this.wsConnected) {
      this._sendSubscribe(topic);
    }
    return { ok: true, value: { topic } };
  }

  _sendSubscribe(topic) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        id: Date.now(),
        type: 'subscribe',
        topic,
        privateChannel: false,
        response: true
      }));
    }
  }

  _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logError('Max reconnect attempts reached');
      this.emit('disconnected', { permanent: true });
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connectWebSocket(), delay);
  }

  // ===========================================================================
  // REST API
  // ===========================================================================

  async _apiRequest(method, endpoint, body = null) {
    // Circuit breaker check
    if (this.circuitBreaker.state === 'OPEN') {
      if (Date.now() - this.circuitBreaker.lastFailure > this.circuitBreaker.resetTimeout) {
        this.circuitBreaker.state = 'HALF_OPEN';
      } else {
        return { ok: false, error: { code: 'CIRCUIT_OPEN', message: 'Circuit breaker open' } };
      }
    }

    // Rate limit check
    if (!this._consumeToken()) {
      return { ok: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } };
    }

    try {
      const url = `${KUCOIN_FUTURES_API}${endpoint}`;
      const headers = this._buildHeaders(method, endpoint, body);

      const response = await axios({
        method,
        url,
        headers,
        data: body,
        timeout: 10000
      });

      // Success - reset circuit breaker
      if (this.circuitBreaker.state === 'HALF_OPEN') {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failures = 0;
      }

      return { ok: true, value: response.data.data };

    } catch (error) {
      this._recordFailure();
      
      const status = error.response?.status;
      const message = error.response?.data?.msg || error.message;

      return { ok: false, error: { code: `API_ERROR_${status || 'UNKNOWN'}`, message } };
    }
  }

  _buildHeaders(method, endpoint, body) {
    const timestamp = Date.now();
    const headers = {
      'Content-Type': 'application/json',
      'KC-API-TIMESTAMP': timestamp
    };

    if (this.apiKey && this.apiSecret) {
      const strToSign = `${timestamp}${method}${endpoint}${body ? JSON.stringify(body) : ''}`;
      const signature = crypto.createHmac('sha256', this.apiSecret).update(strToSign).digest('base64');
      const passphrase = crypto.createHmac('sha256', this.apiSecret).update(this.apiPassphrase || '').digest('base64');

      headers['KC-API-KEY'] = this.apiKey;
      headers['KC-API-SIGN'] = signature;
      headers['KC-API-PASSPHRASE'] = passphrase;
      headers['KC-API-KEY-VERSION'] = '2';
    }

    return headers;
  }

  // ===========================================================================
  // RATE LIMITER
  // ===========================================================================

  _consumeToken() {
    this._refillTokens();
    
    if (this.rateLimiter.tokens >= 1) {
      this.rateLimiter.tokens--;
      return true;
    }
    return false;
  }

  _refillTokens() {
    const now = Date.now();
    const elapsed = (now - this.rateLimiter.lastRefill) / 1000;
    const refill = elapsed * this.rateLimiter.refillRate;
    
    this.rateLimiter.tokens = Math.min(
      this.rateLimiter.maxTokens,
      this.rateLimiter.tokens + refill
    );
    this.rateLimiter.lastRefill = now;
  }

  // ===========================================================================
  // CIRCUIT BREAKER
  // ===========================================================================

  _recordFailure() {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
      this.circuitBreaker.state = 'OPEN';
      this.logWarn('Circuit breaker OPEN');
    }
  }

  // ===========================================================================
  // UTILS
  // ===========================================================================

  _timeframeToGranularity(tf) {
    const map = {
      '1min': 1, '5min': 5, '15min': 15, '30min': 30,
      '1hour': 60, '2hour': 120, '4hour': 240, '8hour': 480,
      '12hour': 720, '1day': 1440
    };
    return map[tf] || 15;
  }

  // ===========================================================================
  // MESSAGE HANDLERS
  // ===========================================================================

  async _handleFetchCandles(payload) {
    return this.fetchCandles(payload.symbol, payload.timeframe, payload.limit);
  }

  async _handleSubscribe(payload) {
    const { type, symbol, timeframe } = payload;
    if (type === 'candle') return this.subscribeCandles(symbol, timeframe);
    if (type === 'ticker') return this.subscribeTicker(symbol);
    if (type === 'orderbook') return this.subscribeOrderBook(symbol);
    return { ok: false, error: { code: 'INVALID_TYPE', message: `Unknown type: ${type}` } };
  }

  async _handleUnsubscribe(payload) {
    this.subscriptions.delete(payload.topic);
    return { ok: true, value: null };
  }

  async _handleGetTicker(payload) {
    return this.fetchTicker(payload.symbol);
  }

  async _handleGetInstruments() {
    return this.fetchInstruments();
  }

  // ===========================================================================
  // HEALTH
  // ===========================================================================

  async performHealthCheck() {
    return {
      status: this.wsConnected ? 'HEALTHY' : 'DEGRADED',
      details: {
        wsConnected: this.wsConnected,
        circuitBreaker: this.circuitBreaker.state,
        rateLimitTokens: Math.floor(this.rateLimiter.tokens),
        subscriptions: this.subscriptions.size,
        bufferedSymbols: this.candleBuffers.size
      }
    };
  }

  async cleanup() {
    clearInterval(this.pingInterval);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = DataAgent;
