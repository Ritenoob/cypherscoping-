/**
 * On-Balance Volume (OBV) - ENHANCED V2 with Volume Analysis
 *
 * ENHANCEMENTS (2026-01-16):
 * - Hidden divergence detection (continuation signals)
 * - Volume momentum analysis (rate of volume accumulation)
 * - OBV trend line analysis
 * - Price/OBV confirmation signals
 * - Accumulation/distribution phase detection
 * - EMA smoothing for noise reduction
 * - Volume climax detection
 *
 * Signals: Slope, Breakout, Divergence, Hidden Div, Confirmation, Climax
 */

class OBVIndicator {
  constructor(config = {}) {
    this.slopeWindow = config.slopeWindow || 14;
    this.smoothingEma = config.smoothingEma || 5;
    this.zScoreCap = config.zScoreCap || 2.0;
    this.confirmTrend = config.confirmTrend !== false;

    this.currentOBV = 0;
    this.prevClose = null;

    // EMA smoothed OBV
    this.emaOBV = null;
    this.emaMultiplier = 2 / (this.smoothingEma + 1);

    this.obvHistory = [];
    this.emaOBVHistory = [];
    this.priceHistory = [];
    this.volumeHistory = [];
    this.slopeHistory = [];
    this.maxHistory = config.historyLength || 100;

    // For accumulation/distribution phases
    this.accumulationBars = 0;
    this.distributionBars = 0;
  }

  update(candle) {
    const { close, volume } = candle;

    if (this.prevClose !== null) {
      if (close > this.prevClose) {
        this.currentOBV += volume;
        this.accumulationBars++;
        this.distributionBars = 0;
      } else if (close < this.prevClose) {
        this.currentOBV -= volume;
        this.distributionBars++;
        this.accumulationBars = 0;
      } else {
        // Equal close - reset both
        this.accumulationBars = 0;
        this.distributionBars = 0;
      }
    }

    this.prevClose = close;

    // Calculate EMA of OBV for smoothing
    if (this.emaOBV === null) {
      this.emaOBV = this.currentOBV;
    } else {
      this.emaOBV = (this.currentOBV - this.emaOBV) * this.emaMultiplier + this.emaOBV;
    }

    this.obvHistory.push(this.currentOBV);
    this.emaOBVHistory.push(this.emaOBV);
    this.priceHistory.push(close);
    this.volumeHistory.push(volume);

    // Calculate slope
    if (this.obvHistory.length >= this.slopeWindow) {
      const recentOBV = this.obvHistory.slice(-this.slopeWindow);
      const slope = (recentOBV[recentOBV.length - 1] - recentOBV[0]) / this.slopeWindow;
      this.slopeHistory.push(slope);
    }

    if (this.obvHistory.length > this.maxHistory) {
      this.obvHistory.shift();
      this.emaOBVHistory.shift();
      this.priceHistory.shift();
      this.volumeHistory.shift();
    }
    if (this.slopeHistory.length > this.maxHistory) {
      this.slopeHistory.shift();
    }

    return this.getResult();
  }

  // SIGNAL 1: Slope Analysis (enhanced with trend confirmation)
  getSlopeSignal() {
    if (this.slopeHistory.length < 5) return null;

    const currentSlope = this.slopeHistory[this.slopeHistory.length - 1];
    const avgSlope = this.slopeHistory.reduce((a, b) => a + b, 0) / this.slopeHistory.length;
    const stdDev = Math.sqrt(
      this.slopeHistory.reduce((sum, s) => sum + Math.pow(s - avgSlope, 2), 0) / this.slopeHistory.length
    );

    const zScore = stdDev > 0 ? (currentSlope - avgSlope) / stdDev : 0;
    const cappedZScore = Math.max(-this.zScoreCap, Math.min(this.zScoreCap, zScore));

    // Check price trend alignment
    const priceRising = this.priceHistory.length >= 5 &&
      this.priceHistory[this.priceHistory.length - 1] > this.priceHistory[this.priceHistory.length - 5];
    const priceFalling = this.priceHistory.length >= 5 &&
      this.priceHistory[this.priceHistory.length - 1] < this.priceHistory[this.priceHistory.length - 5];

    if (cappedZScore > 1) {
      const confirmed = priceRising;
      return {
        type: 'bullish_obv_slope',
        direction: 'bullish',
        strength: confirmed ? 'very_strong' : (cappedZScore > 1.5 ? 'strong' : 'moderate'),
        message: `OBV slope strongly positive (z: ${cappedZScore.toFixed(2)})${confirmed ? ' - price confirms' : ''}`,
        metadata: { zScore: cappedZScore, slope: currentSlope, avgSlope, priceConfirms: confirmed }
      };
    }

    if (cappedZScore < -1) {
      const confirmed = priceFalling;
      return {
        type: 'bearish_obv_slope',
        direction: 'bearish',
        strength: confirmed ? 'very_strong' : (cappedZScore < -1.5 ? 'strong' : 'moderate'),
        message: `OBV slope strongly negative (z: ${cappedZScore.toFixed(2)})${confirmed ? ' - price confirms' : ''}`,
        metadata: { zScore: cappedZScore, slope: currentSlope, avgSlope, priceConfirms: confirmed }
      };
    }

    return null;
  }

