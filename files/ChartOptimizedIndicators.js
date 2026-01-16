/**
 * Multi-Indicator Signal System - Chart-Optimized Entry Logic
 * 
 * Based on visual analysis of XRPUSDT 2H, VIRTUALUSDT 1H, and BTC 15M charts.
 * Implements the exact indicator suite and entry logic observed.
 * 
 * Indicators:
 * 1. Williams %R 14 - Rise from deep oversold
 * 2. Stochastic RSI 50,16,4,5 - K/D crossover from oversold
 * 3. Stochastic 14,1,3 - Fast stochastic crossover
 * 4. Awesome Oscillator - Zero line cross and saucer patterns
 * 5. OBV Dual MA - WMA/SMA crossover for volume confirmation
 * 6. EMA Cross 10,3 - Trend direction filter
 * 7. Bollinger Bands 20,2 - Squeeze and breakout detection
 * 
 * Entry Logic: Signal fires when multiple indicators align with the same direction.
 * 
 * @version 1.0.0
 */

const EventEmitter = require('events');

// ============================================================================
// STOCHASTIC RSI INDICATOR
// ============================================================================

class StochasticRSI {
  constructor(config = {}) {
    this.rsiPeriod = config.rsiPeriod || 50;
    this.stochPeriod = config.stochPeriod || 16;
    this.kSmooth = config.kSmooth || 4;
    this.dSmooth = config.dSmooth || 5;
    this.oversold = config.oversold || 20;
    this.overbought = config.overbought || 80;
    
    this.closes = [];
    this.rsiValues = [];
    this.kValues = [];
    this.dValues = [];
    
    this.currentK = null;
    this.currentD = null;
    this.prevK = null;
    this.prevD = null;
  }

  update(candle) {
    this.closes.push(candle.close);
    if (this.closes.length > this.rsiPeriod + this.stochPeriod + 50) {
      this.closes.shift();
    }

    if (this.closes.length < this.rsiPeriod + 1) {
      return this.getResult();
    }

    // Calculate RSI
    const rsi = this.calculateRSI();
    this.rsiValues.push(rsi);
    
    if (this.rsiValues.length > this.stochPeriod + this.kSmooth + this.dSmooth) {
      this.rsiValues.shift();
    }

    if (this.rsiValues.length < this.stochPeriod) {
      return this.getResult();
    }

    // Calculate Stochastic of RSI
    const recentRSI = this.rsiValues.slice(-this.stochPeriod);
    const highestRSI = Math.max(...recentRSI);
    const lowestRSI = Math.min(...recentRSI);
    const range = highestRSI - lowestRSI;
    
    const rawK = range === 0 ? 50 : ((rsi - lowestRSI) / range) * 100;
    this.kValues.push(rawK);
    
    if (this.kValues.length > this.kSmooth + this.dSmooth + 10) {
      this.kValues.shift();
    }

    // Smooth K
    this.prevK = this.currentK;
    if (this.kValues.length >= this.kSmooth) {
      const kSlice = this.kValues.slice(-this.kSmooth);
      this.currentK = kSlice.reduce((a, b) => a + b, 0) / this.kSmooth;
      this.dValues.push(this.currentK);
    }

    if (this.dValues.length > this.dSmooth + 5) {
      this.dValues.shift();
    }

    // Calculate D (smoothed K)
    this.prevD = this.currentD;
    if (this.dValues.length >= this.dSmooth) {
      const dSlice = this.dValues.slice(-this.dSmooth);
      this.currentD = dSlice.reduce((a, b) => a + b, 0) / this.dSmooth;
    }

    return this.getResult();
  }

