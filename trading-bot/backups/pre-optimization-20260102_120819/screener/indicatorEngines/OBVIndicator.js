/**
 * OBV INDICATOR
 * On-Balance Volume - volume-based momentum indicator
 * Tracks cumulative buying and selling pressure
 */

const BaseIndicator = require('./BaseIndicator');

class OBVIndicator extends BaseIndicator {
  constructor(config = {}) {
    super(config);
    this.slopeWindow = config.slopeWindow || 14;
    this.smoothingEma = config.smoothingEma || 5;
    this.zScoreCap = config.zScoreCap || 2.0;
    this.normalize = config.normalize !== undefined ? config.normalize : true;
    this.warmupPeriod = Math.max(this.slopeWindow, this.smoothingEma) + 1;
    
    this.obvValue = 0;
    this.obvHistory = [];
    this.obvEma = null;
    this.previousClose = null;
  }

  /**
   * Update OBV with new candle
   * @param {Object} candle - { close, volume, ... }
   * @returns {Object|null} { obvValue, obvSlope, obvEma, normalized } or null
   */
  update(candle) {
    const close = candle.close;
    const volume = candle.volume || 0;

    // Calculate OBV
    if (this.previousClose !== null) {
      if (close > this.previousClose) {
        this.obvValue += volume; // Buying pressure
      } else if (close < this.previousClose) {
        this.obvValue -= volume; // Selling pressure
      }
      // If close === previousClose, OBV stays the same
    }

    this.previousClose = close;
    this.obvHistory.push(this.obvValue);

    // Keep history limited
    if (this.obvHistory.length > this.slopeWindow * 2) {
      this.obvHistory.shift();
    }

    // Calculate EMA of OBV
    if (this.obvHistory.length === this.smoothingEma) {
      this.obvEma = BaseIndicator.calculateSMA(this.obvHistory, this.smoothingEma);
    } else if (this.obvHistory.length > this.smoothingEma && this.obvEma !== null) {
      this.obvEma = BaseIndicator.calculateEMA(this.obvValue, this.obvEma, this.smoothingEma);
    }

    // Calculate slope (rate of change)
    let obvSlope = 0;
    if (this.obvHistory.length >= this.slopeWindow) {
      const oldOBV = this.obvHistory[this.obvHistory.length - this.slopeWindow];
      obvSlope = ((this.obvValue - oldOBV) / this.slopeWindow) * 100; // Percentage change

      if (!this.ready) this.ready = true;
    }

    // Normalize to -100/+100 scale if enabled
    let normalized = null;
    if (this.ready && this.normalize && this.obvHistory.length >= this.slopeWindow) {
      // Calculate z-score of slope
      const slopes = [];
      for (let i = this.slopeWindow; i < this.obvHistory.length; i++) {
        const oldVal = this.obvHistory[i - this.slopeWindow];
        const newVal = this.obvHistory[i];
        slopes.push(((newVal - oldVal) / this.slopeWindow) * 100);
      }

      if (slopes.length > 0) {
        const mean = slopes.reduce((sum, s) => sum + s, 0) / slopes.length;
        const variance = slopes.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / slopes.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev > 0) {
          let zScore = (obvSlope - mean) / stdDev;
          // Cap z-score
          zScore = Math.max(-this.zScoreCap, Math.min(this.zScoreCap, zScore));
          // Normalize to -100/+100
          normalized = (zScore / this.zScoreCap) * 100;
        } else {
          normalized = 0;
        }
      }
    }

    if (this.ready) {
      const value = {
        obvValue: this.obvValue,
        obvSlope,
        obvEma: this.obvEma,
        normalized,
        timestamp: candle.timestamp
      };

      this.values.push(value);
      
      if (this.values.length > 100) {
        this.values.shift();
      }

      return value;
    }

    return null;
  }

  /**
   * Get current OBV value
   * @returns {Object|null} { obvValue, obvSlope, obvEma, normalized }
   */
  getValue() {
    if (!this.ready) return null;
    return this.values[this.values.length - 1];
  }

  /**
   * Check if OBV is bullish (positive slope)
   * @returns {boolean}
   */
  isBullish() {
    const value = this.getValue();
    return value !== null && value.obvSlope > 0;
  }

  /**
   * Check if OBV is bearish (negative slope)
   * @returns {boolean}
   */
  isBearish() {
    const value = this.getValue();
    return value !== null && value.obvSlope < 0;
  }

  /**
   * Check for divergence with price
   * @param {Array} priceHistory - Array of price values
   * @returns {string|null} 'bullish', 'bearish', or null
   */
  detectDivergence(priceHistory) {
    if (!this.ready || this.values.length < 3 || priceHistory.length < 3) {
      return null;
    }

    const recentOBV = this.values.slice(-3).map(v => v.obvValue);
    const recentPrices = priceHistory.slice(-3);

    // Bullish divergence: price making lower lows, OBV making higher lows
    if (recentPrices[2] < recentPrices[0] && recentOBV[2] > recentOBV[0]) {
      return 'bullish';
    }

    // Bearish divergence: price making higher highs, OBV making lower highs
    if (recentPrices[2] > recentPrices[0] && recentOBV[2] < recentOBV[0]) {
      return 'bearish';
    }

    return null;
  }

  reset() {
    super.reset();
    this.obvValue = 0;
    this.obvHistory = [];
    this.obvEma = null;
    this.previousClose = null;
  }
}

module.exports = OBVIndicator;
