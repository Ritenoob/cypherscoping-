/**
 * Williams %R - ENHANCED with Full Signal Detection
 * Signals: Crossovers, Failure Swings, Divergence, Zone Analysis
 */

class WilliamsRIndicator {
  constructor(config = {}) {
    this.period = config.period || 14;
    this.oversoldLevel = config.oversold || -80;
    this.overboughtLevel = config.overbought || -20;
    
    this.highs = [];
    this.lows = [];
    this.closes = [];
    
    this.currentValue = null;
    this.prevValue = null;
    
    this.wrHistory = [];
    this.priceHistory = [];
    this.maxHistory = config.historyLength || 50;
  }

  update(candle) {
    const { high, low, close } = candle;
    
    this.prevValue = this.currentValue;
    
    this.highs.push(high);
    this.lows.push(low);
    this.closes.push(close);
    
    if (this.highs.length > this.period) {
      this.highs.shift();
      this.lows.shift();
      this.closes.shift();
    }
    
    if (this.highs.length < this.period) {
      return this.getResult();
    }
    
    const highestHigh = Math.max(...this.highs);
    const lowestLow = Math.min(...this.lows);
    const range = highestHigh - lowestLow;
    
    this.currentValue = range === 0 ? -50 : ((highestHigh - close) / range) * -100;
    
    this.wrHistory.push(this.currentValue);
    this.priceHistory.push(close);
    
    if (this.wrHistory.length > this.maxHistory) {
      this.wrHistory.shift();
      this.priceHistory.shift();
    }
    
    return this.getResult();
  }

  getCrossover() {
    if (this.prevValue === null || this.currentValue === null) return null;
    
    if (this.prevValue <= this.oversoldLevel && this.currentValue > this.oversoldLevel) {
      return {
        type: 'bullish_crossover',
        direction: 'bullish',
        strength: 'strong',
        message: `Williams %R crossed above ${this.oversoldLevel} (oversold reversal)`,
        metadata: { from: this.prevValue, to: this.currentValue }
      };
    }
    
    if (this.prevValue >= this.overboughtLevel && this.currentValue < this.overboughtLevel) {
      return {
        type: 'bearish_crossover',
        direction: 'bearish',
        strength: 'strong',
        message: `Williams %R crossed below ${this.overboughtLevel} (overbought reversal)`,
        metadata: { from: this.prevValue, to: this.currentValue }
      };
    }
    
    return null;
  }

  getFailureSwing() {
    if (this.wrHistory.length < 10) return null;
    
    const recent = this.wrHistory.slice(-10);
    const recentMin = Math.min(...recent);
    const recentMax = Math.max(...recent);
    const priceRecent = this.priceHistory.slice(-10);
    
    // Bullish failure swing
    if (this.currentValue < -60 && recentMin > -95) {
      const priceDecreasing = priceRecent[0] > priceRecent[priceRecent.length - 1];
      if (priceDecreasing) {
        return {
          type: 'bullish_failure_swing',
          direction: 'bullish',
          strength: 'moderate',
          message: 'Bullish failure swing (downtrend weakening)',
          metadata: { currentValue: this.currentValue, recentMin }
        };
      }
    }
    
    // Bearish failure swing
    if (this.currentValue > -40 && recentMax < -5) {
      const priceIncreasing = priceRecent[0] < priceRecent[priceRecent.length - 1];
      if (priceIncreasing) {
        return {
          type: 'bearish_failure_swing',
          direction: 'bearish',
          strength: 'moderate',
          message: 'Bearish failure swing (uptrend weakening)',
          metadata: { currentValue: this.currentValue, recentMax }
        };
      }
    }
    
    return null;
  }

  getDivergence() {
    if (this.wrHistory.length < 20) return null;
    
    const recentWR = this.wrHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);
    
    const priceLows = this.findSwingLows(recentPrices);
    const wrLows = this.findSwingLows(recentWR);
    
    if (priceLows.length >= 2 && wrLows.length >= 2) {
      const lastPrice = recentPrices[priceLows[priceLows.length - 1]];
      const prevPrice = recentPrices[priceLows[priceLows.length - 2]];
      const lastWR = recentWR[wrLows[wrLows.length - 1]];
      const prevWR = recentWR[wrLows[wrLows.length - 2]];
      
      if (lastPrice < prevPrice && lastWR > prevWR) {
        return {
          type: 'bullish_divergence',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'Bullish divergence (price lower low, %R higher low)',
          metadata: { lastPrice, prevPrice, lastWR, prevWR }
        };
      }
    }
    
    const priceHighs = this.findSwingHighs(recentPrices);
    const wrHighs = this.findSwingHighs(recentWR);
    
    if (priceHighs.length >= 2 && wrHighs.length >= 2) {
      const lastPrice = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPrice = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastWR = recentWR[wrHighs[wrHighs.length - 1]];
      const prevWR = recentWR[wrHighs[wrHighs.length - 2]];
      
      if (lastPrice > prevPrice && lastWR < prevWR) {
        return {
          type: 'bearish_divergence',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'Bearish divergence (price higher high, %R lower high)',
          metadata: { lastPrice, prevPrice, lastWR, prevWR }
        };
      }
    }
    
    return null;
  }

  getZone() {
    if (this.currentValue === null) return null;
    
    if (this.currentValue < this.oversoldLevel) {
      return {
        type: 'oversold_zone',
        direction: 'bullish',
        strength: this.currentValue < -90 ? 'extreme' : 'moderate',
        message: `Williams %R in oversold zone (${this.currentValue.toFixed(1)})`,
        metadata: { value: this.currentValue, threshold: this.oversoldLevel }
      };
    }
    
    if (this.currentValue > this.overboughtLevel) {
      return {
        type: 'overbought_zone',
        direction: 'bearish',
        strength: this.currentValue > -10 ? 'extreme' : 'moderate',
        message: `Williams %R in overbought zone (${this.currentValue.toFixed(1)})`,
        metadata: { value: this.currentValue, threshold: this.overboughtLevel }
      };
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
    
    const crossover = this.getCrossover();
    if (crossover) signals.push(crossover);
    
    const failureSwing = this.getFailureSwing();
    if (failureSwing) signals.push(failureSwing);
    
    const divergence = this.getDivergence();
    if (divergence) signals.push(divergence);
    
    const zone = this.getZone();
    if (zone) signals.push(zone);
    
    return signals;
  }

  getResult() {
    return {
      value: this.currentValue,
      signals: this.currentValue !== null ? this.getSignals() : []
    };
  }

  reset() {
    this.highs = [];
    this.lows = [];
    this.closes = [];
    this.currentValue = null;
    this.prevValue = null;
    this.wrHistory = [];
    this.priceHistory = [];
  }
}

module.exports = WilliamsRIndicator;
