/**
 * Williams %R - ENHANCED V2 with Advanced Signal Detection
 *
 * ENHANCEMENTS (2026-01-16):
 * - Hidden divergence detection (continuation signals)
 * - Momentum thrust detection
 * - Multiple timeframe-like analysis (fast vs slow)
 * - Trend filter integration
 * - Hook patterns detection
 * - Zone persistence analysis
 *
 * Signals: Crossovers, Failure Swings, Divergence, Hidden Divergence, Zone, Thrust, Hook
 */

class WilliamsRIndicator {
  constructor(config = {}) {
    this.period = config.period || 14;
    this.oversoldLevel = config.oversold || -80;
    this.overboughtLevel = config.overbought || -20;

    // Fast %R for timing (optional)
    this.fastPeriod = config.fastPeriod || 7;

    this.highs = [];
    this.lows = [];
    this.closes = [];

    // Fast %R state
    this.fastHighs = [];
    this.fastLows = [];

    this.currentValue = null;
    this.prevValue = null;
    this.fastValue = null;
    this.prevFastValue = null;

    this.wrHistory = [];
    this.priceHistory = [];
    this.maxHistory = config.historyLength || 100;

    // Zone persistence tracking
    this.oversoldBars = 0;
    this.overboughtBars = 0;
  }

  update(candle) {
    const { high, low, close } = candle;

    this.prevValue = this.currentValue;
    this.prevFastValue = this.fastValue;

    this.highs.push(high);
    this.lows.push(low);
    this.closes.push(close);

    if (this.highs.length > this.period) {
      this.highs.shift();
      this.lows.shift();
      this.closes.shift();
    }

    // Fast %R data
    this.fastHighs.push(high);
    this.fastLows.push(low);
    if (this.fastHighs.length > this.fastPeriod) {
      this.fastHighs.shift();
      this.fastLows.shift();
    }

    if (this.highs.length < this.period) {
      return this.getResult();
    }

    // Calculate standard Williams %R
    const highestHigh = Math.max(...this.highs);
    const lowestLow = Math.min(...this.lows);
    const range = highestHigh - lowestLow;

    this.currentValue = range === 0 ? -50 : ((highestHigh - close) / range) * -100;

    // Calculate fast %R
    if (this.fastHighs.length >= this.fastPeriod) {
      const fastHH = Math.max(...this.fastHighs);
      const fastLL = Math.min(...this.fastLows);
      const fastRange = fastHH - fastLL;
      this.fastValue = fastRange === 0 ? -50 : ((fastHH - close) / fastRange) * -100;
    }

    // Track zone persistence
    if (this.currentValue < this.oversoldLevel) {
      this.oversoldBars++;
      this.overboughtBars = 0;
    } else if (this.currentValue > this.overboughtLevel) {
      this.overboughtBars++;
      this.oversoldBars = 0;
    } else {
      this.oversoldBars = 0;
      this.overboughtBars = 0;
    }

    this.wrHistory.push(this.currentValue);
    this.priceHistory.push(close);

    if (this.wrHistory.length > this.maxHistory) {
      this.wrHistory.shift();
      this.priceHistory.shift();
    }

    return this.getResult();
  }

  // SIGNAL 1: Zone Crossover (enhanced)
  getCrossover() {
    if (this.prevValue === null || this.currentValue === null) return null;

    // Bullish: %R crosses above oversold
    if (this.prevValue <= this.oversoldLevel && this.currentValue > this.oversoldLevel) {
      const strength = this.oversoldBars > 3 ? 'very_strong' : 'strong';
      return {
        type: 'bullish_crossover',
        direction: 'bullish',
        strength,
        message: `Williams %R crossed above ${this.oversoldLevel} (oversold reversal after ${this.oversoldBars} bars)`,
        metadata: { from: this.prevValue, to: this.currentValue, barsInZone: this.oversoldBars }
      };
    }

    // Bearish: %R crosses below overbought
    if (this.prevValue >= this.overboughtLevel && this.currentValue < this.overboughtLevel) {
      const strength = this.overboughtBars > 3 ? 'very_strong' : 'strong';
      return {
        type: 'bearish_crossover',
        direction: 'bearish',
        strength,
        message: `Williams %R crossed below ${this.overboughtLevel} (overbought reversal after ${this.overboughtBars} bars)`,
        metadata: { from: this.prevValue, to: this.currentValue, barsInZone: this.overboughtBars }
      };
    }

    return null;
  }