  calculateRSI() {
    const period = this.rsiPeriod;
    const closes = this.closes.slice(-period - 1);
    
    let gains = 0, losses = 0;
    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  getSignal() {
    if (this.currentK === null || this.currentD === null || 
        this.prevK === null || this.prevD === null) {
      return null;
    }

    // LONG: K crosses above D from oversold
    const bullishCross = this.prevK <= this.prevD && this.currentK > this.currentD;
    const inOversold = this.prevK < this.oversold || this.prevD < this.oversold;
    
    if (bullishCross && inOversold) {
      return {
        type: 'bullish_crossover',
        direction: 'long',
        strength: this.currentK < 30 ? 'strong' : 'moderate',
        k: this.currentK,
        d: this.currentD,
        message: `StochRSI bullish cross: K(${this.currentK.toFixed(1)}) > D(${this.currentD.toFixed(1)}) from oversold`
      };
    }

    // SHORT: K crosses below D from overbought
    const bearishCross = this.prevK >= this.prevD && this.currentK < this.currentD;
    const inOverbought = this.prevK > this.overbought || this.prevD > this.overbought;
    
    if (bearishCross && inOverbought) {
      return {
        type: 'bearish_crossover',
        direction: 'short',
        strength: this.currentK > 70 ? 'strong' : 'moderate',
        k: this.currentK,
        d: this.currentD,
        message: `StochRSI bearish cross: K(${this.currentK.toFixed(1)}) < D(${this.currentD.toFixed(1)}) from overbought`
      };
    }

    return null;
  }

  getResult() {
    const signal = this.getSignal();
    let score = 0;
    
    if (signal) {
      score = signal.direction === 'long' ? 20 : -20;
      if (signal.strength === 'strong') score *= 1.25;
    }

    return {
      k: this.currentK,
      d: this.currentD,
      signal,
      score,
      zone: this.currentK < this.oversold ? 'oversold' : 
            this.currentK > this.overbought ? 'overbought' : 'neutral'
    };
  }

  reset() {
    this.closes = [];
    this.rsiValues = [];
    this.kValues = [];
    this.dValues = [];
    this.currentK = null;
    this.currentD = null;
    this.prevK = null;
    this.prevD = null;
  }
}

// ============================================================================
// FAST STOCHASTIC INDICATOR
// ============================================================================

class FastStochastic {
  constructor(config = {}) {
    this.kPeriod = config.kPeriod || 14;
    this.dPeriod = config.dPeriod || 3;
    this.smooth = config.smooth || 1;
    this.oversold = config.oversold || 20;
    this.overbought = config.overbought || 80;
    
    this.highs = [];
    this.lows = [];
    this.closes = [];
    this.kValues = [];
    
    this.currentK = null;
    this.currentD = null;
    this.prevK = null;
    this.prevD = null;
  }

  update(candle) {
    this.highs.push(candle.high);
    this.lows.push(candle.low);
    this.closes.push(candle.close);

    if (this.highs.length > this.kPeriod + this.dPeriod + 10) {
      this.highs.shift();
      this.lows.shift();
      this.closes.shift();
    }

    if (this.highs.length < this.kPeriod) {
      return this.getResult();
    }

    // Calculate %K
    const recentHighs = this.highs.slice(-this.kPeriod);
    const recentLows = this.lows.slice(-this.kPeriod);
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    const range = highestHigh - lowestLow;
    
    const rawK = range === 0 ? 50 : ((candle.close - lowestLow) / range) * 100;
    this.kValues.push(rawK);

    if (this.kValues.length > this.dPeriod + 10) {
      this.kValues.shift();
    }

    this.prevK = this.currentK;
    this.currentK = rawK;

    // Calculate %D (SMA of %K)
    this.prevD = this.currentD;
    if (this.kValues.length >= this.dPeriod) {
      const dSlice = this.kValues.slice(-this.dPeriod);
      this.currentD = dSlice.reduce((a, b) => a + b, 0) / this.dPeriod;
    }

    return this.getResult();
  }

  getSignal() {
    if (this.currentK === null || this.currentD === null ||
        this.prevK === null || this.prevD === null) {
      return null;
    }

    // LONG: K crosses above D from oversold
    const bullishCross = this.prevK <= this.prevD && this.currentK > this.currentD;
    const wasOversold = this.prevK < this.oversold || this.prevD < this.oversold;
    
    if (bullishCross && wasOversold) {
      return {
        type: 'bullish_crossover',
        direction: 'long',
        strength: this.prevK < 15 ? 'strong' : 'moderate',
        k: this.currentK,
        d: this.currentD,
        message: `Stoch bullish cross from oversold: K(${this.currentK.toFixed(1)}) > D(${this.currentD.toFixed(1)})`
      };
    }

    // SHORT: K crosses below D from overbought
    const bearishCross = this.prevK >= this.prevD && this.currentK < this.currentD;
    const wasOverbought = this.prevK > this.overbought || this.prevD > this.overbought;
    
    if (bearishCross && wasOverbought) {
      return {
        type: 'bearish_crossover',
        direction: 'short',
        strength: this.prevK > 85 ? 'strong' : 'moderate',
        k: this.currentK,
        d: this.currentD,
        message: `Stoch bearish cross from overbought: K(${this.currentK.toFixed(1)}) < D(${this.currentD.toFixed(1)})`
      };
    }

    return null;
  }

