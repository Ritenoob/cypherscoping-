/**
 * MACD INDICATOR
 * Moving Average Convergence Divergence
 */

const BaseIndicator = require('./BaseIndicator');

class MACDIndicator extends BaseIndicator {
  constructor(config = {}) {
    super(config);
    this.fastPeriod = config.fastPeriod || 12;
    this.slowPeriod = config.slowPeriod || 26;
    this.signalPeriod = config.signalPeriod || 9;
    this.warmupPeriod = this.slowPeriod + this.signalPeriod;
    
    // EMA state
    this.fastEMA = null;
    this.slowEMA = null;
    this.signalEMA = null;
    
    this.closes = [];
    this.macdLine = [];
  }

  /**
   * Update MACD with new candle
   * @param {Object} candle - { close, ... }
   * @returns {Object|null} { macdLine, signalLine, histogram } or null
   */
  update(candle) {
    const close = candle.close;
    this.closes.push(close);

    // Calculate fast EMA
    if (this.closes.length === this.fastPeriod) {
      this.fastEMA = BaseIndicator.calculateSMA(this.closes, this.fastPeriod);
    } else if (this.closes.length > this.fastPeriod && this.fastEMA !== null) {
      this.fastEMA = BaseIndicator.calculateEMA(close, this.fastEMA, this.fastPeriod);
    }

    // Calculate slow EMA
    if (this.closes.length === this.slowPeriod) {
      this.slowEMA = BaseIndicator.calculateSMA(this.closes, this.slowPeriod);
    } else if (this.closes.length > this.slowPeriod && this.slowEMA !== null) {
      this.slowEMA = BaseIndicator.calculateEMA(close, this.slowEMA, this.slowPeriod);
    }

    // Calculate MACD line
    if (this.fastEMA !== null && this.slowEMA !== null) {
      const macdValue = this.fastEMA - this.slowEMA;
      this.macdLine.push(macdValue);

      // Calculate signal line
      if (this.macdLine.length === this.signalPeriod) {
        this.signalEMA = BaseIndicator.calculateSMA(this.macdLine, this.signalPeriod);
        this.ready = true;
      } else if (this.macdLine.length > this.signalPeriod && this.signalEMA !== null) {
        this.signalEMA = BaseIndicator.calculateEMA(macdValue, this.signalEMA, this.signalPeriod);
      }

      // Calculate histogram
      if (this.ready) {
        const histogram = macdValue - this.signalEMA;

        const value = {
          macdLine: macdValue,
          signalLine: this.signalEMA,
          histogram,
          timestamp: candle.timestamp
        };

        this.values.push(value);

        // Keep only last 100 values
        if (this.values.length > 100) {
          this.values.shift();
        }

        return value;
      }
    }

    return null;
  }

  /**
   * Get current MACD value
   * @returns {Object|null} { macdLine, signalLine, histogram }
   */
  getValue() {
    if (!this.ready) return null;
    return this.values[this.values.length - 1];
  }

  /**
   * Check for bullish crossover (MACD crosses above signal)
   * @returns {boolean}
   */
  isBullishCrossover() {
    if (this.values.length < 2) return false;
    
    const current = this.values[this.values.length - 1];
    const previous = this.values[this.values.length - 2];
    
    return previous.histogram < 0 && current.histogram > 0;
  }

  /**
   * Check for bearish crossover (MACD crosses below signal)
   * @returns {boolean}
   */
  isBearishCrossover() {
    if (this.values.length < 2) return false;
    
    const current = this.values[this.values.length - 1];
    const previous = this.values[this.values.length - 2];
    
    return previous.histogram > 0 && current.histogram < 0;
  }

  /**
   * Detect divergence
   * @param {Array} priceHistory - Array of price values
   * @returns {string|null} 'bullish', 'bearish', or null
   */
  detectDivergence(priceHistory) {
    if (!this.ready || this.values.length < 3 || priceHistory.length < 3) {
      return null;
    }

    const recentMACD = this.values.slice(-3).map(v => v.histogram);
    const recentPrices = priceHistory.slice(-3);

    // Bullish divergence
    if (recentPrices[2] < recentPrices[0] && recentMACD[2] > recentMACD[0]) {
      return 'bullish';
    }

    // Bearish divergence
    if (recentPrices[2] > recentPrices[0] && recentMACD[2] < recentMACD[0]) {
      return 'bearish';
    }

    return null;
  }

  reset() {
    super.reset();
    this.fastEMA = null;
    this.slowEMA = null;
    this.signalEMA = null;
    this.closes = [];
    this.macdLine = [];
  }
}

module.exports = MACDIndicator;
