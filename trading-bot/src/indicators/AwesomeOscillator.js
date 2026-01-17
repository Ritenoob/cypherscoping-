/**
 * Awesome Oscillator - ENHANCED V2 with Accelerator Integration
 *
 * ENHANCEMENTS (2026-01-16):
 * - Accelerator Oscillator integration (AC = AO - SMA(AO))
 * - Hidden divergence detection (continuation signals)
 * - Color bar sequence analysis (3+ consecutive colors)
 * - AO/AC alignment signals
 * - Momentum thrust detection
 * - Enhanced twin peaks with confirmation
 * - Zone analysis (distance from zero)
 *
 * Signals: Zero Cross, Saucer, Twin Peaks, Divergence, Hidden Div, AC Alignment, Thrust
 */

class AwesomeOscillator {
  constructor(config = {}) {
    this.fastPeriod = config.fastPeriod || 5;
    this.slowPeriod = config.slowPeriod || 34;
    this.acPeriod = config.acPeriod || 5; // Accelerator smoothing

    this.fastWindow = [];
    this.slowWindow = [];
    this.fastSum = 0;
    this.slowSum = 0;

    this.currentAO = null;
    this.prevAO = null;

    // Accelerator Oscillator state
    this.aoWindow = [];
    this.aoSum = 0;
    this.currentAC = null;
    this.prevAC = null;

    this.aoHistory = [];
    this.acHistory = [];
    this.priceHistory = [];
    this.maxHistory = config.historyLength || 100;

    // Color tracking (green = rising, red = falling)
    this.consecutiveGreen = 0;
    this.consecutiveRed = 0;
  }

  update(candle) {
    this.prevAO = this.currentAO;
    this.prevAC = this.currentAC;

    const median = (candle.high + candle.low) / 2;

    this.fastWindow.push(median);
    this.fastSum += median;
    if (this.fastWindow.length > this.fastPeriod) {
      this.fastSum -= this.fastWindow.shift();
    }

    this.slowWindow.push(median);
    this.slowSum += median;
    if (this.slowWindow.length > this.slowPeriod) {
      this.slowSum -= this.slowWindow.shift();
    }

    if (this.slowWindow.length < this.slowPeriod) {
      return this.getResult();
    }

    const fastSMA = this.fastSum / this.fastPeriod;
    const slowSMA = this.slowSum / this.slowPeriod;
    this.currentAO = fastSMA - slowSMA;

    // Calculate Accelerator Oscillator (AC = AO - SMA(AO))
    this.aoWindow.push(this.currentAO);
    this.aoSum += this.currentAO;
    if (this.aoWindow.length > this.acPeriod) {
      this.aoSum -= this.aoWindow.shift();
    }

    if (this.aoWindow.length >= this.acPeriod) {
      const aoSMA = this.aoSum / this.acPeriod;
      this.currentAC = this.currentAO - aoSMA;
    }

    // Track consecutive colors
    if (this.prevAO !== null) {
      if (this.currentAO > this.prevAO) {
        this.consecutiveGreen++;
        this.consecutiveRed = 0;
      } else if (this.currentAO < this.prevAO) {
        this.consecutiveRed++;
        this.consecutiveGreen = 0;
      }
    }

    this.aoHistory.push(this.currentAO);
    if (this.currentAC !== null) {
      this.acHistory.push(this.currentAC);
    }
    this.priceHistory.push(candle.close || median);

    if (this.aoHistory.length > this.maxHistory) {
      this.aoHistory.shift();
      this.priceHistory.shift();
      if (this.acHistory.length > this.maxHistory) {
        this.acHistory.shift();
      }
    }

    return this.getResult();
  }

  // SIGNAL 1: Zero Line Cross (enhanced with AC confirmation)
  getZeroLineCross() {
    if (this.prevAO === null || this.currentAO === null) return null;

    // Bullish: AO crosses above zero
    if (this.prevAO <= 0 && this.currentAO > 0) {
      const acConfirm = this.currentAC !== null && this.currentAC > 0;
      return {
        type: 'bullish_zero_cross',
        direction: 'bullish',
        strength: acConfirm ? 'very_strong' : 'strong',
        message: `AO crossed above zero ${acConfirm ? '(AC confirms)' : ''}`,
        metadata: { prevAO: this.prevAO, currentAO: this.currentAO, ac: this.currentAC, acConfirm }
      };
    }

    // Bearish: AO crosses below zero
    if (this.prevAO >= 0 && this.currentAO < 0) {
      const acConfirm = this.currentAC !== null && this.currentAC < 0;
      return {
        type: 'bearish_zero_cross',
        direction: 'bearish',
        strength: acConfirm ? 'very_strong' : 'strong',
        message: `AO crossed below zero ${acConfirm ? '(AC confirms)' : ''}`,
        metadata: { prevAO: this.prevAO, currentAO: this.currentAO, ac: this.currentAC, acConfirm }
      };
    }

    return null;
  }