  getResult() {
    const signal = this.getSignal();
    let score = 0;
    
    if (signal) {
      score = signal.direction === 'long' ? 15 : -15;
      if (signal.strength === 'strong') score *= 1.3;
    }

    return {
      k: this.currentK,
      d: this.currentD,
      signal,
      score,
      zone: this.currentK < this.oversold ? 'oversold' :
            this.currentK > this.overbought ? 'overbought' : 'neutral'
    };
  }

  reset() {
    this.highs = [];
    this.lows = [];
    this.closes = [];
    this.kValues = [];
    this.currentK = null;
    this.currentD = null;
    this.prevK = null;
    this.prevD = null;
  }
}

// ============================================================================
// AWESOME OSCILLATOR
// ============================================================================

class AwesomeOscillator {
  constructor(config = {}) {
    this.fastPeriod = config.fastPeriod || 5;
    this.slowPeriod = config.slowPeriod || 34;
    
    this.medianPrices = [];
    this.aoValues = [];
    this.maxHistory = 50;
  }

  update(candle) {
    const medianPrice = (candle.high + candle.low) / 2;
    this.medianPrices.push(medianPrice);

    if (this.medianPrices.length > this.slowPeriod + this.maxHistory) {
      this.medianPrices.shift();
    }

    if (this.medianPrices.length < this.slowPeriod) {
      return this.getResult();
    }

    // AO = SMA(5, median) - SMA(34, median)
    const fastSMA = this.sma(this.medianPrices, this.fastPeriod);
    const slowSMA = this.sma(this.medianPrices, this.slowPeriod);
    const ao = fastSMA - slowSMA;

    this.aoValues.push(ao);
    if (this.aoValues.length > this.maxHistory) {
      this.aoValues.shift();
    }

    return this.getResult();
  }

  sma(data, period) {
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  getSignal() {
    if (this.aoValues.length < 3) return null;

    const current = this.aoValues[this.aoValues.length - 1];
    const prev = this.aoValues[this.aoValues.length - 2];
    const prev2 = this.aoValues[this.aoValues.length - 3];

    // Zero Line Cross
    if (prev <= 0 && current > 0) {
      return {
        type: 'zero_cross_bullish',
        direction: 'long',
        strength: 'strong',
        value: current,
        message: `AO crossed above zero (${current.toFixed(4)})`
      };
    }

    if (prev >= 0 && current < 0) {
      return {
        type: 'zero_cross_bearish',
        direction: 'short',
        strength: 'strong',
        value: current,
        message: `AO crossed below zero (${current.toFixed(4)})`
      };
    }

    // Saucer Pattern (momentum continuation)
    // Bullish saucer: AO > 0, red bar followed by green bar
    if (current > 0 && prev < prev2 && current > prev) {
      return {
        type: 'bullish_saucer',
        direction: 'long',
        strength: 'moderate',
        value: current,
        message: `AO bullish saucer pattern above zero`
      };
    }

    // Bearish saucer: AO < 0, green bar followed by red bar
    if (current < 0 && prev > prev2 && current < prev) {
      return {
        type: 'bearish_saucer',
        direction: 'short',
        strength: 'moderate',
        value: current,
        message: `AO bearish saucer pattern below zero`
      };
    }

    return null;
  }

  getResult() {
    const current = this.aoValues.length > 0 ? this.aoValues[this.aoValues.length - 1] : null;
    const signal = this.getSignal();
    let score = 0;

    if (signal) {
      if (signal.type.includes('zero_cross')) {
        score = signal.direction === 'long' ? 20 : -20;
      } else {
        score = signal.direction === 'long' ? 10 : -10;
      }
    }

    return {
      value: current,
      signal,
      score,
      histogram: this.aoValues.slice(-10)
    };
  }

  reset() {
    this.medianPrices = [];
    this.aoValues = [];
  }
}

// ============================================================================
// OBV WITH DUAL MOVING AVERAGES
// ============================================================================

class OBVDualMA {
  constructor(config = {}) {
    this.wmaPeriod = config.wmaPeriod || 20;
    this.smaPeriod = config.smaPeriod || 20;
    
    this.obvValues = [];
    this.wmaValues = [];
    this.smaValues = [];
    this.prevClose = null;
    
    this.currentOBV = 0;
    this.currentWMA = null;
    this.currentSMA = null;
    this.prevWMA = null;
    this.prevSMA = null;
  }

