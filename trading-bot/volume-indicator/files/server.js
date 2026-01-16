const express = require('express');
const WebSocket = require('ws');
const crypto = require('crypto');
const axios = require('axios');
const { EventEmitter } = require('events');
const config = require('./config');
require('dotenv').config();

const app = express();
app.use(express.json());

// KuCoin Futures API Configuration
const KUCOIN_API_KEY = process.env.KUCOIN_API_KEY;
const KUCOIN_API_SECRET = process.env.KUCOIN_API_SECRET;
const KUCOIN_API_PASSPHRASE = process.env.KUCOIN_API_PASSPHRASE;
const KUCOIN_FUTURES_BASE_URL = 'https://api-futures.kucoin.com';

// Validate API credentials
if (!KUCOIN_API_KEY || !KUCOIN_API_SECRET || !KUCOIN_API_PASSPHRASE) {
  console.error('ERROR: Missing KuCoin API credentials');
  console.error('Please set: KUCOIN_API_KEY, KUCOIN_API_SECRET, KUCOIN_API_PASSPHRASE');
  process.exit(1);
}

// Market data storage
const marketDataCache = {
  XBTUSDTM: { prices: [], volumes: [], timestamps: [] },
  ETHUSDTM: { prices: [], volumes: [], timestamps: [] },
  SOLUSDTM: { prices: [], volumes: [], timestamps: [] }
};

// Position tracking
const activePositions = new Map();
const positionMonitor = new EventEmitter();

// WebSocket clients
const wsClients = new Set();

// KuCoin Futures API Helper
class KuCoinFuturesAPI {
  constructor(apiKey, apiSecret, passphrase) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.passphrase = passphrase;
    this.baseURL = KUCOIN_FUTURES_BASE_URL;
  }

  generateSignature(timestamp, method, endpoint, body = '') {
    const strToSign = timestamp + method + endpoint + body;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(strToSign)
      .digest('base64');
    return signature;
  }

  getHeaders(method, endpoint, body = '') {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(timestamp, method, endpoint, body);
    const passphraseSignature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(this.passphrase)
      .digest('base64');

    return {
      'KC-API-KEY': this.apiKey,
      'KC-API-SIGN': signature,
      'KC-API-TIMESTAMP': timestamp,
      'KC-API-PASSPHRASE': passphraseSignature,
      'KC-API-KEY-VERSION': '2',
      'Content-Type': 'application/json'
    };
  }

  async request(method, endpoint, data = null) {
    try {
      const body = data ? JSON.stringify(data) : '';
      const headers = this.getHeaders(method, endpoint, body);
      const url = `${this.baseURL}${endpoint}`;

      const config = {
        method,
        url,
        headers,
        ...(data && { data })
      };

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`KuCoin API Error [${method} ${endpoint}]:`, error.response?.data || error.message);
      throw error;
    }
  }

  // Get account overview
  async getAccountOverview(currency = 'USDT') {
    return this.request('GET', `/api/v1/account-overview?currency=${currency}`);
  }

  // Get position details
  async getPosition(symbol) {
    return this.request('GET', `/api/v1/position?symbol=${symbol}`);
  }

  // Get all positions
  async getAllPositions() {
    return this.request('GET', '/api/v1/positions');
  }

  // Place order
  async placeOrder(params) {
    return this.request('POST', '/api/v1/orders', params);
  }

  // Cancel order
  async cancelOrder(orderId) {
    return this.request('DELETE', `/api/v1/orders/${orderId}`);
  }

  // Get order details
  async getOrder(orderId) {
    return this.request('GET', `/api/v1/orders/${orderId}`);
  }

  // Set auto-deposit margin
  async setAutoDepositMargin(symbol, status) {
    return this.request('POST', '/api/v1/position/margin/auto-deposit-status', {
      symbol,
      status
    });
  }

  // Add margin to position
  async addMargin(symbol, margin) {
    return this.request('POST', '/api/v1/position/margin/deposit-margin', {
      symbol,
      margin: margin.toString()
    });
  }

  // Get WebSocket token
  async getWebSocketToken() {
    return this.request('POST', '/api/v1/bullet-private');
  }

  // Get ticker
  async getTicker(symbol) {
    return this.request('GET', `/api/v1/ticker?symbol=${symbol}`);
  }

  // Get contract details
  async getContractDetail(symbol) {
    return this.request('GET', `/api/v1/contracts/${symbol}`);
  }
}

