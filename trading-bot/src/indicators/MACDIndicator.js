/**
 * MACD Indicator - ENHANCED with Full Signal Detection
 * 
 * Signals: Signal Line Cross, Zero Line Cross, Histogram Analysis, Divergence
 * Formula: EMA-based (verified)
 */

class MACDIndicator {
  constructor(config = {}) {
    this.fastPeriod = config.fastPeriod || 12;
    this.slowPeriod = config.slowPeriod || 26;
    this.signalPeriod = config.signalPeriod || 9;
    
    this.fastEMA = null;
    this.slowEMA = null;
    this.signalEMA = null;
    
    this.fastMultiplier = 2 / (this.fastPeriod + 1);
    this.slowMultiplier = 2 / (this.slowPeriod + 1);
    this.signalMultiplier = 2 / (this.signalPeriod + 1);
    
    this.priceCount = 0;
    this.priceSum = 0;
    
    this.currentMACD = null;
    this.currentSignal = null;
    this.currentHistogram = null;
    
    this.prevMACD = null;
    this.prevSignal = null;
    this.prevHistogram = null;
    
    this.macdHistory = [];
    this.histogramHistory = [];
    this.priceHistory = [];
    this.maxHistory = config.historyLength || 50;
  }

  update(candle) {
    const close = typeof candle === 'number' ? candle : candle.close;
    
    this.priceCount++;
    this.priceSum += close;
    
    // Store previous values
    this.prevMACD = this.currentMACD;
    this.prevSignal = this.currentSignal;
    this.prevHistogram = this.currentHistogram;
    
    this.priceHistory.push(close);
    if (this.priceHistory.length > this.maxHistory) {
      this.priceHistory.shift();
    }
    
    // Initialize EMAs with SMA
    if (this.priceCount === this.slowPeriod) {
      this.slowEMA = this.priceSum / this.slowPeriod;
      
      // Calculate initial fast EMA from recent prices
      const recentSum = this.priceHistory.slice(-this.fastPeriod).reduce((a, b) => a + b, 0);
      this.fastEMA = recentSum / this.fastPeriod;
    } else if (this.priceCount > this.slowPeriod) {
      // EMA calculation
      this.fastEMA = (close - this.fastEMA) * this.fastMultiplier + this.fastEMA;
      this.slowEMA = (close - this.slowEMA) * this.slowMultiplier + this.slowEMA;
      
      this.currentMACD = this.fastEMA - this.slowEMA;
      
      // Signal line
      if (this.signalEMA === null && this.macdHistory.length >= this.signalPeriod) {
        this.signalEMA = this.macdHistory.slice(-this.signalPeriod).reduce((a, b) => a + b, 0) / this.signalPeriod;
      } else if (this.signalEMA !== null) {
        this.signalEMA = (this.currentMACD - this.signalEMA) * this.signalMultiplier + this.signalEMA;
      }
      
      this.currentSignal = this.signalEMA;
      
      if (this.currentMACD !== null && this.currentSignal !== null) {
        this.currentHistogram = this.currentMACD - this.currentSignal;
      }
      
      // Update history
      if (this.currentMACD !== null) {
        this.macdHistory.push(this.currentMACD);
        if (this.currentHistogram !== null) {
          this.histogramHistory.push(this.currentHistogram);
        }
        
        if (this.macdHistory.length > this.maxHistory) {
          this.macdHistory.shift();
          if (this.histogramHistory.length > this.maxHistory) {
            this.histogramHistory.shift();
          }
        }
      }
    }
    
    return this.getResult();
  }

  // SIGNAL 1: Signal Line Crossover
  getSignalCrossover() {
    if (this.prevMACD === null || this.prevSignal === null) return null;
    if (this.currentMACD === null || this.currentSignal === null) return null;
    
    // Bullish: MACD crosses ABOVE signal line
    if (this.prevMACD <= this.prevSignal && this.currentMACD > this.currentSignal) {
      return {
        type: 'bullish_signal_crossover',
        direction: 'bullish',
        strength: 'strong',
        message: 'MACD crossed above signal line (bullish crossover)',
        metadata: { macd: this.currentMACD, signal: this.currentSignal }
      };
    }
    
    // Bearish: MACD crosses BELOW signal line
    if (this.prevMACD >= this.prevSignal && this.currentMACD < this.currentSignal) {
      return {
        type: 'bearish_signal_crossover',
        direction: 'bearish',
        strength: 'strong',
        message: 'MACD crossed below signal line (bearish crossover)',
        metadata: { macd: this.currentMACD, signal: this.currentSignal }
      };
    }
    
    return null;
  }

  // SIGNAL 2: Zero Line Crossover
  getZeroCrossover() {
    if (this.prevMACD === null || this.currentMACD === null) return null;
    
    // Bullish: MACD crosses ABOVE zero
    if (this.prevMACD <= 0 && this.currentMACD > 0) {
      return {
        type: 'bullish_zero_crossover',
        direction: 'bullish',
        strength: 'strong',
        message: 'MACD crossed above zero line (trend confirmation)',
        metadata: { macd: this.currentMACD }
      };
    }
    
    // Bearish: MACD crosses BELOW zero
    if (this.prevMACD >= 0 && this.currentMACD < 0) {
      return {
        type: 'bearish_zero_crossover',
        direction: 'bearish',
        strength: 'strong',
        message: 'MACD crossed below zero line (trend confirmation)',
        metadata: { macd: this.currentMACD }
      };
    }
    
    return null;
  }