  // SIGNAL 2: Saucer Pattern (enhanced with color confirmation)
  getSaucerPattern() {
    if (this.aoHistory.length < 4) return null;

    const bars = this.aoHistory.slice(-4);

    // Bullish saucer: above zero, dip then rise (green after red)
    if (bars[0] > 0 && bars[1] > 0 && bars[2] > 0 && bars[3] > 0) {
      if (bars[1] < bars[0] && bars[2] < bars[1] && bars[3] > bars[2]) {
        return {
          type: 'bullish_saucer',
          direction: 'bullish',
          strength: 'strong',
          message: 'Bullish saucer pattern (buy continuation)',
          metadata: { bars, consecutiveGreen: this.consecutiveGreen }
        };
      }
    }

    // Bearish saucer: below zero, rise then dip (red after green)
    if (bars[0] < 0 && bars[1] < 0 && bars[2] < 0 && bars[3] < 0) {
      if (bars[1] > bars[0] && bars[2] > bars[1] && bars[3] < bars[2]) {
        return {
          type: 'bearish_saucer',
          direction: 'bearish',
          strength: 'strong',
          message: 'Bearish saucer pattern (sell continuation)',
          metadata: { bars, consecutiveRed: this.consecutiveRed }
        };
      }
    }

    return null;
  }

  // SIGNAL 3: Twin Peaks (enhanced with depth validation)
  getTwinPeaks() {
    if (this.aoHistory.length < 15) return null;

    const recent = this.aoHistory.slice(-15);

    // Find peaks and troughs
    const peaks = [];
    const troughs = [];

    for (let i = 1; i < recent.length - 1; i++) {
      if (recent[i] > recent[i-1] && recent[i] > recent[i+1]) {
        peaks.push({ index: i, value: recent[i] });
      }
      if (recent[i] < recent[i-1] && recent[i] < recent[i+1]) {
        troughs.push({ index: i, value: recent[i] });
      }
    }

    // Bullish twin peaks: two troughs below zero, second higher, with trough between
    if (troughs.length >= 2) {
      const t1 = troughs[troughs.length - 2];
      const t2 = troughs[troughs.length - 1];

      if (t1.value < 0 && t2.value < 0 && t2.value > t1.value) {
        // Check for peak between troughs
        const peakBetween = peaks.find(p => p.index > t1.index && p.index < t2.index);
        if (peakBetween && this.currentAO > t2.value) {
          return {
            type: 'bullish_twin_peaks',
            direction: 'bullish',
            strength: 'very_strong',
            message: 'Bullish twin peaks (higher low below zero)',
            metadata: { trough1: t1.value, trough2: t2.value, peakBetween: peakBetween?.value }
          };
        }
      }
    }

    // Bearish twin peaks: two peaks above zero, second lower
    if (peaks.length >= 2) {
      const p1 = peaks[peaks.length - 2];
      const p2 = peaks[peaks.length - 1];

      if (p1.value > 0 && p2.value > 0 && p2.value < p1.value) {
        // Check for trough between peaks
        const troughBetween = troughs.find(t => t.index > p1.index && t.index < p2.index);
        if (troughBetween && this.currentAO < p2.value) {
          return {
            type: 'bearish_twin_peaks',
            direction: 'bearish',
            strength: 'very_strong',
            message: 'Bearish twin peaks (lower high above zero)',
            metadata: { peak1: p1.value, peak2: p2.value, troughBetween: troughBetween?.value }
          };
        }
      }
    }

    return null;
  }

  // SIGNAL 4: Regular Divergence (REVERSAL)
  getDivergence() {
    if (this.aoHistory.length < 20 || this.priceHistory.length < 20) return null;

    const recentAO = this.aoHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);

    const priceLows = this.findSwingLows(recentPrices);
    const aoLows = this.findSwingLows(recentAO);

