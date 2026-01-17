/**
 * Bollinger Bands - ENHANCED V2 with Squeeze Momentum
 *
 * ENHANCEMENTS (2026-01-16):
 * - Keltner Channel integration for TTM Squeeze detection
 * - Squeeze fire signals (momentum burst after squeeze)
 * - W-bottom and M-top pattern detection
 * - Walking the bands detection
 * - %B momentum (rate of change)
 * - Mean reversion signals
 * - Band width expansion/contraction analysis
 *
 * Signals: Band Touch, Squeeze, Squeeze Fire, Breakout, %B, W-Bottom, M-Top, Walking
 */

class BollingerBands {
  constructor(config = {}) {
    this.period = config.period || 20;
    this.stdDev = config.stdDev || 2;

    // Keltner Channel parameters for squeeze detection
    this.keltnerPeriod = config.keltnerPeriod || 20;
    this.keltnerMultiplier = config.keltnerMultiplier || 1.5;

    this.prices = [];
    this.highs = [];
    this.lows = [];
    this.closes = [];

    this.upper = null;
    this.middle = null;
    this.lower = null;
    this.bandwidth = null;
    this.percentB = null;

    this.prevUpper = null;
    this.prevLower = null;
    this.prevBandwidth = null;
    this.prevPercentB = null;

    // Keltner Channel values
    this.keltnerUpper = null;
    this.keltnerLower = null;
    this.keltnerMiddle = null;
    this.atr = null;
    this.prevAtr = null;

    // Squeeze state
    this.inSqueeze = false;
    this.prevInSqueeze = false;
    this.squeezeCount = 0;

    this.bandwidthHistory = [];
    this.priceHistory = [];
    this.percentBHistory = [];
    this.trHistory = []; // True Range history for ATR
    this.maxHistory = config.historyLength || 100;
  }

