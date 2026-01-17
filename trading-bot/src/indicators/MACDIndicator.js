/**
 * MACD Indicator - ENHANCED V2 with Advanced Signal Detection
 *
 * ENHANCEMENTS (2026-01-16):
 * - Hidden divergence detection (continuation signals)
 * - Histogram color change detection (early reversal warning)
 * - Signal line slope analysis
 * - Impulse system integration (trend + momentum alignment)
 * - MACD-Histogram divergence
 * - Convergence detection (early entry signals)
 * - Strength scoring based on MACD position relative to zero
 *
 * Signals: Signal Cross, Zero Cross, Histogram, Divergence, Hidden Divergence, Impulse
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
    this.signalHistory = [];
    this.priceHistory = [];
    this.maxHistory = config.historyLength || 100;

    // For impulse system
    this.ema13 = null;
    this.prevEma13 = null;
    this.ema13Multiplier = 2 / 14;
  }

  update(candle) {
    const close = typeof candle === 'number' ? candle : candle.close;

    this.priceCount++;
    this.priceSum += close;

    // Store previous values
    this.prevMACD = this.currentMACD;
    this.prevSignal = this.currentSignal;
    this.prevHistogram = this.currentHistogram;
    this.prevEma13 = this.ema13;

    this.priceHistory.push(close);
    if (this.priceHistory.length > this.maxHistory) {
      this.priceHistory.shift();
    }

    // Update EMA13 for impulse system
    if (this.priceCount === 13) {
      this.ema13 = this.priceHistory.slice(-13).reduce((a, b) => a + b, 0) / 13;
    } else if (this.priceCount > 13) {
      this.ema13 = (close - this.ema13) * this.ema13Multiplier + this.ema13;
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
        if (this.currentSignal !== null) {
          this.signalHistory.push(this.currentSignal);
        }

        if (this.macdHistory.length > this.maxHistory) {
          this.macdHistory.shift();
          if (this.histogramHistory.length > this.maxHistory) {
            this.histogramHistory.shift();
          }
          if (this.signalHistory.length > this.maxHistory) {
            this.signalHistory.shift();
          }
        }
      }
    }

    return this.getResult();
  }

  // SIGNAL 1: Signal Line Crossover (enhanced with position context)
  getSignalCrossover() {
    if (this.prevMACD === null || this.prevSignal === null) return null;
    if (this.currentMACD === null || this.currentSignal === null) return null;

    // Bullish: MACD crosses ABOVE signal line
    if (this.prevMACD <= this.prevSignal && this.currentMACD > this.currentSignal) {
      // Stronger if below zero (early signal) or near zero
      const belowZero = this.currentMACD < 0;
      return {
        type: 'bullish_signal_crossover',
        direction: 'bullish',
        strength: belowZero ? 'very_strong' : 'strong',
        message: `MACD crossed above signal line ${belowZero ? '(below zero - early signal)' : '(bullish crossover)'}`,
        metadata: { macd: this.currentMACD, signal: this.currentSignal, belowZero }
      };
    }

    // Bearish: MACD crosses BELOW signal line
    if (this.prevMACD >= this.prevSignal && this.currentMACD < this.currentSignal) {
      // Stronger if above zero (early signal)
      const aboveZero = this.currentMACD > 0;
      return {
        type: 'bearish_signal_crossover',
        direction: 'bearish',
        strength: aboveZero ? 'very_strong' : 'strong',
        message: `MACD crossed below signal line ${aboveZero ? '(above zero - early signal)' : '(bearish crossover)'}`,
        metadata: { macd: this.currentMACD, signal: this.currentSignal, aboveZero }
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

  // SIGNAL 3: Histogram Analysis (enhanced with color change)
  getHistogramSignal() {
    if (this.histogramHistory.length < 4) return null;

    const recent = this.histogramHistory.slice(-4);

    // Histogram color change detection (sign flip in momentum)
    if (this.prevHistogram !== null && this.currentHistogram !== null) {
      // Histogram turns from negative to positive
      if (this.prevHistogram < 0 && this.currentHistogram > 0) {
        return {
          type: 'histogram_bullish_flip',
          direction: 'bullish',
          strength: 'strong',
          message: 'MACD histogram turned positive (momentum shift)',
          metadata: { prev: this.prevHistogram, current: this.currentHistogram }
        };
      }

      // Histogram turns from positive to negative
      if (this.prevHistogram > 0 && this.currentHistogram < 0) {
        return {
          type: 'histogram_bearish_flip',
          direction: 'bearish',
          strength: 'strong',
          message: 'MACD histogram turned negative (momentum shift)',
          metadata: { prev: this.prevHistogram, current: this.currentHistogram }
        };
      }
    }

    // Momentum accelerating (bars getting larger in positive direction)
    if (recent[0] > 0 && recent[1] > recent[0] && recent[2] > recent[1] && recent[3] > recent[2]) {
      return {
        type: 'bullish_momentum_accelerating',
        direction: 'bullish',
        strength: 'moderate',
        message: 'MACD histogram expanding rapidly (strong momentum)',
        metadata: { histogram: recent }
      };
    }

    // Momentum accelerating (bars getting larger in negative direction)
    if (recent[0] < 0 && recent[1] < recent[0] && recent[2] < recent[1] && recent[3] < recent[2]) {
      return {
        type: 'bearish_momentum_accelerating',
        direction: 'bearish',
        strength: 'moderate',
        message: 'MACD histogram expanding rapidly (strong momentum)',
        metadata: { histogram: recent }
      };
    }

    // Momentum weakening (positive bars shrinking) - early reversal warning
    if (recent[1] > 0 && recent[2] > 0 && recent[3] > 0 &&
        recent[1] > recent[2] && recent[2] > recent[3]) {
      return {
        type: 'bullish_momentum_weakening',
        direction: 'bearish',
        strength: 'weak',
        message: 'MACD histogram contracting (momentum weakening - potential reversal)',
        metadata: { histogram: recent }
      };
    }

    // Momentum weakening (negative bars shrinking) - early reversal warning
    if (recent[1] < 0 && recent[2] < 0 && recent[3] < 0 &&
        recent[1] < recent[2] && recent[2] < recent[3]) {
      return {
        type: 'bearish_momentum_weakening',
        direction: 'bullish',
        strength: 'weak',
        message: 'MACD histogram contracting (momentum weakening - potential reversal)',
        metadata: { histogram: recent }
      };
    }

    return null;
  }

  // SIGNAL 4: Regular Divergence Detection (REVERSAL signals)
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
        const divergenceStrength = Math.abs(lastMACDLow - prevMACDLow);
        return {
          type: 'bullish_divergence',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'Bullish MACD divergence (price lower low, MACD higher low)',
          metadata: { priceLow: lastPriceLow, macdLow: lastMACDLow, divergenceStrength }
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
        const divergenceStrength = Math.abs(lastMACDHigh - prevMACDHigh);
        return {
          type: 'bearish_divergence',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'Bearish MACD divergence (price higher high, MACD lower high)',
          metadata: { priceHigh: lastPriceHigh, macdHigh: lastMACDHigh, divergenceStrength }
        };
      }
    }

    return null;
  }

  // SIGNAL 5: Hidden Divergence Detection (CONTINUATION signals) - NEW!
  getHiddenDivergence() {
    if (this.macdHistory.length < 20 || this.priceHistory.length < 20) {
      return null;
    }

    const recentMACD = this.macdHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);

    // Bullish hidden divergence
    const priceLows = this.findSwingLows(recentPrices);
    const macdLows = this.findSwingLows(recentMACD);

    if (priceLows.length >= 2 && macdLows.length >= 2) {
      const lastPriceLow = recentPrices[priceLows[priceLows.length - 1]];
      const prevPriceLow = recentPrices[priceLows[priceLows.length - 2]];
      const lastMACDLow = recentMACD[macdLows[macdLows.length - 1]];
      const prevMACDLow = recentMACD[macdLows[macdLows.length - 2]];

      // BULLISH HIDDEN: Price higher low, MACD lower low (continuation in uptrend)
      if (lastPriceLow > prevPriceLow && lastMACDLow < prevMACDLow && this.currentMACD > -0.5) {
        return {
          type: 'bullish_hidden_divergence',
          direction: 'bullish',
          strength: 'strong',
          message: 'Bullish hidden divergence (uptrend continuation)',
          metadata: { priceLow: lastPriceLow, macdLow: lastMACDLow, trendDirection: 'up' }
        };
      }
    }

    // Bearish hidden divergence
    const priceHighs = this.findSwingHighs(recentPrices);
    const macdHighs = this.findSwingHighs(recentMACD);

    if (priceHighs.length >= 2 && macdHighs.length >= 2) {
      const lastPriceHigh = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPriceHigh = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastMACDHigh = recentMACD[macdHighs[macdHighs.length - 1]];
      const prevMACDHigh = recentMACD[macdHighs[macdHighs.length - 2]];

      // BEARISH HIDDEN: Price lower high, MACD higher high (continuation in downtrend)
      if (lastPriceHigh < prevPriceHigh && lastMACDHigh > prevMACDHigh && this.currentMACD < 0.5) {
        return {
          type: 'bearish_hidden_divergence',
          direction: 'bearish',
          strength: 'strong',
          message: 'Bearish hidden divergence (downtrend continuation)',
          metadata: { priceHigh: lastPriceHigh, macdHigh: lastMACDHigh, trendDirection: 'down' }
        };
      }
    }

    return null;
  }

  // SIGNAL 6: Impulse System (Elder's method) - NEW!
  getImpulseSignal() {
    if (this.ema13 === null || this.prevEma13 === null) return null;
    if (this.currentHistogram === null || this.prevHistogram === null) return null;

    const ema13Rising = this.ema13 > this.prevEma13;
    const ema13Falling = this.ema13 < this.prevEma13;
    const histogramRising = this.currentHistogram > this.prevHistogram;
    const histogramFalling = this.currentHistogram < this.prevHistogram;

    // Green bar: EMA13 rising AND histogram rising (bullish impulse)
    if (ema13Rising && histogramRising) {
      return {
        type: 'bullish_impulse',
        direction: 'bullish',
        strength: 'strong',
        message: 'Bullish impulse (EMA13 rising + histogram rising)',
        metadata: { ema13Trend: 'up', histogramTrend: 'up', impulseColor: 'green' }
      };
    }

    // Red bar: EMA13 falling AND histogram falling (bearish impulse)
    if (ema13Falling && histogramFalling) {
      return {
        type: 'bearish_impulse',
        direction: 'bearish',
        strength: 'strong',
        message: 'Bearish impulse (EMA13 falling + histogram falling)',
        metadata: { ema13Trend: 'down', histogramTrend: 'down', impulseColor: 'red' }
      };
    }

    return null;
  }

  // SIGNAL 7: Signal Line Slope Analysis - NEW!
  getSignalLineSlope() {
    if (this.signalHistory.length < 5) return null;

    const recent = this.signalHistory.slice(-5);
    const slope = (recent[4] - recent[0]) / 4;
    const normalizedSlope = slope / Math.abs(recent[4] || 1) * 100;

    // Strong upward slope
    if (normalizedSlope > 2 && this.currentSignal < 0) {
      return {
        type: 'signal_line_rising',
        direction: 'bullish',
        strength: 'moderate',
        message: `Signal line rising sharply (slope: ${normalizedSlope.toFixed(2)}%)`,
        metadata: { slope: normalizedSlope, signalValue: this.currentSignal }
      };
    }

    // Strong downward slope
    if (normalizedSlope < -2 && this.currentSignal > 0) {
      return {
        type: 'signal_line_falling',
        direction: 'bearish',
        strength: 'moderate',
        message: `Signal line falling sharply (slope: ${normalizedSlope.toFixed(2)}%)`,
        metadata: { slope: normalizedSlope, signalValue: this.currentSignal }
      };
    }

    return null;
  }

  // SIGNAL 8: Convergence Detection (early entry) - NEW!
  getConvergence() {
    if (this.macdHistory.length < 5 || this.signalHistory.length < 5) return null;

    const macdRecent = this.macdHistory.slice(-5);
    const signalRecent = this.signalHistory.slice(-5);

    // Calculate distance between MACD and signal
    const distances = macdRecent.map((m, i) => Math.abs(m - signalRecent[i]));

    // Check if lines are converging (distance decreasing)
    const isConverging = distances[0] > distances[1] &&
                         distances[1] > distances[2] &&
                         distances[2] > distances[3] &&
                         distances[3] > distances[4];

    if (isConverging && distances[4] < distances[0] * 0.5) {
      const macdAboveSignal = this.currentMACD > this.currentSignal;

      if (macdAboveSignal) {
        return {
          type: 'bearish_convergence',
          direction: 'bearish',
          strength: 'weak',
          message: 'MACD converging from above (potential bearish crossover)',
          metadata: { distance: distances[4], convergenceRate: 1 - distances[4] / distances[0] }
        };
      } else {
        return {
          type: 'bullish_convergence',
          direction: 'bullish',
          strength: 'weak',
          message: 'MACD converging from below (potential bullish crossover)',
          metadata: { distance: distances[4], convergenceRate: 1 - distances[4] / distances[0] }
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

    // Priority order: divergences first, then crossovers, then histogram, then others
    const divergence = this.getDivergence();
    if (divergence) signals.push(divergence);

    const hiddenDivergence = this.getHiddenDivergence();
    if (hiddenDivergence) signals.push(hiddenDivergence);

    const signalCross = this.getSignalCrossover();
    if (signalCross) signals.push(signalCross);

    const zeroCross = this.getZeroCrossover();
    if (zeroCross) signals.push(zeroCross);

    const histogram = this.getHistogramSignal();
    if (histogram) signals.push(histogram);

    const impulse = this.getImpulseSignal();
    if (impulse) signals.push(impulse);

    const signalSlope = this.getSignalLineSlope();
    if (signalSlope) signals.push(signalSlope);

    const convergence = this.getConvergence();
    if (convergence) signals.push(convergence);

    return signals;
  }

  getResult() {
    return {
      value: {
        macd: this.currentMACD,
        signal: this.currentSignal,
        histogram: this.currentHistogram,
        ema13: this.ema13
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
    this.signalHistory = [];
    this.priceHistory = [];
    this.ema13 = null;
    this.prevEma13 = null;
  }
}

module.exports = MACDIndicator;