  // SIGNAL 2: Breakout (enhanced)
  getBreakout() {
    if (this.obvHistory.length < 20) return null;

    const recent = this.obvHistory.slice(-20);
    const currentOBV = recent[recent.length - 1];
    const maxOBV = Math.max(...recent.slice(0, -1));
    const minOBV = Math.min(...recent.slice(0, -1));

    // OBV breakout to new highs
    if (currentOBV > maxOBV) {
      // Check volume confirmation
      const recentVol = this.volumeHistory.slice(-5);
      const avgVol = this.volumeHistory.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const volumeSpike = recentVol.some(v => v > avgVol * 1.5);

      return {
        type: 'bullish_obv_breakout',
        direction: 'bullish',
        strength: volumeSpike ? 'very_strong' : 'strong',
        message: `OBV new 20-period high${volumeSpike ? ' with volume spike' : ''}`,
        metadata: { currentOBV, maxOBV, minOBV, volumeSpike }
      };
    }

    // OBV breakdown to new lows
    if (currentOBV < minOBV) {
      const recentVol = this.volumeHistory.slice(-5);
      const avgVol = this.volumeHistory.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const volumeSpike = recentVol.some(v => v > avgVol * 1.5);

      return {
        type: 'bearish_obv_breakdown',
        direction: 'bearish',
        strength: volumeSpike ? 'very_strong' : 'strong',
        message: `OBV new 20-period low${volumeSpike ? ' with volume spike' : ''}`,
        metadata: { currentOBV, maxOBV, minOBV, volumeSpike }
      };
    }

    return null;
  }

  // SIGNAL 3: Regular Divergence (REVERSAL)
  getDivergence() {
    if (this.obvHistory.length < 20 || this.priceHistory.length < 20) {
      return null;
    }

    const recentOBV = this.obvHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);

    // Check for bullish divergence
    const priceLows = this.findSwingLows(recentPrices);
    const obvLows = this.findSwingLows(recentOBV);

    if (priceLows.length >= 2 && obvLows.length >= 2) {
      const lastPrice = recentPrices[priceLows[priceLows.length - 1]];
      const prevPrice = recentPrices[priceLows[priceLows.length - 2]];
      const lastOBV = recentOBV[obvLows[obvLows.length - 1]];
      const prevOBV = recentOBV[obvLows[obvLows.length - 2]];

      if (lastPrice < prevPrice && lastOBV > prevOBV) {
        return {
          type: 'bullish_divergence',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'Bullish OBV divergence (price lower low, OBV higher low)',
          metadata: { lastPrice, prevPrice, lastOBV, prevOBV }
        };
      }
    }

    // Check for bearish divergence
    const priceHighs = this.findSwingHighs(recentPrices);
    const obvHighs = this.findSwingHighs(recentOBV);

    if (priceHighs.length >= 2 && obvHighs.length >= 2) {
      const lastPrice = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPrice = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastOBV = recentOBV[obvHighs[obvHighs.length - 1]];
      const prevOBV = recentOBV[obvHighs[obvHighs.length - 2]];

      if (lastPrice > prevPrice && lastOBV < prevOBV) {
        return {
          type: 'bearish_divergence',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'Bearish OBV divergence (price higher high, OBV lower high)',
          metadata: { lastPrice, prevPrice, lastOBV, prevOBV }
        };
      }
    }

