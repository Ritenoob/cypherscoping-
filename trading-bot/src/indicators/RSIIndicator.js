/**
 * RSI Indicator - ENHANCED V2 with StochasticRSI Integration
 *
 * ENHANCEMENTS (2026-01-16):
 * - Integrated StochasticRSI for better timing
 * - Hidden divergence detection (continuation signals)
 * - Adaptive thresholds based on recent volatility
 * - RSI momentum acceleration/deceleration
 * - Failure swing detection
 * - Rate of Change analysis
 *
 * Signals: Crossovers, Divergence, Hidden Divergence, Momentum, Zone, StochRSI Crossover
 * Formula: Wilder Smoothing (verified)
 */

class RSIIndicator {
  constructor(config = {}) {
    this.period = config.period || 14;
    this.oversold = config.oversold || 30;
    this.overbought = config.overbought || 70;

    // StochasticRSI parameters
    this.stochPeriod = config.stochPeriod || 14;
    this.stochK = config.stochK || 3;
    this.stochD = config.stochD || 3;

    // Adaptive threshold parameters
    this.adaptiveEnabled = config.adaptiveEnabled !== false;
    this.volatilityLookback = config.volatilityLookback || 20;

    this.gains = [];
    this.losses = [];
    this.avgGain = null;
    this.avgLoss = null;

    this.currentValue = null;
    this.prevValue = null;
    this.prevClose = null;

    this.rsiHistory = [];
    this.priceHistory = [];
    this.maxHistory = config.historyLength || 100;

    // StochasticRSI state
    this.stochRSIK = null;
    this.stochRSID = null;
    this.prevStochK = null;
    this.prevStochD = null;
    this.stochKValues = [];

    // For adaptive thresholds
    this.rsiVolatility = null;
  }

  update(candle) {
    const close = typeof candle === 'number' ? candle : candle.close;

    if (this.prevClose === null) {
      this.prevClose = close;
      return this.getResult();
    }

    this.prevValue = this.currentValue;
    this.prevStochK = this.stochRSIK;
    this.prevStochD = this.stochRSID;

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

      // Calculate StochasticRSI
      this.calculateStochasticRSI();

      // Calculate adaptive thresholds
      this.calculateAdaptiveThresholds();
    }

