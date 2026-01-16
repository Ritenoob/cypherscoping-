/**
 * On-Balance Volume (OBV) - ENHANCED with Full Signal Detection
 * Signals: Slope Analysis, Breakout, Divergence
 * 
 * Formula:
 * if Close > Close_prev: OBV = OBV_prev + Volume
 * if Close < Close_prev: OBV = OBV_prev - Volume
 * if Close = Close_prev: OBV = OBV_prev
 */

class OBVIndicator {
  constructor(config = {}) {
    this.slopeWindow = config.slopeWindow || 14;
    this.smoothingEma = config.smoothingEma || 5;
    this.zScoreCap = config.zScoreCap || 2.0;
    this.confirmTrend = config.confirmTrend !== false;
    
    this.currentOBV = 0;
    this.prevClose = null;
    
    this.obvHistory = [];
    this.priceHistory = [];
    this.slopeHistory = [];
    this.maxHistory = config.historyLength || 100;
  }

  update(candle) {
    const { close, volume } = candle;
    
    if (this.prevClose !== null) {
      if (close > this.prevClose) {
        this.currentOBV += volume;
      } else if (close < this.prevClose) {
        this.currentOBV -= volume;
      }
      // If equal, OBV stays the same
    }
    
    this.prevClose = close;
    
    this.obvHistory.push(this.currentOBV);
    this.priceHistory.push(close);
    
    // Calculate slope
    if (this.obvHistory.length >= this.slopeWindow) {
      const recentOBV = this.obvHistory.slice(-this.slopeWindow);
      const slope = (recentOBV[recentOBV.length - 1] - recentOBV[0]) / this.slopeWindow;
      this.slopeHistory.push(slope);
    }
    
    if (this.obvHistory.length > this.maxHistory) {
      this.obvHistory.shift();
      this.priceHistory.shift();
    }
    if (this.slopeHistory.length > this.maxHistory) {
      this.slopeHistory.shift();
    }
    
    return this.getResult();
  }

  getSlopeSignal() {
    if (this.slopeHistory.length < 5) return null;
    
    const currentSlope = this.slopeHistory[this.slopeHistory.length - 1];
    const avgSlope = this.slopeHistory.reduce((a, b) => a + b, 0) / this.slopeHistory.length;
    const stdDev = Math.sqrt(
      this.slopeHistory.reduce((sum, s) => sum + Math.pow(s - avgSlope, 2), 0) / this.slopeHistory.length
    );
    
    const zScore = stdDev > 0 ? (currentSlope - avgSlope) / stdDev : 0;
    const cappedZScore = Math.max(-this.zScoreCap, Math.min(this.zScoreCap, zScore));
    
    if (cappedZScore > 1) {
      return {
        type: 'bullish_obv_slope',
        direction: 'bullish',
        strength: cappedZScore > 1.5 ? 'strong' : 'moderate',
        message: `OBV slope strongly positive (z-score: ${cappedZScore.toFixed(2)})`,
        metadata: { zScore: cappedZScore, slope: currentSlope, avgSlope }
      };
    }
    
    if (cappedZScore < -1) {
      return {
        type: 'bearish_obv_slope',
        direction: 'bearish',
        strength: cappedZScore < -1.5 ? 'strong' : 'moderate',
        message: `OBV slope strongly negative (z-score: ${cappedZScore.toFixed(2)})`,
        metadata: { zScore: cappedZScore, slope: currentSlope, avgSlope }
      };
    }
    
    return null;
  }

  getBreakout() {
    if (this.obvHistory.length < 20) return null;
    
    const recent = this.obvHistory.slice(-20);
    const currentOBV = recent[recent.length - 1];
    const maxOBV = Math.max(...recent.slice(0, -1));
    const minOBV = Math.min(...recent.slice(0, -1));
    
    // OBV breakout to new highs
    if (currentOBV > maxOBV) {
      return {
        type: 'bullish_obv_breakout',
        direction: 'bullish',
        strength: 'strong',
        message: 'OBV broke to new 20-period high (volume accumulation)',
        metadata: { currentOBV, maxOBV, minOBV }
      };
    }
    
    // OBV breakdown to new lows
    if (currentOBV < minOBV) {
      return {
        type: 'bearish_obv_breakdown',
        direction: 'bearish',
        strength: 'strong',
        message: 'OBV broke to new 20-period low (volume distribution)',
        metadata: { currentOBV, maxOBV, minOBV }
      };
    }
    
    return null;
  }

  getDivergence() {
    if (this.obvHistory.length < 20 || this.priceHistory.length < 20) {
      return null;
    }

    const recentOBV = this.obvHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);
    
    // Check for bullish divergence
    const priceLows = this.findSwingLows(recentPrices);
    const obvLows = this.findSwingLows(recentOBV);
    
    if (priceLows.length >= 2 && obvLows.length >= 2) {
      const lastPrice = recentPrices[priceLows[priceLows.length - 1]];
      const prevPrice = recentPrices[priceLows[priceLows.length - 2]];
      const lastOBV = recentOBV[obvLows[obvLows.length - 1]];
      const prevOBV = recentOBV[obvLows[obvLows.length - 2]];
      
      if (lastPrice < prevPrice && lastOBV > prevOBV) {
        return {
          type: 'bullish_divergence',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'Bullish OBV divergence (price lower low, OBV higher low)',
          metadata: { lastPrice, prevPrice, lastOBV, prevOBV }
        };
      }
    }
    
    // Check for bearish divergence
    const priceHighs = this.findSwingHighs(recentPrices);
    const obvHighs = this.findSwingHighs(recentOBV);
    
    if (priceHighs.length >= 2 && obvHighs.length >= 2) {
      const lastPrice = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPrice = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastOBV = recentOBV[obvHighs[obvHighs.length - 1]];
      const prevOBV = recentOBV[obvHighs[obvHighs.length - 2]];
      
      if (lastPrice > prevPrice && lastOBV < prevOBV) {
        return {
          type: 'bearish_divergence',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'Bearish OBV divergence (price higher high, OBV lower high)',
          metadata: { lastPrice, prevPrice, lastOBV, prevOBV }
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
    
    const slope = this.getSlopeSignal();
    if (slope) signals.push(slope);
    
    const breakout = this.getBreakout();
    if (breakout) signals.push(breakout);
    
    const divergence = this.getDivergence();
    if (divergence) signals.push(divergence);
    
    return signals;
  }

  getResult() {
    const currentSlope = this.slopeHistory.length > 0 
      ? this.slopeHistory[this.slopeHistory.length - 1] 
      : 0;
    
    const avgSlope = this.slopeHistory.length > 0
      ? this.slopeHistory.reduce((a, b) => a + b, 0) / this.slopeHistory.length
      : 0;
    
    const stdDev = this.slopeHistory.length > 0
      ? Math.sqrt(this.slopeHistory.reduce((sum, s) => sum + Math.pow(s - avgSlope, 2), 0) / this.slopeHistory.length)
      : 1;
    
    const zScore = stdDev > 0 ? (currentSlope - avgSlope) / stdDev : 0;
    
    return {
      value: {
        obv: this.currentOBV,
        slope: currentSlope,
        zScore: Math.max(-this.zScoreCap, Math.min(this.zScoreCap, zScore))
      },
      signals: this.obvHistory.length >= this.slopeWindow ? this.getSignals() : []
    };
  }

  reset() {
    this.currentOBV = 0;
    this.prevClose = null;
    this.obvHistory = [];
    this.priceHistory = [];
    this.slopeHistory = [];
  }
}

module.exports = OBVIndicator;