  update(candle) {
    const close = typeof candle === 'number' ? candle : candle.close;
    const high = typeof candle === 'number' ? candle : candle.high;
    const low = typeof candle === 'number' ? candle : candle.low;

    this.prevUpper = this.upper;
    this.prevLower = this.lower;
    this.prevBandwidth = this.bandwidth;
    this.prevPercentB = this.percentB;
    this.prevInSqueeze = this.inSqueeze;
    this.prevAtr = this.atr;

    this.prices.push(close);
    this.highs.push(high);
    this.lows.push(low);
    this.closes.push(close);

    if (this.prices.length > this.period) {
      this.prices.shift();
      this.highs.shift();
      this.lows.shift();
      this.closes.shift();
    }

    // Calculate True Range for Keltner Channel ATR
    if (this.closes.length > 1) {
      const prevClose = this.closes[this.closes.length - 2];
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      this.trHistory.push(tr);
      if (this.trHistory.length > this.keltnerPeriod) {
        this.trHistory.shift();
      }
    }

    if (this.prices.length < this.period) {
      return this.getResult();
    }

    // Calculate SMA (middle band)
    this.middle = this.prices.reduce((a, b) => a + b, 0) / this.period;

    // Calculate standard deviation
    const squaredDiffs = this.prices.map(p => Math.pow(p - this.middle, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / this.period;
    const std = Math.sqrt(variance);

    // Calculate Bollinger Bands
    this.upper = this.middle + (std * this.stdDev);
    this.lower = this.middle - (std * this.stdDev);
    this.bandwidth = (this.upper - this.lower) / this.middle * 100;
    this.percentB = (close - this.lower) / (this.upper - this.lower);

    // Calculate Keltner Channel
    this.calculateKeltnerChannel(close);

    // Determine squeeze state
    this.updateSqueezeState();

    this.bandwidthHistory.push(this.bandwidth);
    this.priceHistory.push(close);
    this.percentBHistory.push(this.percentB);

    if (this.bandwidthHistory.length > this.maxHistory) {
      this.bandwidthHistory.shift();
      this.priceHistory.shift();
      this.percentBHistory.shift();
    }

    return this.getResult();
  }

  /**
   * Calculate Keltner Channel for squeeze detection
   */
  calculateKeltnerChannel(close) {
    if (this.trHistory.length < this.keltnerPeriod) return;

    // ATR (Average True Range)
    this.atr = this.trHistory.reduce((a, b) => a + b, 0) / this.trHistory.length;

    // Keltner middle = same as Bollinger middle (20 SMA)
    this.keltnerMiddle = this.middle;

    // Keltner bands
    this.keltnerUpper = this.keltnerMiddle + (this.atr * this.keltnerMultiplier);
    this.keltnerLower = this.keltnerMiddle - (this.atr * this.keltnerMultiplier);
  }

  /**
   * Update squeeze state - squeeze occurs when BB is inside KC
   */
  updateSqueezeState() {
    if (this.keltnerUpper === null) return;

    // TTM Squeeze: Bollinger Bands are INSIDE Keltner Channel
    const bbInsideKc = this.lower > this.keltnerLower && this.upper < this.keltnerUpper;

    if (bbInsideKc) {
      this.inSqueeze = true;
      this.squeezeCount++;
    } else {
      this.inSqueeze = false;
      this.squeezeCount = 0;
    }
  }

  // SIGNAL 1: Band Touch (enhanced)
  getBandTouch() {
    if (this.upper === null) return null;

    const currentPrice = this.priceHistory[this.priceHistory.length - 1];

    // Touch lower band
    if (currentPrice <= this.lower * 1.001) {
      // Check if this could be a reversal (not walking the bands)
      const isWalking = this.isWalkingBands('lower');
      return {
        type: 'lower_band_touch',
        direction: isWalking ? 'bearish' : 'bullish',
        strength: isWalking ? 'weak' : 'moderate',
        message: isWalking
          ? 'Price walking lower band (strong downtrend)'
          : `Price touched lower Bollinger Band - potential bounce`,
        metadata: { price: currentPrice, lower: this.lower, percentB: this.percentB, isWalking }
      };
    }

    // Touch upper band
    if (currentPrice >= this.upper * 0.999) {
      const isWalking = this.isWalkingBands('upper');
      return {
        type: 'upper_band_touch',
        direction: isWalking ? 'bullish' : 'bearish',
        strength: isWalking ? 'weak' : 'moderate',
        message: isWalking
          ? 'Price walking upper band (strong uptrend)'
          : `Price touched upper Bollinger Band - potential pullback`,
        metadata: { price: currentPrice, upper: this.upper, percentB: this.percentB, isWalking }
      };
    }

    return null;
  }

  // SIGNAL 2: TTM Squeeze Detection (enhanced with Keltner)
  getSqueeze() {
    if (this.keltnerUpper === null) return null;

    // Squeeze just started
    if (this.inSqueeze && !this.prevInSqueeze) {
      return {
        type: 'squeeze_started',
        direction: 'neutral',
        strength: 'moderate',
        message: 'TTM Squeeze started (volatility contracting)',
        metadata: {
          bandwidth: this.bandwidth,
          bbUpper: this.upper,
          bbLower: this.lower,
          kcUpper: this.keltnerUpper,
          kcLower: this.keltnerLower
        }
      };
    }

    // Prolonged squeeze (5+ bars)
    if (this.inSqueeze && this.squeezeCount >= 5) {
      return {
        type: 'squeeze_building',
        direction: 'neutral',
        strength: 'strong',
        message: `TTM Squeeze building (${this.squeezeCount} bars) - expect breakout`,
        metadata: { squeezeCount: this.squeezeCount, bandwidth: this.bandwidth }
      };
    }

    // Legacy squeeze detection (bandwidth-based)
    if (this.bandwidthHistory.length >= 20) {
      const avgBandwidth = this.bandwidthHistory.reduce((a, b) => a + b, 0) / this.bandwidthHistory.length;
      const minBandwidth = Math.min(...this.bandwidthHistory.slice(-20));

      if (this.bandwidth < avgBandwidth * 0.5 && this.bandwidth <= minBandwidth * 1.1) {
        return {
          type: 'bollinger_squeeze',
          direction: 'neutral',
          strength: 'strong',
          message: `Bollinger squeeze detected (bandwidth: ${this.bandwidth.toFixed(2)}%)`,
          metadata: { bandwidth: this.bandwidth, avgBandwidth, minBandwidth }
        };
      }
    }

    return null;
  }

  // SIGNAL 3: Squeeze Fire (momentum burst after squeeze) - NEW!
  getSqueezeFire() {
    if (!this.prevInSqueeze || this.inSqueeze) return null;

    // Squeeze just ended - determine direction
    const currentPrice = this.priceHistory[this.priceHistory.length - 1];

    // Price breaking upper band = bullish fire
    if (currentPrice > this.middle) {
      return {
        type: 'squeeze_fire_bullish',
        direction: 'bullish',
        strength: 'very_strong',
        message: 'TTM Squeeze fired BULLISH (momentum explosion)',
        metadata: {
          price: currentPrice,
          middle: this.middle,
          upper: this.upper,
          squeezeLength: this.squeezeCount
        }
      };
    }

    // Price breaking lower band = bearish fire
    if (currentPrice < this.middle) {
      return {
        type: 'squeeze_fire_bearish',
        direction: 'bearish',
        strength: 'very_strong',
        message: 'TTM Squeeze fired BEARISH (momentum explosion)',
        metadata: {
          price: currentPrice,
          middle: this.middle,
          lower: this.lower,
          squeezeLength: this.squeezeCount
        }
      };
    }

    return null;
  }

  // SIGNAL 4: Breakout (enhanced)
  getBreakout() {
    if (this.prevUpper === null || this.priceHistory.length < 2) return null;

    const currentPrice = this.priceHistory[this.priceHistory.length - 1];
    const prevPrice = this.priceHistory[this.priceHistory.length - 2];

    // Breakout above upper band
    if (prevPrice < this.prevUpper && currentPrice > this.upper) {
      const isAfterSqueeze = this.prevInSqueeze;
      return {
        type: 'bullish_breakout',
        direction: 'bullish',
        strength: isAfterSqueeze ? 'very_strong' : 'strong',
        message: isAfterSqueeze
          ? 'Price broke above upper BB after squeeze (high conviction)'
          : 'Price broke above upper Bollinger Band',
        metadata: { prevPrice, currentPrice, upper: this.upper, afterSqueeze: isAfterSqueeze }
      };
    }

    // Breakdown below lower band
    if (prevPrice > this.prevLower && currentPrice < this.lower) {
      const isAfterSqueeze = this.prevInSqueeze;
      return {
        type: 'bearish_breakdown',
        direction: 'bearish',
        strength: isAfterSqueeze ? 'very_strong' : 'strong',
        message: isAfterSqueeze
          ? 'Price broke below lower BB after squeeze (high conviction)'
          : 'Price broke below lower Bollinger Band',
        metadata: { prevPrice, currentPrice, lower: this.lower, afterSqueeze: isAfterSqueeze }
      };
    }

    return null;
  }

  // SIGNAL 5: %B Analysis (enhanced with momentum)
  getPercentBSignal() {
    if (this.percentB === null) return null;

    // %B momentum (rate of change)
    if (this.percentBHistory.length >= 3) {
      const recent = this.percentBHistory.slice(-3);
      const pbMomentum = recent[2] - recent[0];

      // Rapid %B increase from oversold
      if (recent[0] < 0.2 && pbMomentum > 0.3) {
        return {
          type: 'percentb_momentum_bullish',
          direction: 'bullish',
          strength: 'strong',
          message: '%B momentum surge from oversold',
          metadata: { percentB: this.percentB, momentum: pbMomentum }
        };
      }

      // Rapid %B decrease from overbought
      if (recent[0] > 0.8 && pbMomentum < -0.3) {
        return {
          type: 'percentb_momentum_bearish',
          direction: 'bearish',
          strength: 'strong',
          message: '%B momentum drop from overbought',
          metadata: { percentB: this.percentB, momentum: pbMomentum }
        };
      }
    }

    // %B extreme oversold (below 0)
    if (this.percentB < 0) {
      return {
        type: 'percentb_oversold',
        direction: 'bullish',
        strength: this.percentB < -0.2 ? 'strong' : 'moderate',
        message: `%B extreme oversold (${(this.percentB * 100).toFixed(1)}%)`,
        metadata: { percentB: this.percentB }
      };
    }

    // %B extreme overbought (above 100%)
    if (this.percentB > 1) {
      return {
        type: 'percentb_overbought',
        direction: 'bearish',
        strength: this.percentB > 1.2 ? 'strong' : 'moderate',
        message: `%B extreme overbought (${(this.percentB * 100).toFixed(1)}%)`,
        metadata: { percentB: this.percentB }
      };
    }

    return null;
  }

  // SIGNAL 6: W-Bottom Pattern Detection - NEW!
  getWBottomPattern() {
    if (this.priceHistory.length < 20 || this.percentBHistory.length < 20) return null;

    const prices = this.priceHistory.slice(-20);
    const percentBs = this.percentBHistory.slice(-20);

    // Find two lows in price
    const priceLows = this.findSwingLows(prices);

    if (priceLows.length >= 2) {
      const low1Idx = priceLows[priceLows.length - 2];
      const low2Idx = priceLows[priceLows.length - 1];

      const priceLow1 = prices[low1Idx];
      const priceLow2 = prices[low2Idx];
      const pbLow1 = percentBs[low1Idx];
      const pbLow2 = percentBs[low2Idx];

      // W-Bottom: First low touches/breaks lower band, second low higher in %B
      if (pbLow1 < 0.1 && pbLow2 > pbLow1 && priceLow2 <= priceLow1 * 1.02) {
        return {
          type: 'w_bottom_pattern',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'W-Bottom pattern detected (bullish reversal)',
          metadata: { priceLow1, priceLow2, pbLow1, pbLow2 }
        };
      }
    }

    return null;
  }

  // SIGNAL 7: M-Top Pattern Detection - NEW!
  getMTopPattern() {
    if (this.priceHistory.length < 20 || this.percentBHistory.length < 20) return null;

    const prices = this.priceHistory.slice(-20);
    const percentBs = this.percentBHistory.slice(-20);

    // Find two highs in price
    const priceHighs = this.findSwingHighs(prices);

    if (priceHighs.length >= 2) {
      const high1Idx = priceHighs[priceHighs.length - 2];
      const high2Idx = priceHighs[priceHighs.length - 1];

      const priceHigh1 = prices[high1Idx];
      const priceHigh2 = prices[high2Idx];
      const pbHigh1 = percentBs[high1Idx];
      const pbHigh2 = percentBs[high2Idx];

      // M-Top: First high touches/breaks upper band, second high lower in %B
      if (pbHigh1 > 0.9 && pbHigh2 < pbHigh1 && priceHigh2 >= priceHigh1 * 0.98) {
        return {
          type: 'm_top_pattern',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'M-Top pattern detected (bearish reversal)',
          metadata: { priceHigh1, priceHigh2, pbHigh1, pbHigh2 }
        };
      }
    }

    return null;
  }

  // SIGNAL 8: Band Width Expansion - NEW!
  getBandWidthExpansion() {
    if (this.bandwidthHistory.length < 10) return null;

    const recent = this.bandwidthHistory.slice(-5);
    const older = this.bandwidthHistory.slice(-10, -5);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    // Bandwidth expanding rapidly (volatility increasing)
    if (recentAvg > olderAvg * 1.5) {
      const currentPrice = this.priceHistory[this.priceHistory.length - 1];
      const direction = currentPrice > this.middle ? 'bullish' : 'bearish';

      return {
        type: 'bandwidth_expansion',
        direction,
        strength: 'moderate',
        message: `Bandwidth expanding rapidly (volatility increasing) - ${direction} trend`,
        metadata: { recentBW: recentAvg, olderBW: olderAvg, expansion: recentAvg / olderAvg }
      };
    }

    return null;
  }

  /**
   * Check if price is "walking the bands" (strong trend)
   */
  isWalkingBands(band) {
    if (this.priceHistory.length < 5) return false;

    const recentPrices = this.priceHistory.slice(-5);

    if (band === 'upper') {
      // Walking upper band: 4+ of last 5 closes above middle
      const aboveMiddle = recentPrices.filter(p => p > this.middle).length;
      return aboveMiddle >= 4;
    } else {
      // Walking lower band: 4+ of last 5 closes below middle
      const belowMiddle = recentPrices.filter(p => p < this.middle).length;
      return belowMiddle >= 4;
    }
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

    // High priority signals first
    const squeezeFire = this.getSqueezeFire();
    if (squeezeFire) signals.push(squeezeFire);

    const wBottom = this.getWBottomPattern();
    if (wBottom) signals.push(wBottom);

    const mTop = this.getMTopPattern();
    if (mTop) signals.push(mTop);

    const breakout = this.getBreakout();
    if (breakout) signals.push(breakout);

    const squeeze = this.getSqueeze();
    if (squeeze) signals.push(squeeze);

    const touch = this.getBandTouch();
    if (touch) signals.push(touch);

    const percentBSignal = this.getPercentBSignal();
    if (percentBSignal) signals.push(percentBSignal);

    const expansion = this.getBandWidthExpansion();
    if (expansion) signals.push(expansion);

    return signals;
  }

  getResult() {
    return {
      value: {
        upper: this.upper,
        middle: this.middle,
        lower: this.lower,
        bandwidth: this.bandwidth,
        percentB: this.percentB,
        // Keltner Channel values
        keltnerUpper: this.keltnerUpper,
        keltnerMiddle: this.keltnerMiddle,
        keltnerLower: this.keltnerLower,
        atr: this.atr,
        // Squeeze state
        inSqueeze: this.inSqueeze,
        squeezeCount: this.squeezeCount
      },
      signals: this.upper !== null ? this.getSignals() : []
    };
  }

  reset() {
    this.prices = [];
    this.highs = [];
    this.lows = [];
    this.closes = [];
    this.upper = null;
    this.middle = null;
    this.lower = null;
    this.bandwidth = null;
    this.percentB = null;
    this.prevUpper = null;
    this.prevLower = null;
    this.prevBandwidth = null;
    this.prevPercentB = null;
    this.keltnerUpper = null;
    this.keltnerLower = null;
    this.keltnerMiddle = null;
    this.atr = null;
    this.prevAtr = null;
    this.inSqueeze = false;
    this.prevInSqueeze = false;
    this.squeezeCount = 0;
    this.bandwidthHistory = [];
    this.priceHistory = [];
    this.percentBHistory = [];
    this.trHistory = [];
  }
}

module.exports = BollingerBands;
