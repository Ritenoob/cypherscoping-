/**
 * ADX Indicator - ENHANCED V2 with Trend Quality Analysis
 *
 * ENHANCEMENTS (2026-01-16):
 * - DI crossover with ADX confirmation
 * - ADX turning point detection (trend exhaustion)
 * - Trend quality scoring
 * - Hook reversal patterns
 * - ADX slope analysis for trend acceleration
 * - Regime change detection
 *
 * KEY: ADX > 25 = Strong Trend (use trend strategy)
 *      ADX <= 25 = Ranging Market (use range strategy)
 */

class ADXIndicator {
  constructor(config = {}) {
    this.period = config.period || 14;
    this.trendThreshold = config.trendThreshold || 25;
    this.strongTrendThreshold = config.strongTrendThreshold || 40;

    // History buffers
    this.highHistory = [];
    this.lowHistory = [];
    this.closeHistory = [];
    this.trHistory = [];
    this.plusDMHistory = [];
    this.minusDMHistory = [];

    // Smoothed values
    this.smoothedTR = null;
    this.smoothedPlusDM = null;
    this.smoothedMinusDM = null;
    this.smoothedDX = null;

    // Current values
    this.currentADX = null;
    this.currentPlusDI = null;
    this.currentMinusDI = null;
    this.prevADX = null;
    this.prevPlusDI = null;
    this.prevMinusDI = null;

    this.adxHistory = [];
    this.plusDIHistory = [];
    this.minusDIHistory = [];
    this.maxHistory = config.historyLength || 100;
    this.candleCount = 0;

    // For regime tracking
    this.prevRegime = null;
  }

  update(candle) {
    const { high, low, close } = candle;

    this.candleCount++;
    this.prevADX = this.currentADX;
    this.prevPlusDI = this.currentPlusDI;
    this.prevMinusDI = this.currentMinusDI;

    // Store history
    this.highHistory.push(high);
    this.lowHistory.push(low);
    this.closeHistory.push(close);

    if (this.highHistory.length > this.period + 10) {
      this.highHistory.shift();
      this.lowHistory.shift();
      this.closeHistory.shift();
    }

    if (this.highHistory.length < 2) {
      return this.getResult();
    }

    const prevHigh = this.highHistory[this.highHistory.length - 2];
    const prevLow = this.lowHistory[this.lowHistory.length - 2];
    const prevClose = this.closeHistory[this.closeHistory.length - 2];

    // Calculate True Range
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    // Calculate Directional Movement
    const plusDM = high - prevHigh > prevLow - low && high - prevHigh > 0 ? high - prevHigh : 0;
    const minusDM = prevLow - low > high - prevHigh && prevLow - low > 0 ? prevLow - low : 0;

    this.trHistory.push(tr);
    this.plusDMHistory.push(plusDM);
    this.minusDMHistory.push(minusDM);

    if (this.trHistory.length > this.period) {
      this.trHistory.shift();
      this.plusDMHistory.shift();
      this.minusDMHistory.shift();
    }

    // Need enough data to calculate
    if (this.trHistory.length < this.period) {
      return this.getResult();
    }

    // First calculation: Simple average
    if (this.smoothedTR === null) {
      this.smoothedTR = this.trHistory.reduce((a, b) => a + b, 0);
      this.smoothedPlusDM = this.plusDMHistory.reduce((a, b) => a + b, 0);
      this.smoothedMinusDM = this.minusDMHistory.reduce((a, b) => a + b, 0);
    } else {
      // Wilder smoothing: (previous * (period-1) + current) / period
      this.smoothedTR = this.smoothedTR - (this.smoothedTR / this.period) + tr;
      this.smoothedPlusDM = this.smoothedPlusDM - (this.smoothedPlusDM / this.period) + plusDM;
      this.smoothedMinusDM = this.smoothedMinusDM - (this.smoothedMinusDM / this.period) + minusDM;
    }

    // Calculate +DI and -DI
    if (this.smoothedTR !== 0) {
      this.currentPlusDI = (this.smoothedPlusDM / this.smoothedTR) * 100;
      this.currentMinusDI = (this.smoothedMinusDM / this.smoothedTR) * 100;
    }

    // Calculate DX
    const diSum = this.currentPlusDI + this.currentMinusDI;
    const diDiff = Math.abs(this.currentPlusDI - this.currentMinusDI);
    const dx = diSum !== 0 ? (diDiff / diSum) * 100 : 0;

    // Smooth DX to get ADX
    if (this.smoothedDX === null) {
      this.smoothedDX = dx;
      this.currentADX = dx;
    } else {
      this.currentADX = ((this.smoothedDX * (this.period - 1)) + dx) / this.period;
      this.smoothedDX = this.currentADX;
    }

    // Store history
    this.adxHistory.push(this.currentADX);
    if (this.currentPlusDI !== null) this.plusDIHistory.push(this.currentPlusDI);
    if (this.currentMinusDI !== null) this.minusDIHistory.push(this.currentMinusDI);

    if (this.adxHistory.length > this.maxHistory) {
      this.adxHistory.shift();
      this.plusDIHistory.shift();
      this.minusDIHistory.shift();
    }

    return this.getResult();
  }

