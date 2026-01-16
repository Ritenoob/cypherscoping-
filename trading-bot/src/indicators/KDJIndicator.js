/**
 * KDJ Indicator - Stochastic Variant with J-Line
 * Signals: J-Line Extremes, K/D Crossover, Divergence
 * 
 * Formula:
 * RSV = (Close - Lowest Low) / (Highest High - Lowest Low) × 100
 * K = (2/3) × K_prev + (1/3) × RSV
 * D = (2/3) × D_prev + (1/3) × K
 * J = 3K - 2D
 */

class KDJIndicator {
  constructor(config = {}) {
    this.kPeriod = config.kPeriod || 9;
    this.dPeriod = config.dPeriod || 3;
    this.smooth = config.smooth || 3;
    this.jOversold = config.jOversold || 20;
    this.jOverbought = config.jOverbought || 80;
    
    this.highs = [];
    this.lows = [];
    this.closes = [];
    
    this.currentK = 50;
    this.currentD = 50;
    this.currentJ = 50;
    
    this.prevK = null;
    this.prevD = null;
    this.prevJ = null;
    
    this.jHistory = [];
    this.priceHistory = [];
    this.maxHistory = config.historyLength || 50;
    this.initialized = false;
  }

  update(candle) {
    const { high, low, close } = candle;
    
    this.prevK = this.currentK;
    this.prevD = this.currentD;
    this.prevJ = this.currentJ;
    
    this.highs.push(high);
    this.lows.push(low);
    this.closes.push(close);
    
    if (this.highs.length > this.kPeriod) {
      this.highs.shift();
      this.lows.shift();
      this.closes.shift();
    }
    
    if (this.highs.length < this.kPeriod) {
      return this.getResult();
    }
    
    const highestHigh = Math.max(...this.highs);
    const lowestLow = Math.min(...this.lows);
    const range = highestHigh - lowestLow;
    
    // RSV (Raw Stochastic Value)
    const rsv = range === 0 ? 50 : ((close - lowestLow) / range) * 100;
    
    // K, D, J with smoothing
    this.currentK = (2/3) * this.currentK + (1/3) * rsv;
    this.currentD = (2/3) * this.currentD + (1/3) * this.currentK;
    this.currentJ = 3 * this.currentK - 2 * this.currentD;
    
    this.initialized = true;
    
    this.jHistory.push(this.currentJ);
    this.priceHistory.push(close);
    
    if (this.jHistory.length > this.maxHistory) {
      this.jHistory.shift();
      this.priceHistory.shift();
    }
    
    return this.getResult();
  }

  getJLineSignal() {
    if (!this.initialized) return null;
    
    // J-Line extreme oversold (bullish)
    if (this.currentJ < this.jOversold) {
      return {
        type: 'j_oversold',
        direction: 'bullish',
        strength: this.currentJ < 0 ? 'extreme' : 'strong',
        message: `KDJ J-line oversold (J: ${this.currentJ.toFixed(1)})`,
        metadata: { k: this.currentK, d: this.currentD, j: this.currentJ }
      };
    }
    
    // J-Line extreme overbought (bearish)
    if (this.currentJ > this.jOverbought) {
      return {
        type: 'j_overbought',
        direction: 'bearish',
        strength: this.currentJ > 100 ? 'extreme' : 'strong',
        message: `KDJ J-line overbought (J: ${this.currentJ.toFixed(1)})`,
        metadata: { k: this.currentK, d: this.currentD, j: this.currentJ }
      };
    }
    
    return null;
  }

  getKDCrossover() {
    if (this.prevK === null || this.prevD === null) return null;
    
    // Bullish: K crosses above D
    if (this.prevK <= this.prevD && this.currentK > this.currentD) {
      const inOversold = this.currentJ < 50;
      return {
        type: 'bullish_kd_cross',
        direction: 'bullish',
        strength: inOversold ? 'strong' : 'moderate',
        message: `KDJ K crossed above D ${inOversold ? '(in oversold)' : ''}`,
        metadata: { k: this.currentK, d: this.currentD, j: this.currentJ, inOversold }
      };
    }
    
    // Bearish: K crosses below D
    if (this.prevK >= this.prevD && this.currentK < this.currentD) {
      const inOverbought = this.currentJ > 50;
      return {
        type: 'bearish_kd_cross',
        direction: 'bearish',
        strength: inOverbought ? 'strong' : 'moderate',
        message: `KDJ K crossed below D ${inOverbought ? '(in overbought)' : ''}`,
        metadata: { k: this.currentK, d: this.currentD, j: this.currentJ, inOverbought }
      };
    }
    
    return null;
  }

  getDivergence() {
    if (this.jHistory.length < 20) return null;
    
    const recentJ = this.jHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);
    
    // Bullish divergence check
    const priceLows = this.findSwingLows(recentPrices);
    const jLows = this.findSwingLows(recentJ);
    
    if (priceLows.length >= 2 && jLows.length >= 2) {
      const lastPrice = recentPrices[priceLows[priceLows.length - 1]];
      const prevPrice = recentPrices[priceLows[priceLows.length - 2]];
      const lastJ = recentJ[jLows[jLows.length - 1]];
      const prevJ = recentJ[jLows[jLows.length - 2]];
      
      if (lastPrice < prevPrice && lastJ > prevJ) {
        return {
          type: 'bullish_divergence',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'Bullish KDJ divergence (price lower low, J higher low)',
          metadata: { lastPrice, prevPrice, lastJ, prevJ }
        };
      }
    }
    
    // Bearish divergence check
    const priceHighs = this.findSwingHighs(recentPrices);
    const jHighs = this.findSwingHighs(recentJ);
    
    if (priceHighs.length >= 2 && jHighs.length >= 2) {
      const lastPrice = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPrice = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastJ = recentJ[jHighs[jHighs.length - 1]];
      const prevJ = recentJ[jHighs[jHighs.length - 2]];
      
      if (lastPrice > prevPrice && lastJ < prevJ) {
        return {
          type: 'bearish_divergence',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'Bearish KDJ divergence (price higher high, J lower high)',
          metadata: { lastPrice, prevPrice, lastJ, prevJ }
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
    
    const jSignal = this.getJLineSignal();
    if (jSignal) signals.push(jSignal);
    
    const crossover = this.getKDCrossover();
    if (crossover) signals.push(crossover);
    
    const divergence = this.getDivergence();
    if (divergence) signals.push(divergence);
    
    return signals;
  }

  getResult() {
    return {
      value: {
        k: this.currentK,
        d: this.currentD,
        j: this.currentJ
      },
      signals: this.initialized ? this.getSignals() : []
    };
  }

  reset() {
    this.highs = [];
    this.lows = [];
    this.closes = [];
    this.currentK = 50;
    this.currentD = 50;
    this.currentJ = 50;
    this.prevK = null;
    this.prevD = null;
    this.prevJ = null;
    this.jHistory = [];
    this.priceHistory = [];
    this.initialized = false;
  }
}

module.exports = KDJIndicator;
