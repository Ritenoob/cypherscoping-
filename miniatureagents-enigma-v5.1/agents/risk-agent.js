/**
 * RiskAgent - Trade Gatekeeper & Risk Management
 * 
 * Every trade MUST pass through Risk Agent before execution.
 * Enforces position limits, leverage caps, drawdown controls.
 */

const { AgentBase, Decimal } = require('./agent-base');
const D = Decimal;

class RiskAgent extends AgentBase {
  constructor(config = {}) {
    super({
      id: 'risk-agent',
      name: 'Risk Agent',
      options: config
    });

    // Risk parameters (with defaults)
    this.params = {
      // Position sizing
      maxPositionPercent: config.maxPositionPercent || 2.0,
      minPositionPercent: config.minPositionPercent || 0.1,
      maxOpenPositions: config.maxOpenPositions || 5,
      maxTotalExposure: config.maxTotalExposure || 10.0,

      // Leverage
      minLeverage: 1,
      maxLeverage: config.maxLeverage || 100,
      defaultLeverage: config.defaultLeverage || 50,

      // Stop loss / Take profit (ROI %)
      stopLossROI: config.stopLossROI || 0.5,
      takeProfitROI: config.takeProfitROI || 2.0,
      minLiquidationBuffer: config.minLiquidationBuffer || 0.05,

      // Trailing stop
      trailingEnabled: config.trailingEnabled !== false,
      trailingActivation: config.trailingActivation || 1.0,
      trailingDistance: config.trailingDistance || 0.3,
      trailingStep: config.trailingStep || 0.5,

      // Drawdown controls
      maxDailyDrawdown: config.maxDailyDrawdown || 5.0,
      maxConsecutiveLosses: config.maxConsecutiveLosses || 5,

      // Fees
      takerFee: config.takerFee || 0.0006,
      makerFee: config.makerFee || 0.0002,
      slippageBuffer: config.slippageBuffer || 0.0002,

      // ATR-based leverage tiers
      atrTiers: config.atrTiers || {
        veryLow: { threshold: 0.3, leverage: 100 },
        low: { threshold: 0.5, leverage: 75 },
        medium: { threshold: 1.0, leverage: 50 },
        high: { threshold: 2.0, leverage: 25 },
        veryHigh: { threshold: 3.0, leverage: 10 },
        extreme: { threshold: Infinity, leverage: 5 }
      }
    };

    // State
    this.positions = new Map();
    this.dailyPnL = 0;
    this.startOfDayBalance = 0;
    this.consecutiveLosses = 0;
    this.tradeHistory = [];
  }

