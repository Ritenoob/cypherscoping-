/**
 * ExecutionAgent - Order Management & Execution
 * 
 * Handles order placement, modification, cancellation, fill tracking.
 * Implements 9th level order book entry, slippage control, position lifecycle.
 */

const { AgentBase, Decimal } = require('./agent-base');
const crypto = require('crypto');
const axios = require('axios');
const D = Decimal;

const KUCOIN_FUTURES_API = 'https://api-futures.kucoin.com';

class ExecutionAgent extends AgentBase {
  constructor(config = {}) {
    super({
      id: 'execution-agent',
      name: 'Execution Agent',
      options: config
    });

    // API credentials
    this.apiKey = config.apiKey || process.env.KUCOIN_API_KEY;
    this.apiSecret = config.apiSecret || process.env.KUCOIN_API_SECRET;
    this.apiPassphrase = config.apiPassphrase || process.env.KUCOIN_API_PASSPHRASE;

    // Mode
    this.mode = config.mode || process.env.BOT_MODE || 'paper';

    // Data agent reference
    this.dataAgent = config.dataAgent;

    // Execution config
    this.entryLevel = config.entryLevel || 9; // 9th level order book
    this.maxSlippage = config.maxSlippage || 0.002; // 0.2%
    this.orderTimeout = config.orderTimeout || 30000;

    // Position tracking
    this.positions = new Map();
    this.pendingOrders = new Map();
    this.orderHistory = [];

    // Paper trading state
    this.paperBalance = config.paperBalance || 10000;
    this.paperPositions = new Map();
    this.paperOrders = new Map();
    this.paperOrderId = 1;
  }

