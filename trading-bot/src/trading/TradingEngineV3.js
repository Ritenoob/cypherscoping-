/**
 * Trading Engine V3 - Unified Paper & Live Trading
 *
 * OPTIMIZED 2026-01-14
 *
 * Key Features:
 * - Integrates SignalGeneratorV2 with optimized weights
 * - Supports both paper and live trading modes
 * - Uses entry requirements: minScore 85, minConfidence 70, 4+ indicators
 * - Implements risk management: 5x leverage, 8% SL, 25% TP
 * - Safety kill switches for live trading
 * - Break-even and trailing stop protection
 *
 * Usage:
 *   const engine = new TradingEngineV3({ mode: 'paper' });  // or 'live'
 *   await engine.start();
 */

const EventEmitter = require('events');
const Decimal = require('decimal.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const SignalGeneratorV2 = require('../lib/SignalGeneratorV2');

// Load signal weights
let signalWeights;
try {
  signalWeights = require('../../signal-weights');
} catch (e) {
  signalWeights = null;
}

class TradingEngineV3 extends EventEmitter {
  constructor(config = {}) {
    super();

    // Trading mode: 'paper' or 'live'
    this.mode = config.mode || process.env.BOT_MODE || 'paper';

    // SAFETY: Live trading requires explicit enable
    this.liveEnabled = process.env.ENABLE_LIVE_TRADING === 'true';

    if (this.mode === 'live' && !this.liveEnabled) {
      console.warn('[TradingEngineV3] SAFETY: Live trading disabled. Set ENABLE_LIVE_TRADING=true in .env');
      this.mode = 'paper';
    }

    // Account Settings
    this.initialBalance = new Decimal(config.initialBalance || parseFloat(process.env.INITIAL_BALANCE) || 10000);
    this.balance = new Decimal(this.initialBalance);

    // API Configuration
    this.apiKey = process.env.KUCOIN_API_KEY;
    this.apiSecret = process.env.KUCOIN_API_SECRET;
    this.apiPassphrase = process.env.KUCOIN_API_PASSPHRASE;
    this.apiVersion = process.env.KUCOIN_API_VERSION || '2';
    this.apiBase = 'https://api-futures.kucoin.com';

    // Risk Management - OPTIMIZED 2026-01-14
    this.riskConfig = {
      // Leverage
      leverageDefault: parseInt(process.env.LEVERAGE_DEFAULT) || 5,
      leverageMin: parseInt(process.env.LEVERAGE_MIN) || 3,
      leverageMax: parseInt(process.env.LEVERAGE_MAX) || 15,

      // Stop Loss / Take Profit (ROI-based)
      stopLossROI: parseFloat(process.env.STOP_LOSS_ROI) || 10,      // 10% ROI
      takeProfitROI: parseFloat(process.env.TAKE_PROFIT_ROI) || 30,  // 30% ROI

      // Break-Even Protection
      breakEvenEnabled: process.env.BREAK_EVEN_ENABLED !== 'false',
      breakEvenActivation: parseFloat(process.env.BREAK_EVEN_ACTIVATION) || 8,  // 8% ROI
      breakEvenBuffer: parseFloat(process.env.BREAK_EVEN_BUFFER) || 1.0,

      // Trailing Stop
      trailingEnabled: process.env.TRAILING_STOP_ENABLED !== 'false',
      trailingActivation: parseFloat(process.env.TRAILING_STOP_ACTIVATION) || 12,  // 12% ROI
      trailingDistance: parseFloat(process.env.TRAILING_STOP_TRAIL) || 4,

      // Position Limits
      maxPositions: parseInt(process.env.MAX_OPEN_POSITIONS) || 5,
      maxPositionSizeUSD: parseFloat(process.env.MAX_POSITION_SIZE_USD) || 5000,
      riskPerTrade: parseFloat(process.env.DEFAULT_RISK_PERCENT) || 2,

      // Fees
      makerFee: parseFloat(process.env.MAKER_FEE) || 0.0002,
      takerFee: parseFloat(process.env.TAKER_FEE) || 0.0006
    };

    // Signal Thresholds - OPTIMIZED 2026-01-14
    this.signalConfig = {
      minScore: parseInt(process.env.SIGNAL_MIN_SCORE) || 85,
      strongScore: parseInt(process.env.SIGNAL_STRONG_SCORE) || 100,
      extremeScore: parseInt(process.env.SIGNAL_EXTREME_SCORE) || 120,
      minConfidence: parseInt(process.env.SIGNAL_MIN_CONFIDENCE) || 70,
      minIndicators: parseInt(process.env.SIGNAL_MIN_INDICATORS) || 4,
      cooldownMs: parseInt(process.env.SIGNAL_COOLDOWN_MS) || 180000
    };

    // Microstructure Filters
    this.microFilters = {
      maxSpread: 0.03,
      maxFundingRate: 0.02,
      extremeBuySellLow: 0.15,
      extremeBuySellHigh: 0.85
    };

    // Signal Generator
    this.signalGenerator = new SignalGeneratorV2({
      enhancedMode: true,
      includeMicrostructure: this.mode === 'live'
    });

    // State
    this.positions = new Map();  // symbol -> position
    this.trades = [];
    this.signals = new Map();    // symbol -> last signal
    this.lastSignalTime = new Map();  // symbol -> timestamp
    this.isRunning = false;

    // Performance Metrics
    this.metrics = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      grossProfit: new Decimal(0),
      grossLoss: new Decimal(0),
      winRate: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      peakBalance: new Decimal(this.initialBalance)
    };

    // Logging
    this.logDir = path.join(__dirname, '../../logs');
    this.logFile = path.join(this.logDir, `trading-${this.mode}-${Date.now()}.log`);

    this._ensureLogDir();
    this._log('info', `TradingEngineV3 initialized in ${this.mode.toUpperCase()} mode`, {
      balance: this.balance.toNumber(),
      riskConfig: this.riskConfig,
      signalConfig: this.signalConfig
    });
  }

  // ============================================================================
  // CORE TRADING LOGIC
  // ============================================================================

  /**
   * Process market update with candle and indicator data
   */
  async processUpdate(symbol, data) {
    if (!this.isRunning) return null;

    const { candle, indicators, microstructure } = data;

    if (!candle || !indicators) {
      this._log('debug', `${symbol}: Insufficient data`);
      return null;
    }

    // Generate signal
    const signal = this.signalGenerator.generate(indicators, microstructure || {});
    this.signals.set(symbol, signal);

    // Update existing position
    if (this.positions.has(symbol)) {
      await this._updatePosition(symbol, candle, signal);
    }

    // Check for entry opportunity
    if (this.positions.size < this.riskConfig.maxPositions && !this.positions.has(symbol)) {
      await this._checkEntry(symbol, candle, signal, indicators, microstructure);
    }

    return {
      symbol,
      signal: this.signalGenerator.getSummary(signal),
      position: this.positions.get(symbol) || null,
      balance: this.balance.toNumber()
    };
  }

  /**
   * Check if signal meets entry requirements
   */
  async _checkEntry(symbol, candle, signal, indicators, microstructure) {
    // Check cooldown
    const lastSignal = this.lastSignalTime.get(symbol) || 0;
    if (Date.now() - lastSignal < this.signalConfig.cooldownMs) {
      return;
    }

    // Check signal direction
    if (signal.type === 'NEUTRAL') return;

    // Check entry requirements from SignalGeneratorV2
    if (!signal.meetsEntryRequirements) {
      this._log('debug', `${symbol}: Does not meet entry requirements`, {
        score: signal.score,
        confidence: signal.confidence,
        indicatorsAgreeing: signal.indicatorsAgreeing
      });
      return;
    }

    // Additional threshold checks
    if (Math.abs(signal.score) < this.signalConfig.minScore) return;
    if (signal.confidence < this.signalConfig.minConfidence) return;
    if (signal.indicatorsAgreeing < this.signalConfig.minIndicators) return;

    // Check for entry warnings
    if (this.signalGenerator.hasEntryWarning(signal)) {
      this._log('warn', `${symbol}: Entry warning detected, skipping`);
      return;
    }

    // Microstructure filters (live mode only)
    if (this.mode === 'live' && microstructure) {
      if (!this._checkMicrostructureFilters(microstructure)) {
        this._log('debug', `${symbol}: Microstructure filter blocked entry`);
        return;
      }
    }

    // Determine side
    const side = signal.type.includes('BUY') ? 'long' : 'short';

    // Calculate position parameters
    const atrPercent = indicators.atr?.percentValue || 2.0;
    const leverage = this._calculateLeverage(atrPercent);
    const positionSizeUSD = this._calculatePositionSize(signal, atrPercent);

    // SAFETY: Position size limit
    const limitedSize = Math.min(positionSizeUSD, this.riskConfig.maxPositionSizeUSD);

    // Enter position
    await this._enterPosition(symbol, {
      side,
      entryPrice: candle.close,
      positionSizeUSD: limitedSize,
      leverage,
      signal,
      atrPercent
    });

    this.lastSignalTime.set(symbol, Date.now());
  }

  /**
   * Enter a new position
   */
  async _enterPosition(symbol, config) {
    const { side, entryPrice, positionSizeUSD, leverage, signal, atrPercent } = config;

    // Calculate position details
    const marginUsed = new Decimal(positionSizeUSD);
    const positionValue = marginUsed.mul(leverage);
    const quantity = positionValue.div(entryPrice);

    // Calculate stop loss and take profit (ROI-based)
    const slROI = this.riskConfig.stopLossROI;
    const tpROI = this.riskConfig.takeProfitROI;

    // Convert ROI to price distance (ROI = price_change * leverage / entry)
    const slPriceChange = (slROI / 100) / leverage;
    const tpPriceChange = (tpROI / 100) / leverage;

    const stopLoss = side === 'long'
      ? new Decimal(entryPrice).mul(1 - slPriceChange)
      : new Decimal(entryPrice).mul(1 + slPriceChange);

    const takeProfit = side === 'long'
      ? new Decimal(entryPrice).mul(1 + tpPriceChange)
      : new Decimal(entryPrice).mul(1 - tpPriceChange);

    // Create position object
    const position = {
      id: `${symbol}-${Date.now()}`,
      symbol,
      side,
      entryPrice: new Decimal(entryPrice),
      currentPrice: new Decimal(entryPrice),
      quantity: quantity,
      leverage,
      marginUsed,
      positionValue,
      stopLoss,
      initialStopLoss: stopLoss,
      takeProfit,
      breakEvenActivated: false,
      trailingActivated: false,
      highestPnlROI: 0,
      unrealizedPnl: new Decimal(0),
      unrealizedROI: 0,
      signal: this.signalGenerator.getSummary(signal),
      entryTime: Date.now(),
      atrPercent,
      status: 'open'
    };

    // Save position
    this.positions.set(symbol, position);

    // Execute on exchange (live mode)
    if (this.mode === 'live') {
      await this._executeLiveEntry(position);
    }

    this._log('info', `ENTRY: ${symbol} ${side.toUpperCase()}`, {
      entry: entryPrice,
      size: positionSizeUSD.toFixed(2),
      leverage: `${leverage}x`,
      sl: stopLoss.toFixed(4),
      tp: takeProfit.toFixed(4),
      score: signal.score,
      confidence: signal.confidence
    });

    this.emit('positionOpened', position);
    return position;
  }

  /**
   * Update existing position with new price
   */
  async _updatePosition(symbol, candle, signal) {
    const position = this.positions.get(symbol);
    if (!position || position.status !== 'open') return;

    const currentPrice = new Decimal(candle.close);
    position.currentPrice = currentPrice;

    // Calculate unrealized P&L
    const priceDiff = position.side === 'long'
      ? currentPrice.minus(position.entryPrice)
      : position.entryPrice.minus(currentPrice);

    position.unrealizedPnl = priceDiff.div(position.entryPrice).mul(position.positionValue);
    position.unrealizedROI = position.unrealizedPnl.div(position.marginUsed).mul(100).toNumber();

    // Track highest ROI for trailing
    if (position.unrealizedROI > position.highestPnlROI) {
      position.highestPnlROI = position.unrealizedROI;
    }

    // Break-Even Activation
    if (this.riskConfig.breakEvenEnabled && !position.breakEvenActivated) {
      if (position.unrealizedROI >= this.riskConfig.breakEvenActivation) {
        this._activateBreakEven(position);
      }
    }

    // Trailing Stop Activation
    if (this.riskConfig.trailingEnabled && position.breakEvenActivated && !position.trailingActivated) {
      if (position.unrealizedROI >= this.riskConfig.trailingActivation) {
        position.trailingActivated = true;
        this._log('info', `${symbol}: Trailing stop activated at +${position.unrealizedROI.toFixed(2)}% ROI`);
      }
    }

    // Update trailing stop
    if (position.trailingActivated) {
      this._updateTrailingStop(position);
    }

    // Check exit conditions
    const slHit = position.side === 'long'
      ? currentPrice.lte(position.stopLoss)
      : currentPrice.gte(position.stopLoss);

    const tpHit = position.side === 'long'
      ? currentPrice.gte(position.takeProfit)
      : currentPrice.lte(position.takeProfit);

    if (slHit) {
      await this._closePosition(symbol, 'STOP_LOSS', position.stopLoss);
    } else if (tpHit) {
      await this._closePosition(symbol, 'TAKE_PROFIT', position.takeProfit);
    }
  }

  /**
   * Activate break-even stop
   */
  _activateBreakEven(position) {
    const { side, entryPrice } = position;
    const buffer = this.riskConfig.breakEvenBuffer / 100;
    const fees = (this.riskConfig.takerFee * 2);  // Entry + exit fees

    // Move stop to break-even plus buffer plus fees
    const breakEvenPrice = side === 'long'
      ? entryPrice.mul(1 + buffer + fees)
      : entryPrice.mul(1 - buffer - fees);

    // Only move if it's an improvement
    const isImprovement = side === 'long'
      ? breakEvenPrice.gt(position.stopLoss)
      : breakEvenPrice.lt(position.stopLoss);

    if (isImprovement) {
      position.stopLoss = breakEvenPrice;
      position.breakEvenActivated = true;
      this._log('info', `${position.symbol}: Break-even activated at ${breakEvenPrice.toFixed(4)}`);
    }
  }

  /**
   * Update trailing stop
   */
  _updateTrailingStop(position) {
    const { side, currentPrice, leverage } = position;
    const trailDistance = (this.riskConfig.trailingDistance / 100) / leverage;

    const newStopLoss = side === 'long'
      ? currentPrice.mul(1 - trailDistance)
      : currentPrice.mul(1 + trailDistance);

    // Only move stop in favorable direction (anti-untrailing)
    const isImprovement = side === 'long'
      ? newStopLoss.gt(position.stopLoss)
      : newStopLoss.lt(position.stopLoss);

    if (isImprovement) {
      position.stopLoss = newStopLoss;
    }
  }

  /**
   * Close position
   */
  async _closePosition(symbol, reason, exitPrice = null) {
    const position = this.positions.get(symbol);
    if (!position) return;

    exitPrice = exitPrice || position.currentPrice;

    // Calculate final P&L
    const priceDiff = position.side === 'long'
      ? exitPrice.minus(position.entryPrice)
      : position.entryPrice.minus(exitPrice);

    const realizedPnl = priceDiff.div(position.entryPrice).mul(position.positionValue);
    const realizedROI = realizedPnl.div(position.marginUsed).mul(100).toNumber();

    // Apply fees
    const fees = position.positionValue.mul(this.riskConfig.takerFee * 2);
    const netPnl = realizedPnl.minus(fees);

    // Update balance
    this.balance = this.balance.plus(netPnl);

    // Execute on exchange (live mode)
    if (this.mode === 'live') {
      await this._executeLiveExit(position, exitPrice);
    }

    // Record trade
    const trade = {
      ...position,
      exitPrice,
      exitTime: Date.now(),
      duration: Date.now() - position.entryTime,
      realizedPnl: netPnl.toNumber(),
      realizedROI,
      reason,
      status: 'closed'
    };

    this.trades.push(trade);
    this.positions.delete(symbol);

    // Update metrics
    this._updateMetrics(trade);

    this._log('info', `EXIT: ${symbol} ${reason}`, {
      entry: position.entryPrice.toFixed(4),
      exit: exitPrice.toFixed(4),
      pnl: `${netPnl.gte(0) ? '+' : ''}$${netPnl.toFixed(2)}`,
      roi: `${realizedROI >= 0 ? '+' : ''}${realizedROI.toFixed(2)}%`,
      duration: `${Math.round((Date.now() - position.entryTime) / 60000)}m`,
      balance: `$${this.balance.toFixed(2)}`
    });

    this.emit('positionClosed', trade);
    this._saveTrades();

    return trade;
  }

  // ============================================================================
  // RISK CALCULATIONS
  // ============================================================================

  /**
   * Calculate leverage based on volatility (ATR)
   */
  _calculateLeverage(atrPercent) {
    const { leverageMin, leverageMax, leverageDefault } = this.riskConfig;

    // Lower leverage in high volatility
    if (atrPercent > 2.0) return leverageMin;
    if (atrPercent > 1.0) return Math.min(5, leverageDefault);
    if (atrPercent > 0.5) return Math.min(10, leverageMax);
    if (atrPercent > 0.3) return leverageMax;

    return leverageDefault;
  }

  /**
   * Calculate position size based on signal strength and volatility
   */
  _calculatePositionSize(signal, atrPercent) {
    const baseRisk = (this.riskConfig.riskPerTrade / 100) * this.balance.toNumber();

    // Adjust based on signal strength
    let multiplier = 1.0;
    if (Math.abs(signal.score) >= this.signalConfig.extremeScore) {
      multiplier = 1.5;
    } else if (Math.abs(signal.score) >= this.signalConfig.strongScore) {
      multiplier = 1.25;
    }

    // Reduce size in high volatility
    if (atrPercent > 2.0) {
      multiplier *= 0.5;
    } else if (atrPercent > 1.0) {
      multiplier *= 0.75;
    }

    return baseRisk * multiplier;
  }

  /**
   * Check microstructure filters
   */
  _checkMicrostructureFilters(microstructure) {
    // Spread check
    const spread = microstructure.priceRatio?.value?.spread;
    if (spread && spread > this.microFilters.maxSpread) {
      return false;
    }

    // Funding rate check
    const fundingRate = microstructure.fundingRate?.value?.currentRate;
    if (fundingRate && Math.abs(fundingRate) > this.microFilters.maxFundingRate * 100) {
      return false;
    }

    // Buy/Sell ratio check (avoid extremes)
    const ratio = microstructure.buySellRatio?.value?.ratio;
    if (ratio !== undefined) {
      if (ratio < this.microFilters.extremeBuySellLow || ratio > this.microFilters.extremeBuySellHigh) {
        return false;
      }
    }

    return true;
  }

  // ============================================================================
  // LIVE TRADING (KuCoin API)
  // ============================================================================

  /**
   * Execute live entry on KuCoin
   */
  async _executeLiveEntry(position) {
    if (this.mode !== 'live') return;

    // SAFETY CHECK
    if (!this.liveEnabled) {
      this._log('error', 'Live trading is disabled');
      return;
    }

    try {
      // Set leverage
      await this._apiRequest('POST', '/api/v1/position/risk-limit-level/change', {
        symbol: position.symbol,
        level: this._getLeverageLevel(position.leverage)
      });

      // Place market order
      const orderSide = position.side === 'long' ? 'buy' : 'sell';
      const orderResult = await this._apiRequest('POST', '/api/v1/orders', {
        clientOid: position.id,
        symbol: position.symbol,
        side: orderSide,
        type: 'market',
        leverage: position.leverage.toString(),
        size: Math.floor(position.quantity.toNumber())  // Contract quantity
      });

      position.orderId = orderResult?.data?.orderId;
      this._log('info', `Live order placed: ${position.orderId}`);

      // Place stop loss order
      await this._placeStopOrder(position, 'stopLoss');

      // Place take profit order
      await this._placeStopOrder(position, 'takeProfit');

    } catch (error) {
      this._log('error', `Live entry failed: ${error.message}`, { symbol: position.symbol });
      throw error;
    }
  }

  /**
   * Execute live exit on KuCoin
   */
  async _executeLiveExit(position, exitPrice) {
    if (this.mode !== 'live') return;

    try {
      // Cancel any existing stop orders
      await this._apiRequest('DELETE', `/api/v1/stopOrders?symbol=${position.symbol}`);

      // Close position with market order
      const orderSide = position.side === 'long' ? 'sell' : 'buy';
      await this._apiRequest('POST', '/api/v1/orders', {
        clientOid: `${position.id}-exit`,
        symbol: position.symbol,
        side: orderSide,
        type: 'market',
        size: Math.floor(position.quantity.toNumber()),
        reduceOnly: true
      });

      this._log('info', `Live exit executed: ${position.symbol}`);

    } catch (error) {
      this._log('error', `Live exit failed: ${error.message}`, { symbol: position.symbol });
    }
  }

  /**
   * Place stop order on KuCoin
   */
  async _placeStopOrder(position, type) {
    if (this.mode !== 'live') return;

    const isStopLoss = type === 'stopLoss';
    const price = isStopLoss ? position.stopLoss : position.takeProfit;
    const side = position.side === 'long' ? 'sell' : 'buy';
    const triggerType = (isStopLoss)
      ? (position.side === 'long' ? 'down' : 'up')
      : (position.side === 'long' ? 'up' : 'down');

    await this._apiRequest('POST', '/api/v1/stopOrders', {
      clientOid: `${position.id}-${type}`,
      symbol: position.symbol,
      side,
      type: 'market',
      stop: triggerType,
      stopPrice: price.toFixed(4),
      stopPriceType: 'TP',
      size: Math.floor(position.quantity.toNumber()),
      reduceOnly: true
    });
  }

  /**
   * Get leverage level from leverage value
   */
  _getLeverageLevel(leverage) {
    // KuCoin uses risk limit levels, not direct leverage
    // This is a simplified mapping
    if (leverage <= 5) return 1;
    if (leverage <= 10) return 2;
    if (leverage <= 15) return 3;
    return 1;
  }

  /**
   * Make authenticated API request to KuCoin
   */
  async _apiRequest(method, endpoint, data = null) {
    const timestamp = Date.now().toString();
    const body = data ? JSON.stringify(data) : '';
    const path = endpoint.split('?')[0];

    // Create signature
    const signString = timestamp + method + path + body;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(signString)
      .digest('base64');

    // Encrypt passphrase for API v2
    let passphrase = this.apiPassphrase;
    if (this.apiVersion === '2') {
      passphrase = crypto
        .createHmac('sha256', this.apiSecret)
        .update(this.apiPassphrase)
        .digest('base64');
    }

    const headers = {
      'KC-API-KEY': this.apiKey,
      'KC-API-SIGN': signature,
      'KC-API-TIMESTAMP': timestamp,
      'KC-API-PASSPHRASE': passphrase,
      'KC-API-KEY-VERSION': this.apiVersion,
      'Content-Type': 'application/json'
    };

    try {
      const response = await axios({
        method,
        url: `${this.apiBase}${endpoint}`,
        headers,
        data: data || undefined,
        timeout: 10000
      });

      if (response.data.code !== '200000') {
        throw new Error(response.data.msg || 'API Error');
      }

      return response.data;
    } catch (error) {
      this._log('error', `API request failed: ${method} ${endpoint}`, {
        error: error.message,
        code: error.response?.data?.code
      });
      throw error;
    }
  }

  // ============================================================================
  // METRICS & PERSISTENCE
  // ============================================================================

  /**
   * Update performance metrics
   */
  _updateMetrics(trade) {
    this.metrics.totalTrades++;

    if (trade.realizedPnl > 0) {
      this.metrics.winningTrades++;
      this.metrics.grossProfit = this.metrics.grossProfit.plus(trade.realizedPnl);
    } else {
      this.metrics.losingTrades++;
      this.metrics.grossLoss = this.metrics.grossLoss.plus(Math.abs(trade.realizedPnl));
    }

    // Win rate
    this.metrics.winRate = (this.metrics.winningTrades / this.metrics.totalTrades) * 100;

    // Profit factor
    const grossLossNum = this.metrics.grossLoss.toNumber();
    this.metrics.profitFactor = grossLossNum > 0
      ? this.metrics.grossProfit.div(grossLossNum).toNumber()
      : this.metrics.grossProfit.gt(0) ? Infinity : 0;

    // Drawdown
    if (this.balance.gt(this.metrics.peakBalance)) {
      this.metrics.peakBalance = new Decimal(this.balance);
    } else {
      const drawdown = this.metrics.peakBalance.minus(this.balance)
        .div(this.metrics.peakBalance).mul(100).toNumber();
      if (drawdown > this.metrics.maxDrawdown) {
        this.metrics.maxDrawdown = drawdown;
      }
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      mode: this.mode,
      balance: this.balance.toNumber(),
      initialBalance: this.initialBalance.toNumber(),
      totalReturn: this.balance.minus(this.initialBalance)
        .div(this.initialBalance).mul(100).toNumber(),
      totalTrades: this.metrics.totalTrades,
      winningTrades: this.metrics.winningTrades,
      losingTrades: this.metrics.losingTrades,
      winRate: this.metrics.winRate.toFixed(2),
      profitFactor: this.metrics.profitFactor.toFixed(2),
      grossProfit: this.metrics.grossProfit.toNumber(),
      grossLoss: this.metrics.grossLoss.toNumber(),
      maxDrawdown: this.metrics.maxDrawdown.toFixed(2),
      activePositions: this.positions.size
    };
  }

  /**
   * Get all positions
   */
  getPositions() {
    return Array.from(this.positions.values()).map(p => ({
      ...p,
      entryPrice: p.entryPrice.toNumber(),
      currentPrice: p.currentPrice.toNumber(),
      stopLoss: p.stopLoss.toNumber(),
      takeProfit: p.takeProfit.toNumber(),
      marginUsed: p.marginUsed.toNumber(),
      positionValue: p.positionValue.toNumber(),
      unrealizedPnl: p.unrealizedPnl.toNumber()
    }));
  }

  /**
   * Save trades to file
   */
  _saveTrades() {
    try {
      const data = {
        mode: this.mode,
        trades: this.trades.map(t => ({
          ...t,
          entryPrice: t.entryPrice?.toNumber?.() || t.entryPrice,
          exitPrice: t.exitPrice?.toNumber?.() || t.exitPrice,
          marginUsed: t.marginUsed?.toNumber?.() || t.marginUsed,
          positionValue: t.positionValue?.toNumber?.() || t.positionValue
        })),
        metrics: this.getMetrics(),
        timestamp: new Date().toISOString()
      };

      fs.writeFileSync(
        path.join(this.logDir, `trades-${this.mode}.json`),
        JSON.stringify(data, null, 2)
      );
    } catch (error) {
      this._log('warn', `Failed to save trades: ${error.message}`);
    }
  }

  // ============================================================================
  // CONTROL
  // ============================================================================

  /**
   * Start trading engine
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this._log('info', `TradingEngineV3 started in ${this.mode.toUpperCase()} mode`);
    this.emit('started', { mode: this.mode });
  }

  /**
   * Stop trading engine
   */
  stop() {
    this.isRunning = false;
    this._log('info', 'TradingEngineV3 stopped');
    this.emit('stopped');
  }

  /**
   * Reset engine (paper mode only)
   */
  reset() {
    if (this.mode === 'live') {
      this._log('warn', 'Cannot reset in live mode');
      return;
    }

    this.balance = new Decimal(this.initialBalance);
    this.positions.clear();
    this.trades = [];
    this.signals.clear();
    this.lastSignalTime.clear();
    this.metrics = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      grossProfit: new Decimal(0),
      grossLoss: new Decimal(0),
      winRate: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      peakBalance: new Decimal(this.initialBalance)
    };

    this._log('info', 'TradingEngineV3 reset');
    this.emit('reset');
  }

  /**
   * Force close all positions
   */
  async closeAllPositions(reason = 'MANUAL_CLOSE') {
    const symbols = Array.from(this.positions.keys());
    for (const symbol of symbols) {
      await this._closePosition(symbol, reason);
    }
    this._log('info', `Closed all ${symbols.length} positions`);
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  _ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  _log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.mode.toUpperCase()}] [${level.toUpperCase()}]`;
    const logMessage = `${prefix} ${message}`;

    console.log(logMessage, data || '');

    try {
      const line = `${logMessage}${data ? ' ' + JSON.stringify(data) : ''}\n`;
      fs.appendFileSync(this.logFile, line);
    } catch (error) {
      // Silent fail on log write
    }
  }
}

module.exports = TradingEngineV3;
