/**
 * Awesome Oscillator - ENHANCED with Bill Williams Patterns
 * Signals: Zero Cross, Saucer, Twin Peaks, Divergence
 */

class AwesomeOscillator {
  constructor(config = {}) {
    this.fastPeriod = config.fastPeriod || 5;
    this.slowPeriod = config.slowPeriod || 34;
    
    this.fastWindow = [];
    this.slowWindow = [];
    this.fastSum = 0;
    this.slowSum = 0;
    
    this.currentAO = null;
    this.prevAO = null;
    
    this.aoHistory = [];
    this.priceHistory = [];
    this.maxHistory = config.historyLength || 50;
  }

  update(candle) {
    this.prevAO = this.currentAO;
    
    const median = (candle.high + candle.low) / 2;
    
    this.fastWindow.push(median);
    this.fastSum += median;
    if (this.fastWindow.length > this.fastPeriod) {
      this.fastSum -= this.fastWindow.shift();
    }
    
    this.slowWindow.push(median);
    this.slowSum += median;
    if (this.slowWindow.length > this.slowPeriod) {
      this.slowSum -= this.slowWindow.shift();
    }
    
    if (this.slowWindow.length < this.slowPeriod) {
      return this.getResult();
    }
    
    const fastSMA = this.fastSum / this.fastPeriod;
    const slowSMA = this.slowSum / this.slowPeriod;
    this.currentAO = fastSMA - slowSMA;
    
    this.aoHistory.push(this.currentAO);
    this.priceHistory.push(candle.close || median);
    
    if (this.aoHistory.length > this.maxHistory) {
      this.aoHistory.shift();
      this.priceHistory.shift();
    }
    
    return this.getResult();
  }

  getZeroLineCross() {
    if (this.prevAO === null || this.currentAO === null) return null;
    
    if (this.prevAO <= 0 && this.currentAO > 0) {
      return {
        type: 'bullish_zero_cross',
        direction: 'bullish',
        strength: 'strong',
        message: 'AO crossed above zero line (bullish momentum)',
        metadata: { prevAO: this.prevAO, currentAO: this.currentAO }
      };
    }
    
    if (this.prevAO >= 0 && this.currentAO < 0) {
      return {
        type: 'bearish_zero_cross',
        direction: 'bearish',
        strength: 'strong',
        message: 'AO crossed below zero line (bearish momentum)',
        metadata: { prevAO: this.prevAO, currentAO: this.currentAO }
      };
    }
    
    return null;
  }

  getSaucerPattern() {
    if (this.aoHistory.length < 3) return null;
    
    const [bar1, bar2, bar3] = this.aoHistory.slice(-3);
    
    // Bullish saucer: above zero, dip then rise
    if (bar1 > 0 && bar2 < bar1 && bar3 > bar2) {
      return {
        type: 'bullish_saucer',
        direction: 'bullish',
        strength: 'moderate',
        message: 'Bullish saucer pattern (continuation signal)',
        metadata: { bars: [bar1, bar2, bar3] }
      };
    }
    
    // Bearish saucer: below zero, rise then dip
    if (bar1 < 0 && bar2 > bar1 && bar3 < bar2) {
      return {
        type: 'bearish_saucer',
        direction: 'bearish',
        strength: 'moderate',
        message: 'Bearish saucer pattern (continuation signal)',
        metadata: { bars: [bar1, bar2, bar3] }
      };
    }
    
    return null;
  }

  getTwinPeaks() {
    if (this.aoHistory.length < 10) return null;
    
    const recent = this.aoHistory.slice(-10);
    const peaks = this.findPeaks(recent);
    
    if (peaks.length >= 2) {
      const peak1 = recent[peaks[peaks.length - 2]];
      const peak2 = recent[peaks[peaks.length - 1]];
      
      // Bullish twin peaks: two troughs below zero, second higher
      if (peak1 < 0 && peak2 < 0 && peak2 > peak1) {
        return {
          type: 'bullish_twin_peaks',
          direction: 'bullish',
          strength: 'strong',
          message: 'Bullish twin peaks (higher low below zero)',
          metadata: { peak1, peak2 }
        };
      }
      
      // Bearish twin peaks: two peaks above zero, second lower
      if (peak1 > 0 && peak2 > 0 && peak2 < peak1) {
        return {
          type: 'bearish_twin_peaks',
          direction: 'bearish',
          strength: 'strong',
          message: 'Bearish twin peaks (lower high above zero)',
          metadata: { peak1, peak2 }
        };
      }
    }
    
    return null;
  }

