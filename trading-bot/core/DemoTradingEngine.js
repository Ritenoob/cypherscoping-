// ============================================================================
// DEMO TRADING ENGINE - Systematic Paper Trading Strategy
// ============================================================================
//
// PURPOSE: Automated paper trading system using multi-indicator confluence
// - Analyzes real-time market data and indicator signals
// - Places demo trades when multiple indicators align
// - Tracks performance metrics (win rate, profit factor, drawdown)
// - Optimizes parameters based on results
// - Operates with paper money only (no real capital at risk)
//
// STRATEGY:
// - Entry: Multiple indicator confluence + signal strength threshold
// - Exit: Stop loss, take profit, and adaptive trailing stops
// - Risk: Position sizing based on volatility (ATR)
// - Optimization: Adjusts thresholds based on recent performance
// ============================================================================

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class DemoTradingEngine extends EventEmitter {
  constructor(config = {}) {
    super();

    // Demo account settings
    this.paperBalance = config.initialBalance || 10000; // $10k paper money
    this.initialBalance = this.paperBalance;
    this.maxPositions = config.maxPositions || 3;
    this.maxRiskPerTrade = config.maxRiskPerTrade || 2.0; // 2% of balance

    // Strategy parameters (will be optimized)
    this.params = {
      // Entry thresholds
      minSignalScore: 60,           // Minimum signal strength to enter
      minIndicatorConfluence: 3,    // Minimum indicators agreeing

      // Risk management
      initialStopLoss: 2.0,         // % stop loss (leveraged ROI)
      initialTakeProfit: 4.0,       // % take profit (leveraged ROI)
      maxLeverage: 10,              // Maximum leverage allowed
      minLeverage: 3,               // Minimum leverage

      // Volatility-based adjustments
      lowVolatilityThreshold: 1.0,  // ATR% threshold
      highVolatilityThreshold: 3.0, // ATR% threshold

      // Trailing stop
      trailingStopActivation: 1.5,  // Activate after 1.5% profit
      trailingStopDistance: 0.5,    // Trail by 0.5%
    };

    // Active demo positions
    this.positions = new Map(); // symbol -> position object

    // Performance tracking
    this.trades = [];
    this.metrics = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      grossProfit: 0,
      grossLoss: 0,
      winRate: 0,
      profitFactor: 0,
      expectancy: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      peakBalance: this.paperBalance,
    };

    // Market data cache
    this.marketData = {};
    this.indicators = {};
    this.signals = {};

    // Optimization state
    this.optimizationWindow = 20; // trades
    this.lastOptimization = Date.now();
    this.optimizationInterval = 3600000; // 1 hour

    // State
    this.enabled = false;
    this.logFile = path.join(__dirname, '../logs/demo-trading.log');

    this.log('info', 'Demo Trading Engine initialized', {
      balance: this.paperBalance,
      params: this.params
    });
  }

  // ========================================================================
  // CORE TRADING LOGIC
  // ========================================================================

  /**
   * Process market update and check for trading opportunities
   */
  async onMarketUpdate(symbol, data) {
    if (!this.enabled) return;

    // Update market data cache
    this.marketData[symbol] = data.marketData;
    this.indicators[symbol] = data.indicators;
    this.signals[symbol] = data.signal;

    // Update existing positions
    if (this.positions.has(symbol)) {
      await this.updatePosition(symbol, data);
    }

    // Check for new entry opportunities
    if (this.positions.size < this.maxPositions) {
      await this.checkEntrySignal(symbol, data);
    }
  }

  /**
   * Analyze indicators and determine if entry signal is valid
   */
  async checkEntrySignal(symbol, data) {
    const { indicators, signal, marketData } = data;

    // Skip if already in position
    if (this.positions.has(symbol)) return;

    // Skip if insufficient data
    if (!indicators || !signal || !marketData) return;

    // Analyze signal strength
    const signalScore = signal.score || 0;
    const signalType = signal.type || 'NEUTRAL';

    // Check if signal meets minimum threshold
    if (Math.abs(signalScore) < this.params.minSignalScore) {
      return;
    }

    // Count indicator confluence
    const confluence = this.calculateConfluence(indicators, signalType);

    if (confluence.count < this.params.minIndicatorConfluence) {
      this.log('debug', `${symbol}: Insufficient confluence (${confluence.count}/${this.params.minIndicatorConfluence})`);
      return;
    }

    // Determine trade direction
    const side = signalType.includes('BUY') ? 'long' : signalType.includes('SELL') ? 'short' : null;

    if (!side) return;

    // Calculate position size and leverage based on volatility
    const atrPercent = indicators.atrPercent || 2.0;
    const leverage = this.calculateLeverage(atrPercent);
    const positionSize = this.calculatePositionSize(atrPercent);

    // Risk check
    const riskAmount = (positionSize / 100) * this.paperBalance;
    if (riskAmount > (this.maxRiskPerTrade / 100) * this.paperBalance) {
      this.log('warn', `${symbol}: Risk too high ($${riskAmount.toFixed(2)} > $${((this.maxRiskPerTrade / 100) * this.paperBalance).toFixed(2)})`);
      return;
    }

    // Enter position
    await this.enterPosition(symbol, {
      side,
      entryPrice: marketData.price,
      positionSize,
      leverage,
      signalScore,
      confluence: confluence.count,
      indicators,
      atrPercent
    });
  }

  /**
   * Calculate indicator confluence (how many agree on direction)
   */
  calculateConfluence(indicators, signalType) {
    const bullish = signalType.includes('BUY');
    let count = 0;
    const agreeing = [];

    // RSI
    if (bullish && indicators.rsi < 50) { count++; agreeing.push('RSI'); }
    if (!bullish && indicators.rsi > 50) { count++; agreeing.push('RSI'); }

    // MACD
    if (bullish && indicators.macd > 0) { count++; agreeing.push('MACD'); }
    if (!bullish && indicators.macd < 0) { count++; agreeing.push('MACD'); }

    // Williams %R
    if (bullish && indicators.williamsR < -50) { count++; agreeing.push('WilliamsR'); }
    if (!bullish && indicators.williamsR > -50) { count++; agreeing.push('WilliamsR'); }

    // Awesome Oscillator
    if (bullish && indicators.ao > 0) { count++; agreeing.push('AO'); }
    if (!bullish && indicators.ao < 0) { count++; agreeing.push('AO'); }

    // EMA trend
    if (bullish && indicators.ema50 > indicators.ema200) { count++; agreeing.push('EMA_Trend'); }
    if (!bullish && indicators.ema50 < indicators.ema200) { count++; agreeing.push('EMA_Trend'); }

    // Price vs EMA50
    if (bullish && indicators.price > indicators.ema50) { count++; agreeing.push('Price_EMA50'); }
    if (!bullish && indicators.price < indicators.ema50) { count++; agreeing.push('Price_EMA50'); }

    return { count, agreeing };
  }

  /**
   * Calculate optimal leverage based on volatility
   */
  calculateLeverage(atrPercent) {
    // Lower leverage in high volatility, higher leverage in low volatility
    if (atrPercent < this.params.lowVolatilityThreshold) {
      return this.params.maxLeverage;
    } else if (atrPercent > this.params.highVolatilityThreshold) {
      return this.params.minLeverage;
    } else {
      // Linear interpolation
      const range = this.params.highVolatilityThreshold - this.params.lowVolatilityThreshold;
      const position = (atrPercent - this.params.lowVolatilityThreshold) / range;
      const leverageRange = this.params.maxLeverage - this.params.minLeverage;
      return Math.round(this.params.maxLeverage - (position * leverageRange));
    }
  }

  /**
   * Calculate position size as % of balance based on volatility
   */
  calculatePositionSize(atrPercent) {
    // Smaller positions in high volatility
    const baseSize = 2.0; // 2% of balance
    if (atrPercent > this.params.highVolatilityThreshold) {
      return baseSize * 0.5; // 1%
    } else if (atrPercent < this.params.lowVolatilityThreshold) {
      return baseSize * 1.5; // 3%
    }
    return baseSize;
  }

  /**
   * Enter a demo position
   */
  async enterPosition(symbol, config) {
    const { side, entryPrice, positionSize, leverage, signalScore, confluence, indicators, atrPercent } = config;

    // Calculate position value
    const marginUsed = (positionSize / 100) * this.paperBalance;
    const positionValue = marginUsed * leverage;

    // Calculate stop loss and take profit
    const slDistance = this.params.initialStopLoss;
    const tpDistance = this.params.initialTakeProfit;

    const stopLoss = side === 'long'
      ? entryPrice * (1 - (slDistance / leverage) / 100)
      : entryPrice * (1 + (slDistance / leverage) / 100);

    const takeProfit = side === 'long'
      ? entryPrice * (1 + (tpDistance / leverage) / 100)
      : entryPrice * (1 - (tpDistance / leverage) / 100);

    // Create position object
    const position = {
      symbol,
      side,
      entryPrice,
      currentPrice: entryPrice,
      positionSize,
      leverage,
      marginUsed,
      positionValue,
      stopLoss,
      initialStopLoss: stopLoss,
      takeProfit,
      trailingStopActive: false,
      highestPrice: side === 'long' ? entryPrice : null,
      lowestPrice: side === 'short' ? entryPrice : null,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      signalScore,
      confluence,
      entryTime: Date.now(),
      atrPercent,
      status: 'open'
    };

    this.positions.set(symbol, position);

    this.log('info', `📈 DEMO ENTRY: ${symbol} ${side.toUpperCase()}`, {
      entry: entryPrice.toFixed(2),
      size: `${positionSize.toFixed(2)}%`,
      leverage: `${leverage}x`,
      value: `$${positionValue.toFixed(2)}`,
      sl: stopLoss.toFixed(2),
      tp: takeProfit.toFixed(2),
      signal: signalScore,
      confluence,
      atr: `${atrPercent.toFixed(2)}%`
    });

    this.emit('position_opened', position);
  }

  /**
   * Update existing position with new price data
   */
  async updatePosition(symbol, data) {
    const position = this.positions.get(symbol);
    if (!position || position.status !== 'open') return;

    const currentPrice = data.marketData.price;
    position.currentPrice = currentPrice;

    // Update highest/lowest for trailing
    if (position.side === 'long') {
      if (!position.highestPrice || currentPrice > position.highestPrice) {
        position.highestPrice = currentPrice;
      }
    } else {
      if (!position.lowestPrice || currentPrice < position.lowestPrice) {
        position.lowestPrice = currentPrice;
      }
    }

    // Calculate P&L
    const priceDiff = position.side === 'long'
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice;

    position.unrealizedPnl = (priceDiff / position.entryPrice) * position.positionValue;
    position.unrealizedPnlPercent = (position.unrealizedPnl / position.marginUsed) * 100;

    // Check trailing stop activation
    if (!position.trailingStopActive && position.unrealizedPnlPercent > this.params.trailingStopActivation) {
      position.trailingStopActive = true;
      this.log('info', `${symbol}: Trailing stop activated at +${position.unrealizedPnlPercent.toFixed(2)}%`);
    }

    // Update trailing stop
    if (position.trailingStopActive) {
      const trailDistance = this.params.trailingStopDistance / position.leverage / 100;

      if (position.side === 'long') {
        const newSL = position.highestPrice * (1 - trailDistance);
        if (newSL > position.stopLoss) {
          position.stopLoss = newSL;
        }
      } else {
        const newSL = position.lowestPrice * (1 + trailDistance);
        if (newSL < position.stopLoss) {
          position.stopLoss = newSL;
        }
      }
    }

    // Check exit conditions
    const slHit = position.side === 'long'
      ? currentPrice <= position.stopLoss
      : currentPrice >= position.stopLoss;

    const tpHit = position.side === 'long'
      ? currentPrice >= position.takeProfit
      : currentPrice <= position.takeProfit;

    if (slHit) {
      await this.closePosition(symbol, 'Stop Loss', position.stopLoss);
    } else if (tpHit) {
      await this.closePosition(symbol, 'Take Profit', position.takeProfit);
    }
  }

  /**
   * Close a demo position
   */
  async closePosition(symbol, reason, exitPrice = null) {
    const position = this.positions.get(symbol);
    if (!position) return;

    exitPrice = exitPrice || position.currentPrice;

    // Calculate final P&L
    const priceDiff = position.side === 'long'
      ? exitPrice - position.entryPrice
      : position.entryPrice - exitPrice;

    const realizedPnl = (priceDiff / position.entryPrice) * position.positionValue;
    const realizedPnlPercent = (realizedPnl / position.marginUsed) * 100;

    // Update balance
    this.paperBalance += realizedPnl;

    // Record trade
    const trade = {
      ...position,
      exitPrice,
      exitTime: Date.now(),
      duration: Date.now() - position.entryTime,
      realizedPnl,
      realizedPnlPercent,
      reason,
      status: 'closed'
    };

    this.trades.push(trade);
    this.positions.delete(symbol);

    // Update metrics
    this.updateMetrics(trade);

    this.log('info', `📊 DEMO EXIT: ${symbol} ${reason}`, {
      entry: position.entryPrice.toFixed(2),
      exit: exitPrice.toFixed(2),
      pnl: `${realizedPnl >= 0 ? '+' : ''}$${realizedPnl.toFixed(2)}`,
      pnlPercent: `${realizedPnlPercent >= 0 ? '+' : ''}${realizedPnlPercent.toFixed(2)}%`,
      duration: `${Math.round((Date.now() - position.entryTime) / 60000)}m`,
      balance: `$${this.paperBalance.toFixed(2)}`
    });

    this.emit('position_closed', trade);

    // Check if optimization needed
    if (this.trades.length % this.optimizationWindow === 0) {
      await this.optimizeParameters();
    }

    // Save trade history
    this.saveTrades();
  }

  // ========================================================================
  // PERFORMANCE TRACKING
  // ========================================================================

  /**
   * Update performance metrics
   */
  updateMetrics(trade) {
    this.metrics.totalTrades++;

    if (trade.realizedPnl > 0) {
      this.metrics.winningTrades++;
      this.metrics.grossProfit += trade.realizedPnl;
    } else {
      this.metrics.losingTrades++;
      this.metrics.grossLoss += Math.abs(trade.realizedPnl);
    }

    // Win rate
    this.metrics.winRate = (this.metrics.winningTrades / this.metrics.totalTrades) * 100;

    // Profit factor
    this.metrics.profitFactor = this.metrics.grossLoss > 0
      ? this.metrics.grossProfit / this.metrics.grossLoss
      : this.metrics.grossProfit > 0 ? Infinity : 0;

    // Expectancy
    const avgWin = this.metrics.winningTrades > 0
      ? this.metrics.grossProfit / this.metrics.winningTrades
      : 0;
    const avgLoss = this.metrics.losingTrades > 0
      ? this.metrics.grossLoss / this.metrics.losingTrades
      : 0;
    this.metrics.expectancy = (this.metrics.winRate / 100) * avgWin - ((100 - this.metrics.winRate) / 100) * avgLoss;

    // Drawdown
    if (this.paperBalance > this.metrics.peakBalance) {
      this.metrics.peakBalance = this.paperBalance;
      this.metrics.currentDrawdown = 0;
    } else {
      this.metrics.currentDrawdown = ((this.metrics.peakBalance - this.paperBalance) / this.metrics.peakBalance) * 100;
      if (this.metrics.currentDrawdown > this.metrics.maxDrawdown) {
        this.metrics.maxDrawdown = this.metrics.currentDrawdown;
      }
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      balance: this.paperBalance,
      initialBalance: this.initialBalance,
      totalReturn: ((this.paperBalance - this.initialBalance) / this.initialBalance) * 100,
      activePositions: this.positions.size,
      totalTrades: this.trades.length
    };
  }

  // ========================================================================
  // PARAMETER OPTIMIZATION
  // ========================================================================

  /**
   * Optimize parameters based on recent performance
   */
  async optimizeParameters() {
    if (this.trades.length < this.optimizationWindow) return;

    this.log('info', '🔧 Running parameter optimization...');

    // Get recent trades
    const recentTrades = this.trades.slice(-this.optimizationWindow);

    // Calculate recent performance
    const recentWinRate = (recentTrades.filter(t => t.realizedPnl > 0).length / recentTrades.length) * 100;
    const avgPnl = recentTrades.reduce((sum, t) => sum + t.realizedPnl, 0) / recentTrades.length;

    // Adjust signal threshold based on win rate
    if (recentWinRate < 40) {
      // Too many losses - be more selective
      this.params.minSignalScore = Math.min(80, this.params.minSignalScore + 5);
      this.params.minIndicatorConfluence = Math.min(5, this.params.minIndicatorConfluence + 1);
      this.log('info', `Tightening entry criteria: score=${this.params.minSignalScore}, confluence=${this.params.minIndicatorConfluence}`);
    } else if (recentWinRate > 70 && avgPnl > 0) {
      // High win rate - can be slightly less selective
      this.params.minSignalScore = Math.max(50, this.params.minSignalScore - 5);
      this.log('info', `Relaxing entry criteria: score=${this.params.minSignalScore}`);
    }

    // Adjust stop loss based on average loss
    const losses = recentTrades.filter(t => t.realizedPnl < 0);
    if (losses.length > 0) {
      const avgLossPercent = losses.reduce((sum, t) => sum + Math.abs(t.realizedPnlPercent), 0) / losses.length;
      if (avgLossPercent > 3.0) {
        // Losses too large - tighten stops
        this.params.initialStopLoss = Math.max(1.0, this.params.initialStopLoss - 0.2);
        this.log('info', `Tightening stop loss: ${this.params.initialStopLoss.toFixed(1)}%`);
      }
    }

    this.lastOptimization = Date.now();
    this.log('info', `Optimization complete. Win rate: ${recentWinRate.toFixed(1)}%, Avg P&L: $${avgPnl.toFixed(2)}`);
  }

  // ========================================================================
  // CONTROL & PERSISTENCE
  // ========================================================================

  /**
   * Enable/disable demo trading
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.log('info', `Demo trading ${enabled ? 'ENABLED' : 'DISABLED'}`);
    this.emit('status_changed', { enabled });
  }

  /**
   * Reset demo account
   */
  reset() {
    this.paperBalance = this.initialBalance;
    this.positions.clear();
    this.trades = [];
    this.metrics = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      grossProfit: 0,
      grossLoss: 0,
      winRate: 0,
      profitFactor: 0,
      expectancy: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      peakBalance: this.paperBalance,
    };
    this.log('info', 'Demo account reset');
    this.emit('reset');
  }

  /**
   * Save trade history to file
   */
  saveTrades() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const data = {
      trades: this.trades,
      metrics: this.getMetrics(),
      params: this.params,
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync(
      this.logFile.replace('.log', '.json'),
      JSON.stringify(data, null, 2)
    );
  }

  /**
   * Logging utility
   */
  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [DEMO-${level.toUpperCase()}] ${message}`;

    console.log(logMessage, data || '');

    // Append to log file
    try {
      const logDir = path.dirname(this.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(this.logFile, logMessage + (data ? ' ' + JSON.stringify(data) : '') + '\n');
    } catch (error) {
      // Silent fail on log write error
    }
  }
}

module.exports = DemoTradingEngine;