// Initialize KuCoin API
const kucoinAPI = new KuCoinFuturesAPI(KUCOIN_API_KEY, KUCOIN_API_SECRET, KUCOIN_API_PASSPHRASE);

// Technical Indicator Calculations
class TechnicalIndicators {
  static calculateSMA(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  static calculateEMA(data, period) {
    if (data.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = this.calculateSMA(data.slice(0, period), period);
    
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  static calculateRSI(data, period = 14) {
    if (data.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = data.length - period; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  static calculateWilliamsR(highs, lows, closes, period = 14) {
    if (closes.length < period) return -50;
    
    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const currentClose = closes[closes.length - 1];
    
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    
    if (highestHigh === lowestLow) return -50;
    return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
  }

  static calculateATR(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return 0;
    
    const trueRanges = [];
    for (let i = 1; i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }
    
    return this.calculateSMA(trueRanges.slice(-period), period);
  }

  static calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (data.length < slowPeriod) return 0;
    
    const fastEMA = this.calculateEMA(data, fastPeriod);
    const slowEMA = this.calculateEMA(data, slowPeriod);
    
    return fastEMA - slowEMA;
  }

  static calculateAO(highs, lows, shortPeriod = 5, longPeriod = 34) {
    if (highs.length < longPeriod) return 0;
    
    const medianPrices = highs.map((high, i) => (high + lows[i]) / 2);
    const shortSMA = this.calculateSMA(medianPrices.slice(-shortPeriod), shortPeriod);
    const longSMA = this.calculateSMA(medianPrices.slice(-longPeriod), longPeriod);
    
    return shortSMA - longSMA;
  }
}

// Market Data Manager
class MarketDataManager {
  constructor(symbol) {
    this.symbol = symbol;
    this.candles = [];
    this.maxCandles = 200;
  }

  addCandle(candle) {
    this.candles.push(candle);
    if (this.candles.length > this.maxCandles) {
      this.candles.shift();
    }
  }

  getIndicators() {
    if (this.candles.length < 50) {
      return {
        price: this.candles.length > 0 ? this.candles[this.candles.length - 1].close : 0,
        rsi: 50,
        wr: -50,
        atr: 0,
        ao: 0,
        macd: 0,
        ema50: 0,
        ema200: 0
      };
    }

    const closes = this.candles.map(c => c.close);
    const highs = this.candles.map(c => c.high);
    const lows = this.candles.map(c => c.low);

    return {
      price: closes[closes.length - 1],
      rsi: TechnicalIndicators.calculateRSI(closes, 14),
      wr: TechnicalIndicators.calculateWilliamsR(highs, lows, closes, 14),
      atr: TechnicalIndicators.calculateATR(highs, lows, closes, 14),
      ao: TechnicalIndicators.calculateAO(highs, lows, 5, 34),
      macd: TechnicalIndicators.calculateMACD(closes, 12, 26, 9),
      ema50: TechnicalIndicators.calculateEMA(closes, 50),
      ema200: TechnicalIndicators.calculateEMA(closes, 200)
    };
  }
}

// Market data managers
const marketManagers = {
  XBTUSDTM: new MarketDataManager('XBTUSDTM'),
  ETHUSDTM: new MarketDataManager('ETHUSDTM'),
  SOLUSDTM: new MarketDataManager('SOLUSDTM')
};

// Position Manager - Handles automated exits
class PositionManager {
  constructor(position, kucoinAPI) {
    this.position = position;
    this.api = kucoinAPI;
    this.symbol = position.symbol;
    this.initialStopLoss = position.stopLoss;
    this.currentStopLoss = position.stopLoss;
    this.entryPrice = position.entryPrice;
    this.side = position.side;
    this.size = position.size;
    this.breakEvenTriggered = false;
    this.lastProfitLevel = 0;
    
    // Configuration from config.js
    this.BREAK_EVEN_PIPS = config.EXIT_STRATEGY.BREAK_EVEN_TRIGGER_PIPS;
    this.TRAILING_STEP_PIPS = config.EXIT_STRATEGY.TRAILING_STEP_PIPS;
    this.SL_MOVE_PIPS = config.EXIT_STRATEGY.SL_MOVE_PIPS;
    this.PIP_VALUE = config.EXIT_STRATEGY.PIP_VALUE;
  }

  async updatePrice(currentPrice) {
    this.position.currentPrice = currentPrice;
    
    // Calculate P&L
    const priceDiff = this.side === 'long' 
      ? (currentPrice - this.entryPrice)
      : (this.entryPrice - currentPrice);
    
    this.position.unrealizedPnl = priceDiff * this.size * (this.position.leverage || 1);
    
    // Calculate profit in pips
    const profitPips = Math.abs(priceDiff / this.PIP_VALUE);
    
    // Check if we should trigger break-even
    if (!this.breakEvenTriggered && profitPips >= this.BREAK_EVEN_PIPS) {
      await this.moveToBreakEven();
      this.breakEvenTriggered = true;
      this.lastProfitLevel = Math.floor(profitPips / this.TRAILING_STEP_PIPS) * this.TRAILING_STEP_PIPS;
      broadcastLog('success', `Break-even triggered for ${this.symbol} at ${profitPips.toFixed(1)} pips profit`);
    }
    
    // Check if we should trail the stop
    if (this.breakEvenTriggered) {
      const currentProfitLevel = Math.floor(profitPips / this.TRAILING_STEP_PIPS) * this.TRAILING_STEP_PIPS;
      
      if (currentProfitLevel > this.lastProfitLevel) {
        await this.trailStop();
        this.lastProfitLevel = currentProfitLevel;
        broadcastLog('info', `Trailing stop moved for ${this.symbol} at ${currentProfitLevel} pips profit`);
      }
    }
    
    // Check if stop loss hit
    const stopHit = this.side === 'long'
      ? currentPrice <= this.currentStopLoss
      : currentPrice >= this.currentStopLoss;
    
    if (stopHit) {
      await this.closePosition('Stop loss hit');
    }
    
    return this.position;
  }

  async moveToBreakEven() {
    // Move stop loss to entry price
    this.currentStopLoss = this.entryPrice;
    this.position.currentStopLoss = this.currentStopLoss;
    
    // In a real implementation, you would update the stop loss order on KuCoin here
    // For now, we're tracking it internally
  }

  async trailStop() {
    // Move stop loss forward by 1 pip
    const pipMove = this.SL_MOVE_PIPS * this.PIP_VALUE;
    
    if (this.side === 'long') {
      this.currentStopLoss += pipMove;
    } else {
      this.currentStopLoss -= pipMove;
    }
    
    this.position.currentStopLoss = this.currentStopLoss;
  }

  async closePosition(reason) {
    try {
      broadcastLog('info', `Closing position ${this.symbol}: ${reason}`);
      
      // Place opposite order to close
      const closeSide = this.side === 'long' ? 'sell' : 'buy';
      
      const orderParams = {
        clientOid: `close_${Date.now()}`,
        side: closeSide,
        symbol: this.symbol,
        type: 'market',
        size: this.size
      };
      
      const result = await this.api.placeOrder(orderParams);
      
      broadcastLog('success', `Position closed: ${this.symbol}`, {
        orderId: result.data.orderId,
        pnl: this.position.unrealizedPnl.toFixed(2)
      });
      
      // Remove from active positions
      activePositions.delete(this.symbol);
      broadcastPositions();
      
      return result;
    } catch (error) {
      broadcastLog('error', `Failed to close position ${this.symbol}: ${error.message}`);
      throw error;
    }
  }
}

// Broadcast functions
function broadcastLog(type, message, data = null) {
  const log = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    type,
    message,
    data
  };
  
  broadcast({ type: 'log', log });
}

function broadcastPositions() {
  const positions = Array.from(activePositions.values()).map(pm => pm.position);
  broadcast({ type: 'positions', data: positions });
}

function broadcastBalance(balance) {
  broadcast({ type: 'balance', data: balance });
}

function broadcastMarketData(symbol, data) {
  broadcast({ type: 'market_data', symbol, data });
}

function broadcast(message) {
  const messageStr = JSON.stringify(message);
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Fetch historical candles from KuCoin
async function fetchHistoricalCandles(symbol, granularity = 60) {
  try {
    const endpoint = `/api/v1/kline/query?symbol=${symbol}&granularity=${granularity}&from=${Date.now() - 200 * granularity * 1000}&to=${Date.now()}`;
    const response = await kucoinAPI.request('GET', endpoint);
    
    if (response.data && response.data.length > 0) {
      const candles = response.data.map(c => ({
        timestamp: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5])
      }));
      
      // Add to market manager
      candles.forEach(candle => {
        if (marketManagers[symbol]) {
          marketManagers[symbol].addCandle(candle);
        }
      });
      
      broadcastLog('success', `Loaded ${candles.length} historical candles for ${symbol}`);
      
      // Broadcast initial indicators
      const indicators = marketManagers[symbol].getIndicators();
      broadcastMarketData(symbol, indicators);
      
      return candles;
    }
  } catch (error) {
    broadcastLog('error', `Failed to fetch candles for ${symbol}: ${error.message}`);
  }
}

// Initialize market data
async function initializeMarketData() {
  try {
    await Promise.all([
      fetchHistoricalCandles('XBTUSDTM', 60),
      fetchHistoricalCandles('ETHUSDTM', 60),
      fetchHistoricalCandles('SOLUSDTM', 60)
    ]);
    
    broadcastLog('success', 'Market data initialized');
  } catch (error) {
    broadcastLog('error', `Failed to initialize market data: ${error.message}`);
  }
}

// Sync positions from KuCoin
async function syncPositions() {
  try {
    const response = await kucoinAPI.getAllPositions();
    
    if (response.data && Array.isArray(response.data)) {
      response.data.forEach(pos => {
        if (pos.currentQty !== 0) {
          const symbol = pos.symbol;
          const side = pos.currentQty > 0 ? 'long' : 'short';
          const size = Math.abs(pos.currentQty);
          
          const position = {
            symbol,
            side,
            size,
            leverage: pos.realLeverage || 10,
            entryPrice: parseFloat(pos.avgEntryPrice),
            currentPrice: parseFloat(pos.markPrice),
            unrealizedPnl: parseFloat(pos.unrealisedPnl || 0),
            currentStopLoss: parseFloat(pos.avgEntryPrice) * (side === 'long' ? 0.99 : 1.01), // Default 1% SL
            liquidationPrice: parseFloat(pos.liquidationPrice)
          };
          
          if (!activePositions.has(symbol)) {
            const manager = new PositionManager(position, kucoinAPI);
            activePositions.set(symbol, manager);
            broadcastLog('info', `Synced position: ${symbol} ${side} ${size}`);
          }
        }
      });
      
      broadcastPositions();
    }
  } catch (error) {
    broadcastLog('error', `Failed to sync positions: ${error.message}`);
  }
}

// Update positions with current prices
async function updatePositions() {
  for (const [symbol, manager] of activePositions.entries()) {
    try {
      const indicators = marketManagers[symbol]?.getIndicators();
      if (indicators && indicators.price > 0) {
        await manager.updatePrice(indicators.price);
      }
    } catch (error) {
      broadcastLog('error', `Error updating position ${symbol}: ${error.message}`);
    }
  }
  
  broadcastPositions();
}

// WebSocket Server
const wss = new WebSocket.Server({ port: 3001 });

wss.on('connection', async (ws) => {
  console.log('Client connected');
  wsClients.add(ws);
  
  broadcastLog('success', 'Frontend connected');
  
  // Send initial data
  try {
    // Get account balance
    const balance = await kucoinAPI.getAccountOverview('USDT');
    if (balance.data) {
      broadcastBalance(balance.data);
    }
    
    // Send current positions
    broadcastPositions();
    
    // Send current market data
    Object.keys(marketManagers).forEach(symbol => {
      const indicators = marketManagers[symbol].getIndicators();
      broadcastMarketData(symbol, indicators);
    });
    
  } catch (error) {
    broadcastLog('error', `Initialization error: ${error.message}`);
  }
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'place_order') {
        await handlePlaceOrder(data);
      } else if (data.type === 'close_position') {
        await handleClosePosition(data);
      } else if (data.type === 'get_balance') {
        const balance = await kucoinAPI.getAccountOverview('USDT');
        if (balance.data) {
          broadcastBalance(balance.data);
        }
      }
      
    } catch (error) {
      broadcastLog('error', `Message handling error: ${error.message}`);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    wsClients.delete(ws);
  });
});