  findPeaks(data) {
    const peaks = [];
    for (let i = 1; i < data.length - 1; i++) {
      if ((data[i] > data[i-1] && data[i] > data[i+1]) ||
          (data[i] < data[i-1] && data[i] < data[i+1])) {
        peaks.push(i);
      }
    }
    return peaks;
  }

  getDivergence() {
    if (this.aoHistory.length < 20 || this.priceHistory.length < 20) return null;
    
    const recentAO = this.aoHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);
    
    const priceLows = this.findSwingLows(recentPrices);
    const aoLows = this.findSwingLows(recentAO);
    
    if (priceLows.length >= 2 && aoLows.length >= 2) {
      const lastPrice = recentPrices[priceLows[priceLows.length - 1]];
      const prevPrice = recentPrices[priceLows[priceLows.length - 2]];
      const lastAO = recentAO[aoLows[aoLows.length - 1]];
      const prevAO = recentAO[aoLows[aoLows.length - 2]];
      
      if (lastPrice < prevPrice && lastAO > prevAO) {
        return {
          type: 'bullish_divergence',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'Bullish AO divergence (price lower low, AO higher low)',
          metadata: { lastPrice, prevPrice, lastAO, prevAO }
        };
      }
    }
    
    const priceHighs = this.findSwingHighs(recentPrices);
    const aoHighs = this.findSwingHighs(recentAO);
    
    if (priceHighs.length >= 2 && aoHighs.length >= 2) {
      const lastPrice = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPrice = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastAO = recentAO[aoHighs[aoHighs.length - 1]];
      const prevAO = recentAO[aoHighs[aoHighs.length - 2]];
      
      if (lastPrice > prevPrice && lastAO < prevAO) {
        return {
          type: 'bearish_divergence',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'Bearish AO divergence (price higher high, AO lower high)',
          metadata: { lastPrice, prevPrice, lastAO, prevAO }
        };
      }
    }
    
    return null;
  }

  findSwingLows(data) {
    const lows = [];
    for (let i = 2; i < data.length - 2; i++) {
      if (data[i] < data[i-1] && data[i] < data[i-2] &&
          data[i] < data[i+1] && data[i] < data[i+2]) {
        lows.push(i);
      }
    }
    return lows;
  }

  findSwingHighs(data) {
    const highs = [];
    for (let i = 2; i < data.length - 2; i++) {
      if (data[i] > data[i-1] && data[i] > data[i-2] &&
          data[i] > data[i+1] && data[i] > data[i+2]) {
        highs.push(i);
      }
    }
    return highs;
  }

  getSignals() {
    const signals = [];
    
    const zeroCross = this.getZeroLineCross();
    if (zeroCross) signals.push(zeroCross);
    
    const saucer = this.getSaucerPattern();
    if (saucer) signals.push(saucer);
    
    const twinPeaks = this.getTwinPeaks();
    if (twinPeaks) signals.push(twinPeaks);
    
    const divergence = this.getDivergence();
    if (divergence) signals.push(divergence);
    
    return signals;
  }

  getResult() {
    return {
      value: this.currentAO,
      signals: this.currentAO !== null ? this.getSignals() : []
    };
  }

  reset() {
    this.fastWindow = [];
    this.slowWindow = [];
    this.fastSum = 0;
    this.slowSum = 0;
    this.currentAO = null;
    this.prevAO = null;
    this.aoHistory = [];
    this.priceHistory = [];
  }
}

module.exports = AwesomeOscillator;