  // SIGNAL 1: Market Regime Detection
  getRegime() {
    if (this.currentADX === null) return null;

    let regime;
    if (this.currentADX >= this.strongTrendThreshold) {
      regime = {
        type: 'strong_trend',
        mode: 'trend',
        strength: 'very_strong',
        message: `Strong trend detected (ADX: ${this.currentADX.toFixed(1)})`,
        metadata: { adx: this.currentADX, threshold: this.strongTrendThreshold }
      };
    } else if (this.currentADX >= this.trendThreshold) {
      regime = {
        type: 'trend',
        mode: 'trend',
        strength: 'strong',
        message: `Trending market (ADX: ${this.currentADX.toFixed(1)})`,
        metadata: { adx: this.currentADX, threshold: this.trendThreshold }
      };
    } else {
      regime = {
        type: 'range',
        mode: 'range',
        strength: 'moderate',
        message: `Ranging/sideways market (ADX: ${this.currentADX.toFixed(1)})`,
        metadata: { adx: this.currentADX, threshold: this.trendThreshold }
      };
    }

    // Only return if in trend mode
    if (regime.mode === 'trend') {
      return regime;
    }
    return null;
  }

  // SIGNAL 2: Trend Direction
  getTrendDirection() {
    if (this.currentPlusDI === null || this.currentMinusDI === null) return null;
    if (this.currentADX < this.trendThreshold) return null;

    if (this.currentPlusDI > this.currentMinusDI) {
      return {
        type: 'bullish_adx_trend',
        direction: 'bullish',
        strength: this.currentADX >= this.strongTrendThreshold ? 'very_strong' : 'strong',
        message: `Bullish trend (+DI: ${this.currentPlusDI.toFixed(1)} > -DI: ${this.currentMinusDI.toFixed(1)})`,
        metadata: { plusDI: this.currentPlusDI, minusDI: this.currentMinusDI, adx: this.currentADX }
      };
    }

    if (this.currentMinusDI > this.currentPlusDI) {
      return {
        type: 'bearish_adx_trend',
        direction: 'bearish',
        strength: this.currentADX >= this.strongTrendThreshold ? 'very_strong' : 'strong',
        message: `Bearish trend (-DI: ${this.currentMinusDI.toFixed(1)} > +DI: ${this.currentPlusDI.toFixed(1)})`,
        metadata: { plusDI: this.currentPlusDI, minusDI: this.currentMinusDI, adx: this.currentADX }
      };
    }

    return null;
  }

  // SIGNAL 3: DI Crossover (enhanced with ADX confirmation)
  getDICrossover() {
    if (this.prevPlusDI === null || this.prevMinusDI === null) return null;
    if (this.currentPlusDI === null || this.currentMinusDI === null) return null;

    // Bullish DI crossover: +DI crosses above -DI
    if (this.prevPlusDI <= this.prevMinusDI && this.currentPlusDI > this.currentMinusDI) {
      const adxConfirm = this.currentADX >= this.trendThreshold;
      const adxRising = this.adxHistory.length >= 3 &&
        this.adxHistory[this.adxHistory.length - 1] > this.adxHistory[this.adxHistory.length - 3];

      return {
        type: 'bullish_di_crossover',
        direction: 'bullish',
        strength: (adxConfirm && adxRising) ? 'very_strong' : (adxConfirm ? 'strong' : 'moderate'),
        message: `+DI crossed above -DI${adxConfirm ? ' (ADX confirms)' : ''}${adxRising ? ' (ADX rising)' : ''}`,
        metadata: { plusDI: this.currentPlusDI, minusDI: this.currentMinusDI, adx: this.currentADX, adxConfirm, adxRising }
      };
    }

    // Bearish DI crossover: -DI crosses above +DI
    if (this.prevMinusDI <= this.prevPlusDI && this.currentMinusDI > this.currentPlusDI) {
      const adxConfirm = this.currentADX >= this.trendThreshold;
      const adxRising = this.adxHistory.length >= 3 &&
        this.adxHistory[this.adxHistory.length - 1] > this.adxHistory[this.adxHistory.length - 3];

      return {
        type: 'bearish_di_crossover',
        direction: 'bearish',
        strength: (adxConfirm && adxRising) ? 'very_strong' : (adxConfirm ? 'strong' : 'moderate'),
        message: `-DI crossed above +DI${adxConfirm ? ' (ADX confirms)' : ''}${adxRising ? ' (ADX rising)' : ''}`,
        metadata: { plusDI: this.currentPlusDI, minusDI: this.currentMinusDI, adx: this.currentADX, adxConfirm, adxRising }
      };
    }

    return null;
  }