  // SIGNAL 3: Histogram Analysis
  getHistogramSignal() {
    if (this.histogramHistory.length < 3) return null;
    
    const recent = this.histogramHistory.slice(-3);
    
    // Momentum accelerating (bars getting larger in positive direction)
    if (recent[0] > 0 && recent[1] > recent[0] && recent[2] > recent[1]) {
      return {
        type: 'bullish_momentum_accelerating',
        direction: 'bullish',
        strength: 'moderate',
        message: 'MACD histogram expanding (momentum accelerating)',
        metadata: { histogram: recent }
      };
    }
    
    // Momentum accelerating (bars getting larger in negative direction)
    if (recent[0] < 0 && recent[1] < recent[0] && recent[2] < recent[1]) {
      return {
        type: 'bearish_momentum_accelerating',
        direction: 'bearish',
        strength: 'moderate',
        message: 'MACD histogram expanding (momentum accelerating)',
        metadata: { histogram: recent }
      };
    }
    
    // Momentum weakening (positive bars shrinking)
    if (recent[0] > 0 && recent[1] < recent[0] && recent[2] < recent[1] && recent[2] > 0) {
      return {
        type: 'bullish_momentum_weakening',
        direction: 'bearish',
        strength: 'weak',
        message: 'MACD histogram contracting (momentum weakening)',
        metadata: { histogram: recent }
      };
    }
    
    // Momentum weakening (negative bars shrinking)
    if (recent[0] < 0 && recent[1] > recent[0] && recent[2] > recent[1] && recent[2] < 0) {
      return {
        type: 'bearish_momentum_weakening',
        direction: 'bullish',
        strength: 'weak',
        message: 'MACD histogram contracting (momentum weakening)',
        metadata: { histogram: recent }
      };
    }
    
    return null;
  }

  // SIGNAL 4: Divergence Detection
  getDivergence() {
    if (this.macdHistory.length < 20 || this.priceHistory.length < 20) {
      return null;
    }

    const recentMACD = this.macdHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);
    
    // Check for bullish divergence
    const priceLows = this.findSwingLows(recentPrices);
    const macdLows = this.findSwingLows(recentMACD);
    
    if (priceLows.length >= 2 && macdLows.length >= 2) {
      const lastPriceLow = recentPrices[priceLows[priceLows.length - 1]];
      const prevPriceLow = recentPrices[priceLows[priceLows.length - 2]];
      const lastMACDLow = recentMACD[macdLows[macdLows.length - 1]];
      const prevMACDLow = recentMACD[macdLows[macdLows.length - 2]];
      
      if (lastPriceLow < prevPriceLow && lastMACDLow > prevMACDLow) {
        return {
          type: 'bullish_divergence',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'Bullish MACD divergence (price lower low, MACD higher low)',
          metadata: { priceLow: lastPriceLow, macdLow: lastMACDLow }
        };
      }
    }
    
    // Check for bearish divergence
    const priceHighs = this.findSwingHighs(recentPrices);
    const macdHighs = this.findSwingHighs(recentMACD);
    
    if (priceHighs.length >= 2 && macdHighs.length >= 2) {
      const lastPriceHigh = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPriceHigh = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastMACDHigh = recentMACD[macdHighs[macdHighs.length - 1]];
      const prevMACDHigh = recentMACD[macdHighs[macdHighs.length - 2]];
      
      if (lastPriceHigh > prevPriceHigh && lastMACDHigh < prevMACDHigh) {
        return {
          type: 'bearish_divergence',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'Bearish MACD divergence (price higher high, MACD lower high)',
          metadata: { priceHigh: lastPriceHigh, macdHigh: lastMACDHigh }
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
    
    const signalCross = this.getSignalCrossover();
    if (signalCross) signals.push(signalCross);
    
    const zeroCross = this.getZeroCrossover();
    if (zeroCross) signals.push(zeroCross);
    
    const histogram = this.getHistogramSignal();
    if (histogram) signals.push(histogram);
    
    const divergence = this.getDivergence();
    if (divergence) signals.push(divergence);
    
    return signals;
  }

  getResult() {
    return {
      value: {
        macd: this.currentMACD,
        signal: this.currentSignal,
        histogram: this.currentHistogram
      },
      signals: this.currentMACD !== null ? this.getSignals() : []
    };
  }

  reset() {
    this.fastEMA = null;
    this.slowEMA = null;
    this.signalEMA = null;
    this.priceCount = 0;
    this.priceSum = 0;
    this.currentMACD = null;
    this.currentSignal = null;
    this.currentHistogram = null;
    this.prevMACD = null;
    this.prevSignal = null;
    this.prevHistogram = null;
    this.macdHistory = [];
    this.histogramHistory = [];
    this.priceHistory = [];
  }
}

module.exports = MACDIndicator;
