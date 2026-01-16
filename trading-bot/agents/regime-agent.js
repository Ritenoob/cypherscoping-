/**
 * RegimeAgent - Market Regime Classification
 *
 * Classifies market conditions into regimes (trending, ranging, volatile, quiet)
 * Uses statistical methods and technical indicators for regime detection.
 * Provides adaptive parameters based on current market conditions.
 */

const { AgentBase, Decimal } = require('./agent-base');
const D = Decimal;

// Regime types
const REGIMES = {
  STRONG_TREND_UP: 'strong_trend_up',
  WEAK_TREND_UP: 'weak_trend_up',
  RANGING: 'ranging',
  WEAK_TREND_DOWN: 'weak_trend_down',
  STRONG_TREND_DOWN: 'strong_trend_down',
  HIGH_VOLATILITY: 'high_volatility',
  LOW_VOLATILITY: 'low_volatility',
  BREAKOUT: 'breakout',
  UNKNOWN: 'unknown'
};

// Regime-specific trading parameters
const REGIME_PARAMS = {
  [REGIMES.STRONG_TREND_UP]: {
    signalBias: 'long',
    minScore: 60,
    leverage: 15,
    trailingEnabled: true,
    trailingActivation: 3,
    stopLossMultiplier: 1.2,
    description: 'Strong uptrend - favor longs, wider stops'
  },
  [REGIMES.WEAK_TREND_UP]: {
    signalBias: 'long',
    minScore: 70,
    leverage: 10,
    trailingEnabled: true,
    trailingActivation: 4,
    stopLossMultiplier: 1.0,
    description: 'Weak uptrend - cautious longs'
  },
  [REGIMES.RANGING]: {
    signalBias: 'neutral',
    minScore: 80,
    leverage: 8,
    trailingEnabled: false,
    takeProfitMultiplier: 0.8,
    stopLossMultiplier: 0.8,
    description: 'Range-bound - mean reversion, tight targets'
  },
  [REGIMES.WEAK_TREND_DOWN]: {
    signalBias: 'short',
    minScore: 70,
    leverage: 10,
    trailingEnabled: true,
    trailingActivation: 4,
    stopLossMultiplier: 1.0,
    description: 'Weak downtrend - cautious shorts'
  },
  [REGIMES.STRONG_TREND_DOWN]: {
    signalBias: 'short',
    minScore: 60,
    leverage: 15,
    trailingEnabled: true,
    trailingActivation: 3,
    stopLossMultiplier: 1.2,
    description: 'Strong downtrend - favor shorts, wider stops'
  },
  [REGIMES.HIGH_VOLATILITY]: {
    signalBias: 'neutral',
    minScore: 90,
    leverage: 5,
    trailingEnabled: true,
    trailingActivation: 5,
    stopLossMultiplier: 1.5,
    description: 'High volatility - reduce size, wider stops'
  },
  [REGIMES.LOW_VOLATILITY]: {
    signalBias: 'neutral',
    minScore: 70,
    leverage: 12,
    trailingEnabled: false,
    stopLossMultiplier: 0.7,
    description: 'Low volatility - tighter stops, wait for breakout'
  },
  [REGIMES.BREAKOUT]: {
    signalBias: 'follow',
    minScore: 75,
    leverage: 12,
    trailingEnabled: true,
    trailingActivation: 2,
    stopLossMultiplier: 1.0,
    description: 'Breakout detected - follow direction aggressively'
  },
  [REGIMES.UNKNOWN]: {
    signalBias: 'neutral',
    minScore: 85,
    leverage: 8,
    trailingEnabled: true,
    trailingActivation: 4,
    stopLossMultiplier: 1.0,
    description: 'Unclear regime - conservative approach'
  }
};

class RegimeAgent extends AgentBase {
  constructor(config = {}) {
    super({
      id: 'regime-agent',
      name: 'Regime Agent',
      options: config
    });

    // Data source
    this.dataAgent = config.dataAgent;

    // Detection parameters
    this.trendPeriod = config.trendPeriod || 50;
    this.volatilityPeriod = config.volatilityPeriod || 20;
    this.adxPeriod = config.adxPeriod || 14;
    this.atrPeriod = config.atrPeriod || 14;

    // Thresholds
    this.strongTrendADX = config.strongTrendADX || 30;
    this.weakTrendADX = config.weakTrendADX || 20;
    this.highVolatilityPct = config.highVolatilityPct || 3.0;
    this.lowVolatilityPct = config.lowVolatilityPct || 1.0;

    // Regime history per symbol
    this.regimeHistory = new Map();
    this.currentRegimes = new Map();

    // Update interval
    this.updateIntervalMs = config.updateIntervalMs || 60000;
    this.updateTimer = null;
  }