// Handle place order
async function handlePlaceOrder(data) {
  try {
    const { symbol, side, size, price, leverage } = data;
    
    broadcastLog('info', `Placing ${side} order: ${size} ${symbol} @ ${price}`);
    
    // Set leverage first
    // Note: KuCoin API leverage setting might be done via a different endpoint
    // This is a simplified version
    
    const orderParams = {
      clientOid: `order_${Date.now()}`,
      side: side.toLowerCase(),
      symbol: symbol,
      type: 'limit',
      price: price.toString(),
      size: size,
      leverage: leverage.toString(),
      timeInForce: 'GTC'
    };
    
    const result = await kucoinAPI.placeOrder(orderParams);
    
    if (result.data) {
      broadcastLog('success', 'Order placed successfully', {
        orderId: result.data.orderId,
        symbol,
        side,
        size,
        price
      });
      
      broadcast({
        type: 'order_result',
        result: {
          success: true,
          data: result.data
        }
      });
      
      // Wait a bit then sync positions
      setTimeout(async () => {
        await syncPositions();
      }, 2000);
    }
    
  } catch (error) {
    broadcastLog('error', `Order placement failed: ${error.message}`);
    broadcast({
      type: 'order_result',
      result: {
        success: false,
        error: error.message
      }
    });
  }
}