  update(candle) {
    // Calculate OBV
    if (this.prevClose !== null) {
      if (candle.close > this.prevClose) {
        this.currentOBV += candle.volume;
      } else if (candle.close < this.prevClose) {
        this.currentOBV -= candle.volume;
      }
    }
    this.prevClose = candle.close;

    this.obvValues.push(this.currentOBV);
    if (this.obvValues.length > Math.max(this.wmaPeriod, this.smaPeriod) + 20) {
      this.obvValues.shift();
    }

    // Calculate WMA
    this.prevWMA = this.currentWMA;
    if (this.obvValues.length >= this.wmaPeriod) {
      this.currentWMA = this.calculateWMA(this.obvValues, this.wmaPeriod);
    }

    // Calculate SMA
    this.prevSMA = this.currentSMA;
    if (this.obvValues.length >= this.smaPeriod) {
      const slice = this.obvValues.slice(-this.smaPeriod);
      this.currentSMA = slice.reduce((a, b) => a + b, 0) / this.smaPeriod;
    }

    return this.getResult();
  }

  calculateWMA(data, period) {
    const slice = data.slice(-period);
    let weightedSum = 0;
    let weightSum = 0;
    
    for (let i = 0; i < slice.length; i++) {
      const weight = i + 1;
      weightedSum += slice[i] * weight;
      weightSum += weight;
    }
    
    return weightedSum / weightSum;
  }

  getSignal() {
    if (this.currentWMA === null || this.currentSMA === null ||
        this.prevWMA === null || this.prevSMA === null) {
      return null;
    }

    // LONG: WMA crosses above SMA (volume momentum turning bullish)
    const bullishCross = this.prevWMA <= this.prevSMA && this.currentWMA > this.currentSMA;
    
    if (bullishCross) {
      return {
        type: 'bullish_volume_cross',
        direction: 'long',
        strength: 'moderate',
        wma: this.currentWMA,
        sma: this.currentSMA,
        message: `OBV WMA crossed above SMA (bullish volume momentum)`
      };
    }

    // SHORT: WMA crosses below SMA
    const bearishCross = this.prevWMA >= this.prevSMA && this.currentWMA < this.currentSMA;
    
    if (bearishCross) {
      return {
        type: 'bearish_volume_cross',
        direction: 'short',
        strength: 'moderate',
        wma: this.currentWMA,
        sma: this.currentSMA,
        message: `OBV WMA crossed below SMA (bearish volume momentum)`
      };
    }

    return null;
  }

  getResult() {
    const signal = this.getSignal();
    let score = 0;

    if (signal) {
      score = signal.direction === 'long' ? 15 : -15;
    }

    // Also provide trend confirmation
    let trend = 'neutral';
    if (this.currentWMA !== null && this.currentSMA !== null) {
      trend = this.currentWMA > this.currentSMA ? 'bullish' : 'bearish';
    }

    return {
      obv: this.currentOBV,
      wma: this.currentWMA,
      sma: this.currentSMA,
      signal,
      score,
      trend
    };
  }

  reset() {
    this.obvValues = [];
    this.wmaValues = [];
    this.smaValues = [];
    this.prevClose = null;
    this.currentOBV = 0;
    this.currentWMA = null;
    this.currentSMA = null;
    this.prevWMA = null;
    this.prevSMA = null;
  }
}

// ============================================================================
// EMA CROSS INDICATOR
// ============================================================================

class EMACross {
  constructor(config = {}) {
    this.fastPeriod = config.fastPeriod || 10;
    this.slowPeriod = config.slowPeriod || 3;
    this.trendPeriod = config.trendPeriod || 50;
    
    this.closes = [];
    this.fastEMA = null;
    this.slowEMA = null;
    this.trendEMA = null;
    this.prevFastEMA = null;
    this.prevSlowEMA = null;
  }

