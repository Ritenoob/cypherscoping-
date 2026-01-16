/**
 * Bollinger Bands - ENHANCED with Full Signal Detection
 * Signals: Band Touch, Squeeze, Breakout, %B Analysis
 */

class BollingerBands {
  constructor(config = {}) {
    this.period = config.period || 20;
    this.stdDev = config.stdDev || 2;
    
    this.prices = [];
    
    this.upper = null;
    this.middle = null;
    this.lower = null;
    this.bandwidth = null;
    this.percentB = null;
    
    this.prevUpper = null;
    this.prevLower = null;
    this.prevBandwidth = null;
    
    this.bandwidthHistory = [];
    this.priceHistory = [];
    this.maxHistory = config.historyLength || 50;
  }

  update(candle) {
    const close = typeof candle === 'number' ? candle : candle.close;
    
    this.prevUpper = this.upper;
    this.prevLower = this.lower;
    this.prevBandwidth = this.bandwidth;
    
    this.prices.push(close);
    if (this.prices.length > this.period) {
      this.prices.shift();
    }
    
    if (this.prices.length < this.period) {
      return this.getResult();
    }
    
    // Calculate SMA (middle band)
    this.middle = this.prices.reduce((a, b) => a + b, 0) / this.period;
    
    // Calculate standard deviation
    const squaredDiffs = this.prices.map(p => Math.pow(p - this.middle, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / this.period;
    const std = Math.sqrt(variance);
    
    // Calculate bands
    this.upper = this.middle + (std * this.stdDev);
    this.lower = this.middle - (std * this.stdDev);
    this.bandwidth = (this.upper - this.lower) / this.middle * 100;
    this.percentB = (close - this.lower) / (this.upper - this.lower);
    
    this.bandwidthHistory.push(this.bandwidth);
    this.priceHistory.push(close);
    
    if (this.bandwidthHistory.length > this.maxHistory) {
      this.bandwidthHistory.shift();
      this.priceHistory.shift();
    }
    
    return this.getResult();
  }

  getBandTouch() {
    if (this.upper === null) return null;
    
    const currentPrice = this.priceHistory[this.priceHistory.length - 1];
    
    // Touch lower band
    if (currentPrice <= this.lower * 1.001) {
      return {
        type: 'lower_band_touch',
        direction: 'bullish',
        strength: 'moderate',
        message: `Price touched lower Bollinger Band (${this.lower.toFixed(2)})`,
        metadata: { price: currentPrice, lower: this.lower, percentB: this.percentB }
      };
    }
    
    // Touch upper band
    if (currentPrice >= this.upper * 0.999) {
      return {
        type: 'upper_band_touch',
        direction: 'bearish',
        strength: 'moderate',
        message: `Price touched upper Bollinger Band (${this.upper.toFixed(2)})`,
        metadata: { price: currentPrice, upper: this.upper, percentB: this.percentB }
      };
    }
    
    return null;
  }

  getSqueeze() {
    if (this.bandwidthHistory.length < 20) return null;
    
    const avgBandwidth = this.bandwidthHistory.reduce((a, b) => a + b, 0) / this.bandwidthHistory.length;
    const minBandwidth = Math.min(...this.bandwidthHistory.slice(-20));
    
    // Squeeze: bandwidth near 20-period minimum
    if (this.bandwidth < avgBandwidth * 0.5 && this.bandwidth <= minBandwidth * 1.1) {
      return {
        type: 'bollinger_squeeze',
        direction: 'neutral',
        strength: 'strong',
        message: `Bollinger squeeze detected (bandwidth: ${this.bandwidth.toFixed(2)}%)`,
        metadata: { bandwidth: this.bandwidth, avgBandwidth, minBandwidth }
      };
    }
    
    return null;
  }

  getBreakout() {
    if (this.prevUpper === null || this.priceHistory.length < 2) return null;
    
    const currentPrice = this.priceHistory[this.priceHistory.length - 1];
    const prevPrice = this.priceHistory[this.priceHistory.length - 2];
    
    // Breakout above upper band
    if (prevPrice < this.prevUpper && currentPrice > this.upper) {
      return {
        type: 'bullish_breakout',
        direction: 'bullish',
        strength: 'strong',
        message: 'Price broke above upper Bollinger Band',
        metadata: { prevPrice, currentPrice, upper: this.upper }
      };
    }
    
    // Breakdown below lower band
    if (prevPrice > this.prevLower && currentPrice < this.lower) {
      return {
        type: 'bearish_breakdown',
        direction: 'bearish',
        strength: 'strong',
        message: 'Price broke below lower Bollinger Band',
        metadata: { prevPrice, currentPrice, lower: this.lower }
      };
    }
    
    return null;
  }

  getPercentBSignal() {
    if (this.percentB === null) return null;
    
    // %B extreme oversold (below 0)
    if (this.percentB < 0) {
      return {
        type: 'percentb_oversold',
        direction: 'bullish',
        strength: this.percentB < -0.2 ? 'strong' : 'moderate',
        message: `%B extreme oversold (${(this.percentB * 100).toFixed(1)}%)`,
        metadata: { percentB: this.percentB }
      };
    }
    
    // %B extreme overbought (above 100%)
    if (this.percentB > 1) {
      return {
        type: 'percentb_overbought',
        direction: 'bearish',
        strength: this.percentB > 1.2 ? 'strong' : 'moderate',
        message: `%B extreme overbought (${(this.percentB * 100).toFixed(1)}%)`,
        metadata: { percentB: this.percentB }
      };
    }
    
    return null;
  }

  getSignals() {
    const signals = [];
    
    const touch = this.getBandTouch();
    if (touch) signals.push(touch);
    
    const squeeze = this.getSqueeze();
    if (squeeze) signals.push(squeeze);
    
    const breakout = this.getBreakout();
    if (breakout) signals.push(breakout);
    
    const percentBSignal = this.getPercentBSignal();
    if (percentBSignal) signals.push(percentBSignal);
    
    return signals;
  }

  getResult() {
    return {
      value: {
        upper: this.upper,
        middle: this.middle,
        lower: this.lower,
        bandwidth: this.bandwidth,
        percentB: this.percentB
      },
      signals: this.upper !== null ? this.getSignals() : []
    };
  }

  reset() {
    this.prices = [];
    this.upper = null;
    this.middle = null;
    this.lower = null;
    this.bandwidth = null;
    this.percentB = null;
    this.prevUpper = null;
    this.prevLower = null;
    this.prevBandwidth = null;
    this.bandwidthHistory = [];
    this.priceHistory = [];
  }
}

module.exports = BollingerBands;