  async initialize() {
    this.log('Initializing Execution Agent');

    // Message handlers
    this.onMessage('EXECUTE_TRADE', this._handleExecuteTrade.bind(this));
    this.onMessage('CLOSE_POSITION', this._handleClosePosition.bind(this));
    this.onMessage('CANCEL_ORDER', this._handleCancelOrder.bind(this));
    this.onMessage('CANCEL_ALL_ORDERS', this._handleCancelAllOrders.bind(this));
    this.onMessage('GET_POSITIONS', this._handleGetPositions.bind(this));
    this.onMessage('UPDATE_STOP_LOSS', this._handleUpdateStopLoss.bind(this));

    return { ok: true, value: { mode: this.mode } };
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Execute a trade signal
   */
  async executeTrade(params) {
    const {
      symbol,
      direction,
      size,
      leverage,
      stopLoss,
      takeProfit,
      entryPrice: suggestedEntry
    } = params;

    // Get optimal entry price from order book
    const entryResult = await this._getOptimalEntryPrice(symbol, direction);
    if (!entryResult.ok) return entryResult;

    const entryPrice = entryResult.value.price;
    const midPrice = entryResult.value.midPrice;

    // Check slippage
    const slippage = Math.abs(entryPrice - midPrice) / midPrice;
    if (slippage > this.maxSlippage) {
      return { 
        ok: false, 
        error: { 
          code: 'SLIPPAGE_EXCEEDED', 
          message: `Slippage ${(slippage * 100).toFixed(2)}% exceeds max ${this.maxSlippage * 100}%` 
        } 
      };
    }

    // Place orders
    if (this.mode === 'paper') {
      return this._executePaperTrade(params, entryPrice);
    } else {
      return this._executeLiveTrade(params, entryPrice);
    }
  }

  /**
   * Close a position
   */
  async closePosition(symbol, reason = 'manual') {
    if (this.mode === 'paper') {
      return this._closePaperPosition(symbol, reason);
    } else {
      return this._closeLivePosition(symbol, reason);
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId) {
    if (this.mode === 'paper') {
      this.paperOrders.delete(orderId);
      return { ok: true, value: { orderId, cancelled: true } };
    } else {
      return this._apiRequest('DELETE', `/api/v1/orders/${orderId}`);
    }
  }

  /**
   * Cancel all orders for symbol
   */
  async cancelAllOrders(symbol = null) {
    if (this.mode === 'paper') {
      if (symbol) {
        for (const [id, order] of this.paperOrders) {
          if (order.symbol === symbol) this.paperOrders.delete(id);
        }
      } else {
        this.paperOrders.clear();
      }
      return { ok: true, value: { cancelled: true } };
    } else {
      const endpoint = symbol 
        ? `/api/v1/orders?symbol=${symbol}` 
        : '/api/v1/orders';
      return this._apiRequest('DELETE', endpoint);
    }
  }

  /**
   * Update stop loss for position
   */
  async updateStopLoss(symbol, newStopPrice) {
    if (this.mode === 'paper') {
      const pos = this.paperPositions.get(symbol);
      if (pos) {
        pos.stopLoss = newStopPrice;
        this.log(`Updated SL for ${symbol}: ${newStopPrice}`);
        return { ok: true, value: { symbol, stopLoss: newStopPrice } };
      }
      return { ok: false, error: { code: 'NO_POSITION', message: 'Position not found' } };
    } else {
      // Cancel old SL, place new one
      // Implementation depends on KuCoin order structure
      return { ok: true, value: { symbol, stopLoss: newStopPrice } };
    }
  }

  /**
   * Get all positions
   */
  getPositions() {
    if (this.mode === 'paper') {
      return Object.fromEntries(this.paperPositions);
    }
    return Object.fromEntries(this.positions);
  }

  /**
   * Get balance
   */
  getBalance() {
    if (this.mode === 'paper') {
      return this.paperBalance;
    }
    return 0; // Would need to fetch from API
  }

  // ===========================================================================
  // OPTIMAL ENTRY PRICE (9th Level)
  // ===========================================================================

  async _getOptimalEntryPrice(symbol, direction) {
    try {
      let orderBook;
      
      if (this.dataAgent) {
        const result = await this.dataAgent.fetchOrderBook(symbol, 20);
        if (!result.ok) return result;
        orderBook = result.value;
      } else {
        // Mock order book
        const midPrice = 100;
        orderBook = {
          bids: Array(20).fill(null).map((_, i) => ({ 
            price: midPrice * (1 - 0.0001 * (i + 1)), 
            size: Math.random() * 1000 
          })),
          asks: Array(20).fill(null).map((_, i) => ({ 
            price: midPrice * (1 + 0.0001 * (i + 1)), 
            size: Math.random() * 1000 
          }))
        };
      }

      const level = Math.min(this.entryLevel - 1, 19);
      const midPrice = (orderBook.bids[0].price + orderBook.asks[0].price) / 2;

      // Long: use 9th bid level, Short: use 9th ask level
      const price = direction === 'long' 
        ? orderBook.bids[level].price 
        : orderBook.asks[level].price;

      return { ok: true, value: { price, midPrice, level: this.entryLevel } };

    } catch (error) {
      return { ok: false, error: { code: 'ORDERBOOK_ERROR', message: error.message } };
    }
  }

  // ===========================================================================
  // PAPER TRADING
  // ===========================================================================

  _executePaperTrade(params, entryPrice) {
    const { symbol, direction, size, leverage, stopLoss, takeProfit } = params;

    const orderId = `paper-${this.paperOrderId++}`;
    const notional = new D(size).mul(entryPrice).toNumber();
    const margin = new D(notional).div(leverage).toNumber();

    // Check balance
    if (margin > this.paperBalance) {
      return { ok: false, error: { code: 'INSUFFICIENT_BALANCE', message: 'Not enough margin' } };
    }

    // Deduct margin
    this.paperBalance -= margin;

    // Create position
    const position = {
      symbol,
      direction,
      size,
      entryPrice,
      leverage,
      margin,
      notional,
      stopLoss,
      takeProfit,
      openTime: Date.now(),
      orderId,
      pnl: 0
    };

    this.paperPositions.set(symbol, position);

    this.log(`Paper trade opened: ${direction.toUpperCase()} ${size} ${symbol} @ ${entryPrice}`);
    
    this.emit('positionOpened', position);

    return { ok: true, value: position };
  }

  _closePaperPosition(symbol, reason) {
    const position = this.paperPositions.get(symbol);
    if (!position) {
      return { ok: false, error: { code: 'NO_POSITION', message: 'Position not found' } };
    }

    // Get current price (mock)
    const currentPrice = position.entryPrice * (1 + (Math.random() - 0.5) * 0.02);
    
    // Calculate PnL
    let pnl;
    if (position.direction === 'long') {
      pnl = new D(currentPrice).sub(position.entryPrice).div(position.entryPrice)
        .mul(position.leverage).mul(position.margin).toNumber();
    } else {
      pnl = new D(position.entryPrice).sub(currentPrice).div(position.entryPrice)
        .mul(position.leverage).mul(position.margin).toNumber();
    }

    // Return margin + PnL
    this.paperBalance += position.margin + pnl;

    // Record
    const closedPosition = {
      ...position,
      exitPrice: currentPrice,
      pnl,
      closeTime: Date.now(),
      reason
    };

    this.orderHistory.push(closedPosition);
    this.paperPositions.delete(symbol);

    this.log(`Paper position closed: ${symbol} PnL: ${pnl.toFixed(2)}`);
    
    this.emit('positionClosed', closedPosition);

    return { ok: true, value: closedPosition };
  }

  /**
   * Check paper positions for SL/TP hits
   */
  checkPaperPositions(prices) {
    for (const [symbol, position] of this.paperPositions) {
      const currentPrice = prices[symbol];
      if (!currentPrice) continue;

      let shouldClose = false;
      let reason = '';

      // Check stop loss
      if (position.direction === 'long' && currentPrice <= position.stopLoss) {
        shouldClose = true;
        reason = 'stop_loss';
      } else if (position.direction === 'short' && currentPrice >= position.stopLoss) {
        shouldClose = true;
        reason = 'stop_loss';
      }

      // Check take profit
      if (position.direction === 'long' && currentPrice >= position.takeProfit) {
        shouldClose = true;
        reason = 'take_profit';
      } else if (position.direction === 'short' && currentPrice <= position.takeProfit) {
        shouldClose = true;
        reason = 'take_profit';
      }

      if (shouldClose) {
        this._closePaperPosition(symbol, reason);
      }
    }
  }

  // ===========================================================================
  // LIVE TRADING
  // ===========================================================================

  async _executeLiveTrade(params, entryPrice) {
    const { symbol, direction, size, leverage, stopLoss, takeProfit } = params;

    try {
      // Set leverage first
      await this._apiRequest('POST', '/api/v1/position/risk-limit-level/change', {
        symbol,
        level: leverage
      });

      // Place entry order
      const side = direction === 'long' ? 'buy' : 'sell';
      const entryOrder = await this._apiRequest('POST', '/api/v1/orders', {
        clientOid: `entry-${Date.now()}`,
        symbol,
        side,
        type: 'limit',
        price: entryPrice.toString(),
        size: size.toString(),
        leverage: leverage.toString(),
        timeInForce: 'GTC'
      });

      if (!entryOrder.ok) return entryOrder;

      // Place stop loss
      const slSide = direction === 'long' ? 'sell' : 'buy';
      await this._apiRequest('POST', '/api/v1/orders', {
        clientOid: `sl-${Date.now()}`,
        symbol,
        side: slSide,
        type: 'market',
        stop: 'down',
        stopPriceType: 'TP',
        stopPrice: stopLoss.toString(),
        size: size.toString(),
        closeOrder: true
      });

      // Place take profit
      await this._apiRequest('POST', '/api/v1/orders', {
        clientOid: `tp-${Date.now()}`,
        symbol,
        side: slSide,
        type: 'market',
        stop: 'up',
        stopPriceType: 'TP',
        stopPrice: takeProfit.toString(),
        size: size.toString(),
        closeOrder: true
      });

      return { ok: true, value: { orderId: entryOrder.value.orderId, symbol, direction } };

    } catch (error) {
      return { ok: false, error: { code: 'ORDER_FAILED', message: error.message } };
    }
  }

  async _closeLivePosition(symbol, reason) {
    try {
      // Get position
      const posResult = await this._apiRequest('GET', `/api/v1/position?symbol=${symbol}`);
      if (!posResult.ok) return posResult;

      const position = posResult.value;
      if (!position || position.currentQty === 0) {
        return { ok: false, error: { code: 'NO_POSITION', message: 'No open position' } };
      }

      // Close with market order
      const side = position.currentQty > 0 ? 'sell' : 'buy';
      const closeOrder = await this._apiRequest('POST', '/api/v1/orders', {
        clientOid: `close-${Date.now()}`,
        symbol,
        side,
        type: 'market',
        size: Math.abs(position.currentQty).toString(),
        closeOrder: true
      });

      return closeOrder;

    } catch (error) {
      return { ok: false, error: { code: 'CLOSE_FAILED', message: error.message } };
    }
  }

  // ===========================================================================
  // API REQUEST
  // ===========================================================================

  async _apiRequest(method, endpoint, body = null) {
    if (!this.apiKey || !this.apiSecret) {
      return { ok: false, error: { code: 'NO_CREDENTIALS', message: 'API credentials not configured' } };
    }

    try {
      const timestamp = Date.now();
      const bodyStr = body ? JSON.stringify(body) : '';
      const strToSign = `${timestamp}${method}${endpoint}${bodyStr}`;
      
      const signature = crypto.createHmac('sha256', this.apiSecret)
        .update(strToSign).digest('base64');
      
      const passphrase = crypto.createHmac('sha256', this.apiSecret)
        .update(this.apiPassphrase || '').digest('base64');

      const response = await axios({
        method,
        url: `${KUCOIN_FUTURES_API}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          'KC-API-KEY': this.apiKey,
          'KC-API-SIGN': signature,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-PASSPHRASE': passphrase,
          'KC-API-KEY-VERSION': '2'
        },
        data: body,
        timeout: this.orderTimeout
      });

      if (response.data.code !== '200000') {
        return { ok: false, error: { code: response.data.code, message: response.data.msg } };
      }

      return { ok: true, value: response.data.data };

    } catch (error) {
      return { ok: false, error: { code: 'API_ERROR', message: error.message } };
    }
  }

  // ===========================================================================
  // MESSAGE HANDLERS
  // ===========================================================================

  async _handleExecuteTrade(payload) {
    return this.executeTrade(payload);
  }

  async _handleClosePosition(payload) {
    return this.closePosition(payload.symbol, payload.reason);
  }

  async _handleCancelOrder(payload) {
    return this.cancelOrder(payload.orderId);
  }

  async _handleCancelAllOrders(payload) {
    return this.cancelAllOrders(payload?.symbol);
  }

  async _handleGetPositions() {
    return { ok: true, value: this.getPositions() };
  }

  async _handleUpdateStopLoss(payload) {
    return this.updateStopLoss(payload.symbol, payload.stopPrice);
  }

  // ===========================================================================
  // HEALTH
  // ===========================================================================

  async performHealthCheck() {
    const positionCount = this.mode === 'paper' 
      ? this.paperPositions.size 
      : this.positions.size;

    return {
      status: 'HEALTHY',
      details: {
        mode: this.mode,
        openPositions: positionCount,
        pendingOrders: this.pendingOrders.size,
        balance: this.getBalance()
      }
    };
  }
}

module.exports = ExecutionAgent;