  update(candle) {
    this.closes.push(candle.close);
    
    const maxPeriod = Math.max(this.fastPeriod, this.slowPeriod, this.trendPeriod);
    if (this.closes.length > maxPeriod + 50) {
      this.closes.shift();
    }

    this.prevFastEMA = this.fastEMA;
    this.prevSlowEMA = this.slowEMA;

    // Calculate EMAs
    if (this.closes.length >= this.fastPeriod) {
      this.fastEMA = this.calculateEMA(candle.close, this.fastEMA, this.fastPeriod);
    }

    if (this.closes.length >= this.slowPeriod) {
      this.slowEMA = this.calculateEMA(candle.close, this.slowEMA, this.slowPeriod);
    }

    if (this.closes.length >= this.trendPeriod) {
      this.trendEMA = this.calculateEMA(candle.close, this.trendEMA, this.trendPeriod);
    }

    return this.getResult();
  }

  calculateEMA(price, prevEMA, period) {
    const multiplier = 2 / (period + 1);
    if (prevEMA === null) {
      // Initialize with SMA
      const slice = this.closes.slice(-period);
      return slice.reduce((a, b) => a + b, 0) / period;
    }
    return (price - prevEMA) * multiplier + prevEMA;
  }

  getSignal() {
    if (this.fastEMA === null || this.slowEMA === null ||
        this.prevFastEMA === null || this.prevSlowEMA === null) {
      return null;
    }

    // LONG: Fast EMA crosses above Slow EMA
    const bullishCross = this.prevFastEMA <= this.prevSlowEMA && this.fastEMA > this.slowEMA;
    
    if (bullishCross) {
      const aboveTrend = this.trendEMA === null || this.fastEMA > this.trendEMA;
      return {
        type: 'bullish_ema_cross',
        direction: 'long',
        strength: aboveTrend ? 'strong' : 'moderate',
        fastEMA: this.fastEMA,
        slowEMA: this.slowEMA,
        trendEMA: this.trendEMA,
        message: `EMA ${this.fastPeriod} crossed above EMA ${this.slowPeriod}${aboveTrend ? ' (above trend)' : ''}`
      };
    }

    // SHORT: Fast EMA crosses below Slow EMA
    const bearishCross = this.prevFastEMA >= this.prevSlowEMA && this.fastEMA < this.slowEMA;
    
    if (bearishCross) {
      const belowTrend = this.trendEMA === null || this.fastEMA < this.trendEMA;
      return {
        type: 'bearish_ema_cross',
        direction: 'short',
        strength: belowTrend ? 'strong' : 'moderate',
        fastEMA: this.fastEMA,
        slowEMA: this.slowEMA,
        trendEMA: this.trendEMA,
        message: `EMA ${this.fastPeriod} crossed below EMA ${this.slowPeriod}${belowTrend ? ' (below trend)' : ''}`
      };
    }

    return null;
  }

  getResult() {
    const signal = this.getSignal();
    let score = 0;

    if (signal) {
      score = signal.direction === 'long' ? 15 : -15;
      if (signal.strength === 'strong') score *= 1.2;
    }

    // Trend determination
    let trend = 'neutral';
    if (this.fastEMA !== null && this.slowEMA !== null) {
      trend = this.fastEMA > this.slowEMA ? 'bullish' : 'bearish';
    }

    return {
      fastEMA: this.fastEMA,
      slowEMA: this.slowEMA,
      trendEMA: this.trendEMA,
      signal,
      score,
      trend
    };
  }

  reset() {
    this.closes = [];
    this.fastEMA = null;
    this.slowEMA = null;
    this.trendEMA = null;
    this.prevFastEMA = null;
    this.prevSlowEMA = null;
  }
}

// ============================================================================
// BOLLINGER BANDS
// ============================================================================

class BollingerBands {
  constructor(config = {}) {
    this.period = config.period || 20;
    this.stdDev = config.stdDev || 2;
    this.squeezeThreshold = config.squeezeThreshold || 0.02; // 2% bandwidth for squeeze
    
    this.closes = [];
    this.bandwidthHistory = [];
  }