    this.prevClose = close;
    return this.getResult();
  }

  /**
   * Calculate StochasticRSI - applies stochastic formula to RSI values
   * Provides better timing signals than raw RSI
   */
  calculateStochasticRSI() {
    if (this.rsiHistory.length < this.stochPeriod) return;

    const recentRSI = this.rsiHistory.slice(-this.stochPeriod);
    const highestRSI = Math.max(...recentRSI);
    const lowestRSI = Math.min(...recentRSI);
    const range = highestRSI - lowestRSI;

    // Raw StochRSI
    const rawStochRSI = range === 0 ? 50 : ((this.currentValue - lowestRSI) / range) * 100;

    // Smooth %K
    this.stochKValues.push(rawStochRSI);
    if (this.stochKValues.length > this.stochK) {
      this.stochKValues.shift();
    }
    this.stochRSIK = this.stochKValues.reduce((a, b) => a + b, 0) / this.stochKValues.length;

    // Calculate %D (SMA of %K)
    if (this.rsiHistory.length >= this.stochPeriod + this.stochD) {
      // Simple approach: use recent K values
      const kForD = this.stochKValues.slice(-this.stochD);
      this.stochRSID = kForD.reduce((a, b) => a + b, 0) / kForD.length;
    }
  }

  /**
   * Calculate adaptive thresholds based on RSI volatility
   * In volatile conditions, use wider thresholds; in calm conditions, tighter
   */
  calculateAdaptiveThresholds() {
    if (!this.adaptiveEnabled || this.rsiHistory.length < this.volatilityLookback) return;

    const recentRSI = this.rsiHistory.slice(-this.volatilityLookback);
    const mean = recentRSI.reduce((a, b) => a + b, 0) / recentRSI.length;
    const variance = recentRSI.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentRSI.length;
    this.rsiVolatility = Math.sqrt(variance);
  }

  /**
   * Get adaptive oversold/overbought levels
   */
  getAdaptiveLevels() {
    if (!this.adaptiveEnabled || this.rsiVolatility === null) {
      return { oversold: this.oversold, overbought: this.overbought };
    }

    // Adjust thresholds: high volatility = wider bands, low volatility = tighter
    const adjustment = Math.min(10, this.rsiVolatility / 2);

    return {
      oversold: Math.max(20, this.oversold - adjustment),
      overbought: Math.min(80, this.overbought + adjustment)
    };
  }

  // SIGNAL 1: Crossover Detection (with adaptive thresholds)
  getCrossover() {
    if (this.prevValue === null || this.currentValue === null) return null;

    const { oversold, overbought } = this.getAdaptiveLevels();

    // Bullish: RSI crosses ABOVE oversold
    if (this.prevValue <= oversold && this.currentValue > oversold) {
      return {
        type: 'bullish_crossover',
        direction: 'bullish',
        strength: 'strong',
        message: `RSI crossed above ${oversold.toFixed(0)} (oversold reversal)`,
        metadata: { from: this.prevValue, to: this.currentValue, adaptive: this.adaptiveEnabled }
      };
    }

    // Bearish: RSI crosses BELOW overbought
    if (this.prevValue >= overbought && this.currentValue < overbought) {
      return {
        type: 'bearish_crossover',
        direction: 'bearish',
        strength: 'strong',
        message: `RSI crossed below ${overbought.toFixed(0)} (overbought reversal)`,
        metadata: { from: this.prevValue, to: this.currentValue, adaptive: this.adaptiveEnabled }
      };
    }

    return null;
  }

  // SIGNAL 2: Momentum Detection (enhanced with acceleration)
  getMomentum() {
    if (this.rsiHistory.length < 10) return null;

    const recent5 = this.rsiHistory.slice(-5);
    const recent10 = this.rsiHistory.slice(-10, -5);

    const slope5 = (recent5[4] - recent5[0]) / 4;
    const slope10 = (recent10[4] - recent10[0]) / 4;

    // Acceleration: current momentum vs previous momentum
    const acceleration = slope5 - slope10;

    // Bullish momentum with acceleration
    if (slope5 > 3 && this.currentValue < 60) {
      const isAccelerating = acceleration > 0.5;
      return {
        type: 'bullish_momentum',
        direction: 'bullish',
        strength: isAccelerating ? 'strong' : 'moderate',
        message: `RSI momentum ${isAccelerating ? 'accelerating' : 'rising'} (slope: ${slope5.toFixed(2)})`,
        metadata: { slope: slope5, acceleration, isAccelerating }
      };
    }

    // Bearish momentum with deceleration
    if (slope5 < -3 && this.currentValue > 40) {
      const isAccelerating = acceleration < -0.5;
      return {
        type: 'bearish_momentum',
        direction: 'bearish',
        strength: isAccelerating ? 'strong' : 'moderate',
        message: `RSI momentum ${isAccelerating ? 'accelerating down' : 'falling'} (slope: ${slope5.toFixed(2)})`,
        metadata: { slope: slope5, acceleration, isAccelerating }
      };
    }

    return null;
  }

  // SIGNAL 3: Regular Divergence Detection (REVERSAL signals)
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
        const divergenceStrength = Math.abs(lastRSILow - prevRSILow);
        return {
          type: 'bullish_divergence',
          direction: 'bullish',
          strength: divergenceStrength > 5 ? 'very_strong' : 'strong',
          message: 'Bullish divergence (price lower low, RSI higher low)',
          metadata: {
            priceLow: lastPriceLow,
            rsiLow: lastRSILow,
            divergenceStrength
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
        const divergenceStrength = Math.abs(lastRSIHigh - prevRSIHigh);
        return {
          type: 'bearish_divergence',
          direction: 'bearish',
          strength: divergenceStrength > 5 ? 'very_strong' : 'strong',
          message: 'Bearish divergence (price higher high, RSI lower high)',
          metadata: {
            priceHigh: lastPriceHigh,
            rsiHigh: lastRSIHigh,
            divergenceStrength
          }
        };
      }
    }

    return null;
  }

  // SIGNAL 4: Hidden Divergence Detection (CONTINUATION signals) - NEW!
  getHiddenDivergence() {
    if (this.rsiHistory.length < 20 || this.priceHistory.length < 20) {
      return null;
    }

    const recentBars = 14;
    const recentRSI = this.rsiHistory.slice(-recentBars);
    const recentPrices = this.priceHistory.slice(-recentBars);

    // Find swing lows for bullish hidden divergence
    const priceLows = this.findSwingLows(recentPrices);
    const rsiLows = this.findSwingLows(recentRSI);

    if (priceLows.length >= 2 && rsiLows.length >= 2) {
      const lastPriceLow = recentPrices[priceLows[priceLows.length - 1]];
      const prevPriceLow = recentPrices[priceLows[priceLows.length - 2]];
      const lastRSILow = recentRSI[rsiLows[rsiLows.length - 1]];
      const prevRSILow = recentRSI[rsiLows[rsiLows.length - 2]];

      // BULLISH HIDDEN DIVERGENCE: Price higher low, RSI lower low (continuation in uptrend)
      if (lastPriceLow > prevPriceLow && lastRSILow < prevRSILow && this.currentValue > 40) {
        return {
          type: 'bullish_hidden_divergence',
          direction: 'bullish',
          strength: 'strong',
          message: 'Bullish hidden divergence (trend continuation)',
          metadata: {
            priceLow: lastPriceLow,
            rsiLow: lastRSILow,
            trendDirection: 'up'
          }
        };
      }
    }

    // Find swing highs for bearish hidden divergence
    const priceHighs = this.findSwingHighs(recentPrices);
    const rsiHighs = this.findSwingHighs(recentRSI);

    if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
      const lastPriceHigh = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPriceHigh = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastRSIHigh = recentRSI[rsiHighs[rsiHighs.length - 1]];
      const prevRSIHigh = recentRSI[rsiHighs[rsiHighs.length - 2]];

      // BEARISH HIDDEN DIVERGENCE: Price lower high, RSI higher high (continuation in downtrend)
      if (lastPriceHigh < prevPriceHigh && lastRSIHigh > prevRSIHigh && this.currentValue < 60) {
        return {
          type: 'bearish_hidden_divergence',
          direction: 'bearish',
          strength: 'strong',
          message: 'Bearish hidden divergence (trend continuation)',
          metadata: {
            priceHigh: lastPriceHigh,
            rsiHigh: lastRSIHigh,
            trendDirection: 'down'
          }
        };
      }
    }

    return null;
  }

  // SIGNAL 5: Zone Analysis (with adaptive thresholds)
  getZone() {
    if (this.currentValue === null) return null;

    const { oversold, overbought } = this.getAdaptiveLevels();

    if (this.currentValue < oversold) {
      const extremeLevel = oversold - 10;
      return {
        type: 'oversold_zone',
        direction: 'bullish',
        strength: this.currentValue < extremeLevel ? 'extreme' : 'moderate',
        message: `RSI in oversold zone (${this.currentValue.toFixed(1)})`,
        metadata: { value: this.currentValue, threshold: oversold, adaptive: this.adaptiveEnabled }
      };
    }

    if (this.currentValue > overbought) {
      const extremeLevel = overbought + 10;
      return {
        type: 'overbought_zone',
        direction: 'bearish',
        strength: this.currentValue > extremeLevel ? 'extreme' : 'moderate',
        message: `RSI in overbought zone (${this.currentValue.toFixed(1)})`,
        metadata: { value: this.currentValue, threshold: overbought, adaptive: this.adaptiveEnabled }
      };
    }

    return null;
  }

  // SIGNAL 6: StochasticRSI Crossover - NEW!
  getStochRSICrossover() {
    if (this.prevStochK === null || this.prevStochD === null) return null;
    if (this.stochRSIK === null || this.stochRSID === null) return null;

    // Bullish: %K crosses above %D in oversold zone
    if (this.prevStochK <= this.prevStochD && this.stochRSIK > this.stochRSID) {
      const inOversold = this.stochRSIK < 25;
      if (inOversold) {
        return {
          type: 'stochrsi_bullish_cross',
          direction: 'bullish',
          strength: 'strong',
          message: 'StochRSI bullish crossover in oversold zone',
          metadata: { k: this.stochRSIK, d: this.stochRSID, rsi: this.currentValue }
        };
      }
    }

    // Bearish: %K crosses below %D in overbought zone
    if (this.prevStochK >= this.prevStochD && this.stochRSIK < this.stochRSID) {
      const inOverbought = this.stochRSIK > 75;
      if (inOverbought) {
        return {
          type: 'stochrsi_bearish_cross',
          direction: 'bearish',
          strength: 'strong',
          message: 'StochRSI bearish crossover in overbought zone',
          metadata: { k: this.stochRSIK, d: this.stochRSID, rsi: this.currentValue }
        };
      }
    }

    return null;
  }

  // SIGNAL 7: Failure Swing - NEW!
  getFailureSwing() {
    if (this.rsiHistory.length < 15) return null;

    const recent = this.rsiHistory.slice(-15);
    const { oversold, overbought } = this.getAdaptiveLevels();

    // Find recent swing points
    const highs = this.findSwingHighs(recent);
    const lows = this.findSwingLows(recent);

    // Bullish failure swing: RSI falls below oversold, rallies, fails to reach new low, breaks above
    if (lows.length >= 2 && highs.length >= 1) {
      const low1 = recent[lows[lows.length - 2]];
      const low2 = recent[lows[lows.length - 1]];
      const middleHigh = highs.length > 0 ? recent[highs[highs.length - 1]] : null;

      if (low1 < oversold && low2 > low1 && middleHigh && this.currentValue > middleHigh) {
        return {
          type: 'bullish_failure_swing',
          direction: 'bullish',
          strength: 'strong',
          message: 'RSI bullish failure swing (bottom reversal)',
          metadata: { low1, low2, breakLevel: middleHigh }
        };
      }
    }

    // Bearish failure swing: RSI rises above overbought, falls, fails to reach new high, breaks below
    if (highs.length >= 2 && lows.length >= 1) {
      const high1 = recent[highs[highs.length - 2]];
      const high2 = recent[highs[highs.length - 1]];
      const middleLow = lows.length > 0 ? recent[lows[lows.length - 1]] : null;

      if (high1 > overbought && high2 < high1 && middleLow && this.currentValue < middleLow) {
        return {
          type: 'bearish_failure_swing',
          direction: 'bearish',
          strength: 'strong',
          message: 'RSI bearish failure swing (top reversal)',
          metadata: { high1, high2, breakLevel: middleLow }
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

    // Priority order: divergences first (highest value), then crossovers, then zones
    const divergence = this.getDivergence();
    if (divergence) signals.push(divergence);

    const hiddenDivergence = this.getHiddenDivergence();
    if (hiddenDivergence) signals.push(hiddenDivergence);

    const failureSwing = this.getFailureSwing();
    if (failureSwing) signals.push(failureSwing);

    const stochCross = this.getStochRSICrossover();
    if (stochCross) signals.push(stochCross);

    const crossover = this.getCrossover();
    if (crossover) signals.push(crossover);

    const momentum = this.getMomentum();
    if (momentum) signals.push(momentum);

    const zone = this.getZone();
    if (zone) signals.push(zone);

    return signals;
  }

  getResult() {
    return {
      value: this.currentValue,
      stochRSI: {
        k: this.stochRSIK,
        d: this.stochRSID
      },
      adaptiveLevels: this.getAdaptiveLevels(),
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
    this.stochRSIK = null;
    this.stochRSID = null;
    this.prevStochK = null;
    this.prevStochD = null;
    this.stochKValues = [];
    this.rsiVolatility = null;
  }
}

module.exports = RSIIndicator;