  // SIGNAL 2: Failure Swing (enhanced)
  getFailureSwing() {
    if (this.wrHistory.length < 10) return null;

    const recent = this.wrHistory.slice(-10);
    const priceRecent = this.priceHistory.slice(-10);

    // Find swing points
    const highs = this.findSwingHighs(recent);
    const lows = this.findSwingLows(recent);

    // Bullish failure swing
    if (lows.length >= 2) {
      const low1 = recent[lows[lows.length - 2]];
      const low2 = recent[lows[lows.length - 1]];

      // First dip below oversold, second dip higher (failure to reach new low)
      if (low1 < this.oversoldLevel && low2 > low1 && this.currentValue > Math.max(recent[lows[lows.length - 1] + 1] || -50, -50)) {
        return {
          type: 'bullish_failure_swing',
          direction: 'bullish',
          strength: 'strong',
          message: 'Bullish failure swing (higher low in oversold)',
          metadata: { low1, low2, currentValue: this.currentValue }
        };
      }
    }

    // Bearish failure swing
    if (highs.length >= 2) {
      const high1 = recent[highs[highs.length - 2]];
      const high2 = recent[highs[highs.length - 1]];

      // First peak above overbought, second peak lower (failure to reach new high)
      if (high1 > this.overboughtLevel && high2 < high1 && this.currentValue < Math.min(recent[highs[highs.length - 1] + 1] || -50, -50)) {
        return {
          type: 'bearish_failure_swing',
          direction: 'bearish',
          strength: 'strong',
          message: 'Bearish failure swing (lower high in overbought)',
          metadata: { high1, high2, currentValue: this.currentValue }
        };
      }
    }

    return null;
  }

  // SIGNAL 3: Regular Divergence (REVERSAL)
  getDivergence() {
    if (this.wrHistory.length < 20) return null;

    const recentWR = this.wrHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);

    const priceLows = this.findSwingLows(recentPrices);
    const wrLows = this.findSwingLows(recentWR);

    if (priceLows.length >= 2 && wrLows.length >= 2) {
      const lastPrice = recentPrices[priceLows[priceLows.length - 1]];
      const prevPrice = recentPrices[priceLows[priceLows.length - 2]];
      const lastWR = recentWR[wrLows[wrLows.length - 1]];
      const prevWR = recentWR[wrLows[wrLows.length - 2]];

      // Bullish divergence: price lower low, %R higher low
      if (lastPrice < prevPrice && lastWR > prevWR) {
        return {
          type: 'bullish_divergence',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'Bullish divergence (price lower low, %R higher low)',
          metadata: { lastPrice, prevPrice, lastWR, prevWR }
        };
      }
    }

    const priceHighs = this.findSwingHighs(recentPrices);
    const wrHighs = this.findSwingHighs(recentWR);

    if (priceHighs.length >= 2 && wrHighs.length >= 2) {
      const lastPrice = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPrice = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastWR = recentWR[wrHighs[wrHighs.length - 1]];
      const prevWR = recentWR[wrHighs[wrHighs.length - 2]];

      // Bearish divergence: price higher high, %R lower high
      if (lastPrice > prevPrice && lastWR < prevWR) {
        return {
          type: 'bearish_divergence',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'Bearish divergence (price higher high, %R lower high)',
          metadata: { lastPrice, prevPrice, lastWR, prevWR }
        };
      }
    }

