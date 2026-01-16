/**
 * WILLIAMS %R INDICATOR
 * Williams Percent Range - momentum indicator
 */

const BaseIndicator = require('./BaseIndicator');

class WilliamsRIndicator extends BaseIndicator {
  constructor(config = {}) {
    super(config);
    this.period = config.period || 14;
    this.warmupPeriod = this.period;
    
    this.highs = [];
    this.lows = [];
    this.closes = [];
  }

  /**
   * Update Williams %R with new candle
   * @param {Object} candle - { high, low, close, ... }
   * @returns {number|null} Williams %R value (-100 to 0) or null
   */
  update(candle) {
    this.highs.push(candle.high);
    this.lows.push(candle.low);
    this.closes.push(candle.close);

    // Keep only necessary data
    if (this.highs.length > this.period) {
      this.highs.shift();
      this.lows.shift();
      this.closes.shift();
    }

    if (this.highs.length >= this.period) {
      const highestHigh = Math.max(...this.highs);
      const lowestLow = Math.min(...this.lows);
      const close = candle.close;

      const williamsR = ((highestHigh - close) / (highestHigh - lowestLow)) * -100;

      const value = {
        williamsR,
        highestHigh,
        lowestLow,
        timestamp: candle.timestamp
      };

      this.values.push(value);
      
      if (this.values.length > 100) {
        this.values.shift();
      }

      if (!this.ready) this.ready = true;

      return williamsR;
    }

    return null;
  }

  /**
   * Get current Williams %R value
   * @returns {number|null}
   */
  getValue() {
    if (!this.ready) return null;
    const latest = this.values[this.values.length - 1];
    return latest ? latest.williamsR : null;
  }

  /**
   * Check if oversold
   * @param {number} threshold - Oversold threshold (default: -80)
   * @returns {boolean}
   */
  isOversold(threshold = -80) {
    const value = this.getValue();
    return value !== null && value <= threshold;
  }

  /**
   * Check if overbought
   * @param {number} threshold - Overbought threshold (default: -20)
   * @returns {boolean}
   */
  isOverbought(threshold = -20) {
    const value = this.getValue();
    return value !== null && value >= threshold;
  }

  reset() {
    super.reset();
    this.highs = [];
    this.lows = [];
    this.closes = [];
  }
}

module.exports = WilliamsRIndicator;
