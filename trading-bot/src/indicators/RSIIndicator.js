/**
 * RSI Indicator - ENHANCED with Full Signal Detection
 * 
 * Signals: Crossovers, Divergence, Momentum, Zone Analysis
 * Formula: Wilder Smoothing (verified)
 */

class RSIIndicator {
  constructor(config = {}) {
    this.period = config.period || 14;
    this.oversold = config.oversold || 30;
    this.overbought = config.overbought || 70;
    
    this.gains = [];
    this.losses = [];
    this.avgGain = null;
    this.avgLoss = null;
    
    this.currentValue = null;
    this.prevValue = null;
    this.prevClose = null;
    
    this.rsiHistory = [];
    this.priceHistory = [];
    this.maxHistory = config.historyLength || 50;
  }

  update(candle) {
    const close = typeof candle === 'number' ? candle : candle.close;
    
    if (this.prevClose === null) {
      this.prevClose = close;
      return this.getResult();
    }

    this.prevValue = this.currentValue;
    
    const change = close - this.prevClose;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    this.gains.push(gain);
    this.losses.push(loss);
    
    if (this.gains.length <= this.period) {
      if (this.gains.length === this.period) {
        this.avgGain = this.gains.reduce((a, b) => a + b, 0) / this.period;
        this.avgLoss = this.losses.reduce((a, b) => a + b, 0) / this.period;
      }
    } else {
      // Wilder smoothing
      this.avgGain = ((this.avgGain * (this.period - 1)) + gain) / this.period;
      this.avgLoss = ((this.avgLoss * (this.period - 1)) + loss) / this.period;
      
      this.gains.shift();
      this.losses.shift();
    }
    
    if (this.avgGain !== null) {
      if (this.avgLoss === 0) {
        this.currentValue = 100;
      } else {
        const rs = this.avgGain / this.avgLoss;
        this.currentValue = 100 - (100 / (1 + rs));
      }
      
      this.rsiHistory.push(this.currentValue);
      this.priceHistory.push(close);
      
      if (this.rsiHistory.length > this.maxHistory) {
        this.rsiHistory.shift();
        this.priceHistory.shift();
      }
    }
    
    this.prevClose = close;
    return this.getResult();
  }

  // SIGNAL 1: Crossover Detection
  getCrossover() {
    if (this.prevValue === null || this.currentValue === null) return null;
    
    // Bullish: RSI crosses ABOVE oversold (30)
    if (this.prevValue <= this.oversold && this.currentValue > this.oversold) {
      return {
        type: 'bullish_crossover',
        direction: 'bullish',
        strength: 'strong',
        message: `RSI crossed above ${this.oversold} (oversold reversal)`,
        metadata: { from: this.prevValue, to: this.currentValue }
      };
    }
    
    // Bearish: RSI crosses BELOW overbought (70)
    if (this.prevValue >= this.overbought && this.currentValue < this.overbought) {
      return {
        type: 'bearish_crossover',
        direction: 'bearish',
        strength: 'strong',
        message: `RSI crossed below ${this.overbought} (overbought reversal)`,
        metadata: { from: this.prevValue, to: this.currentValue }
      };
    }
    
    return null;
  }

  // SIGNAL 2: Momentum Detection
  getMomentum() {
    if (this.rsiHistory.length < 5) return null;
    
    const recent = this.rsiHistory.slice(-5);
    const slope = (recent[4] - recent[0]) / 4;
    
    if (slope > 3 && this.currentValue < 60) {
      return {
        type: 'bullish_momentum',
        direction: 'bullish',
        strength: 'moderate',
        message: `RSI momentum accelerating (slope: ${slope.toFixed(2)})`,
        metadata: { slope }
      };
    }
    
    if (slope < -3 && this.currentValue > 40) {
      return {
        type: 'bearish_momentum',
        direction: 'bearish',
        strength: 'moderate',
        message: `RSI momentum decelerating (slope: ${slope.toFixed(2)})`,
        metadata: { slope }
      };
    }
    
    return null;
  }

  // SIGNAL 3: Divergence Detection (HIGHEST PRIORITY)
  getDivergence() {
    if (this.rsiHistory.length < 20 || this.priceHistory.length < 20) {
      return null;
    }

    const recentBars = 14;
    const recentRSI = this.rsiHistory.slice(-recentBars);
    const recentPrices = this.priceHistory.slice(-recentBars);
    
    // Find swing lows for bullish divergence
    const priceLows = this.findSwingLows(recentPrices);
    const rsiLows = this.findSwingLows(recentRSI);
    
    if (priceLows.length >= 2 && rsiLows.length >= 2) {
      const lastPriceLow = recentPrices[priceLows[priceLows.length - 1]];
      const prevPriceLow = recentPrices[priceLows[priceLows.length - 2]];
      const lastRSILow = recentRSI[rsiLows[rsiLows.length - 1]];
      const prevRSILow = recentRSI[rsiLows[rsiLows.length - 2]];
      
      // BULLISH DIVERGENCE: Price lower low, RSI higher low
      if (lastPriceLow < prevPriceLow && lastRSILow > prevRSILow) {
        return {
          type: 'bullish_divergence',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'Bullish divergence (price lower low, RSI higher low)',
          metadata: { 
            priceLow: lastPriceLow, 
            rsiLow: lastRSILow,
            divergenceStrength: Math.abs(lastRSILow - prevRSILow)
          }
        };
      }
    }
    
    // Find swing highs for bearish divergence
    const priceHighs = this.findSwingHighs(recentPrices);
    const rsiHighs = this.findSwingHighs(recentRSI);
    
    if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
      const lastPriceHigh = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPriceHigh = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastRSIHigh = recentRSI[rsiHighs[rsiHighs.length - 1]];
      const prevRSIHigh = recentRSI[rsiHighs[rsiHighs.length - 2]];
      
      // BEARISH DIVERGENCE: Price higher high, RSI lower high
      if (lastPriceHigh > prevPriceHigh && lastRSIHigh < prevRSIHigh) {
        return {
          type: 'bearish_divergence',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'Bearish divergence (price higher high, RSI lower high)',
          metadata: {
            priceHigh: lastPriceHigh,
            rsiHigh: lastRSIHigh,
            divergenceStrength: Math.abs(lastRSIHigh - prevRSIHigh)
          }
        };
      }
    }
    
    return null;
  }

  // SIGNAL 4: Zone Analysis
  getZone() {
    if (this.currentValue === null) return null;
    
    if (this.currentValue < this.oversold) {
      return {
        type: 'oversold_zone',
        direction: 'bullish',
        strength: this.currentValue < 20 ? 'extreme' : 'moderate',
        message: `RSI in oversold zone (${this.currentValue.toFixed(1)})`,
        metadata: { value: this.currentValue, threshold: this.oversold }
      };
    }
    
    if (this.currentValue > this.overbought) {
      return {
        type: 'overbought_zone',
        direction: 'bearish',
        strength: this.currentValue > 80 ? 'extreme' : 'moderate',
        message: `RSI in overbought zone (${this.currentValue.toFixed(1)})`,
        metadata: { value: this.currentValue, threshold: this.overbought }
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
    
    const momentum = this.getMomentum();
    if (momentum) signals.push(momentum);
    
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
    this.gains = [];
    this.losses = [];
    this.avgGain = null;
    this.avgLoss = null;
    this.currentValue = null;
    this.prevValue = null;
    this.prevClose = null;
    this.rsiHistory = [];
    this.priceHistory = [];
  }
}

module.exports = RSIIndicator;