  // SIGNAL 4: ADX Strengthening/Weakening
  getADXStrengthening() {
    if (this.adxHistory.length < 5) return null;

    const recent = this.adxHistory.slice(-5);
    const slope = (recent[4] - recent[0]) / 4;

    // ADX rising while above threshold = strengthening trend
    if (slope > 1.5 && this.currentADX >= this.trendThreshold) {
      const direction = this.currentPlusDI > this.currentMinusDI ? 'bullish' : 'bearish';
      return {
        type: `${direction}_adx_strengthening`,
        direction: direction,
        strength: 'strong',
        message: `Trend strengthening (ADX slope: +${slope.toFixed(1)})`,
        metadata: { slope, adx: this.currentADX, direction }
      };
    }

    // ADX falling while still in trend = weakening trend (potential reversal)
    if (slope < -1.5 && this.currentADX >= this.trendThreshold) {
      const direction = this.currentPlusDI > this.currentMinusDI ? 'bearish' : 'bullish';
      return {
        type: `trend_weakening`,
        direction: direction,
        strength: 'moderate',
        message: `Trend weakening (ADX slope: ${slope.toFixed(1)}) - potential reversal`,
        metadata: { slope, adx: this.currentADX }
      };
    }

    return null;
  }

  // SIGNAL 5: ADX Turning Point Detection - NEW!
  getADXTurningPoint() {
    if (this.adxHistory.length < 6) return null;

    const recent = this.adxHistory.slice(-6);

    // ADX peaked and now falling (trend exhaustion)
    if (recent[2] > recent[0] && recent[2] > recent[1] &&
        recent[2] > recent[3] && recent[2] > recent[4] &&
        recent[2] > this.strongTrendThreshold) {
      const direction = this.currentPlusDI > this.currentMinusDI ? 'bearish' : 'bullish';
      return {
        type: 'adx_peak_reversal',
        direction: direction,
        strength: 'moderate',
        message: `ADX peaked and falling (trend exhaustion warning)`,
        metadata: { peak: recent[2], current: this.currentADX }
      };
    }

    // ADX bottomed and now rising (new trend starting)
    if (recent[2] < recent[0] && recent[2] < recent[1] &&
        recent[2] < recent[3] && recent[2] < recent[4] &&
        recent[2] < this.trendThreshold && this.currentADX > recent[2]) {
      const direction = this.currentPlusDI > this.currentMinusDI ? 'bullish' : 'bearish';
      return {
        type: 'adx_bottom_reversal',
        direction: direction,
        strength: 'moderate',
        message: `ADX bottomed and rising (new trend emerging)`,
        metadata: { bottom: recent[2], current: this.currentADX, direction }
      };
    }

    return null;
  }

  // SIGNAL 6: Regime Change Detection - NEW!
  getRegimeChange() {
    if (this.prevADX === null) return null;

    const currentRegime = this.currentADX >= this.trendThreshold ? 'trend' : 'range';

    // Transition from range to trend
    if (this.prevADX < this.trendThreshold && this.currentADX >= this.trendThreshold) {
      const direction = this.currentPlusDI > this.currentMinusDI ? 'bullish' : 'bearish';
      return {
        type: 'regime_to_trend',
        direction: direction,
        strength: 'strong',
        message: `Market shifted from ranging to trending (${direction})`,
        metadata: { prevADX: this.prevADX, currentADX: this.currentADX, direction }
      };
    }

    // Transition from trend to range
    if (this.prevADX >= this.trendThreshold && this.currentADX < this.trendThreshold) {
      return {
        type: 'regime_to_range',
        direction: 'neutral',
        strength: 'moderate',
        message: 'Market shifted from trending to ranging (avoid trend strategies)',
        metadata: { prevADX: this.prevADX, currentADX: this.currentADX }
      };
    }

    return null;
  }

