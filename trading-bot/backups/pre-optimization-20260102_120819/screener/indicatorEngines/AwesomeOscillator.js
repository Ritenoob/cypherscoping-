/**
 * AWESOME OSCILLATOR
 * Bill Williams' Awesome Oscillator
 */

const BaseIndicator = require('./BaseIndicator');

class AwesomeOscillator extends BaseIndicator {
  constructor(config = {}) {
    super(config);
    this.fastPeriod = config.fastPeriod || 5;
    this.slowPeriod = config.slowPeriod || 34;
    this.warmupPeriod = this.slowPeriod;
    
    this.medianPrices = [];
    this.fastSMA = null;
    this.slowSMA = null;
  }

  /**
   * Update AO with new candle
   * @param {Object} candle - { high, low, ... }
   * @returns {number|null} AO value or null
   */
  update(candle) {
    // Median price = (high + low) / 2
    const medianPrice = (candle.high + candle.low) / 2;
    this.medianPrices.push(medianPrice);

    // Keep only necessary data
    if (this.medianPrices.length > this.slowPeriod) {
      this.medianPrices.shift();
    }

    // Calculate SMAs
    if (this.medianPrices.length >= this.fastPeriod) {
      this.fastSMA = BaseIndicator.calculateSMA(this.medianPrices, this.fastPeriod);
    }

    if (this.medianPrices.length >= this.slowPeriod) {
      this.slowSMA = BaseIndicator.calculateSMA(this.medianPrices, this.slowPeriod);
    }

    // Calculate AO
    if (this.fastSMA !== null && this.slowSMA !== null) {
      const ao = this.fastSMA - this.slowSMA;

      const value = {
        ao,
        fastSMA: this.fastSMA,
        slowSMA: this.slowSMA,
        timestamp: candle.timestamp
      };

      this.values.push(value);
      
      if (this.values.length > 100) {
        this.values.shift();
      }

      if (!this.ready) this.ready = true;

      return ao;
    }

    return null;
  }

  /**
   * Get current AO value
   * @returns {number|null}
   */
  getValue() {
    if (!this.ready) return null;
    const latest = this.values[this.values.length - 1];
    return latest ? latest.ao : null;
  }

  /**
   * Check for bullish crossover (AO crosses above zero)
   * @returns {boolean}
   */
  isBullishCrossover() {
    if (this.values.length < 2) return false;
    
    const current = this.values[this.values.length - 1];
    const previous = this.values[this.values.length - 2];
    
    return previous.ao < 0 && current.ao > 0;
  }

  /**
   * Check for bearish crossover (AO crosses below zero)
   * @returns {boolean}
   */
  isBearishCrossover() {
    if (this.values.length < 2) return false;
    
    const current = this.values[this.values.length - 1];
    const previous = this.values[this.values.length - 2];
    
    return previous.ao > 0 && current.ao < 0;
  }

  /**
   * Check for twin peaks (bullish pattern)
   * @returns {boolean}
   */
  isTwinPeaksBullish() {
    if (this.values.length < 3) return false;
    
    const vals = this.values.slice(-3);
    // Two consecutive negative bars where second is closer to zero
    return vals[0].ao < 0 && vals[1].ao < 0 && vals[2].ao < 0 &&
           vals[1].ao < vals[0].ao && vals[2].ao > vals[1].ao;
  }

  reset() {
    super.reset();
    this.medianPrices = [];
    this.fastSMA = null;
    this.slowSMA = null;
  }
}

module.exports = AwesomeOscillator;
