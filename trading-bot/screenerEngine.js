/**
 * Screener Engine - FIXED with WebSocket Token Management
 * 
 * Features:
 * - Dynamic token fetch from /api/v1/bullet-public
 * - Token refresh every 24 hours
 * - Adaptive ping interval
 * - Enhanced error handling
 * - All 10 indicators integrated
 */

const WebSocket = require('ws');
const axios = require('axios');
const EventEmitter = require('events');

const RSIIndicator = require('./src/indicators/RSIIndicator');
const MACDIndicator = require('./src/indicators/MACDIndicator');
const WilliamsRIndicator = require('./src/indicators/WilliamsRIndicator');
const AwesomeOscillator = require('./src/indicators/AwesomeOscillator');
const StochasticRSI = require('./src/indicators/StochasticRSI');
const BollingerBands = require('./src/indicators/BollingerBands');
const EMATrend = require('./src/indicators/EMATrend');
const KDJIndicator = require('./src/indicators/KDJIndicator');
const OBVIndicator = require('./src/indicators/OBVIndicator');

// Microstructure Analyzers (LIVE-ONLY)
const BuySellRatioAnalyzer = require('./src/microstructure/BuySellRatioAnalyzer');
const PriceRatioAnalyzer = require('./src/microstructure/PriceRatioAnalyzer');
const FundingRateAnalyzer = require('./src/microstructure/FundingRateAnalyzer');

const SignalGeneratorV2 = require('./src/lib/SignalGeneratorV2');
const timeframeAligner = require('./timeframeAligner');

const KUCOIN_FUTURES_REST = 'https://api-futures.kucoin.com';