  // SIGNAL 7: DI Separation (Trend Quality) - NEW!
  getDISeparation() {
    if (this.currentPlusDI === null || this.currentMinusDI === null) return null;
    if (this.currentADX < this.trendThreshold) return null;

    const separation = Math.abs(this.currentPlusDI - this.currentMinusDI);

    // Very wide DI separation = high quality trend
    if (separation > 20 && this.currentADX >= this.trendThreshold) {
      const direction = this.currentPlusDI > this.currentMinusDI ? 'bullish' : 'bearish';
      return {
        type: `${direction}_strong_separation`,
        direction: direction,
        strength: 'strong',
        message: `Strong DI separation (${separation.toFixed(1)}) - high quality ${direction} trend`,
        metadata: { plusDI: this.currentPlusDI, minusDI: this.currentMinusDI, separation, adx: this.currentADX }
      };
    }

    return null;
  }

  // SIGNAL 8: ADX Hook Pattern - NEW!
  getADXHook() {
    if (this.adxHistory.length < 4) return null;

    const recent = this.adxHistory.slice(-4);

    // Bullish ADX hook: ADX was falling, now turning up below threshold
    if (recent[0] > recent[1] && recent[1] > recent[2] && recent[3] > recent[2] &&
        recent[2] < this.trendThreshold && this.currentPlusDI > this.currentMinusDI) {
      return {
        type: 'bullish_adx_hook',
        direction: 'bullish',
        strength: 'moderate',
        message: 'ADX hook turning up (potential new bullish trend)',
        metadata: { values: recent, hookPoint: recent[2] }
      };
    }

    // Bearish ADX hook: ADX was falling, now turning up below threshold
    if (recent[0] > recent[1] && recent[1] > recent[2] && recent[3] > recent[2] &&
        recent[2] < this.trendThreshold && this.currentMinusDI > this.currentPlusDI) {
      return {
        type: 'bearish_adx_hook',
        direction: 'bearish',
        strength: 'moderate',
        message: 'ADX hook turning up (potential new bearish trend)',
        metadata: { values: recent, hookPoint: recent[2] }
      };
    }

    return null;
  }

  getSignals() {
    const signals = [];

    const regime = this.getRegime();
    if (regime) signals.push(regime);

    const regimeChange = this.getRegimeChange();
    if (regimeChange) signals.push(regimeChange);

    const diCross = this.getDICrossover();
    if (diCross) signals.push(diCross);

    const trendDir = this.getTrendDirection();
    if (trendDir) signals.push(trendDir);

    const strengthening = this.getADXStrengthening();
    if (strengthening) signals.push(strengthening);

    const turningPoint = this.getADXTurningPoint();
    if (turningPoint) signals.push(turningPoint);

    const separation = this.getDISeparation();
    if (separation) signals.push(separation);

    const hook = this.getADXHook();
    if (hook) signals.push(hook);

    return signals;
  }

  getResult() {
    const regime = this.getRegime();

    return {
      value: {
        adx: this.currentADX,
        plusDI: this.currentPlusDI,
        minusDI: this.currentMinusDI,
        diSeparation: this.currentPlusDI && this.currentMinusDI ?
          Math.abs(this.currentPlusDI - this.currentMinusDI) : null,
        regime: regime ? regime.mode : (this.currentADX < this.trendThreshold ? 'range' : null),
        isTrending: this.currentADX >= this.trendThreshold,
        trendStrength: this.currentADX
      },
      signals: this.currentADX !== null ? this.getSignals() : []
    };
  }

  reset() {
    this.highHistory = [];
    this.lowHistory = [];
    this.closeHistory = [];
    this.trHistory = [];
    this.plusDMHistory = [];
    this.minusDMHistory = [];
    this.smoothedTR = null;
    this.smoothedPlusDM = null;
    this.smoothedMinusDM = null;
    this.smoothedDX = null;
    this.currentADX = null;
    this.currentPlusDI = null;
    this.currentMinusDI = null;
    this.prevADX = null;
    this.prevPlusDI = null;
    this.prevMinusDI = null;
    this.adxHistory = [];
    this.plusDIHistory = [];
    this.minusDIHistory = [];
    this.candleCount = 0;
    this.prevRegime = null;
  }
}

module.exports = ADXIndicator;
