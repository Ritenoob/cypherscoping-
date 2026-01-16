/**
 * Stochastic RSI Indicator - KuCoin Style
 *
 * Applies Stochastic formula to RSI values:
 * StochRSI = (RSI - Lowest RSI) / (Highest RSI - Lowest RSI)
 *
 * Then smooths with %K and %D lines like regular Stochastic
 *
 * Signals: Crossovers, Overbought/Oversold, Divergence
 */

class StochasticRSI {
  constructor(config = {}) {
    // RSI parameters
    this.rsiPeriod = config.rsiPeriod || 14;

    // Stochastic parameters applied to RSI
    this.stochPeriod = config.stochPeriod || 14;
    this.kSmooth = config.kSmooth || 3;
    this.dSmooth = config.dSmooth || 3;

    // Thresholds
    this.oversold = config.oversold || 20;
    this.overbought = config.overbought || 80;

    // RSI calculation state
    this.gains = [];
    this.losses = [];
    this.avgGain = null;
    this.avgLoss = null;
    this.prevClose = null;

    // RSI history for stochastic calculation
    this.rsiHistory = [];

    // Stochastic RSI values
    this.rawStochRSI = [];
    this.kValues = [];
    this.dValues = [];

    // Current values
    this.currentK = null;
    this.currentD = null;
    this.prevK = null;
    this.prevD = null;

    // For divergence detection
    this.priceHistory = [];
    this.stochRSIHistory = [];
    this.maxHistory = config.historyLength || 50;
  }

  update(candle) {
    const close = typeof candle === 'number' ? candle : candle.close;

    // Store previous values
    this.prevK = this.currentK;
    this.prevD = this.currentD;

    // Step 1: Calculate RSI
    const rsi = this._calculateRSI(close);

    if (rsi === null) {
      return this.getResult();
    }

    // Store RSI in history
    this.rsiHistory.push(rsi);
    if (this.rsiHistory.length > this.stochPeriod) {
      this.rsiHistory.shift();
    }

    // Step 2: Calculate Stochastic of RSI
    if (this.rsiHistory.length >= this.stochPeriod) {
      const highestRSI = Math.max(...this.rsiHistory);
      const lowestRSI = Math.min(...this.rsiHistory);
      const range = highestRSI - lowestRSI;

      // Raw Stochastic RSI (0-100 scale)
      const rawStochRSI = range === 0 ? 50 : ((rsi - lowestRSI) / range) * 100;
      this.rawStochRSI.push(rawStochRSI);

      if (this.rawStochRSI.length > this.kSmooth) {
        this.rawStochRSI.shift();
      }

      // Step 3: Smooth to get %K
      if (this.rawStochRSI.length >= this.kSmooth) {
        const kValue = this.rawStochRSI.slice(-this.kSmooth).reduce((a, b) => a + b, 0) / this.kSmooth;
        this.kValues.push(kValue);

        if (this.kValues.length > this.dSmooth) {
          this.kValues.shift();
        }

        // Step 4: Smooth %K to get %D
        if (this.kValues.length >= this.dSmooth) {
          const dValue = this.kValues.slice(-this.dSmooth).reduce((a, b) => a + b, 0) / this.dSmooth;
          this.dValues.push(dValue);

          if (this.dValues.length > this.maxHistory) {
            this.dValues.shift();
          }

          this.currentK = kValue;
          this.currentD = dValue;

          // Store for divergence
          this.priceHistory.push(close);
          this.stochRSIHistory.push(kValue);

          if (this.priceHistory.length > this.maxHistory) {
            this.priceHistory.shift();
            this.stochRSIHistory.shift();
          }
        }
      }
    }

    this.prevClose = close;
    return this.getResult();
  }

  _calculateRSI(close) {
    if (this.prevClose === null) {
      this.prevClose = close;
      return null;
    }

    const change = close - this.prevClose;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    this.gains.push(gain);
    this.losses.push(loss);

    if (this.gains.length <= this.rsiPeriod) {
      if (this.gains.length === this.rsiPeriod) {
        this.avgGain = this.gains.reduce((a, b) => a + b, 0) / this.rsiPeriod;
        this.avgLoss = this.losses.reduce((a, b) => a + b, 0) / this.rsiPeriod;
      } else {
        return null;
      }
    } else {
      // Wilder smoothing
      this.avgGain = ((this.avgGain * (this.rsiPeriod - 1)) + gain) / this.rsiPeriod;
      this.avgLoss = ((this.avgLoss * (this.rsiPeriod - 1)) + loss) / this.rsiPeriod;

      this.gains.shift();
      this.losses.shift();
    }

    if (this.avgLoss === 0) {
      return 100;
    }

    const rs = this.avgGain / this.avgLoss;
    return 100 - (100 / (1 + rs));
  }