class ScreenerEngine extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    
    this.ws = null;
    this.pingTimer = null;
    this.tokenRefreshTimer = null;
    this.connected = false;
    
    this.wsEndpoint = null;
    this.pingInterval = 18000;
    
    this.candleBuffers = {};
    this.indicators = {};
    this.lastSignals = new Map();

    // Microstructure state (per symbol)
    this.microstructure = {};
    this.isLiveMode = process.env.BOT_MODE === 'live';

    this.signalGenerator = new SignalGeneratorV2({
      enhancedMode: true,
      includeMicrostructure: this.isLiveMode  // Enable for live mode
    });
  }

  async getWebSocketEndpoint() {
    try {
      const response = await axios.post(`${KUCOIN_FUTURES_REST}/api/v1/bullet-public`);
      
      if (response.data.code !== '200000') {
        throw new Error(`KuCoin API error: ${response.data.msg}`);
      }
      
      const { token, instanceServers } = response.data.data;
      
      if (!instanceServers || instanceServers.length === 0) {
        throw new Error('No WebSocket servers available');
      }
      
      const server = instanceServers[0];
      
      this.wsEndpoint = `${server.endpoint}?token=${token}`;
      this.pingInterval = server.pingInterval || 18000;
      
      console.log(`[Screener] WebSocket token obtained, ping interval: ${this.pingInterval}ms`);
      
      return {
        url: this.wsEndpoint,
        pingInterval: this.pingInterval,
        tokenExpiresIn: 24 * 60 * 60 * 1000
      };
    } catch (error) {
      console.error('[Screener] Failed to get WebSocket token:', error.message);
      throw error;
    }
  }

  scheduleTokenRefresh() {
    const refreshInterval = 23 * 60 * 60 * 1000;
    
    this.tokenRefreshTimer = setInterval(async () => {
      console.log('[Screener] Refreshing WebSocket token...');
      try {
        await this.reconnectWithNewToken();
      } catch (error) {
        console.error('[Screener] Token refresh failed:', error.message);
      }
    }, refreshInterval);
  }

  async reconnectWithNewToken() {
    if (this.ws) {
      this.ws.close();
    }
    
    await this.getWebSocketEndpoint();
    await this._connectWebSocket();
    this._subscribeAll();
  }

  async start() {
    console.log('[Screener] Starting...');
    
    await this.getWebSocketEndpoint();
    
    this._initializeState();
    await this._connectWebSocket();
    this._subscribeAll();
    this._startHeartbeat();
    this.scheduleTokenRefresh();
    
    console.log('[Screener] Started successfully');
  }

  async stop() {
    console.log('[Screener] Shutting down...');
    
    clearInterval(this.pingTimer);
    clearInterval(this.tokenRefreshTimer);
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.connected = false;
  }

  _initializeState() {
    for (const symbol of this.config.symbols) {
      this.candleBuffers[symbol] = {};
      this.indicators[symbol] = {};

      for (const tf of [this.config.primaryTimeframe, this.config.secondaryTimeframe]) {
        this.candleBuffers[symbol][tf] = [];

        this.indicators[symbol][tf] = {
          rsi: new RSIIndicator(this.config.indicatorParams.rsi),
          macd: new MACDIndicator(this.config.indicatorParams.macd),
          williamsR: new WilliamsRIndicator(this.config.indicatorParams.williamsR),
          ao: new AwesomeOscillator(this.config.indicatorParams.ao),
          stochRSI: new StochasticRSI(this.config.indicatorParams.stochRSI || this.config.indicatorParams.stochastic),
          bollinger: new BollingerBands(this.config.indicatorParams.bollinger),
          emaTrend: new EMATrend(this.config.indicatorParams.emaTrend),
          kdj: new KDJIndicator(this.config.indicatorParams.kdj),
          obv: new OBVIndicator(this.config.indicatorParams.obv)
        };
      }

      // Initialize microstructure analyzers (LIVE mode only)
      if (this.isLiveMode) {
        this.microstructure[symbol] = {
          buySellRatio: new BuySellRatioAnalyzer(this.config.microstructureParams?.buySellRatio || {}),
          priceRatio: new PriceRatioAnalyzer(this.config.microstructureParams?.priceRatio || {}),
          fundingRate: new FundingRateAnalyzer(this.config.microstructureParams?.fundingRate || {})
        };
        // Enable live mode for all analyzers
        this.microstructure[symbol].buySellRatio.enableLiveMode();
        this.microstructure[symbol].priceRatio.enableLiveMode();
        this.microstructure[symbol].fundingRate.enableLiveMode();
      }
    }

    if (this.isLiveMode) {
      console.log('[Screener] Microstructure analyzers initialized (LIVE MODE)');
    }
  }

  async _connectWebSocket() {
    return new Promise((resolve, reject) => {
      if (!this.wsEndpoint) {
        reject(new Error('No WebSocket endpoint available'));
        return;
      }
      
      this.ws = new WebSocket(this.wsEndpoint);
      
      this.ws.on('open', () => {
        this.connected = true;
        console.log('[Screener] WebSocket connected');
        resolve();
      });
      
      this.ws.on('message', (msg) => this._onMessage(msg));
      
      this.ws.on('error', (err) => {
        console.error('[Screener] WS error:', err.message);
      });
      
      this.ws.on('close', async () => {
        console.warn('[Screener] WS closed - reconnecting...');
        this.connected = false;
        clearInterval(this.pingTimer);
        
        await new Promise(r => setTimeout(r, 3000));
        
        try {
          await this.getWebSocketEndpoint();
          await this._connectWebSocket();
          this._subscribeAll();
          this._startHeartbeat();
        } catch (error) {
          console.error('[Screener] Reconnection failed:', error.message);
        }
      });
      
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 30000);
    });
  }

  _startHeartbeat() {
    this.pingTimer = setInterval(() => {
      if (this.ws && this.connected) {
        this.ws.send(JSON.stringify({
          id: Date.now().toString(),
          type: 'ping'
        }));
      }
    }, this.pingInterval);
  }

  _subscribeAll() {
    for (const symbol of this.config.symbols) {
      // Subscribe to candle data
      for (const tf of [this.config.primaryTimeframe, this.config.secondaryTimeframe]) {
        const topic = `/contractMarket/candle:${symbol}_${tf}`;

        this.ws.send(JSON.stringify({
          id: Date.now().toString(),
          type: 'subscribe',
          topic,
          response: true
        }));

        console.log(`[Screener] Subscribed to ${topic}`);
      }

      // Subscribe to microstructure streams (LIVE mode only)
      if (this.isLiveMode) {
        // Trade execution stream (for Buy/Sell Ratio)
        this.ws.send(JSON.stringify({
          id: Date.now().toString(),
          type: 'subscribe',
          topic: `/contractMarket/execution:${symbol}`,
          response: true
        }));

        // Ticker stream (for bid/ask/mark/index prices)
        this.ws.send(JSON.stringify({
          id: Date.now().toString(),
          type: 'subscribe',
          topic: `/contractMarket/tickerV2:${symbol}`,
          response: true
        }));
      }
    }

    if (this.isLiveMode) {
      console.log('[Screener] Subscribed to microstructure streams (execution, ticker)');
    }
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'pong') {
      return;
    }

    if (msg.type === 'ack') {
      console.log(`[Screener] Subscription acknowledged: ${msg.id}`);
      return;
    }

    if (msg.type === 'message') {
      switch (msg.subject) {
        case 'candle.stick':
          this._handleCandle(msg);
          break;
        case 'match':
          // Trade execution for Buy/Sell Ratio
          if (this.isLiveMode) this._handleTradeExecution(msg);
          break;
        case 'tickerV2':
          // Ticker update for Price Ratios
          if (this.isLiveMode) this._handleTicker(msg);
          break;
      }
    }
  }

  _handleTradeExecution(msg) {
    const symbol = msg.data?.symbol;
    if (!symbol || !this.microstructure[symbol]) return;

    const trade = {
      ts: msg.data.ts,
      side: msg.data.side,
      size: msg.data.size,
      price: msg.data.price
    };

    this.microstructure[symbol].buySellRatio.processTrade(trade);
  }

  _handleTicker(msg) {
    const symbol = msg.data?.symbol;
    if (!symbol || !this.microstructure[symbol]) return;

    const prices = {
      bid: msg.data.bestBidPrice,
      ask: msg.data.bestAskPrice,
      index: msg.data.indexPrice,
      mark: msg.data.markPrice,
      last: msg.data.price
    };

    this.microstructure[symbol].priceRatio.update(prices);

    // Update funding rate if available
    if (msg.data.fundingRate !== undefined) {
      this.microstructure[symbol].fundingRate.update({
        currentRate: msg.data.fundingRate,
        predictedRate: msg.data.predictedFundingRate,
        nextFundingTime: msg.data.nextFundingRateTime
      });
    }
  }

  _handleCandle(msg) {
    const topicParts = msg.topic.split(':');
    if (topicParts.length < 2) return;
    
    const [symbol, tf] = topicParts[1].split('_');
    const data = msg.data;
    
    const candle = {
      ts: Number(data.time) * 1000,
      open: Number(data.open),
      close: Number(data.close),
      high: Number(data.high),
      low: Number(data.low),
      volume: Number(data.volume)
    };
    
    const buffer = this.candleBuffers[symbol]?.[tf];
    if (!buffer) return;
    
    buffer.push(candle);
    if (buffer.length > (this.config.internals?.maxCandleBuffer || 1000)) {
      buffer.shift();
    }
    
    const indicatorValues = this._updateIndicators(symbol, tf, candle);
    this._checkAlignment(symbol, tf, indicatorValues);
  }

  _updateIndicators(symbol, tf, candle) {
    const engines = this.indicators[symbol][tf];
    const values = {};
    
    if (engines.rsi) values.rsi = engines.rsi.update({ close: candle.close });
    if (engines.macd) values.macd = engines.macd.update({ close: candle.close });
    if (engines.williamsR) values.williamsR = engines.williamsR.update(candle);
    if (engines.ao) values.ao = engines.ao.update(candle);
    if (engines.stochRSI) values.stochRSI = engines.stochRSI.update(candle);
    if (engines.bollinger) values.bollinger = engines.bollinger.update({ close: candle.close });
    if (engines.emaTrend) values.emaTrend = engines.emaTrend.update({ close: candle.close });
    if (engines.kdj) values.kdj = engines.kdj.update(candle);
    if (engines.obv) values.obv = engines.obv.update(candle);
    
    return values;
  }

  _checkAlignment(symbol, updatedTf, updatedValues) {
    const otherTf = updatedTf === this.config.primaryTimeframe
      ? this.config.secondaryTimeframe
      : this.config.primaryTimeframe;

    const otherEngines = this.indicators[symbol][otherTf];
    if (!otherEngines) return;

    const otherValues = {};
    if (otherEngines.rsi) otherValues.rsi = otherEngines.rsi.getResult();
    if (otherEngines.macd) otherValues.macd = otherEngines.macd.getResult();
    if (otherEngines.williamsR) otherValues.williamsR = otherEngines.williamsR.getResult();
    if (otherEngines.ao) otherValues.ao = otherEngines.ao.getResult();
    if (otherEngines.stochRSI) otherValues.stochRSI = otherEngines.stochRSI.getResult();
    if (otherEngines.bollinger) otherValues.bollinger = otherEngines.bollinger.getResult();
    if (otherEngines.emaTrend) otherValues.emaTrend = otherEngines.emaTrend.getResult();
    if (otherEngines.kdj) otherValues.kdj = otherEngines.kdj.getResult();
    if (otherEngines.obv) otherValues.obv = otherEngines.obv.getResult();

    // Get microstructure data for live mode
    let microstructureData = {};
    if (this.isLiveMode && this.microstructure[symbol]) {
      microstructureData = {
        buySellRatio: this.microstructure[symbol].buySellRatio.getResult(),
        priceRatio: this.microstructure[symbol].priceRatio.getResult(),
        fundingRate: this.microstructure[symbol].fundingRate.getResult()
      };
    }

    const result = timeframeAligner.checkAlignment(
      updatedTf === this.config.primaryTimeframe ? updatedValues : otherValues,
      updatedTf === this.config.primaryTimeframe ? otherValues : updatedValues,
      this.config
    );
    
    if (!result) return;
    
    const dedupKey = `${symbol}:${result.direction}`;
    const cooldown = this.config.internals?.signalCooldownMs || 60000;
    const lastTime = this.lastSignals.get(dedupKey);
    
    if (lastTime && Date.now() - lastTime < cooldown) {
      return;
    }
    
    this.lastSignals.set(dedupKey, Date.now());

    const signal = {
      symbol,
      timeframes: [this.config.primaryTimeframe, this.config.secondaryTimeframe],
      direction: result.direction,
      score: result.score,
      confidence: result.confidence,
      alignment: result.alignment,
      indicators: result.indicators,
      signals: result.signals,
      microstructure: microstructureData,
      hasMicrostructure: this.isLiveMode && Object.keys(microstructureData).length > 0,
      ts: Date.now()
    };

    this._logSignal(signal);
    this.emit('signal', signal);
  }

  _logSignal(signal) {
    const timestamp = new Date(signal.ts).toISOString();
    const direction = signal.direction.toUpperCase();
    const score = signal.score > 0 ? `+${signal.score}` : signal.score;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[SIGNAL] ${timestamp}`);
    console.log(`Symbol: ${signal.symbol}`);
    console.log(`Direction: ${direction} | Score: ${score} | Confidence: ${signal.confidence}%`);
    console.log(`Alignment: ${signal.alignment}`);
    console.log(`Timeframes: ${signal.timeframes.join(', ')}`);
    console.log(`Active signals: ${signal.signals.length}`);

    // Log microstructure data if available
    if (signal.hasMicrostructure) {
      const bs = signal.microstructure.buySellRatio?.value;
      const pr = signal.microstructure.priceRatio?.value;
      const fr = signal.microstructure.fundingRate?.value;

      if (bs?.ratio !== null) {
        console.log(`Buy:Sell Ratio: ${(bs.ratio * 100).toFixed(1)}:${((1 - bs.ratio) * 100).toFixed(1)}`);
      }
      if (pr?.basis !== null) {
        console.log(`Basis: ${pr.basis >= 0 ? '+' : ''}${pr.basis?.toFixed(3)}% | Spread: ${pr.spread?.toFixed(3)}%`);
      }
      if (fr?.currentRate !== null) {
        console.log(`Funding Rate: ${fr.currentRate >= 0 ? '+' : ''}${fr.currentRate?.toFixed(4)}%`);
      }
    }

    console.log(`${'='.repeat(60)}\n`);
  }

  updateSymbols(newSymbols) {
    const added = newSymbols.filter(s => !this.config.symbols.includes(s));
    const removed = this.config.symbols.filter(s => !newSymbols.includes(s));
    
    for (const symbol of added) {
      this.candleBuffers[symbol] = {};
      this.indicators[symbol] = {};
      
      for (const tf of [this.config.primaryTimeframe, this.config.secondaryTimeframe]) {
        this.candleBuffers[symbol][tf] = [];
        this.indicators[symbol][tf] = {
          rsi: new RSIIndicator(this.config.indicatorParams.rsi),
          macd: new MACDIndicator(this.config.indicatorParams.macd),
          williamsR: new WilliamsRIndicator(this.config.indicatorParams.williamsR),
          ao: new AwesomeOscillator(this.config.indicatorParams.ao),
          stochRSI: new StochasticRSI(this.config.indicatorParams.stochRSI || this.config.indicatorParams.stochastic),
          bollinger: new BollingerBands(this.config.indicatorParams.bollinger),
          emaTrend: new EMATrend(this.config.indicatorParams.emaTrend),
          kdj: new KDJIndicator(this.config.indicatorParams.kdj),
          obv: new OBVIndicator(this.config.indicatorParams.obv)
        };
        
        if (this.ws && this.connected) {
          const topic = `/contractMarket/candle:${symbol}_${tf}`;
          this.ws.send(JSON.stringify({
            id: Date.now().toString(),
            type: 'subscribe',
            topic,
            response: true
          }));
        }
      }
    }
    
    for (const symbol of removed) {
      delete this.candleBuffers[symbol];
      delete this.indicators[symbol];
      
      if (this.ws && this.connected) {
        for (const tf of [this.config.primaryTimeframe, this.config.secondaryTimeframe]) {
          const topic = `/contractMarket/candle:${symbol}_${tf}`;
          this.ws.send(JSON.stringify({
            id: Date.now().toString(),
            type: 'unsubscribe',
            topic,
            response: true
          }));
        }
      }
    }
    
    this.config.symbols = newSymbols;
    console.log(`[Screener] Symbols updated: ${newSymbols.length} symbols`);
  }
}

module.exports = ScreenerEngine;