    return null;
  }

  // SIGNAL 4: Hidden Divergence (CONTINUATION) - NEW!
  getHiddenDivergence() {
    if (this.obvHistory.length < 20 || this.priceHistory.length < 20) return null;

    const recentOBV = this.obvHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);

    // Bullish hidden divergence
    const priceLows = this.findSwingLows(recentPrices);
    const obvLows = this.findSwingLows(recentOBV);

    if (priceLows.length >= 2 && obvLows.length >= 2) {
      const lastPrice = recentPrices[priceLows[priceLows.length - 1]];
      const prevPrice = recentPrices[priceLows[priceLows.length - 2]];
      const lastOBV = recentOBV[obvLows[obvLows.length - 1]];
      const prevOBV = recentOBV[obvLows[obvLows.length - 2]];

      // Price higher low, OBV lower low (smart money still accumulating)
      if (lastPrice > prevPrice && lastOBV < prevOBV) {
        return {
          type: 'bullish_hidden_divergence',
          direction: 'bullish',
          strength: 'strong',
          message: 'Bullish hidden divergence (smart money accumulating)',
          metadata: { lastPrice, prevPrice, lastOBV, prevOBV }
        };
      }
    }

    // Bearish hidden divergence
    const priceHighs = this.findSwingHighs(recentPrices);
    const obvHighs = this.findSwingHighs(recentOBV);

    if (priceHighs.length >= 2 && obvHighs.length >= 2) {
      const lastPrice = recentPrices[priceHighs[priceHighs.length - 1]];
      const prevPrice = recentPrices[priceHighs[priceHighs.length - 2]];
      const lastOBV = recentOBV[obvHighs[obvHighs.length - 1]];
      const prevOBV = recentOBV[obvHighs[obvHighs.length - 2]];

      // Price lower high, OBV higher high (smart money distributing)
      if (lastPrice < prevPrice && lastOBV > prevOBV) {
        return {
          type: 'bearish_hidden_divergence',
          direction: 'bearish',
          strength: 'strong',
          message: 'Bearish hidden divergence (smart money distributing)',
          metadata: { lastPrice, prevPrice, lastOBV, prevOBV }
        };
      }
    }

    return null;
  }

  // SIGNAL 5: Price/OBV Confirmation - NEW!
  getPriceOBVConfirmation() {
    if (this.priceHistory.length < 10 || this.obvHistory.length < 10) return null;

    const price5 = this.priceHistory.slice(-5);
    const obv5 = this.obvHistory.slice(-5);

    const priceUp = price5[4] > price5[0];
    const priceDown = price5[4] < price5[0];
    const obvUp = obv5[4] > obv5[0];
    const obvDown = obv5[4] < obv5[0];

    // Strong confirmation: both price and OBV moving in same direction
    if (priceUp && obvUp) {
      return {
        type: 'bullish_confirmation',
        direction: 'bullish',
        strength: 'strong',
        message: 'Price and OBV both rising (bullish confirmation)',
        metadata: { priceChange: price5[4] - price5[0], obvChange: obv5[4] - obv5[0] }
      };
    }

    if (priceDown && obvDown) {
      return {
        type: 'bearish_confirmation',
        direction: 'bearish',
        strength: 'strong',
        message: 'Price and OBV both falling (bearish confirmation)',
        metadata: { priceChange: price5[4] - price5[0], obvChange: obv5[4] - obv5[0] }
      };
    }

    // Non-confirmation (potential reversal warning)
    if (priceUp && obvDown) {
      return {
        type: 'bearish_non_confirmation',
        direction: 'bearish',
        strength: 'moderate',
        message: 'Price rising but OBV falling (bearish non-confirmation)',
        metadata: { priceChange: price5[4] - price5[0], obvChange: obv5[4] - obv5[0] }
      };
    }

    if (priceDown && obvUp) {
      return {
        type: 'bullish_non_confirmation',
        direction: 'bullish',
        strength: 'moderate',
        message: 'Price falling but OBV rising (bullish non-confirmation)',
        metadata: { priceChange: price5[4] - price5[0], obvChange: obv5[4] - obv5[0] }
      };
    }

    return null;
  }

  // SIGNAL 6: Volume Climax - NEW!
  getVolumeClimax() {
    if (this.volumeHistory.length < 20) return null;

    const recentVol = this.volumeHistory.slice(-5);
    const avgVol = this.volumeHistory.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const currentVol = recentVol[recentVol.length - 1];

    // Extreme volume spike (2.5x average)
    if (currentVol > avgVol * 2.5) {
      const priceUp = this.priceHistory[this.priceHistory.length - 1] > this.priceHistory[this.priceHistory.length - 2];

      return {
        type: priceUp ? 'bullish_climax' : 'bearish_climax',
        direction: priceUp ? 'bullish' : 'bearish',
        strength: 'strong',
        message: `Volume climax detected (${(currentVol / avgVol).toFixed(1)}x average)`,
        metadata: { currentVol, avgVol, ratio: currentVol / avgVol }
      };
    }

    return null;
  }

  // SIGNAL 7: Accumulation/Distribution Phase - NEW!
  getAccDistPhase() {
    // 5+ consecutive accumulation or distribution bars
    if (this.accumulationBars >= 5) {
      return {
        type: 'accumulation_phase',
        direction: 'bullish',
        strength: this.accumulationBars >= 8 ? 'strong' : 'moderate',
        message: `Accumulation phase (${this.accumulationBars} consecutive up-volume bars)`,
        metadata: { consecutiveBars: this.accumulationBars }
      };
    }

    if (this.distributionBars >= 5) {
      return {
        type: 'distribution_phase',
        direction: 'bearish',
        strength: this.distributionBars >= 8 ? 'strong' : 'moderate',
        message: `Distribution phase (${this.distributionBars} consecutive down-volume bars)`,
        metadata: { consecutiveBars: this.distributionBars }
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

    // Priority: divergences first
    const divergence = this.getDivergence();
    if (divergence) signals.push(divergence);

    const hiddenDivergence = this.getHiddenDivergence();
    if (hiddenDivergence) signals.push(hiddenDivergence);

    const breakout = this.getBreakout();
    if (breakout) signals.push(breakout);

    const climax = this.getVolumeClimax();
    if (climax) signals.push(climax);

    const slope = this.getSlopeSignal();
    if (slope) signals.push(slope);

    const confirmation = this.getPriceOBVConfirmation();
    if (confirmation) signals.push(confirmation);

    const accDist = this.getAccDistPhase();
    if (accDist) signals.push(accDist);

    return signals;
  }

  getResult() {
    const currentSlope = this.slopeHistory.length > 0
      ? this.slopeHistory[this.slopeHistory.length - 1]
      : 0;

    const avgSlope = this.slopeHistory.length > 0
      ? this.slopeHistory.reduce((a, b) => a + b, 0) / this.slopeHistory.length
      : 0;

    const stdDev = this.slopeHistory.length > 0
      ? Math.sqrt(this.slopeHistory.reduce((sum, s) => sum + Math.pow(s - avgSlope, 2), 0) / this.slopeHistory.length)
      : 1;

    const zScore = stdDev > 0 ? (currentSlope - avgSlope) / stdDev : 0;

    return {
      value: {
        obv: this.currentOBV,
        emaOBV: this.emaOBV,
        slope: currentSlope,
        zScore: Math.max(-this.zScoreCap, Math.min(this.zScoreCap, zScore)),
        accumulationBars: this.accumulationBars,
        distributionBars: this.distributionBars
      },
      signals: this.obvHistory.length >= this.slopeWindow ? this.getSignals() : []
    };
  }

  reset() {
    this.currentOBV = 0;
    this.prevClose = null;
    this.emaOBV = null;
    this.obvHistory = [];
    this.emaOBVHistory = [];
    this.priceHistory = [];
    this.volumeHistory = [];
    this.slopeHistory = [];
    this.accumulationBars = 0;
    this.distributionBars = 0;
  }
}

module.exports = OBVIndicator;