  async initialize() {
    this.log('Initializing Regime Agent');

    this.onMessage('CLASSIFY_REGIME', this._handleClassifyRegime.bind(this));
    this.onMessage('GET_REGIME', this._handleGetRegime.bind(this));
    this.onMessage('GET_PARAMS', this._handleGetParams.bind(this));
    this.onMessage('GET_ALL_REGIMES', this._handleGetAllRegimes.bind(this));

    return { ok: true, value: null };
  }

  async start() {
    await super.start();
    this.log('Regime Agent started');
    return { ok: true };
  }

  async stop() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    await super.stop();
    return { ok: true };
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Classify market regime for a symbol
   */
  async classifyRegime(symbol, candles) {
    if (!candles || candles.length < 100) {
      return { ok: false, error: { code: 'INSUFFICIENT_DATA', message: 'Need at least 100 candles' } };
    }

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    // Calculate indicators
    const adx = this._calculateADX(highs, lows, closes, this.adxPeriod);
    const atr = this._calculateATR(highs, lows, closes, this.atrPeriod);
    const volatilityPct = (atr / closes[closes.length - 1]) * 100;
    const trendDirection = this._detectTrendDirection(closes);
    const isBreakout = this._detectBreakout(candles);

    // Determine primary regime
    let regime = REGIMES.UNKNOWN;
    let confidence = 0;

    // Check for breakout first
    if (isBreakout.detected) {
      regime = REGIMES.BREAKOUT;
      confidence = isBreakout.strength;
    }
    // Check volatility extremes
    else if (volatilityPct >= this.highVolatilityPct) {
      regime = REGIMES.HIGH_VOLATILITY;
      confidence = Math.min((volatilityPct / this.highVolatilityPct) * 50, 90);
    }
    else if (volatilityPct <= this.lowVolatilityPct) {
      regime = REGIMES.LOW_VOLATILITY;
      confidence = Math.min((this.lowVolatilityPct / volatilityPct) * 50, 90);
    }
    // Check trend strength via ADX
    else if (adx >= this.strongTrendADX) {
      regime = trendDirection > 0 ? REGIMES.STRONG_TREND_UP : REGIMES.STRONG_TREND_DOWN;
      confidence = Math.min(adx + 40, 95);
    }
    else if (adx >= this.weakTrendADX) {
      regime = trendDirection > 0 ? REGIMES.WEAK_TREND_UP : REGIMES.WEAK_TREND_DOWN;
      confidence = Math.min(adx + 30, 80);
    }
    else {
      regime = REGIMES.RANGING;
      confidence = Math.min((this.weakTrendADX - adx) * 5 + 50, 85);
    }

    // Store result
    const result = {
      symbol,
      regime,
      confidence,
      indicators: {
        adx: Math.round(adx * 100) / 100,
        atr: Math.round(atr * 10000) / 10000,
        volatilityPct: Math.round(volatilityPct * 100) / 100,
        trendDirection,
        isBreakout: isBreakout.detected
      },
      params: REGIME_PARAMS[regime],
      timestamp: Date.now()
    };

    this.currentRegimes.set(symbol, result);

    // Maintain history (keep last 100)
    if (!this.regimeHistory.has(symbol)) {
      this.regimeHistory.set(symbol, []);
    }
    const history = this.regimeHistory.get(symbol);
    history.push(result);
    if (history.length > 100) history.shift();

    return { ok: true, value: result };
  }

  /**
   * Get current regime for symbol
   */
  getRegime(symbol) {
    return this.currentRegimes.get(symbol) || null;
  }

  /**
   * Get trading parameters for current regime
   */
  getRegimeParams(symbol) {
    const regime = this.currentRegimes.get(symbol);
    if (!regime) return REGIME_PARAMS[REGIMES.UNKNOWN];
    return regime.params;
  }

  /**
   * Get all current regimes
   */
  getAllRegimes() {
    return Object.fromEntries(this.currentRegimes);
  }

  /**
   * Get regime history for symbol
   */
  getRegimeHistory(symbol, count = 50) {
    const history = this.regimeHistory.get(symbol) || [];
    return history.slice(-count);
  }

  // ===========================================================================
  // INDICATOR CALCULATIONS
  // ===========================================================================