  async initialize() {
    this.log('Initializing Risk Agent');
    this.startOfDayBalance = 0; // Will be set on first balance update
    
    // Message handlers
    this.onMessage('VALIDATE_TRADE', this._handleValidateTrade.bind(this));
    this.onMessage('UPDATE_POSITION', this._handleUpdatePosition.bind(this));
    this.onMessage('UPDATE_BALANCE', this._handleUpdateBalance.bind(this));
    this.onMessage('RECORD_TRADE_RESULT', this._handleTradeResult.bind(this));

    return { ok: true, value: null };
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Validate and approve/reject a trade
   * @param {Object} trade
   * @returns {Result}
   */
  validateTrade(trade) {
    const checks = this._runValidationChecks(trade);
    
    if (!checks.passed) {
      this.emit('tradeRejected', { trade, reason: checks.failures });
      return { ok: false, error: { code: 'VALIDATION_FAILED', failures: checks.failures } };
    }

    // Calculate position details
    const positionDetails = this._calculatePositionDetails(trade);
    
    this.emit('tradeApproved', { trade, positionDetails });
    return { ok: true, value: positionDetails };
  }

  /**
   * Calculate position sizing
   */
  calculatePosition(params) {
    const { balance, positionPercent, price, leverage, multiplier, lotSize } = params;
    
    const notional = new D(balance).mul(positionPercent).div(100);
    const rawSize = notional.mul(leverage).div(price).div(multiplier);
    const size = rawSize.div(lotSize).floor().mul(lotSize);
    
    return {
      size: size.toNumber(),
      notional: notional.toNumber(),
      margin: notional.div(leverage).toNumber()
    };
  }

  /**
   * Calculate stop loss price
   */
  calculateStopLoss(entryPrice, leverage, direction, stopLossROI = null) {
    const slROI = stopLossROI || this.params.stopLossROI;
    const movement = new D(slROI).div(leverage).div(100);
    
    if (direction === 'long') {
      return new D(entryPrice).mul(new D(1).sub(movement)).toNumber();
    } else {
      return new D(entryPrice).mul(new D(1).add(movement)).toNumber();
    }
  }

  /**
   * Calculate take profit price
   */
  calculateTakeProfit(entryPrice, leverage, direction, takeProfitROI = null) {
    const tpROI = takeProfitROI || this.params.takeProfitROI;
    const movement = new D(tpROI).div(leverage).div(100);
    
    if (direction === 'long') {
      return new D(entryPrice).mul(new D(1).add(movement)).toNumber();
    } else {
      return new D(entryPrice).mul(new D(1).sub(movement)).toNumber();
    }
  }

  /**
   * Calculate liquidation price
   */
  calculateLiquidation(entryPrice, leverage, direction, maintMargin = 0.005) {
    const factor = new D(1).div(leverage).mul(new D(1).sub(maintMargin));
    
    if (direction === 'long') {
      return new D(entryPrice).mul(new D(1).sub(factor)).toNumber();
    } else {
      return new D(entryPrice).mul(new D(1).add(factor)).toNumber();
    }
  }

  /**
   * Calculate break-even ROI (fee-adjusted)
   */
  calculateBreakEvenROI(leverage, useMaker = false) {
    const fee = useMaker ? this.params.makerFee : this.params.takerFee;
    const totalFees = new D(fee).mul(2); // Entry + exit
    return totalFees.mul(leverage).mul(100).add(0.05).toNumber(); // +0.05% buffer
  }

  /**
   * Calculate auto leverage based on ATR%
   */
  calculateAutoLeverage(atrPercent) {
    const { atrTiers } = this.params;
    
    if (atrPercent <= atrTiers.veryLow.threshold) return atrTiers.veryLow.leverage;
    if (atrPercent <= atrTiers.low.threshold) return atrTiers.low.leverage;
    if (atrPercent <= atrTiers.medium.threshold) return atrTiers.medium.leverage;
    if (atrPercent <= atrTiers.high.threshold) return atrTiers.high.leverage;
    if (atrPercent <= atrTiers.veryHigh.threshold) return atrTiers.veryHigh.leverage;
    return atrTiers.extreme.leverage;
  }

  /**
   * Update trailing stop (staircase logic - NEVER untrail)
   */
  updateTrailingStop(position, currentPrice) {
    if (!this.params.trailingEnabled) return { updated: false, stopPrice: position.stopLoss };
    
    const { entryPrice, leverage, direction, stopLoss: currentStop } = position;
    const { trailingActivation, trailingDistance, trailingStep } = this.params;

    // Calculate current ROI
    let currentROI;
    if (direction === 'long') {
      currentROI = new D(currentPrice).sub(entryPrice).div(entryPrice).mul(100).mul(leverage).toNumber();
    } else {
      currentROI = new D(entryPrice).sub(currentPrice).div(entryPrice).mul(100).mul(leverage).toNumber();
    }

    // Not activated yet
    if (currentROI < trailingActivation) {
      return { updated: false, stopPrice: currentStop, currentROI };
    }

    // Calculate staircase level
    const level = Math.floor(currentROI / trailingStep) * trailingStep;
    const trailROI = level - trailingDistance;

    // Calculate new stop price
    let newStop;
    if (direction === 'long') {
      const movement = new D(trailROI).div(leverage).div(100);
      newStop = new D(entryPrice).mul(new D(1).add(movement)).toNumber();
    } else {
      const movement = new D(trailROI).div(leverage).div(100);
      newStop = new D(entryPrice).mul(new D(1).sub(movement)).toNumber();
    }

    // CRITICAL: Never untrail
    if (direction === 'long' && newStop <= currentStop) {
      return { updated: false, stopPrice: currentStop, currentROI, level };
    }
    if (direction === 'short' && newStop >= currentStop) {
      return { updated: false, stopPrice: currentStop, currentROI, level };
    }

    return { updated: true, stopPrice: newStop, currentROI, level };
  }

  // ===========================================================================
  // VALIDATION CHECKS
  // ===========================================================================

  _runValidationChecks(trade) {
    const failures = [];

    // Check 1: Position size within limits
    if (trade.positionPercent > this.params.maxPositionPercent) {
      failures.push({ check: 'POSITION_SIZE', message: `Position ${trade.positionPercent}% exceeds max ${this.params.maxPositionPercent}%` });
    }

    // Check 2: Max open positions
    if (this.positions.size >= this.params.maxOpenPositions && !this.positions.has(trade.symbol)) {
      failures.push({ check: 'MAX_POSITIONS', message: `Already have ${this.positions.size} open positions` });
    }

    // Check 3: Leverage within bounds
    if (trade.leverage < this.params.minLeverage || trade.leverage > this.params.maxLeverage) {
      failures.push({ check: 'LEVERAGE', message: `Leverage ${trade.leverage}x outside bounds [${this.params.minLeverage}, ${this.params.maxLeverage}]` });
    }

    // Check 4: Daily drawdown
    if (this.startOfDayBalance > 0) {
      const currentDrawdown = (this.dailyPnL / this.startOfDayBalance) * 100;
      if (currentDrawdown <= -this.params.maxDailyDrawdown) {
        failures.push({ check: 'DAILY_DRAWDOWN', message: `Daily drawdown ${currentDrawdown.toFixed(2)}% exceeds max ${this.params.maxDailyDrawdown}%` });
      }
    }

    // Check 5: Consecutive losses
    if (this.consecutiveLosses >= this.params.maxConsecutiveLosses) {
      failures.push({ check: 'CONSECUTIVE_LOSSES', message: `${this.consecutiveLosses} consecutive losses reached limit` });
    }

    // Check 6: Total exposure
    const currentExposure = this._calculateTotalExposure();
    const newExposure = currentExposure + (trade.positionPercent || this.params.maxPositionPercent);
    if (newExposure > this.params.maxTotalExposure) {
      failures.push({ check: 'TOTAL_EXPOSURE', message: `Total exposure ${newExposure.toFixed(2)}% would exceed max ${this.params.maxTotalExposure}%` });
    }

    // Check 7: Liquidation buffer
    if (trade.entryPrice && trade.leverage) {
      const liqPrice = this.calculateLiquidation(trade.entryPrice, trade.leverage, trade.direction);
      const buffer = Math.abs(trade.entryPrice - liqPrice) / trade.entryPrice;
      if (buffer < this.params.minLiquidationBuffer) {
        failures.push({ check: 'LIQUIDATION_BUFFER', message: `Liquidation buffer ${(buffer * 100).toFixed(2)}% below minimum ${this.params.minLiquidationBuffer * 100}%` });
      }
    }

    // Check 8: Break-even achievable
    if (trade.leverage && trade.takeProfitROI) {
      const beROI = this.calculateBreakEvenROI(trade.leverage);
      if (trade.takeProfitROI < beROI) {
        failures.push({ check: 'BREAK_EVEN', message: `TP ROI ${trade.takeProfitROI}% below break-even ${beROI.toFixed(2)}%` });
      }
    }

    return {
      passed: failures.length === 0,
      failures,
      checksRun: 8
    };
  }

  _calculatePositionDetails(trade) {
    const leverage = trade.leverage || this.params.defaultLeverage;
    const direction = trade.direction;
    const entryPrice = trade.entryPrice;

    return {
      symbol: trade.symbol,
      direction,
      entryPrice,
      leverage,
      stopLoss: this.calculateStopLoss(entryPrice, leverage, direction),
      takeProfit: this.calculateTakeProfit(entryPrice, leverage, direction),
      liquidationPrice: this.calculateLiquidation(entryPrice, leverage, direction),
      breakEvenROI: this.calculateBreakEvenROI(leverage),
      positionPercent: trade.positionPercent || this.params.maxPositionPercent,
      timestamp: Date.now()
    };
  }

  _calculateTotalExposure() {
    let total = 0;
    for (const pos of this.positions.values()) {
      total += pos.positionPercent || 0;
    }
    return total;
  }

  // ===========================================================================
  // STATE MANAGEMENT
  // ===========================================================================

  updatePosition(symbol, position) {
    if (position) {
      this.positions.set(symbol, position);
    } else {
      this.positions.delete(symbol);
    }
  }

  updateBalance(balance) {
    if (this.startOfDayBalance === 0) {
      this.startOfDayBalance = balance;
    }
  }

  recordTradeResult(pnl, isWin) {
    this.dailyPnL += pnl;
    
    if (isWin) {
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses++;
    }

    this.tradeHistory.push({
      pnl,
      isWin,
      consecutiveLosses: this.consecutiveLosses,
      dailyPnL: this.dailyPnL,
      timestamp: Date.now()
    });

    // Keep only last 1000 trades
    if (this.tradeHistory.length > 1000) {
      this.tradeHistory.shift();
    }
  }

  resetDailyStats(newBalance) {
    this.dailyPnL = 0;
    this.startOfDayBalance = newBalance;
  }

  // ===========================================================================
  // MESSAGE HANDLERS
  // ===========================================================================

  async _handleValidateTrade(payload) {
    return this.validateTrade(payload);
  }

  async _handleUpdatePosition(payload) {
    this.updatePosition(payload.symbol, payload.position);
    return { ok: true, value: null };
  }

  async _handleUpdateBalance(payload) {
    this.updateBalance(payload.balance);
    return { ok: true, value: null };
  }

  async _handleTradeResult(payload) {
    this.recordTradeResult(payload.pnl, payload.isWin);
    return { ok: true, value: null };
  }

  // ===========================================================================
  // STATUS
  // ===========================================================================

  getRiskStatus() {
    return {
      openPositions: this.positions.size,
      maxOpenPositions: this.params.maxOpenPositions,
      dailyPnL: this.dailyPnL,
      dailyDrawdownPercent: this.startOfDayBalance > 0 
        ? (this.dailyPnL / this.startOfDayBalance) * 100 
        : 0,
      maxDailyDrawdown: this.params.maxDailyDrawdown,
      consecutiveLosses: this.consecutiveLosses,
      maxConsecutiveLosses: this.params.maxConsecutiveLosses,
      totalExposure: this._calculateTotalExposure(),
      maxTotalExposure: this.params.maxTotalExposure
    };
  }
}

module.exports = RiskAgent;
