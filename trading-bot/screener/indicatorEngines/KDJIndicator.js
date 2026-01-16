/**
 * KDJ INDICATOR
 * Stochastic oscillator with J line (K%D%J)
 * K line: Fast stochastic
 * D line: Moving average of K
 * J line: 3K - 2D (most sensitive)
 */

const BaseIndicator = require('./BaseIndicator');

class KDJIndicator extends BaseIndicator {
  constructor(config = {}) {
    super(config);
    this.kPeriod = config.kPeriod || 9;
    this.dPeriod = config.dPeriod || 3;
    this.smooth = config.smooth || 3;
    this.warmupPeriod = this.kPeriod + this.dPeriod;
    
    this.highs = [];
    this.lows = [];
    this.closes = [];
    this.kValues = [];
    this.dValue = null;
  }

  /**
   * Update KDJ with new candle
   * @param {Object} candle - { high, low, close, ... }
   * @returns {Object|null} { k, d, j } or null
   */
  update(candle) {
    this.highs.push(candle.high);
    this.lows.push(candle.low);
    this.closes.push(candle.close);

    // Keep only necessary data
    if (this.highs.length > this.kPeriod) {
      this.highs.shift();
      this.lows.shift();
      this.closes.shift();
    }

    if (this.highs.length >= this.kPeriod) {
      // Calculate RSV (Raw Stochastic Value)
      const highestHigh = Math.max(...this.highs);
      const lowestLow = Math.min(...this.lows);
      const close = candle.close;

      let rsv;
      if (highestHigh === lowestLow) {
        rsv = 50; // Neutral if no range
      } else {
        rsv = ((close - lowestLow) / (highestHigh - lowestLow)) * 100;
      }

      // Calculate K (smoothed RSV)
      let k;
      if (this.kValues.length === 0) {
        k = rsv; // First K = RSV
      } else {
        const prevK = this.kValues[this.kValues.length - 1];
        k = (prevK * (this.smooth - 1) + rsv) / this.smooth;
      }

      this.kValues.push(k);

      // Keep only necessary K values
      if (this.kValues.length > this.dPeriod) {
        this.kValues.shift();
      }

      // Calculate D (smoothed K)
      let d;
      if (this.kValues.length >= this.dPeriod) {
        if (this.dValue === null) {
          d = BaseIndicator.calculateSMA(this.kValues, this.dPeriod);
        } else {
          d = (this.dValue * (this.smooth - 1) + k) / this.smooth;
        }
        this.dValue = d;

        // Calculate J (3K - 2D)
        const j = 3 * k - 2 * d;

        const value = {
          k,
          d,
          j,
          timestamp: candle.timestamp
        };

        this.values.push(value);
        
        if (this.values.length > 100) {
          this.values.shift();
        }

        if (!this.ready) this.ready = true;

        return value;
      }
    }

    return null;
  }

  /**
   * Get current KDJ value
   * @returns {Object|null} { k, d, j }
   */
  getValue() {
    if (!this.ready) return null;
    return this.values[this.values.length - 1];
  }

  /**
   * Check if J line is oversold
   * @param {number} threshold - Oversold threshold (default: 20)
   * @returns {boolean}
   */
  isOversold(threshold = 20) {
    const value = this.getValue();
    return value !== null && value.j < threshold;
  }

  /**
   * Check if J line is overbought
   * @param {number} threshold - Overbought threshold (default: 80)
   * @returns {boolean}
   */
  isOverbought(threshold = 80) {
    const value = this.getValue();
    return value !== null && value.j > threshold;
  }

  /**
   * Check for golden cross (K crosses above D)
   * @returns {boolean}
   */
  isGoldenCross() {
    if (this.values.length < 2) return false;
    
    const current = this.values[this.values.length - 1];
    const previous = this.values[this.values.length - 2];
    
    return previous.k < previous.d && current.k > current.d;
  }

  /**
   * Check for death cross (K crosses below D)
   * @returns {boolean}
   */
  isDeathCross() {
    if (this.values.length < 2) return false;
    
    const current = this.values[this.values.length - 1];
    const previous = this.values[this.values.length - 2];
    
    return previous.k > previous.d && current.k < current.d;
  }

  reset() {
    super.reset();
    this.highs = [];
    this.lows = [];
    this.closes = [];
    this.kValues = [];
    this.dValue = null;
  }
}

module.exports = KDJIndicator;
