/**
 * RSI INDICATOR
 * Relative Strength Index with incremental O(1) calculation
 */

const BaseIndicator = require('./BaseIndicator');

class RSIIndicator extends BaseIndicator {
  constructor(config = {}) {
    super(config);
    this.period = config.period || 14;
    this.warmupPeriod = this.period + 1;
    
    // State for incremental calculation
    this.gains = [];
    this.losses = [];
    this.avgGain = 0;
    this.avgLoss = 0;
    this.previousClose = null;
  }

  /**
   * Update RSI with new candle
   * @param {Object} candle - { open, high, low, close, volume, timestamp }
   * @returns {number|null} RSI value (0-100) or null if not ready
   */
  update(candle) {
    const close = candle.close;

    // Need previous close to calculate change
    if (this.previousClose === null) {
      this.previousClose = close;
      return null;
    }

    const change = close - this.previousClose;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    this.gains.push(gain);
    this.losses.push(loss);

    // Initial SMA calculation
    if (this.gains.length === this.period) {
      this.avgGain = this.gains.reduce((sum, g) => sum + g, 0) / this.period;
      this.avgLoss = this.losses.reduce((sum, l) => sum + l, 0) / this.period;
      this.ready = true;
    }
    // Incremental EMA calculation (Wilder's smoothing)
    else if (this.gains.length > this.period) {
      this.avgGain = ((this.avgGain * (this.period - 1)) + gain) / this.period;
      this.avgLoss = ((this.avgLoss * (this.period - 1)) + loss) / this.period;
    }

    this.previousClose = close;

    // Calculate RSI
    if (this.ready) {
      let rsi;
      if (this.avgLoss === 0) {
        rsi = 100;
      } else {
        const rs = this.avgGain / this.avgLoss;
        rsi = 100 - (100 / (1 + rs));
      }

      const value = {
        rsi,
        avgGain: this.avgGain,
        avgLoss: this.avgLoss,
        timestamp: candle.timestamp
      };

      this.values.push(value);
      
      // Keep only last 100 values
      if (this.values.length > 100) {
        this.values.shift();
      }

      return rsi;
    }

    return null;
  }

  /**
   * Get current RSI value
   * @returns {number|null}
   */
  getValue() {
    if (!this.ready) return null;
    const latest = this.values[this.values.length - 1];
    return latest ? latest.rsi : null;
  }

  /**
   * Check if oversold
   * @param {number} threshold - Oversold threshold (default: 30)
   * @returns {boolean}
   */
  isOversold(threshold = 30) {
    const rsi = this.getValue();
    return rsi !== null && rsi < threshold;
  }

  /**
   * Check if overbought
   * @param {number} threshold - Overbought threshold (default: 70)
   * @returns {boolean}
   */
  isOverbought(threshold = 70) {
    const rsi = this.getValue();
    return rsi !== null && rsi > threshold;
  }

  /**
   * Detect divergence (basic)
   * @param {Array} priceHistory - Array of price values
   * @returns {string|null} 'bullish', 'bearish', or null
   */
  detectDivergence(priceHistory) {
    if (!this.ready || this.values.length < 3 || priceHistory.length < 3) {
      return null;
    }

    const recentRSI = this.values.slice(-3).map(v => v.rsi);
    const recentPrices = priceHistory.slice(-3);

    // Bullish divergence: price making lower lows, RSI making higher lows
    if (recentPrices[2] < recentPrices[0] && recentRSI[2] > recentRSI[0]) {
      return 'bullish';
    }

    // Bearish divergence: price making higher highs, RSI making lower highs
    if (recentPrices[2] > recentPrices[0] && recentRSI[2] < recentRSI[0]) {
      return 'bearish';
    }

    return null;
  }

  reset() {
    super.reset();
    this.gains = [];
    this.losses = [];
    this.avgGain = 0;
    this.avgLoss = 0;
    this.previousClose = null;
  }
}

module.exports = RSIIndicator;