  update(candle) {
    this.closes.push(candle.close);
    
    if (this.closes.length > this.period + 50) {
      this.closes.shift();
    }

    if (this.closes.length < this.period) {
      return this.getResult();
    }

    const slice = this.closes.slice(-this.period);
    const sma = slice.reduce((a, b) => a + b, 0) / this.period;
    
    // Calculate standard deviation
    const squaredDiffs = slice.map(x => Math.pow(x - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / this.period;
    const std = Math.sqrt(variance);

    const upper = sma + (this.stdDev * std);
    const lower = sma - (this.stdDev * std);
    const bandwidth = (upper - lower) / sma;

    this.bandwidthHistory.push(bandwidth);
    if (this.bandwidthHistory.length > 20) {
      this.bandwidthHistory.shift();
    }

    this.current = {
      upper,
      middle: sma,
      lower,
      bandwidth,
      close: candle.close
    };

    return this.getResult();
  }

  getSignal() {
    if (!this.current) return null;

    const { upper, middle, lower, bandwidth, close } = this.current;

    // Squeeze detection (low volatility, preparing for breakout)
    const avgBandwidth = this.bandwidthHistory.length > 10 ?
      this.bandwidthHistory.reduce((a, b) => a + b, 0) / this.bandwidthHistory.length : bandwidth;
    
    const isSqueeze = bandwidth < avgBandwidth * 0.7;

    // Breakout signals
    if (close > upper) {
      return {
        type: 'upper_breakout',
        direction: 'long',
        strength: isSqueeze ? 'very_strong' : 'strong',
        bandwidth,
        message: `Price broke above upper Bollinger Band${isSqueeze ? ' (squeeze breakout)' : ''}`
      };
    }

    if (close < lower) {
      return {
        type: 'lower_breakout',
        direction: 'short',
        strength: isSqueeze ? 'very_strong' : 'strong',
        bandwidth,
        message: `Price broke below lower Bollinger Band${isSqueeze ? ' (squeeze breakout)' : ''}`
      };
    }

    // Mean reversion from bands
    const prevClose = this.closes.length > 1 ? this.closes[this.closes.length - 2] : close;
    
    // Bouncing off lower band (bullish)
    if (prevClose <= lower && close > lower && close < middle) {
      return {
        type: 'lower_bounce',
        direction: 'long',
        strength: 'moderate',
        bandwidth,
        message: `Price bouncing off lower Bollinger Band`
      };
    }

    // Bouncing off upper band (bearish)
    if (prevClose >= upper && close < upper && close > middle) {
      return {
        type: 'upper_bounce',
        direction: 'short',
        strength: 'moderate',
        bandwidth,
        message: `Price bouncing off upper Bollinger Band`
      };
    }

    // Squeeze setup (not a signal, but important context)
    if (isSqueeze) {
      return {
        type: 'squeeze',
        direction: 'neutral',
        strength: 'setup',
        bandwidth,
        message: `Bollinger Band squeeze detected (breakout imminent)`
      };
    }

    return null;
  }

  getResult() {
    const signal = this.getSignal();
    let score = 0;

    if (signal && signal.direction !== 'neutral') {
      if (signal.type.includes('breakout')) {
        score = signal.direction === 'long' ? 18 : -18;
      } else {
        score = signal.direction === 'long' ? 10 : -10;
      }
      if (signal.strength === 'very_strong') score *= 1.3;
    }

    return {
      upper: this.current?.upper,
      middle: this.current?.middle,
      lower: this.current?.lower,
      bandwidth: this.current?.bandwidth,
      signal,
      score
    };
  }

  reset() {
    this.closes = [];
    this.bandwidthHistory = [];
    this.current = null;
  }
}

// ============================================================================
// WILLIAMS %R (Import from existing)
// ============================================================================

const WilliamsRIndicator = require('./WilliamsRIndicator');

// ============================================================================
// MULTI-INDICATOR SIGNAL AGGREGATOR
// ============================================================================

class MultiIndicatorSignalAggregator extends EventEmitter {
  constructor(config = {}) {
    super();

    // Initialize all indicators with chart-matching parameters
    this.williamsR = new WilliamsRIndicator({
      period: 14,
      oversold: -80,
      overbought: -20,
      deepOversold: -85,
      deepOverbought: -15,
      minRiseStrength: 10
    });

    this.stochRSI = new StochasticRSI({
      rsiPeriod: 50,
      stochPeriod: 16,
      kSmooth: 4,
      dSmooth: 5,
      oversold: 20,
      overbought: 80
    });

    this.stochastic = new FastStochastic({
      kPeriod: 14,
      dPeriod: 3,
      smooth: 1,
      oversold: 20,
      overbought: 80
    });

    this.ao = new AwesomeOscillator({
      fastPeriod: 5,
      slowPeriod: 34
    });

    this.obv = new OBVDualMA({
      wmaPeriod: 20,
      smaPeriod: 20
    });

    this.emaCross = new EMACross({
      fastPeriod: 10,
      slowPeriod: 3,
      trendPeriod: 50
    });

    this.bollinger = new BollingerBands({
      period: 20,
      stdDev: 2
    });

    // Signal thresholds
    this.minSignalsForEntry = config.minSignalsForEntry || 3;
    this.minScoreForEntry = config.minScoreForEntry || 40;
    this.strongSignalThreshold = config.strongSignalThreshold || 60;
    
    // History for analysis
    this.signalHistory = [];
    this.maxHistory = 100;
  }

  update(candle) {
    // Update all indicators
    const wrResult = this.williamsR.update(candle);
    const stochRSIResult = this.stochRSI.update(candle);
    const stochResult = this.stochastic.update(candle);
    const aoResult = this.ao.update(candle);
    const obvResult = this.obv.update(candle);
    const emaResult = this.emaCross.update(candle);
    const bbResult = this.bollinger.update(candle);

    // Aggregate signals
    const aggregation = this.aggregateSignals({
      williamsR: wrResult,
      stochRSI: stochRSIResult,
      stochastic: stochResult,
      ao: aoResult,
      obv: obvResult,
      emaCross: emaResult,
      bollinger: bbResult
    }, candle);

    // Store in history
    this.signalHistory.push({
      timestamp: candle.timestamp,
      price: candle.close,
      aggregation
    });

    if (this.signalHistory.length > this.maxHistory) {
      this.signalHistory.shift();
    }

    // Emit events for significant signals
    if (aggregation.signal && aggregation.signal.strength !== 'weak') {
      this.emit('signal', {
        ...aggregation,
        candle
      });
    }

    return aggregation;
  }

  aggregateSignals(results, candle) {
    const signals = {
      long: [],
      short: [],
      neutral: []
    };

    let totalScore = 0;

    // Collect and categorize all signals
    const indicatorResults = [
      { name: 'Williams %R', result: results.williamsR },
      { name: 'Stoch RSI', result: results.stochRSI },
      { name: 'Stochastic', result: results.stochastic },
      { name: 'AO', result: results.ao },
      { name: 'OBV', result: results.obv },
      { name: 'EMA Cross', result: results.emaCross },
      { name: 'Bollinger', result: results.bollinger }
    ];

    for (const { name, result } of indicatorResults) {
      if (result.signal) {
        const signalInfo = {
          indicator: name,
          ...result.signal,
          score: result.score || 0
        };

        totalScore += result.score || 0;

        if (result.signal.direction === 'long') {
          signals.long.push(signalInfo);
        } else if (result.signal.direction === 'short') {
          signals.short.push(signalInfo);
        } else {
          signals.neutral.push(signalInfo);
        }
      }
    }

    // Track recent signals for clustering (look back N bars)
    this.recentLongSignals = this.recentLongSignals || [];
    this.recentShortSignals = this.recentShortSignals || [];
    
    // Add current signals to recent tracking
    for (const sig of signals.long) {
      this.recentLongSignals.push({ 
        timestamp: candle.timestamp, 
        indicator: sig.indicator,
        score: sig.score 
      });
    }
    for (const sig of signals.short) {
      this.recentShortSignals.push({ 
        timestamp: candle.timestamp, 
        indicator: sig.indicator,
        score: sig.score 
      });
    }
    
    // Keep only signals from last 5 bars (cluster window)
    const clusterWindow = 5 * 60000; // 5 bars assuming 1-min, adjust as needed
    const cutoff = candle.timestamp - clusterWindow;
    this.recentLongSignals = this.recentLongSignals.filter(s => s.timestamp > cutoff);
    this.recentShortSignals = this.recentShortSignals.filter(s => s.timestamp > cutoff);
    
    // Count unique indicators in cluster
    const uniqueLongIndicators = new Set(this.recentLongSignals.map(s => s.indicator));
    const uniqueShortIndicators = new Set(this.recentShortSignals.map(s => s.indicator));
    
    // Calculate cluster scores
    const longClusterScore = this.recentLongSignals.reduce((sum, s) => sum + s.score, 0);
    const shortClusterScore = this.recentShortSignals.reduce((sum, s) => sum + Math.abs(s.score), 0);

    // Determine final signal based on CLUSTERED signals
    let finalSignal = null;
    const longCount = uniqueLongIndicators.size;
    const shortCount = uniqueShortIndicators.size;

    // LONG signal logic - use cluster count
    if (longCount >= this.minSignalsForEntry && longClusterScore >= this.minScoreForEntry) {
      const strength = longClusterScore >= this.strongSignalThreshold ? 'strong' :
                       longCount >= 4 ? 'moderate' : 'weak';
      
      finalSignal = {
        direction: 'long',
        score: longClusterScore,
        confirmingIndicators: longCount,
        strength,
        signals: signals.long,
        clusteredIndicators: Array.from(uniqueLongIndicators),
        message: `LONG: ${longCount} indicators confirm in cluster (score: ${longClusterScore})`
      };
      
      // Clear long signals after generating signal to prevent repeated triggers
      this.recentLongSignals = [];
    }
    // SHORT signal logic - use cluster count
    else if (shortCount >= this.minSignalsForEntry && shortClusterScore >= this.minScoreForEntry) {
      const strength = shortClusterScore >= this.strongSignalThreshold ? 'strong' :
                       shortCount >= 4 ? 'moderate' : 'weak';
      
      finalSignal = {
        direction: 'short',
        score: -shortClusterScore,
        confirmingIndicators: shortCount,
        strength,
        signals: signals.short,
        clusteredIndicators: Array.from(uniqueShortIndicators),
        message: `SHORT: ${shortCount} indicators confirm in cluster (score: ${shortClusterScore})`
      };
      
      // Clear short signals after generating signal
      this.recentShortSignals = [];
    }

    return {
      timestamp: candle.timestamp,
      price: candle.close,
      totalScore,
      signals,
      signal: finalSignal,
      clusterInfo: {
        longIndicators: longCount,
        shortIndicators: shortCount,
        longScore: longClusterScore,
        shortScore: shortClusterScore
      },
      indicators: {
        williamsR: results.williamsR.value,
        stochRSI_K: results.stochRSI.k,
        stochRSI_D: results.stochRSI.d,
        stochastic_K: results.stochastic.k,
        stochastic_D: results.stochastic.d,
        ao: results.ao.value,
        obv: results.obv.obv,
        obvTrend: results.obv.trend,
        emaTrend: results.emaCross.trend,
        bbBandwidth: results.bollinger.bandwidth
      }
    };
  }

  reset() {
    this.williamsR.reset();
    this.stochRSI.reset();
    this.stochastic.reset();
    this.ao.reset();
    this.obv.reset();
    this.emaCross.reset();
    this.bollinger.reset();
    this.signalHistory = [];
    this.recentLongSignals = [];
    this.recentShortSignals = [];
  }

  getStatus() {
    return {
      historyLength: this.signalHistory.length,
      lastSignal: this.signalHistory.length > 0 ? 
        this.signalHistory[this.signalHistory.length - 1] : null,
      config: {
        minSignalsForEntry: this.minSignalsForEntry,
        minScoreForEntry: this.minScoreForEntry,
        strongSignalThreshold: this.strongSignalThreshold
      }
    };
  }
}

// Export all classes
module.exports = {
  StochasticRSI,
  FastStochastic,
  AwesomeOscillator,
  OBVDualMA,
  EMACross,
  BollingerBands,
  MultiIndicatorSignalAggregator
};