    return null;
  }

  // SIGNAL 4: Hidden Divergence (CONTINUATION) - NEW!
  getHiddenDivergence() {
    if (this.wrHistory.length < 20) return null;

    const recentWR = this.wrHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);

    // Bullish hidden divergence
    const priceLows = this.findSwingLows(recentPrices);
    const wrLows = this.findSwingLows(recentWR);

    if (priceLows.length >= 2 && wrLows.length >= 2) {
      const lastPrice = recentPrices[priceLows[priceLows.length - 1]];
      const prevPrice = recentPrices[priceLows[priceLows.length - 2]];
      const lastWR = recentWR[wrLows[wrLows.length - 1]];
      const prevWR = recentWR[wrLows[wrLows.length - 2]];

      // Price higher low, %R lower low (continuation in uptrend)
      if (lastPrice > prevPrice && lastWR < prevWR && this.currentValue > -60) {
        return {
          type: 'bullish_hidden_divergence',
          direction: 'bullish',
          strength: 'strong',
          message: 'Bullish hidden divergence (uptrend continuation)',
          metadata: { lastPrice, prevPrice, lastWR, prevWR }
        };
      }
    }

    // Bearish hidden divergence
    const priceHighs = this.findSwingHighs(recentPrices);
    const wrHighs = this.findSwingHighs(recentWR);

    if (priceHighs.length >= 2 && wrHighs.length >= 2) {
      const lastPrice = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPrice = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastWR = recentWR[wrHighs[wrHighs.length - 1]];
      const prevWR = recentWR[wrHighs[wrHighs.length - 2]];

      // Price lower high, %R higher high (continuation in downtrend)
      if (lastPrice < prevPrice && lastWR > prevWR && this.currentValue < -40) {
        return {
          type: 'bearish_hidden_divergence',
          direction: 'bearish',
          strength: 'strong',
          message: 'Bearish hidden divergence (downtrend continuation)',
          metadata: { lastPrice, prevPrice, lastWR, prevWR }
        };
      }
    }

    return null;
  }

  // SIGNAL 5: Zone Analysis (enhanced with persistence)
  getZone() {
    if (this.currentValue === null) return null;

    if (this.currentValue < this.oversoldLevel) {
      // Extreme oversold with persistence is stronger
      const isExtreme = this.currentValue < -90;
      const isPersistent = this.oversoldBars >= 3;
      return {
        type: 'oversold_zone',
        direction: 'bullish',
        strength: isExtreme ? 'extreme' : (isPersistent ? 'strong' : 'moderate'),
        message: `Williams %R oversold (${this.currentValue.toFixed(1)}) for ${this.oversoldBars} bars`,
        metadata: { value: this.currentValue, threshold: this.oversoldLevel, barsInZone: this.oversoldBars }
      };
    }

    if (this.currentValue > this.overboughtLevel) {
      const isExtreme = this.currentValue > -10;
      const isPersistent = this.overboughtBars >= 3;
      return {
        type: 'overbought_zone',
        direction: 'bearish',
        strength: isExtreme ? 'extreme' : (isPersistent ? 'strong' : 'moderate'),
        message: `Williams %R overbought (${this.currentValue.toFixed(1)}) for ${this.overboughtBars} bars`,
        metadata: { value: this.currentValue, threshold: this.overboughtLevel, barsInZone: this.overboughtBars }
      };
    }

    return null;
  }

  // SIGNAL 6: Momentum Thrust - NEW!
  getMomentumThrust() {
    if (this.wrHistory.length < 5) return null;

    const recent = this.wrHistory.slice(-5);
    const thrust = recent[4] - recent[0];

    // Bullish thrust: rapid move from oversold toward overbought
    if (thrust > 30 && recent[0] < -70) {
      return {
        type: 'bullish_thrust',
        direction: 'bullish',
        strength: 'strong',
        message: `Williams %R bullish thrust (${thrust.toFixed(1)} points in 5 bars)`,
        metadata: { thrust, from: recent[0], to: recent[4] }
      };
    }

    // Bearish thrust: rapid move from overbought toward oversold
    if (thrust < -30 && recent[0] > -30) {
      return {
        type: 'bearish_thrust',
        direction: 'bearish',
        strength: 'strong',
        message: `Williams %R bearish thrust (${Math.abs(thrust).toFixed(1)} points in 5 bars)`,
        metadata: { thrust, from: recent[0], to: recent[4] }
      };
    }

    return null;
  }

  // SIGNAL 7: Hook Pattern - NEW!
  getHookPattern() {
    if (this.wrHistory.length < 4) return null;

    const recent = this.wrHistory.slice(-4);

    // Bullish hook: %R was falling, now turning up in oversold
    if (recent[0] > recent[1] && recent[1] > recent[2] && recent[3] > recent[2] && recent[2] < this.oversoldLevel) {
      return {
        type: 'bullish_hook',
        direction: 'bullish',
        strength: 'moderate',
        message: 'Williams %R bullish hook in oversold zone',
        metadata: { values: recent, hookPoint: recent[2] }
      };
    }

    // Bearish hook: %R was rising, now turning down in overbought
    if (recent[0] < recent[1] && recent[1] < recent[2] && recent[3] < recent[2] && recent[2] > this.overboughtLevel) {
      return {
        type: 'bearish_hook',
        direction: 'bearish',
        strength: 'moderate',
        message: 'Williams %R bearish hook in overbought zone',
        metadata: { values: recent, hookPoint: recent[2] }
      };
    }

    return null;
  }

  // SIGNAL 8: Fast/Slow %R Crossover - NEW!
  getFastSlowCrossover() {
    if (this.fastValue === null || this.prevFastValue === null) return null;
    if (this.currentValue === null || this.prevValue === null) return null;

    // Bullish: fast crosses above slow in oversold
    if (this.prevFastValue <= this.prevValue && this.fastValue > this.currentValue && this.currentValue < -50) {
      return {
        type: 'bullish_fast_slow_cross',
        direction: 'bullish',
        strength: 'moderate',
        message: 'Fast %R crossed above Slow %R (bullish momentum shift)',
        metadata: { fast: this.fastValue, slow: this.currentValue }
      };
    }

    // Bearish: fast crosses below slow in overbought
    if (this.prevFastValue >= this.prevValue && this.fastValue < this.currentValue && this.currentValue > -50) {
      return {
        type: 'bearish_fast_slow_cross',
        direction: 'bearish',
        strength: 'moderate',
        message: 'Fast %R crossed below Slow %R (bearish momentum shift)',
        metadata: { fast: this.fastValue, slow: this.currentValue }
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

    // Priority order: divergences first, then crossovers, then zones
    const divergence = this.getDivergence();
    if (divergence) signals.push(divergence);

    const hiddenDivergence = this.getHiddenDivergence();
    if (hiddenDivergence) signals.push(hiddenDivergence);

    const failureSwing = this.getFailureSwing();
    if (failureSwing) signals.push(failureSwing);

    const crossover = this.getCrossover();
    if (crossover) signals.push(crossover);

    const thrust = this.getMomentumThrust();
    if (thrust) signals.push(thrust);

    const hook = this.getHookPattern();
    if (hook) signals.push(hook);

    const fastSlow = this.getFastSlowCrossover();
    if (fastSlow) signals.push(fastSlow);

    const zone = this.getZone();
    if (zone) signals.push(zone);

    return signals;
  }

  getResult() {
    return {
      value: this.currentValue,
      fastValue: this.fastValue,
      oversoldBars: this.oversoldBars,
      overboughtBars: this.overboughtBars,
      signals: this.currentValue !== null ? this.getSignals() : []
    };
  }

  reset() {
    this.highs = [];
    this.lows = [];
    this.closes = [];
    this.fastHighs = [];
    this.fastLows = [];
    this.currentValue = null;
    this.prevValue = null;
    this.fastValue = null;
    this.prevFastValue = null;
    this.wrHistory = [];
    this.priceHistory = [];
    this.oversoldBars = 0;
    this.overboughtBars = 0;
  }
}

module.exports = WilliamsRIndicator;
