/**
 * ExecutionAgent - Order Management & Execution
 * 
 * Handles order placement, modification, cancellation, fill tracking.
 * Implements 9th level order book entry, slippage control, position lifecycle.
 */

const { AgentBase, Decimal } = require('./agent-base');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
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
    // Use relaxed slippage for paper trading (even in live mode)
    const paperTradingEnabled = process.env.PAPER_TRADE_ENABLED === 'true';
    this.maxSlippage = config.maxSlippage || (paperTradingEnabled || this.mode === 'paper' ? 0.02 : 0.002); // 2% paper, 0.2% live
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

    // Trailing stop config (from env or config)
    this.trailingEnabled = process.env.TRAILING_STOP_ENABLED === 'true' || config.trailingEnabled || false;
    this.trailingActivation = parseFloat(process.env.TRAILING_STOP_ACTIVATION) || config.trailingActivation || 4; // ROI% to activate
    this.trailingDistance = parseFloat(process.env.TRAILING_STOP_TRAIL) || config.trailingDistance || 2; // Trail by this ROI%

    // Break-even config (from env or config)
    this.breakEvenEnabled = process.env.BREAK_EVEN_ENABLED === 'true' || config.breakEvenEnabled || false;
    this.breakEvenActivation = parseFloat(process.env.BREAK_EVEN_ACTIVATION) || config.breakEvenActivation || 3; // ROI% to move to BE
    this.breakEvenBuffer = config.breakEvenBuffer || 0.5; // Buffer above entry

    // Trade logging & persistent state
    this.logDir = config.logDir || process.env.LOG_DIR || './logs';
    this.tradeLogFile = path.join(this.logDir, 'trades.log');
    this.tradeJsonFile = path.join(this.logDir, 'trades.json');
    this.stateFile = path.join(this.logDir, 'state.json');
    this.performanceFile = path.join(this.logDir, 'performance.json');

    // Initialize and load persistent state
    this._initPersistentState();
  }

  /**
   * Initialize persistent state and trade logs
   */
  _initPersistentState() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Initialize trades.json if doesn't exist
      if (!fs.existsSync(this.tradeJsonFile)) {
        fs.writeFileSync(this.tradeJsonFile, JSON.stringify({ trades: [] }, null, 2));
      }

      // Initialize or load state.json
      if (fs.existsSync(this.stateFile)) {
        const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        this.paperBalance = state.balance || 10000;
        this.initialBalance = state.initialBalance || 10000;
        console.log(`[TradeLog] Loaded state: Balance $${this.paperBalance.toFixed(2)} (Initial: $${this.initialBalance.toFixed(2)})`);
      } else {
        this.initialBalance = this.paperBalance;
        this._saveState();
        console.log(`[TradeLog] Initialized new state: Balance $${this.paperBalance.toFixed(2)}`);
      }

      // Initialize or load performance.json
      if (fs.existsSync(this.performanceFile)) {
        this.performance = JSON.parse(fs.readFileSync(this.performanceFile, 'utf8'));
        console.log(`[TradeLog] Loaded performance: ${this.performance.totalTrades} trades, ${this.performance.winRate.toFixed(1)}% WR, PF ${this.performance.profitFactor.toFixed(2)}`);
      } else {
        this.performance = this._createEmptyPerformance();
        this._savePerformance();
      }
    } catch (e) {
      console.error('[TradeLog] Failed to initialize:', e.message);
      this.initialBalance = this.paperBalance;
      this.performance = this._createEmptyPerformance();
    }
  }

  /**
   * Create empty performance object
   */
  _createEmptyPerformance() {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnL: 0,
      grossProfit: 0,
      grossLoss: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      avgRoi: 0,
      bestTrade: { symbol: null, pnl: 0, roi: 0 },
      worstTrade: { symbol: null, pnl: 0, roi: 0 },
      largestWin: 0,
      largestLoss: 0,
      avgHoldTime: 0,
      totalHoldTime: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      maxDrawdown: 0,
      peakBalance: 10000,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Save current state to file
   */
  _saveState() {
    try {
      const state = {
        balance: this.paperBalance,
        initialBalance: this.initialBalance,
        totalPnL: this.paperBalance - this.initialBalance,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    } catch (e) {
      console.error('[TradeLog] Failed to save state:', e.message);
    }
  }

  /**
   * Save performance metrics to file
   */
  _savePerformance() {
    try {
      this.performance.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.performanceFile, JSON.stringify(this.performance, null, 2));
    } catch (e) {
      console.error('[TradeLog] Failed to save performance:', e.message);
    }
  }

  /**
   * Update performance metrics after a trade
   */
  _updatePerformance(closedPosition) {
    const pnl = closedPosition.pnl;
    const roi = closedPosition.finalROI;
    const holdTime = closedPosition.closeTime - closedPosition.openTime;
    const isWin = pnl > 0;

    // Basic counts
    this.performance.totalTrades++;
    if (isWin) {
      this.performance.wins++;
      this.performance.grossProfit += pnl;
      this.performance.consecutiveWins++;
      this.performance.consecutiveLosses = 0;
      if (this.performance.consecutiveWins > this.performance.maxConsecutiveWins) {
        this.performance.maxConsecutiveWins = this.performance.consecutiveWins;
      }
    } else {
      this.performance.losses++;
      this.performance.grossLoss += Math.abs(pnl);
      this.performance.consecutiveLosses++;
      this.performance.consecutiveWins = 0;
      if (this.performance.consecutiveLosses > this.performance.maxConsecutiveLosses) {
        this.performance.maxConsecutiveLosses = this.performance.consecutiveLosses;
      }
    }

    // P&L metrics
    this.performance.totalPnL += pnl;
    this.performance.winRate = (this.performance.wins / this.performance.totalTrades) * 100;
    this.performance.profitFactor = this.performance.grossLoss > 0
      ? this.performance.grossProfit / this.performance.grossLoss
      : this.performance.grossProfit > 0 ? 999 : 0;

    // Averages
    this.performance.avgWin = this.performance.wins > 0
      ? this.performance.grossProfit / this.performance.wins : 0;
    this.performance.avgLoss = this.performance.losses > 0
      ? this.performance.grossLoss / this.performance.losses : 0;

    // Hold time
    this.performance.totalHoldTime += holdTime;
    this.performance.avgHoldTime = this.performance.totalHoldTime / this.performance.totalTrades;

    // Best/Worst trades
    if (pnl > this.performance.largestWin) {
      this.performance.largestWin = pnl;
      this.performance.bestTrade = {
        symbol: closedPosition.symbol,
        pnl,
        roi,
        date: new Date().toISOString()
      };
    }
    if (pnl < this.performance.largestLoss) {
      this.performance.largestLoss = pnl;
      this.performance.worstTrade = {
        symbol: closedPosition.symbol,
        pnl,
        roi,
        date: new Date().toISOString()
      };
    }

    // Drawdown tracking
    if (this.paperBalance > this.performance.peakBalance) {
      this.performance.peakBalance = this.paperBalance;
    }
    const currentDrawdown = ((this.performance.peakBalance - this.paperBalance) / this.performance.peakBalance) * 100;
    if (currentDrawdown > this.performance.maxDrawdown) {
      this.performance.maxDrawdown = currentDrawdown;
    }

    // Save updated performance
    this._savePerformance();
    this._saveState();

    // Log performance summary periodically
    if (this.performance.totalTrades % 5 === 0) {
      console.log(`\n📊 [PERFORMANCE] Trades: ${this.performance.totalTrades} | WR: ${this.performance.winRate.toFixed(1)}% | PF: ${this.performance.profitFactor.toFixed(2)} | Total P&L: ${this.performance.totalPnL >= 0 ? '+' : ''}$${this.performance.totalPnL.toFixed(2)}\n`);
    }
  }

  /**
   * Log trade entry to file
   */
  _logTradeEntry(position, signal) {
    const entry = {
      id: position.orderId,
      type: 'ENTRY',
      timestamp: new Date().toISOString(),
      symbol: position.symbol,
      direction: position.direction.toUpperCase(),
      entryPrice: position.entryPrice,
      size: position.size,
      notional: position.notional,
      leverage: position.leverage,
      margin: position.margin,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      signalScore: signal?.score || signal?.finalScore || 0,
      signalQuality: signal?.signalQuality || 'N/A',
      alignedTFs: signal?.alignedTFs || 0,
      totalTFs: signal?.totalTFs || 0,
      breakEvenEnabled: this.breakEvenEnabled,
      breakEvenActivation: this.breakEvenActivation,
      trailingEnabled: this.trailingEnabled,
      trailingActivation: this.trailingActivation,
      trailingDistance: this.trailingDistance
    };

    this._writeTradeLog(entry);
    this._appendTradeJson(entry);
  }

  /**
   * Log trade exit to file
   */
  _logTradeExit(closedPosition) {
    const exit = {
      id: closedPosition.orderId,
      type: 'EXIT',
      timestamp: new Date().toISOString(),
      symbol: closedPosition.symbol,
      direction: closedPosition.direction.toUpperCase(),
      entryPrice: closedPosition.entryPrice,
      exitPrice: closedPosition.exitPrice,
      size: closedPosition.size,
      leverage: closedPosition.leverage,
      margin: closedPosition.margin,
      pnl: closedPosition.pnl,
      pnlPercent: closedPosition.finalROI,
      reason: closedPosition.reason,
      duration: closedPosition.closeTime - closedPosition.openTime,
      durationMin: ((closedPosition.closeTime - closedPosition.openTime) / 60000).toFixed(1),
      breakEvenActivated: closedPosition.breakEvenActivated || false,
      trailingActivated: closedPosition.trailingActive || false,
      finalStopLoss: closedPosition.stopLoss,
      highROI: closedPosition.highROI || closedPosition.finalROI
    };

    this._writeTradeLog(exit);
    this._appendTradeJson(exit);
  }

  /**
   * Write to trade log file (human readable)
   */
  _writeTradeLog(data) {
    try {
      const line = data.type === 'ENTRY'
        ? `[${data.timestamp}] ENTRY | ${data.direction} ${data.symbol} | Price: $${data.entryPrice.toFixed(6)} | Size: $${data.size.toFixed(2)} | Lev: ${data.leverage}x | SL: $${data.stopLoss?.toFixed(6) || 'N/A'} | TP: $${data.takeProfit?.toFixed(6) || 'N/A'} | Score: ${Math.abs(data.signalScore)} [${data.signalQuality}] ${data.alignedTFs}/${data.totalTFs}TF | BE@${data.breakEvenActivation}% Trail@${data.trailingActivation}%/${data.trailingDistance}%\n`
        : `[${data.timestamp}] EXIT  | ${data.direction} ${data.symbol} | Entry: $${data.entryPrice.toFixed(6)} Exit: $${data.exitPrice.toFixed(6)} | PnL: ${data.pnl >= 0 ? '+' : ''}$${data.pnl.toFixed(2)} (${data.pnlPercent >= 0 ? '+' : ''}${data.pnlPercent.toFixed(1)}%) | Reason: ${data.reason.toUpperCase()} | Duration: ${data.durationMin}min | BE: ${data.breakEvenActivated ? 'YES' : 'NO'} | Trail: ${data.trailingActivated ? 'YES' : 'NO'} | HighROI: ${data.highROI?.toFixed(1) || 'N/A'}%\n`;

      fs.appendFileSync(this.tradeLogFile, line);
    } catch (e) {
      console.error('[TradeLog] Write error:', e.message);
    }
  }

  /**
   * Append to JSON trade history
   */
  _appendTradeJson(data) {
    try {
      const json = JSON.parse(fs.readFileSync(this.tradeJsonFile, 'utf8'));
      json.trades.push(data);
      fs.writeFileSync(this.tradeJsonFile, JSON.stringify(json, null, 2));
    } catch (e) {
      console.error('[TradeLog] JSON append error:', e.message);
    }
  }

  async initialize() {
    this.log('Initializing Execution Agent');
    console.log(`[Execution] Break-Even: ${this.breakEvenEnabled ? 'ON' : 'OFF'} (activate: ${this.breakEvenActivation}% ROI)`);
    console.log(`[Execution] Trailing Stop: ${this.trailingEnabled ? 'ON' : 'OFF'} (activate: ${this.trailingActivation}% ROI, trail: ${this.trailingDistance}%)`);

    // Message handlers
    this.onMessage('EXECUTE_TRADE', this._handleExecuteTrade.bind(this));
    this.onMessage('CLOSE_POSITION', this._handleClosePosition.bind(this));
    this.onMessage('CANCEL_ORDER', this._handleCancelOrder.bind(this));
    this.onMessage('CANCEL_ALL_ORDERS', this._handleCancelAllOrders.bind(this));
    this.onMessage('GET_POSITIONS', this._handleGetPositions.bind(this));
    this.onMessage('UPDATE_STOP_LOSS', this._handleUpdateStopLoss.bind(this));

    // Start position monitoring loop (every 2 seconds)
    this.positionMonitorInterval = setInterval(() => {
      this._monitorPositions();
    }, 2000);

    return { ok: true, value: { mode: this.mode } };
  }

  /**
   * Monitor positions for SL/TP/trailing stop/break-even
   */
  _monitorPositions() {
    // Monitor paper positions in both paper and live mode (when paper trading enabled)
    const paperTradingEnabled = process.env.PAPER_TRADE_ENABLED === 'true';
    if (!paperTradingEnabled && this.mode !== 'paper') return;
    if (!this.dataAgent) return;
    if (this.paperPositions.size === 0) return;

    // Build price map from ticker cache
    const prices = {};
    for (const [symbol] of this.paperPositions) {
      const ticker = this.dataAgent.tickerCache?.get(symbol);
      if (ticker && ticker.price) {
        prices[symbol] = ticker.price;
      }
    }

    // Check positions for exits
    if (Object.keys(prices).length > 0) {
      this.checkPaperPositions(prices);
    }
  }

  /**
   * Cleanup on agent stop
   */
  async cleanup() {
    if (this.positionMonitorInterval) {
      clearInterval(this.positionMonitorInterval);
      this.positionMonitorInterval = null;
    }
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
      entryPrice: suggestedEntry,
      // Signal info for logging
      score,
      finalScore,
      signalQuality,
      alignedTFs,
      totalTFs
    } = params;

    // Build signal object for logging
    const signal = { score, finalScore, signalQuality, alignedTFs, totalTFs };
    params.signal = signal;

    // Get optimal entry price from order book (uses cache/synthetic when rate limited)
    const entryResult = await this._getOptimalEntryPrice(symbol, direction);

    let entryPrice, midPrice;
    if (!entryResult.ok) {
      // Fallback to suggested entry price if orderbook completely fails
      entryPrice = suggestedEntry;
      midPrice = suggestedEntry;
    } else {
      entryPrice = entryResult.value.price;
      midPrice = entryResult.value.midPrice;
    }

    // Check slippage (skip for paper mode with fallback data)
    if (this.mode !== 'paper' || entryResult.ok) {
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
    }

    // Execute trade
    if (this.mode === 'paper') {
      return this._executePaperTrade(params, entryPrice, params.signal);
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
   * Get all positions with live prices and P&L
   */
  getPositions() {
    if (this.mode === 'paper') {
      const positions = {};
      for (const [symbol, position] of this.paperPositions) {
        // Get current price from data agent ticker cache
        let currentPrice = position.entryPrice;
        if (this.dataAgent && this.dataAgent.tickerCache) {
          const ticker = this.dataAgent.tickerCache.get(symbol);
          if (ticker && ticker.price) {
            currentPrice = ticker.price;
          }
        }

        // Calculate unrealized P&L
        const priceDiff = position.direction === 'long'
          ? currentPrice - position.entryPrice
          : position.entryPrice - currentPrice;
        const unrealizedPnL = priceDiff * position.size;
        const unrealizedPnLPercent = (priceDiff / position.entryPrice) * position.leverage * 100;

        positions[symbol] = {
          ...position,
          currentPrice,
          unrealizedPnL,
          unrealizedPnLPercent
        };
      }
      return positions;
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

  _executePaperTrade(params, entryPrice, signal) {
    const { symbol, direction, size, leverage, stopLoss, takeProfit } = params;

    const orderId = `paper-${this.paperOrderId++}`;
    // size is already the dollar notional value (e.g., $300)
    const notional = size;
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

    // Log trade entry
    this._logTradeEntry(position, signal);

    this.emit('positionOpened', position);

    return { ok: true, value: position };
  }

  _closePaperPosition(symbol, reason) {
    const position = this.paperPositions.get(symbol);
    if (!position) {
      return { ok: false, error: { code: 'NO_POSITION', message: 'Position not found' } };
    }

    // Get current price from ticker cache (REAL DATA)
    let currentPrice = position.currentPrice || position.entryPrice;
    if (this.dataAgent && this.dataAgent.tickerCache) {
      const ticker = this.dataAgent.tickerCache.get(symbol);
      if (ticker && ticker.price) {
        currentPrice = ticker.price;
      }
    }

    // Use the dedicated method with real price
    return this._closePaperPositionWithPrice(symbol, reason, currentPrice);
  }

  /**
   * Check paper positions for SL/TP hits and manage trailing stops
   */
  checkPaperPositions(prices) {
    for (const [symbol, position] of this.paperPositions) {
      const currentPrice = prices[symbol];
      if (!currentPrice) continue;

      // Calculate current ROI
      const roi = this._calculateROI(position, currentPrice);
      position.currentROI = roi;
      position.currentPrice = currentPrice;

      // Update high water mark
      if (!position.highROI || roi > position.highROI) {
        position.highROI = roi;
      }

      let shouldClose = false;
      let reason = '';

      // 1. Check stop loss hit
      if (position.direction === 'long' && currentPrice <= position.stopLoss) {
        shouldClose = true;
        reason = 'stop_loss';
      } else if (position.direction === 'short' && currentPrice >= position.stopLoss) {
        shouldClose = true;
        reason = 'stop_loss';
      }

      // 2. Check take profit hit
      if (!shouldClose) {
        if (position.direction === 'long' && currentPrice >= position.takeProfit) {
          shouldClose = true;
          reason = 'take_profit';
        } else if (position.direction === 'short' && currentPrice <= position.takeProfit) {
          shouldClose = true;
          reason = 'take_profit';
        }
      }

      // 3. Break-even stop management
      if (!shouldClose && this.breakEvenEnabled && !position.breakEvenActivated) {
        if (roi >= this.breakEvenActivation) {
          const newStop = this._calculateBreakEvenStop(position);
          if (this._isBetterStop(position, newStop)) {
            const oldStop = position.stopLoss;
            position.stopLoss = newStop;
            position.breakEvenActivated = true;
            console.log(`   🛡️  [BREAK-EVEN] ${symbol} | Stop moved: $${oldStop.toFixed(6)} → $${newStop.toFixed(6)} | ROI: +${roi.toFixed(1)}%`);
          }
        }
      }

      // 4. Trailing stop management (only after break-even)
      if (!shouldClose && this.trailingEnabled && position.breakEvenActivated) {
        if (roi >= this.trailingActivation) {
          const newTrailStop = this._calculateTrailingStop(position, currentPrice);
          if (this._isBetterStop(position, newTrailStop)) {
            const oldStop = position.stopLoss;
            position.stopLoss = newTrailStop;
            position.trailingActive = true;
            console.log(`   📈 [TRAILING] ${symbol} | Stop moved: $${oldStop.toFixed(6)} → $${newTrailStop.toFixed(6)} | ROI: +${roi.toFixed(1)}%`);
          }
        }
      }

      if (shouldClose) {
        this._closePaperPositionWithPrice(symbol, reason, currentPrice);
      }
    }
  }

  /**
   * Calculate ROI for position
   */
  _calculateROI(position, currentPrice) {
    const priceDiff = position.direction === 'long'
      ? (currentPrice - position.entryPrice) / position.entryPrice
      : (position.entryPrice - currentPrice) / position.entryPrice;
    return priceDiff * position.leverage * 100;
  }

  /**
   * Calculate break-even stop price
   */
  _calculateBreakEvenStop(position) {
    const buffer = this.breakEvenBuffer / position.leverage / 100;
    if (position.direction === 'long') {
      return position.entryPrice * (1 + buffer);
    } else {
      return position.entryPrice * (1 - buffer);
    }
  }

  /**
   * Calculate trailing stop price
   */
  _calculateTrailingStop(position, currentPrice) {
    const trailDistance = this.trailingDistance / position.leverage / 100;
    if (position.direction === 'long') {
      return currentPrice * (1 - trailDistance);
    } else {
      return currentPrice * (1 + trailDistance);
    }
  }

  /**
   * Check if new stop is better (closer to profit, never worse)
   */
  _isBetterStop(position, newStop) {
    if (position.direction === 'long') {
      return newStop > position.stopLoss;
    } else {
      return newStop < position.stopLoss;
    }
  }

  /**
   * Close paper position with specific price
   */
  _closePaperPositionWithPrice(symbol, reason, exitPrice) {
    const position = this.paperPositions.get(symbol);
    if (!position) return { ok: false, error: { code: 'NO_POSITION' } };

    // Calculate PnL
    let pnl;
    if (position.direction === 'long') {
      pnl = new D(exitPrice).sub(position.entryPrice).div(position.entryPrice)
        .mul(position.leverage).mul(position.margin).toNumber();
    } else {
      pnl = new D(position.entryPrice).sub(exitPrice).div(position.entryPrice)
        .mul(position.leverage).mul(position.margin).toNumber();
    }

    // Return margin + PnL
    this.paperBalance += position.margin + pnl;

    const closedPosition = {
      ...position,
      exitPrice,
      pnl,
      closeTime: Date.now(),
      reason,
      finalROI: this._calculateROI(position, exitPrice)
    };

    this.orderHistory.push(closedPosition);
    this.paperPositions.delete(symbol);

    const emoji = pnl >= 0 ? '✅' : '❌';
    const reasonEmoji = reason === 'take_profit' ? '🎯' : reason === 'stop_loss' ? '🛑' : reason === 'trailing_stop' ? '📈' : '📤';
    const dir = position.direction === 'long' ? '🟢' : '🔴';
    console.log(`   ${emoji} [EXIT] ${dir} ${symbol} | ${reasonEmoji} ${reason.toUpperCase()} | Entry: $${position.entryPrice.toFixed(6)} Exit: $${exitPrice.toFixed(6)} | PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${closedPosition.finalROI >= 0 ? '+' : ''}${closedPosition.finalROI.toFixed(1)}%)`);
    this.log(`${emoji} ${symbol} closed: ${reason} | PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} | ROI: ${closedPosition.finalROI.toFixed(1)}%`);

    // Log trade exit and update performance
    this._logTradeExit(closedPosition);
    this._updatePerformance(closedPosition);

    this.emit('positionClosed', closedPosition);
    return { ok: true, value: closedPosition };
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