  /**
   * Calculate ADX (Average Directional Index)
   */
  _calculateADX(highs, lows, closes, period) {
    const len = closes.length;
    if (len < period * 2) return 15; // Default low ADX

    const tr = [];
    const plusDM = [];
    const minusDM = [];

    for (let i = 1; i < len; i++) {
      // True Range
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];
      tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));

      // Directional Movement
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];

      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    // Smooth with EMA
    const atr = this._ema(tr, period);
    const smoothPlusDM = this._ema(plusDM, period);
    const smoothMinusDM = this._ema(minusDM, period);

    if (atr === 0) return 15;

    const plusDI = (smoothPlusDM / atr) * 100;
    const minusDI = (smoothMinusDM / atr) * 100;

    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;

    // ADX is smoothed DX
    return isNaN(dx) ? 15 : dx;
  }

  /**
   * Calculate ATR (Average True Range)
   */
  _calculateATR(highs, lows, closes, period) {
    const len = closes.length;
    if (len < period + 1) return 0;

    const tr = [];
    for (let i = 1; i < len; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];
      tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }

    return this._sma(tr.slice(-period), period);
  }

  /**
   * Detect trend direction using multiple timeframes
   */
  _detectTrendDirection(closes) {
    const len = closes.length;
    if (len < 50) return 0;

    const price = closes[len - 1];
    const ema9 = this._ema(closes, 9);
    const ema21 = this._ema(closes, 21);
    const ema50 = this._ema(closes, 50);

    let score = 0;

    // Price vs EMAs
    if (price > ema9) score += 1;
    else score -= 1;

    if (price > ema21) score += 1;
    else score -= 1;

    if (price > ema50) score += 1;
    else score -= 1;

    // EMA alignment
    if (ema9 > ema21 && ema21 > ema50) score += 2;
    else if (ema9 < ema21 && ema21 < ema50) score -= 2;

    // Recent price action (last 10 candles)
    const recent = closes.slice(-10);
    const recentSlope = (recent[recent.length - 1] - recent[0]) / recent[0];
    if (recentSlope > 0.01) score += 1;
    else if (recentSlope < -0.01) score -= 1;

    return score;
  }

  /**
   * Detect breakout conditions
   */
  _detectBreakout(candles) {
    const len = candles.length;
    if (len < 30) return { detected: false };

    const recent = candles.slice(-5);
    const lookback = candles.slice(-30, -5);

    // Calculate range from lookback
    const lookbackHigh = Math.max(...lookback.map(c => c.high));
    const lookbackLow = Math.min(...lookback.map(c => c.low));
    const range = lookbackHigh - lookbackLow;

    // Current price
    const currentClose = candles[len - 1].close;

    // Check for breakout
    const breakoutUp = currentClose > lookbackHigh;
    const breakoutDown = currentClose < lookbackLow;

    if (breakoutUp || breakoutDown) {
      // Calculate strength based on how far beyond the range
      const extension = breakoutUp
        ? (currentClose - lookbackHigh) / range
        : (lookbackLow - currentClose) / range;

      // Check for volume confirmation (if available)
      const avgVolume = lookback.reduce((a, c) => a + (c.volume || 0), 0) / lookback.length;
      const recentVolume = recent.reduce((a, c) => a + (c.volume || 0), 0) / recent.length;
      const volumeConfirm = avgVolume > 0 ? recentVolume / avgVolume > 1.5 : true;

      return {
        detected: true,
        direction: breakoutUp ? 'up' : 'down',
        strength: Math.min(extension * 50 + 50, 95),
        volumeConfirmed: volumeConfirm
      };
    }

    return { detected: false };
  }

  // ===========================================================================
  // HELPER FUNCTIONS
  // ===========================================================================

  _ema(values, period) {
    if (values.length < period) {
      return values.length > 0 ? values[values.length - 1] : 0;
    }
    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  _sma(values, period) {
    if (values.length < period) {
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    }
    return values.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  // ===========================================================================
  // MESSAGE HANDLERS
  // ===========================================================================

  async _handleClassifyRegime(payload) {
    return this.classifyRegime(payload.symbol, payload.candles);
  }

  async _handleGetRegime(payload) {
    const regime = this.getRegime(payload.symbol);
    return { ok: true, value: regime };
  }

  async _handleGetParams(payload) {
    const params = this.getRegimeParams(payload.symbol);
    return { ok: true, value: params };
  }

  async _handleGetAllRegimes() {
    return { ok: true, value: this.getAllRegimes() };
  }

  async performHealthCheck() {
    return {
      status: 'HEALTHY',
      details: {
        trackedSymbols: this.currentRegimes.size,
        regimes: Object.fromEntries(
          Array.from(this.currentRegimes.entries()).map(([sym, r]) => [sym, r.regime])
        )
      }
    };
  }
}

module.exports = RegimeAgent;
module.exports.REGIMES = REGIMES;
module.exports.REGIME_PARAMS = REGIME_PARAMS;