// Handle close position
async function handleClosePosition(data) {
  try {
    const { symbol } = data;
    const manager = activePositions.get(symbol);
    
    if (manager) {
      await manager.closePosition('Manual close requested');
    } else {
      broadcastLog('warning', `No active position found for ${symbol}`);
    }
    
  } catch (error) {
    broadcastLog('error', `Failed to close position: ${error.message}`);
  }
}

// Periodic updates
setInterval(async () => {
  try {
    // Update market data
    Object.keys(marketManagers).forEach(symbol => {
      const indicators = marketManagers[symbol].getIndicators();
      broadcastMarketData(symbol, indicators);
    });
    
    // Update positions
    await updatePositions();
    
  } catch (error) {
    console.error('Update error:', error);
  }
}, 3000);

// Periodic balance update
setInterval(async () => {
  try {
    const balance = await kucoinAPI.getAccountOverview('USDT');
    if (balance.data) {
      broadcastBalance(balance.data);
    }
  } catch (error) {
    console.error('Balance update error:', error);
  }
}, 10000);

// Periodic position sync
setInterval(async () => {
  await syncPositions();
}, 30000);

// Initialize on startup
(async () => {
  console.log('KuCoin Futures Trading Server Starting...');
  console.log('API Key:', KUCOIN_API_KEY.substring(0, 8) + '...');
  
  try {
    // Test API connection
    const balance = await kucoinAPI.getAccountOverview('USDT');
    console.log('✓ Connected to KuCoin Futures API');
    console.log('Account Balance:', balance.data?.accountEquity || '0');
    
    // Initialize market data
    await initializeMarketData();
    
    // Sync existing positions
    await syncPositions();
    
    console.log('✓ Server ready on port 3001');
    console.log('Waiting for frontend connection...');
    
  } catch (error) {
    console.error('✗ Initialization failed:', error.message);
    console.error('Please check your API credentials and network connection');
  }
})();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activePositions: activePositions.size,
    connectedClients: wsClients.size,
    marketDataReady: Object.keys(marketManagers).every(s => marketManagers[s].candles.length > 0)
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
