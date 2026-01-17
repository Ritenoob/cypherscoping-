/**
 * ATR Indicator - DEDICATED Volatility Measurement
 *
 * Created: 2026-01-17
 *
 * FEATURES:
 * - Standard ATR calculation (Wilder smoothing)
 * - Normalized ATR (ATR % of price) for cross-symbol comparison
 * - Volatility expansion/contraction detection
 * - ATR breakout signals (volatility explosion)
 * - ATR ratio to historical average
 * - Position sizing helper (returns suggested % based on volatility)
 *
 * SIGNALS:
 * - volatility_expansion: ATR increasing significantly
 * - volatility_contraction: ATR decreasing (squeeze forming)
 * - extreme_volatility: ATR > 2x historical average
 * - low_volatility: ATR < 0.5x historical average (breakout imminent)
 */

class ATRIndicator {
  constructor(config = {}) {
    this.period = config.period || 14;
    this.expansionThreshold = config.expansionThreshold || 1.5;  // ATR > 1.5x avg
    this.contractionThreshold = config.contractionThreshold || 0.7; // ATR < 0.7x avg
    this.extremeThreshold = config.extremeThreshold || 2.0;  // ATR > 2x avg
    this.lowThreshold = config.lowThreshold || 0.5;  // ATR < 0.5x avg

    // State
    this.trHistory = [];
    this.atrHistory = [];
    this.currentATR = null;
    this.prevATR = null;
    this.prevClose = null;
    this.maxHistory = config.historyLength || 100;

    // For normalization
    this.currentClose = null;
  }

  update(candle) {
    const { high, low, close } = candle;

    this.prevATR = this.currentATR;
    this.currentClose = close;

    // Calculate True Range
    let tr;
    if (this.prevClose === null) {
      tr = high - low;
    } else {
      tr = Math.max(
        high - low,
        Math.abs(high - this.prevClose),
        Math.abs(low - this.prevClose)
      );
    }

    this.trHistory.push(tr);

    // Calculate ATR using Wilder smoothing
    if (this.trHistory.length === this.period) {
      // First ATR is SMA of TR
      this.currentATR = this.trHistory.reduce((a, b) => a + b, 0) / this.period;
    } else if (this.trHistory.length > this.period) {
      // Subsequent ATR uses Wilder smoothing
      this.currentATR = ((this.currentATR * (this.period - 1)) + tr) / this.period;
      this.trHistory.shift();
    }

    // Store ATR history
    if (this.currentATR !== null) {
      this.atrHistory.push(this.currentATR);
      if (this.atrHistory.length > this.maxHistory) {
        this.atrHistory.shift();
      }
    }

    this.prevClose = close;
    return this.getResult();
  }

  /**
   * Get normalized ATR (ATR as % of price)
   * Useful for comparing volatility across different priced assets
   */
  getNormalizedATR() {
    if (this.currentATR === null || this.currentClose === null) return null;
    return (this.currentATR / this.currentClose) * 100;
  }

  /**
   * Get ATR ratio to historical average
   */
  getATRRatio() {
    if (this.atrHistory.length < 20) return null;
    const avgATR = this.atrHistory.reduce((a, b) => a + b, 0) / this.atrHistory.length;
    return this.currentATR / avgATR;
  }

  /**
   * Get suggested position size based on volatility
   * Lower volatility = larger position, higher volatility = smaller position
   */
  getSuggestedPositionPct(targetRisk = 1.0) {
    const normalizedATR = this.getNormalizedATR();
    if (normalizedATR === null) return targetRisk;

    // Inverse relationship: high volatility = smaller position
    // Base: 2% normalized ATR = 100% of target position
    const multiplier = 2.0 / normalizedATR;
    return Math.min(2.0, Math.max(0.25, targetRisk * multiplier));
  }

  // SIGNAL 1: Volatility Expansion
  getExpansionSignal() {
    const ratio = this.getATRRatio();
    if (ratio === null) return null;

    if (ratio > this.extremeThreshold) {
      return {
        type: 'extreme_volatility',
        direction: 'neutral',
        strength: 'very_strong',
        message: `Extreme volatility: ATR ${(ratio * 100).toFixed(0)}% of average`,
        metadata: { ratio, atr: this.currentATR, normalizedATR: this.getNormalizedATR() }
      };
    }

    if (ratio > this.expansionThreshold && this.prevATR && this.currentATR > this.prevATR) {
      return {
        type: 'volatility_expansion',
        direction: 'neutral',
        strength: 'strong',
        message: `Volatility expanding: ATR ${(ratio * 100).toFixed(0)}% of average`,
        metadata: { ratio, atr: this.currentATR, normalizedATR: this.getNormalizedATR() }
      };
    }

    return null;
  }

  // SIGNAL 2: Volatility Contraction (squeeze forming)
  getContractionSignal() {
    const ratio = this.getATRRatio();
    if (ratio === null) return null;

    if (ratio < this.lowThreshold) {
      return {
        type: 'low_volatility_squeeze',
        direction: 'neutral',
        strength: 'very_strong',
        message: `Low volatility squeeze: ATR ${(ratio * 100).toFixed(0)}% of average (breakout imminent)`,
        metadata: { ratio, atr: this.currentATR, normalizedATR: this.getNormalizedATR() }
      };
    }

    if (ratio < this.contractionThreshold && this.prevATR && this.currentATR < this.prevATR) {
      return {
        type: 'volatility_contraction',
        direction: 'neutral',
        strength: 'moderate',
        message: `Volatility contracting: ATR ${(ratio * 100).toFixed(0)}% of average`,
        metadata: { ratio, atr: this.currentATR, normalizedATR: this.getNormalizedATR() }
      };
    }

    return null;
  }

  // SIGNAL 3: ATR Breakout (sudden volatility spike after contraction)
  getBreakoutSignal() {
    if (this.atrHistory.length < 5) return null;

    const recent = this.atrHistory.slice(-5);
    const prevAvg = recent.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
    const current = recent[4];

    // Breakout: Current ATR > 1.5x recent average
    if (current > prevAvg * 1.5 && prevAvg > 0) {
      return {
        type: 'atr_breakout',
        direction: 'neutral',
        strength: 'strong',
        message: `ATR breakout: ${((current / prevAvg) * 100).toFixed(0)}% increase`,
        metadata: { current, prevAvg, spike: current / prevAvg }
      };
    }

    return null;
  }

  getSignals() {
    const signals = [];

    const expansion = this.getExpansionSignal();
    if (expansion) signals.push(expansion);

    const contraction = this.getContractionSignal();
    if (contraction) signals.push(contraction);

    const breakout = this.getBreakoutSignal();
    if (breakout) signals.push(breakout);

    return signals;
  }

  getResult() {
    return {
      value: {
        atr: this.currentATR,
        normalizedATR: this.getNormalizedATR(),
        atrRatio: this.getATRRatio(),
        suggestedPositionPct: this.getSuggestedPositionPct()
      },
      signals: this.currentATR !== null ? this.getSignals() : []
    };
  }

  reset() {
    this.trHistory = [];
    this.atrHistory = [];
    this.currentATR = null;
    this.prevATR = null;
    this.prevClose = null;
    this.currentClose = null;
  }
}

module.exports = ATRIndicator;
