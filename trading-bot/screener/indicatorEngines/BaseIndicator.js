/**
 * BASE INDICATOR CLASS
 * Abstract base class for all technical indicators
 * Provides common interface and utilities
 */

class BaseIndicator {
  constructor(config = {}) {
    this.config = config;
    this.values = [];
    this.ready = false;
    this.warmupPeriod = config.warmupPeriod || 0;
  }

  /**
   * Update indicator with new data point
   * @param {Object} candle - OHLCV candle data
   * @returns {Object|null} Indicator value or null if not ready
   */
  update(candle) {
    throw new Error('update() must be implemented by subclass');
  }

  /**
   * Get current indicator value
   * @returns {Object|null} Current value or null if not ready
   */
  getValue() {
    if (!this.ready) return null;
    return this.values[this.values.length - 1];
  }

  /**
   * Get historical values
   * @param {number} count - Number of values to return
   * @returns {Array} Array of historical values
   */
  getHistory(count = 10) {
    return this.values.slice(-count);
  }

  /**
   * Check if indicator is ready
   * @returns {boolean}
   */
  isReady() {
    return this.ready;
  }

  /**
   * Reset indicator state
   */
  reset() {
    this.values = [];
    this.ready = false;
  }

  /**
   * Get warmup period required
   * @returns {number}
   */
  getWarmupPeriod() {
    return this.warmupPeriod;
  }

  /**
   * Helper: Calculate SMA
   * @param {Array} data - Array of values
   * @param {number} period - Period for SMA
   * @returns {number|null}
   */
  static calculateSMA(data, period) {
    if (data.length < period) return null;
    
    const slice = data.slice(-period);
    const sum = slice.reduce((acc, val) => acc + val, 0);
    return sum / period;
  }

  /**
   * Helper: Calculate EMA
   * @param {number} currentValue - Current value
   * @param {number} previousEMA - Previous EMA value
   * @param {number} period - Period for EMA
   * @returns {number}
   */
  static calculateEMA(currentValue, previousEMA, period) {
    const multiplier = 2 / (period + 1);
    return (currentValue - previousEMA) * multiplier + previousEMA;
  }

  /**
   * Helper: Calculate Standard Deviation
   * @param {Array} data - Array of values
   * @param {number} period - Period
   * @returns {number|null}
   */
  static calculateStdDev(data, period) {
    if (data.length < period) return null;
    
    const slice = data.slice(-period);
    const mean = slice.reduce((acc, val) => acc + val, 0) / period;
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
    
    return Math.sqrt(variance);
  }

  /**
   * Helper: Find highest value in array
   * @param {Array} data - Array of values
   * @param {number} period - Period to look back
   * @returns {number|null}
   */
  static findHighest(data, period) {
    if (data.length < period) return null;
    return Math.max(...data.slice(-period));
  }

  /**
   * Helper: Find lowest value in array
   * @param {Array} data - Array of values
   * @param {number} period - Period to look back
   * @returns {number|null}
   */
  static findLowest(data, period) {
    if (data.length < period) return null;
    return Math.min(...data.slice(-period));
  }
}

module.exports = BaseIndicator;