    if (priceLows.length >= 2 && aoLows.length >= 2) {
      const lastPrice = recentPrices[priceLows[priceLows.length - 1]];
      const prevPrice = recentPrices[priceLows[priceLows.length - 2]];
      const lastAO = recentAO[aoLows[aoLows.length - 1]];
      const prevAO = recentAO[aoLows[aoLows.length - 2]];

      if (lastPrice < prevPrice && lastAO > prevAO) {
        return {
          type: 'bullish_divergence',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'Bullish AO divergence (price lower low, AO higher low)',
          metadata: { lastPrice, prevPrice, lastAO, prevAO }
        };
      }
    }

    const priceHighs = this.findSwingHighs(recentPrices);
    const aoHighs = this.findSwingHighs(recentAO);

    if (priceHighs.length >= 2 && aoHighs.length >= 2) {
      const lastPrice = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPrice = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastAO = recentAO[aoHighs[aoHighs.length - 1]];
      const prevAO = recentAO[aoHighs[aoHighs.length - 2]];

      if (lastPrice > prevPrice && lastAO < prevAO) {
        return {
          type: 'bearish_divergence',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'Bearish AO divergence (price higher high, AO lower high)',
          metadata: { lastPrice, prevPrice, lastAO, prevAO }
        };
      }
    }

