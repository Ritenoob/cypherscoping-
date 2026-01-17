/**
 * KDJ Indicator - ENHANCED V2 with Advanced J-Line Analysis
 *
 * ENHANCEMENTS (2026-01-16):
 * - Hidden divergence detection (continuation signals)
 * - J-line hook patterns for early reversal
 * - Golden/death cross with confirmation
 * - J-line momentum acceleration
 * - Extreme zone persistence analysis
 * - K/D spread analysis
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
    this.kHistory = [];
    this.priceHistory = [];
    this.maxHistory = config.historyLength || 100;
    this.initialized = false;

    // Zone persistence tracking
    this.oversoldBars = 0;
    this.overboughtBars = 0;
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

    // Track zone persistence
    if (this.currentJ < this.jOversold) {
      this.oversoldBars++;
      this.overboughtBars = 0;
    } else if (this.currentJ > this.jOverbought) {
      this.overboughtBars++;
      this.oversoldBars = 0;
    } else {
      this.oversoldBars = 0;
      this.overboughtBars = 0;
    }

    this.jHistory.push(this.currentJ);
    this.kHistory.push(this.currentK);
    this.priceHistory.push(close);

    if (this.jHistory.length > this.maxHistory) {
      this.jHistory.shift();
      this.kHistory.shift();
      this.priceHistory.shift();
    }

    return this.getResult();
  }

  // SIGNAL 1: J-Line Extreme Zones (enhanced with persistence)
  getJLineSignal() {
    if (!this.initialized) return null;

    // J-Line extreme oversold (bullish)
    if (this.currentJ < this.jOversold) {
      const isExtreme = this.currentJ < 0;
      const isPersistent = this.oversoldBars >= 3;
      return {
        type: 'j_oversold',
        direction: 'bullish',
        strength: isExtreme ? 'extreme' : (isPersistent ? 'very_strong' : 'strong'),
        message: `KDJ J-line oversold (J: ${this.currentJ.toFixed(1)}) for ${this.oversoldBars} bars`,
        metadata: { k: this.currentK, d: this.currentD, j: this.currentJ, barsInZone: this.oversoldBars }
      };
    }

    // J-Line extreme overbought (bearish)
    if (this.currentJ > this.jOverbought) {
      const isExtreme = this.currentJ > 100;
      const isPersistent = this.overboughtBars >= 3;
      return {
        type: 'j_overbought',
        direction: 'bearish',
        strength: isExtreme ? 'extreme' : (isPersistent ? 'very_strong' : 'strong'),
        message: `KDJ J-line overbought (J: ${this.currentJ.toFixed(1)}) for ${this.overboughtBars} bars`,
        metadata: { k: this.currentK, d: this.currentD, j: this.currentJ, barsInZone: this.overboughtBars }
      };
    }

    return null;
  }

  // SIGNAL 2: K/D Crossover (enhanced with zone context)
  getKDCrossover() {
    if (this.prevK === null || this.prevD === null) return null;

    // Bullish: K crosses above D
    if (this.prevK <= this.prevD && this.currentK > this.currentD) {
      const inOversold = this.currentJ < 50;
      const afterPersistence = this.oversoldBars >= 3;
      return {
        type: 'bullish_kd_cross',
        direction: 'bullish',
        strength: (inOversold && afterPersistence) ? 'very_strong' : (inOversold ? 'strong' : 'moderate'),
        message: `KDJ K crossed above D ${inOversold ? '(in oversold)' : ''}${afterPersistence ? ' after ' + this.oversoldBars + ' bars' : ''}`,
        metadata: { k: this.currentK, d: this.currentD, j: this.currentJ, inOversold, afterPersistence }
      };
    }

    // Bearish: K crosses below D
    if (this.prevK >= this.prevD && this.currentK < this.currentD) {
      const inOverbought = this.currentJ > 50;
      const afterPersistence = this.overboughtBars >= 3;
      return {
        type: 'bearish_kd_cross',
        direction: 'bearish',
        strength: (inOverbought && afterPersistence) ? 'very_strong' : (inOverbought ? 'strong' : 'moderate'),
        message: `KDJ K crossed below D ${inOverbought ? '(in overbought)' : ''}${afterPersistence ? ' after ' + this.overboughtBars + ' bars' : ''}`,
        metadata: { k: this.currentK, d: this.currentD, j: this.currentJ, inOverbought, afterPersistence }
      };
    }

    return null;
  }

  // SIGNAL 3: Regular Divergence (REVERSAL)
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

  // SIGNAL 4: Hidden Divergence (CONTINUATION) - NEW!
  getHiddenDivergence() {
    if (this.jHistory.length < 20) return null;

    const recentJ = this.jHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);

    // Bullish hidden divergence
    const priceLows = this.findSwingLows(recentPrices);
    const jLows = this.findSwingLows(recentJ);

    if (priceLows.length >= 2 && jLows.length >= 2) {
      const lastPrice = recentPrices[priceLows[priceLows.length - 1]];
      const prevPrice = recentPrices[priceLows[priceLows.length - 2]];
      const lastJ = recentJ[jLows[jLows.length - 1]];
      const prevJ = recentJ[jLows[jLows.length - 2]];

      // Price higher low, J lower low (continuation in uptrend)
      if (lastPrice > prevPrice && lastJ < prevJ && this.currentJ > 30) {
        return {
          type: 'bullish_hidden_divergence',
          direction: 'bullish',
          strength: 'strong',
          message: 'Bullish hidden divergence (uptrend continuation)',
          metadata: { lastPrice, prevPrice, lastJ, prevJ }
        };
      }
    }

    // Bearish hidden divergence
    const priceHighs = this.findSwingHighs(recentPrices);
    const jHighs = this.findSwingHighs(recentJ);

    if (priceHighs.length >= 2 && jHighs.length >= 2) {
      const lastPrice = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPrice = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastJ = recentJ[jHighs[jHighs.length - 1]];
      const prevJ = recentJ[jHighs[jHighs.length - 2]];

      // Price lower high, J higher high (continuation in downtrend)
      if (lastPrice < prevPrice && lastJ > prevJ && this.currentJ < 70) {
        return {
          type: 'bearish_hidden_divergence',
          direction: 'bearish',
          strength: 'strong',
          message: 'Bearish hidden divergence (downtrend continuation)',
          metadata: { lastPrice, prevPrice, lastJ, prevJ }
        };
      }
    }

    return null;
  }

  // SIGNAL 5: J-Line Hook Pattern - NEW!
  getJLineHook() {
    if (this.jHistory.length < 4) return null;

    const recent = this.jHistory.slice(-4);

    // Bullish hook: J was falling, now turning up in oversold
    if (recent[0] > recent[1] && recent[1] > recent[2] && recent[3] > recent[2] && recent[2] < this.jOversold) {
      return {
        type: 'bullish_j_hook',
        direction: 'bullish',
        strength: 'strong',
        message: 'KDJ J-line bullish hook in oversold zone',
        metadata: { values: recent, hookPoint: recent[2] }
      };
    }

    // Bearish hook: J was rising, now turning down in overbought
    if (recent[0] < recent[1] && recent[1] < recent[2] && recent[3] < recent[2] && recent[2] > this.jOverbought) {
      return {
        type: 'bearish_j_hook',
        direction: 'bearish',
        strength: 'strong',
        message: 'KDJ J-line bearish hook in overbought zone',
        metadata: { values: recent, hookPoint: recent[2] }
      };
    }

    return null;
  }

  // SIGNAL 6: J-Line Momentum Acceleration - NEW!
  getJMomentum() {
    if (this.jHistory.length < 5) return null;

    const recent = this.jHistory.slice(-5);
    const momentum = recent[4] - recent[0];

    // Strong bullish momentum from oversold
    if (momentum > 30 && recent[0] < 30) {
      return {
        type: 'bullish_j_momentum',
        direction: 'bullish',
        strength: 'strong',
        message: `KDJ J-line momentum surge (${momentum.toFixed(1)} points in 5 bars)`,
        metadata: { momentum, from: recent[0], to: recent[4] }
      };
    }

    // Strong bearish momentum from overbought
    if (momentum < -30 && recent[0] > 70) {
      return {
        type: 'bearish_j_momentum',
        direction: 'bearish',
        strength: 'strong',
        message: `KDJ J-line momentum drop (${Math.abs(momentum).toFixed(1)} points in 5 bars)`,
        metadata: { momentum, from: recent[0], to: recent[4] }
      };
    }

    return null;
  }

  // SIGNAL 7: K/D Spread Analysis - NEW!
  getKDSpread() {
    if (!this.initialized) return null;

    const spread = this.currentK - this.currentD;

    // Very wide spread indicates strong momentum
    if (spread > 15 && this.currentJ > 50) {
      return {
        type: 'bullish_kd_spread',
        direction: 'bullish',
        strength: 'moderate',
        message: `K/D spread widening bullish (spread: ${spread.toFixed(1)})`,
        metadata: { k: this.currentK, d: this.currentD, spread }
      };
    }

    if (spread < -15 && this.currentJ < 50) {
      return {
        type: 'bearish_kd_spread',
        direction: 'bearish',
        strength: 'moderate',
        message: `K/D spread widening bearish (spread: ${spread.toFixed(1)})`,
        metadata: { k: this.currentK, d: this.currentD, spread }
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

    // Priority: divergences first, then crossovers, then zones
    const divergence = this.getDivergence();
    if (divergence) signals.push(divergence);

    const hiddenDivergence = this.getHiddenDivergence();
    if (hiddenDivergence) signals.push(hiddenDivergence);

    const crossover = this.getKDCrossover();
    if (crossover) signals.push(crossover);

    const hook = this.getJLineHook();
    if (hook) signals.push(hook);

    const momentum = this.getJMomentum();
    if (momentum) signals.push(momentum);

    const jSignal = this.getJLineSignal();
    if (jSignal) signals.push(jSignal);

    const spread = this.getKDSpread();
    if (spread) signals.push(spread);

    return signals;
  }

  getResult() {
    return {
      value: {
        k: this.currentK,
        d: this.currentD,
        j: this.currentJ,
        spread: this.currentK - this.currentD,
        oversoldBars: this.oversoldBars,
        overboughtBars: this.overboughtBars
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
    this.kHistory = [];
    this.priceHistory = [];
    this.initialized = false;
    this.oversoldBars = 0;
    this.overboughtBars = 0;
  }
}

module.exports = KDJIndicator;