  // SIGNAL 1: K/D Crossover
  getCrossover() {
    if (this.prevK === null || this.prevD === null) return null;
    if (this.currentK === null || this.currentD === null) return null;

    // Bullish: %K crosses above %D in oversold zone
    if (this.prevK <= this.prevD && this.currentK > this.currentD) {
      const strength = this.currentK < this.oversold ? 'strong' : 'moderate';
      return {
        type: 'bullish_crossover',
        direction: 'bullish',
        strength,
        message: `StochRSI %K crossed above %D (K: ${this.currentK.toFixed(1)}, D: ${this.currentD.toFixed(1)})`,
        metadata: { k: this.currentK, d: this.currentD }
      };
    }

    // Bearish: %K crosses below %D in overbought zone
    if (this.prevK >= this.prevD && this.currentK < this.currentD) {
      const strength = this.currentK > this.overbought ? 'strong' : 'moderate';
      return {
        type: 'bearish_crossover',
        direction: 'bearish',
        strength,
        message: `StochRSI %K crossed below %D (K: ${this.currentK.toFixed(1)}, D: ${this.currentD.toFixed(1)})`,
        metadata: { k: this.currentK, d: this.currentD }
      };
    }

    return null;
  }

  // SIGNAL 2: Zone Analysis (Overbought/Oversold)
  getZone() {
    if (this.currentK === null) return null;

    if (this.currentK < this.oversold) {
      return {
        type: 'oversold_zone',
        direction: 'bullish',
        strength: this.currentK < 10 ? 'extreme' : 'moderate',
        message: `StochRSI oversold (${this.currentK.toFixed(1)})`,
        metadata: { k: this.currentK, d: this.currentD, threshold: this.oversold }
      };
    }

    if (this.currentK > this.overbought) {
      return {
        type: 'overbought_zone',
        direction: 'bearish',
        strength: this.currentK > 90 ? 'extreme' : 'moderate',
        message: `StochRSI overbought (${this.currentK.toFixed(1)})`,
        metadata: { k: this.currentK, d: this.currentD, threshold: this.overbought }
      };
    }

    return null;
  }

  // SIGNAL 3: Divergence Detection
  getDivergence() {
    if (this.stochRSIHistory.length < 20 || this.priceHistory.length < 20) {
      return null;
    }

    const recentBars = 14;
    const recentStochRSI = this.stochRSIHistory.slice(-recentBars);
    const recentPrices = this.priceHistory.slice(-recentBars);

    // Find swing lows for bullish divergence
    const priceLows = this.findSwingLows(recentPrices);
    const stochLows = this.findSwingLows(recentStochRSI);

    if (priceLows.length >= 2 && stochLows.length >= 2) {
      const lastPriceLow = recentPrices[priceLows[priceLows.length - 1]];
      const prevPriceLow = recentPrices[priceLows[priceLows.length - 2]];
      const lastStochLow = recentStochRSI[stochLows[stochLows.length - 1]];
      const prevStochLow = recentStochRSI[stochLows[stochLows.length - 2]];

      // BULLISH DIVERGENCE: Price lower low, StochRSI higher low
      if (lastPriceLow < prevPriceLow && lastStochLow > prevStochLow) {
        return {
          type: 'bullish_divergence',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'Bullish divergence (price lower low, StochRSI higher low)',
          metadata: { priceLow: lastPriceLow, stochRSILow: lastStochLow }
        };
      }
    }

    // Find swing highs for bearish divergence
    const priceHighs = this.findSwingHighs(recentPrices);
    const stochHighs = this.findSwingHighs(recentStochRSI);

    if (priceHighs.length >= 2 && stochHighs.length >= 2) {
      const lastPriceHigh = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPriceHigh = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastStochHigh = recentStochRSI[stochHighs[stochHighs.length - 1]];
      const prevStochHigh = recentStochRSI[stochHighs[stochHighs.length - 2]];

      // BEARISH DIVERGENCE: Price higher high, StochRSI lower high
      if (lastPriceHigh > prevPriceHigh && lastStochHigh < prevStochHigh) {
        return {
          type: 'bearish_divergence',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'Bearish divergence (price higher high, StochRSI lower high)',
          metadata: { priceHigh: lastPriceHigh, stochRSIHigh: lastStochHigh }
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

    const crossover = this.getCrossover();
    if (crossover) signals.push(crossover);

    const zone = this.getZone();
    if (zone) signals.push(zone);

    const divergence = this.getDivergence();
    if (divergence) signals.push(divergence);

    return signals;
  }

  getResult() {
    return {
      value: {
        k: this.currentK,
        d: this.currentD,
        rsi: this.rsiHistory.length > 0 ? this.rsiHistory[this.rsiHistory.length - 1] : null
      },
      signals: this.currentK !== null ? this.getSignals() : []
    };
  }

  reset() {
    this.gains = [];
    this.losses = [];
    this.avgGain = null;
    this.avgLoss = null;
    this.prevClose = null;
    this.rsiHistory = [];
    this.rawStochRSI = [];
    this.kValues = [];
    this.dValues = [];
    this.currentK = null;
    this.currentD = null;
    this.prevK = null;
    this.prevD = null;
    this.priceHistory = [];
    this.stochRSIHistory = [];
  }
}

module.exports = StochasticRSI;