    return null;
  }

  // SIGNAL 5: Hidden Divergence (CONTINUATION) - NEW!
  getHiddenDivergence() {
    if (this.aoHistory.length < 20 || this.priceHistory.length < 20) return null;

    const recentAO = this.aoHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);

    // Bullish hidden divergence
    const priceLows = this.findSwingLows(recentPrices);
    const aoLows = this.findSwingLows(recentAO);

    if (priceLows.length >= 2 && aoLows.length >= 2) {
      const lastPrice = recentPrices[priceLows[priceLows.length - 1]];
      const prevPrice = recentPrices[priceLows[priceLows.length - 2]];
      const lastAO = recentAO[aoLows[aoLows.length - 1]];
      const prevAO = recentAO[aoLows[aoLows.length - 2]];

      // Price higher low, AO lower low (continuation in uptrend)
      if (lastPrice > prevPrice && lastAO < prevAO && this.currentAO > 0) {
        return {
          type: 'bullish_hidden_divergence',
          direction: 'bullish',
          strength: 'strong',
          message: 'Bullish hidden divergence (uptrend continuation)',
          metadata: { lastPrice, prevPrice, lastAO, prevAO }
        };
      }
    }

    // Bearish hidden divergence
    const priceHighs = this.findSwingHighs(recentPrices);
    const aoHighs = this.findSwingHighs(recentAO);

    if (priceHighs.length >= 2 && aoHighs.length >= 2) {
      const lastPrice = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPrice = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastAO = recentAO[aoHighs[aoHighs.length - 1]];
      const prevAO = recentAO[aoHighs[aoHighs.length - 2]];

      // Price lower high, AO higher high (continuation in downtrend)
      if (lastPrice < prevPrice && lastAO > prevAO && this.currentAO < 0) {
        return {
          type: 'bearish_hidden_divergence',
          direction: 'bearish',
          strength: 'strong',
          message: 'Bearish hidden divergence (downtrend continuation)',
          metadata: { lastPrice, prevPrice, lastAO, prevAO }
        };
      }
    }

    return null;
  }

  // SIGNAL 6: AO/AC Alignment - NEW!
  getAOACAlignment() {
    if (this.currentAC === null || this.prevAC === null) return null;

    const aoRising = this.currentAO > this.prevAO;
    const aoFalling = this.currentAO < this.prevAO;
    const acRising = this.currentAC > this.prevAC;
    const acFalling = this.currentAC < this.prevAC;

    // Strong bullish: both AO and AC rising above zero
    if (aoRising && acRising && this.currentAO > 0 && this.currentAC > 0) {
      return {
        type: 'bullish_ao_ac_alignment',
        direction: 'bullish',
        strength: 'very_strong',
        message: 'AO and AC aligned bullish (both rising above zero)',
        metadata: { ao: this.currentAO, ac: this.currentAC, aoTrend: 'rising', acTrend: 'rising' }
      };
    }

    // Strong bearish: both AO and AC falling below zero
    if (aoFalling && acFalling && this.currentAO < 0 && this.currentAC < 0) {
      return {
        type: 'bearish_ao_ac_alignment',
        direction: 'bearish',
        strength: 'very_strong',
        message: 'AO and AC aligned bearish (both falling below zero)',
        metadata: { ao: this.currentAO, ac: this.currentAC, aoTrend: 'falling', acTrend: 'falling' }
      };
    }

    // Early bullish: AC turns up while AO still below zero
    if (acRising && this.prevAC < 0 && this.currentAC > this.prevAC && this.currentAO < 0) {
      return {
        type: 'early_bullish_ac',
        direction: 'bullish',
        strength: 'moderate',
        message: 'AC turning up (early bullish signal)',
        metadata: { ao: this.currentAO, ac: this.currentAC }
      };
    }

    // Early bearish: AC turns down while AO still above zero
    if (acFalling && this.prevAC > 0 && this.currentAC < this.prevAC && this.currentAO > 0) {
      return {
        type: 'early_bearish_ac',
        direction: 'bearish',
        strength: 'moderate',
        message: 'AC turning down (early bearish signal)',
        metadata: { ao: this.currentAO, ac: this.currentAC }
      };
    }

    return null;
  }

  // SIGNAL 7: Color Sequence - NEW!
  getColorSequence() {
    // 3+ consecutive green bars above zero = strong trend
    if (this.consecutiveGreen >= 3 && this.currentAO > 0) {
      return {
        type: 'bullish_color_sequence',
        direction: 'bullish',
        strength: this.consecutiveGreen >= 5 ? 'very_strong' : 'strong',
        message: `${this.consecutiveGreen} consecutive green bars above zero`,
        metadata: { consecutiveGreen: this.consecutiveGreen, ao: this.currentAO }
      };
    }

    // 3+ consecutive red bars below zero = strong trend
    if (this.consecutiveRed >= 3 && this.currentAO < 0) {
      return {
        type: 'bearish_color_sequence',
        direction: 'bearish',
        strength: this.consecutiveRed >= 5 ? 'very_strong' : 'strong',
        message: `${this.consecutiveRed} consecutive red bars below zero`,
        metadata: { consecutiveRed: this.consecutiveRed, ao: this.currentAO }
      };
    }

    return null;
  }

  // SIGNAL 8: Momentum Thrust - NEW!
  getMomentumThrust() {
    if (this.aoHistory.length < 5) return null;

    const recent = this.aoHistory.slice(-5);
    const thrust = recent[4] - recent[0];
    const avgAO = this.aoHistory.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, this.aoHistory.length);
    const normalizedThrust = thrust / (Math.abs(avgAO) || 1);

    // Bullish thrust
    if (normalizedThrust > 0.5 && recent[0] < 0 && recent[4] > recent[0]) {
      return {
        type: 'bullish_thrust',
        direction: 'bullish',
        strength: 'strong',
        message: 'AO bullish thrust (rapid momentum increase)',
        metadata: { thrust, normalizedThrust, from: recent[0], to: recent[4] }
      };
    }

    // Bearish thrust
    if (normalizedThrust < -0.5 && recent[0] > 0 && recent[4] < recent[0]) {
      return {
        type: 'bearish_thrust',
        direction: 'bearish',
        strength: 'strong',
        message: 'AO bearish thrust (rapid momentum decrease)',
        metadata: { thrust, normalizedThrust, from: recent[0], to: recent[4] }
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

    // Priority: divergences, then patterns, then crosses
    const divergence = this.getDivergence();
    if (divergence) signals.push(divergence);

    const hiddenDivergence = this.getHiddenDivergence();
    if (hiddenDivergence) signals.push(hiddenDivergence);

    const twinPeaks = this.getTwinPeaks();
    if (twinPeaks) signals.push(twinPeaks);

    const zeroCross = this.getZeroLineCross();
    if (zeroCross) signals.push(zeroCross);

    const saucer = this.getSaucerPattern();
    if (saucer) signals.push(saucer);

    const aoac = this.getAOACAlignment();
    if (aoac) signals.push(aoac);

    const colorSeq = this.getColorSequence();
    if (colorSeq) signals.push(colorSeq);

    const thrust = this.getMomentumThrust();
    if (thrust) signals.push(thrust);

    return signals;
  }

  getResult() {
    return {
      value: this.currentAO,
      ac: this.currentAC,
      consecutiveGreen: this.consecutiveGreen,
      consecutiveRed: this.consecutiveRed,
      signals: this.currentAO !== null ? this.getSignals() : []
    };
  }

  reset() {
    this.fastWindow = [];
    this.slowWindow = [];
    this.fastSum = 0;
    this.slowSum = 0;
    this.currentAO = null;
    this.prevAO = null;
    this.aoWindow = [];
    this.aoSum = 0;
    this.currentAC = null;
    this.prevAC = null;
    this.aoHistory = [];
    this.acHistory = [];
    this.priceHistory = [];
    this.consecutiveGreen = 0;
    this.consecutiveRed = 0;
  }
}

module.exports = AwesomeOscillator;
