/**
 * SignalAgent - Technical Analysis Engine
 * 
 * Computes all 10 indicators, detects divergences, generates composite signals.
 * Sub-workers handle specific domains for parallel processing.
 */

const { AgentBase, AgentUtils, Decimal } = require('./agent-base');
const D = Decimal;

// Signal classifications
const SIGNAL_CLASSIFICATIONS = {
  EXTREME_BUY: { min: 90, max: 130 },
  STRONG_BUY: { min: 70, max: 89 },
  BUY: { min: 50, max: 69 },
  BUY_WEAK: { min: 30, max: 49 },
  NEUTRAL: { min: -29, max: 29 },
  SELL_WEAK: { min: -49, max: -30 },
  SELL: { min: -69, max: -50 },
  STRONG_SELL: { min: -89, max: -70 },
  EXTREME_SELL: { min: -130, max: -90 }
};

class SignalAgent extends AgentBase {
  constructor(config = {}) {
    super({
      id: 'signal-agent',
      name: 'Signal Agent',
      options: config
    });

    // Indicator configurations
    this.indicatorConfig = config.indicators || {
      rsi: { period: 14, oversold: 30, overbought: 70 },
      macd: { fast: 12, slow: 26, signal: 9 },
      williamsR: { period: 14, oversold: -80, overbought: -20 },
      ao: { fast: 5, slow: 34 },
      stochastic: { kPeriod: 14, dPeriod: 3, smooth: 3, oversold: 20, overbought: 80 },
      bollinger: { period: 20, stdDev: 2 },
      ema: { short: 9, medium: 21, long: 50, trend: 200 },
      kdj: { kPeriod: 9, dPeriod: 3, smooth: 3 },
      obv: { slopeWindow: 14, smoothingEma: 5 }
    };

    // Signal weights (from optimization)
    this.weights = config.weights || {
      rsi: { maxWeight: 30, divergence: 1.5, crossover: 1.2, momentum: 0.7, zone: 0.8 },
      macd: { maxWeight: 12, signalCross: 0.7, zeroCross: 0.7, histogram: 0.5, divergence: 1.0 },
      williamsR: { maxWeight: 25, crossover: 1.2, failureSwing: 0.8, divergence: 1.5, zone: 0.7 },
      ao: { maxWeight: 10, zeroCross: 0.8, saucer: 0.5, twinPeaks: 0.8, divergence: 1.0 },
      stochastic: { maxWeight: 8, kdCross: 0.7, zone: 0.5, divergence: 1.0 },
      bollinger: { maxWeight: 10, bandTouch: 0.7, squeeze: 1.0, breakout: 1.0, percentB: 0.5 },
      ema: { maxWeight: 15, emaCross: 1.0, goldenDeath: 1.2, trend: 0.5, slope: 0.5 },
      kdj: { maxWeight: 18, jLine: 1.2, kdCross: 0.8, divergence: 1.3 },
      obv: { maxWeight: 12, slope: 0.8, breakout: 1.0, divergence: 1.2 }
    };

    // Score caps
    this.caps = {
      indicator: 110,
      microstructure: 20,
      total: 130
    };

    // Candle buffers per symbol/timeframe
    this.candleBuffers = new Map();
    this.indicatorCache = new Map();
    
    // Minimum candles needed
    this.minCandles = 200;
  }

  async initialize() {
    this.log('Initializing Signal Agent');
    
    // Register message handlers
    this.onMessage('PROCESS_CANDLE', this._handleCandleUpdate.bind(this));
    this.onMessage('GENERATE_SIGNAL', this._handleGenerateSignal.bind(this));
    this.onMessage('GET_INDICATORS', this._handleGetIndicators.bind(this));
    
    return { ok: true, value: null };
  }

  async processTask(task) {
    switch (task.type) {
      case 'UPDATE_CANDLE':
        return this._updateCandle(task.symbol, task.timeframe, task.candle);
      case 'GENERATE_SIGNAL':
        return this._generateSignal(task.symbol, task.timeframe);
      default:
        return { ok: false, error: { code: 'UNKNOWN_TASK', message: `Unknown task type: ${task.type}` } };
    }
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Update candle data and compute indicators
   * @param {string} symbol
   * @param {string} timeframe
   * @param {Object} candle - { ts, open, high, low, close, volume }
   * @returns {Result}
   */
  updateCandle(symbol, timeframe, candle) {
    return this.enqueue({ type: 'UPDATE_CANDLE', symbol, timeframe, candle }, 'HIGH');
  }

  /**
   * Generate signal for symbol/timeframe
   * @param {string} symbol
   * @param {string} timeframe
   * @returns {Promise<r>}
   */
  async generateSignal(symbol, timeframe) {
    return this._generateSignal(symbol, timeframe);
  }

  /**
   * Bulk update - initialize with historical candles
   * @param {string} symbol
   * @param {string} timeframe
   * @param {Array} candles
   * @returns {Result}
   */
  initializeBuffer(symbol, timeframe, candles) {
    const key = `${symbol}:${timeframe}`;
    this.candleBuffers.set(key, candles.slice(-1000)); // Keep max 1000
    this._computeAllIndicators(symbol, timeframe);
    this.log(`Initialized ${symbol}:${timeframe} with ${candles.length} candles`);
    return { ok: true, value: { symbol, timeframe, candleCount: candles.length } };
  }

  // ===========================================================================
  // INTERNAL: CANDLE MANAGEMENT
  // ===========================================================================

  _updateCandle(symbol, timeframe, candle) {
    const key = `${symbol}:${timeframe}`;
    
    if (!this.candleBuffers.has(key)) {
      this.candleBuffers.set(key, []);
    }
    
    const buffer = this.candleBuffers.get(key);
    
    // Check if updating existing candle or new candle
    if (buffer.length > 0 && buffer[buffer.length - 1].ts === candle.ts) {
      buffer[buffer.length - 1] = candle;
    } else {
      buffer.push(candle);
      if (buffer.length > 1000) buffer.shift();
    }
    
    // Recompute indicators
    if (buffer.length >= this.minCandles) {
      this._computeAllIndicators(symbol, timeframe);
    }
    
    return { ok: true, value: { symbol, timeframe, candleCount: buffer.length } };
  }

  // ===========================================================================
  // INTERNAL: INDICATOR COMPUTATION
  // ===========================================================================

  _computeAllIndicators(symbol, timeframe) {
    const key = `${symbol}:${timeframe}`;
    const candles = this.candleBuffers.get(key);
    
    if (!candles || candles.length < this.minCandles) {
      return null;
    }

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);

    const indicators = {
      rsi: this._computeRSI(closes),
      macd: this._computeMACD(closes),
      williamsR: this._computeWilliamsR(highs, lows, closes),
      ao: this._computeAO(highs, lows),
      stochastic: this._computeStochastic(highs, lows, closes),
      bollinger: this._computeBollinger(closes),
      ema: this._computeEMA(closes),
      kdj: this._computeKDJ(highs, lows, closes),
      obv: this._computeOBV(closes, volumes),
      timestamp: Date.now()
    };

    this.indicatorCache.set(key, indicators);
    return indicators;
  }

  _computeRSI(closes, period = null) {
    period = period || this.indicatorConfig.rsi.period;
    if (closes.length < period + 1) return { value: null, signals: [] };

    let gains = new D(0);
    let losses = new D(0);

    // Initial average
    for (let i = 1; i <= period; i++) {
      const change = new D(closes[i]).sub(closes[i - 1]);
      if (change.gt(0)) gains = gains.add(change);
      else losses = losses.add(change.abs());
    }

    let avgGain = gains.div(period);
    let avgLoss = losses.div(period);

    // Wilder smoothing
    for (let i = period + 1; i < closes.length; i++) {
      const change = new D(closes[i]).sub(closes[i - 1]);
      const gain = change.gt(0) ? change : new D(0);
      const loss = change.lt(0) ? change.abs() : new D(0);
      
      avgGain = avgGain.mul(period - 1).add(gain).div(period);
      avgLoss = avgLoss.mul(period - 1).add(loss).div(period);
    }

    const rsi = avgLoss.eq(0) 
      ? 100 
      : new D(100).sub(new D(100).div(new D(1).add(avgGain.div(avgLoss)))).toNumber();

    // Detect signals
    const signals = [];
    const { oversold, overbought } = this.indicatorConfig.rsi;

    if (rsi <= oversold) {
      signals.push({ type: 'zone', direction: 'bullish', strength: 'strong', value: rsi });
    } else if (rsi >= overbought) {
      signals.push({ type: 'zone', direction: 'bearish', strength: 'strong', value: rsi });
    }

    // Check for divergence (simplified - compare RSI trend vs price trend)
    const divergence = this._detectDivergence(closes.slice(-20), this._computeRSIHistory(closes, period).slice(-20));
    if (divergence) {
      signals.push({ type: 'divergence', ...divergence });
    }

    return { value: rsi, signals, avgGain: avgGain.toNumber(), avgLoss: avgLoss.toNumber() };
  }

  _computeRSIHistory(closes, period) {
    const history = [];
    for (let i = period; i < closes.length; i++) {
      const slice = closes.slice(0, i + 1);
      const result = this._computeRSI(slice, period);
      history.push(result.value);
    }
    return history;
  }

  _computeMACD(closes) {
    const { fast, slow, signal } = this.indicatorConfig.macd;
    if (closes.length < slow + signal) return { value: null, signals: [] };

    const emaFast = this._ema(closes, fast);
    const emaSlow = this._ema(closes, slow);
    const macdLine = new D(emaFast).sub(emaSlow).toNumber();

    // MACD history for signal line
    const macdHistory = [];
    for (let i = slow; i < closes.length; i++) {
      const f = this._ema(closes.slice(0, i + 1), fast);
      const s = this._ema(closes.slice(0, i + 1), slow);
      macdHistory.push(new D(f).sub(s).toNumber());
    }

    const signalLine = this._ema(macdHistory, signal);
    const histogram = new D(macdLine).sub(signalLine).toNumber();

    const signals = [];
    
    // Signal line crossover
    if (macdHistory.length >= 2) {
      const prevHistogram = new D(macdHistory[macdHistory.length - 2]).sub(this._ema(macdHistory.slice(0, -1), signal)).toNumber();
      
      if (histogram > 0 && prevHistogram <= 0) {
        signals.push({ type: 'signal_crossover', direction: 'bullish', strength: 'moderate' });
      } else if (histogram < 0 && prevHistogram >= 0) {
        signals.push({ type: 'signal_crossover', direction: 'bearish', strength: 'moderate' });
      }
    }

    // Zero line crossover
    if (macdHistory.length >= 2) {
      if (macdLine > 0 && macdHistory[macdHistory.length - 2] <= 0) {
        signals.push({ type: 'zero_crossover', direction: 'bullish', strength: 'strong' });
      } else if (macdLine < 0 && macdHistory[macdHistory.length - 2] >= 0) {
        signals.push({ type: 'zero_crossover', direction: 'bearish', strength: 'strong' });
      }
    }

    return { macdLine, signalLine, histogram, signals };
  }

  _computeWilliamsR(highs, lows, closes) {
    const period = this.indicatorConfig.williamsR.period;
    if (closes.length < period) return { value: null, signals: [] };

    const highSlice = highs.slice(-period);
    const lowSlice = lows.slice(-period);
    const currentClose = closes[closes.length - 1];

    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);

    const williamsR = new D(highestHigh).sub(currentClose)
      .div(new D(highestHigh).sub(lowestLow))
      .mul(-100)
      .toNumber();

    const signals = [];
    const { oversold, overbought } = this.indicatorConfig.williamsR;

    if (williamsR <= oversold) {
      signals.push({ type: 'zone', direction: 'bullish', strength: 'strong', value: williamsR });
    } else if (williamsR >= overbought) {
      signals.push({ type: 'zone', direction: 'bearish', strength: 'strong', value: williamsR });
    }

    return { value: williamsR, signals };
  }

  _computeAO(highs, lows) {
    const { fast, slow } = this.indicatorConfig.ao;
    if (highs.length < slow) return { value: null, signals: [] };

    const medianPrices = highs.map((h, i) => new D(h).add(lows[i]).div(2).toNumber());
    
    const smaFast = this._sma(medianPrices.slice(-fast), fast);
    const smaSlow = this._sma(medianPrices.slice(-slow), slow);
    
    const ao = new D(smaFast).sub(smaSlow).toNumber();

    const signals = [];
    
    // Zero crossover
    const prevAO = this._computeAOValue(highs.slice(0, -1), lows.slice(0, -1));
    if (prevAO !== null) {
      if (ao > 0 && prevAO <= 0) {
        signals.push({ type: 'zero_cross', direction: 'bullish', strength: 'moderate' });
      } else if (ao < 0 && prevAO >= 0) {
        signals.push({ type: 'zero_cross', direction: 'bearish', strength: 'moderate' });
      }
    }

    return { value: ao, signals };
  }

  _computeAOValue(highs, lows) {
    const { fast, slow } = this.indicatorConfig.ao;
    if (highs.length < slow) return null;
    const medianPrices = highs.map((h, i) => new D(h).add(lows[i]).div(2).toNumber());
    const smaFast = this._sma(medianPrices.slice(-fast), fast);
    const smaSlow = this._sma(medianPrices.slice(-slow), slow);
    return new D(smaFast).sub(smaSlow).toNumber();
  }

  _computeStochastic(highs, lows, closes) {
    const { kPeriod, dPeriod, smooth, oversold, overbought } = this.indicatorConfig.stochastic;
    if (closes.length < kPeriod + dPeriod) return { value: null, signals: [] };

    // %K calculation
    const kValues = [];
    for (let i = kPeriod - 1; i < closes.length; i++) {
      const highSlice = highs.slice(i - kPeriod + 1, i + 1);
      const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
      const hh = Math.max(...highSlice);
      const ll = Math.min(...lowSlice);
      const k = new D(closes[i]).sub(ll).div(new D(hh).sub(ll)).mul(100).toNumber();
      kValues.push(k);
    }

    // Smooth %K
    const smoothedK = this._sma(kValues.slice(-smooth), smooth);
    
    // %D (SMA of %K)
    const dValue = this._sma(kValues.slice(-dPeriod), dPeriod);

    const signals = [];
    
    if (smoothedK <= oversold && dValue <= oversold) {
      signals.push({ type: 'zone', direction: 'bullish', strength: 'strong' });
    } else if (smoothedK >= overbought && dValue >= overbought) {
      signals.push({ type: 'zone', direction: 'bearish', strength: 'strong' });
    }

    // K/D crossover
    const prevK = kValues.length >= 2 ? kValues[kValues.length - 2] : null;
    if (prevK !== null) {
      if (smoothedK > dValue && prevK <= dValue) {
        signals.push({ type: 'kd_crossover', direction: 'bullish', strength: 'moderate' });
      } else if (smoothedK < dValue && prevK >= dValue) {
        signals.push({ type: 'kd_crossover', direction: 'bearish', strength: 'moderate' });
      }
    }

    return { k: smoothedK, d: dValue, signals };
  }

  _computeBollinger(closes) {
    const { period, stdDev } = this.indicatorConfig.bollinger;
    if (closes.length < period) return { value: null, signals: [] };

    const slice = closes.slice(-period);
    const middle = this._sma(slice, period);
    
    // Standard deviation
    const squaredDiffs = slice.map(v => Math.pow(v - middle, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(variance);

    const upper = new D(middle).add(new D(sd).mul(stdDev)).toNumber();
    const lower = new D(middle).sub(new D(sd).mul(stdDev)).toNumber();
    
    const currentPrice = closes[closes.length - 1];
    const percentB = new D(currentPrice).sub(lower).div(new D(upper).sub(lower)).toNumber();
    const bandwidth = new D(upper).sub(lower).div(middle).mul(100).toNumber();

    const signals = [];

    // Band touches
    if (currentPrice >= upper) {
      signals.push({ type: 'band_touch', direction: 'bearish', strength: 'moderate', band: 'upper' });
    } else if (currentPrice <= lower) {
      signals.push({ type: 'band_touch', direction: 'bullish', strength: 'moderate', band: 'lower' });
    }

    // Squeeze detection (bandwidth < 4% typically indicates squeeze)
    if (bandwidth < 4) {
      signals.push({ type: 'squeeze', direction: 'neutral', strength: 'strong', bandwidth });
    }

    return { upper, middle, lower, percentB, bandwidth, signals };
  }

  _computeEMA(closes) {
    const { short, medium, long, trend } = this.indicatorConfig.ema;
    if (closes.length < trend) return { value: null, signals: [] };

    const emaShort = this._ema(closes, short);
    const emaMedium = this._ema(closes, medium);
    const emaLong = this._ema(closes, long);
    const emaTrend = this._ema(closes, trend);

    const signals = [];
    const currentPrice = closes[closes.length - 1];

    // Trend direction
    if (currentPrice > emaTrend) {
      signals.push({ type: 'trend_direction', direction: 'bullish', strength: 'moderate' });
    } else {
      signals.push({ type: 'trend_direction', direction: 'bearish', strength: 'moderate' });
    }

    // Golden/Death cross (short crosses long)
    const prevShort = this._ema(closes.slice(0, -1), short);
    const prevLong = this._ema(closes.slice(0, -1), long);
    
    if (emaShort > emaLong && prevShort <= prevLong) {
      signals.push({ type: 'golden_death_cross', direction: 'bullish', strength: 'strong', crossType: 'golden' });
    } else if (emaShort < emaLong && prevShort >= prevLong) {
      signals.push({ type: 'golden_death_cross', direction: 'bearish', strength: 'strong', crossType: 'death' });
    }

    return { short: emaShort, medium: emaMedium, long: emaLong, trend: emaTrend, signals };
  }

  _computeKDJ(highs, lows, closes) {
    const { kPeriod, dPeriod, smooth } = this.indicatorConfig.kdj;
    if (closes.length < kPeriod + dPeriod) return { value: null, signals: [] };

    // RSV calculation
    const rsvValues = [];
    for (let i = kPeriod - 1; i < closes.length; i++) {
      const highSlice = highs.slice(i - kPeriod + 1, i + 1);
      const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
      const hh = Math.max(...highSlice);
      const ll = Math.min(...lowSlice);
      const rsv = new D(closes[i]).sub(ll).div(new D(hh).sub(ll)).mul(100).toNumber();
      rsvValues.push(isNaN(rsv) ? 50 : rsv);
    }

    // K, D, J calculation
    let k = 50, d = 50;
    for (const rsv of rsvValues) {
      k = new D(k).mul(2).add(rsv).div(3).toNumber();
      d = new D(d).mul(2).add(k).div(3).toNumber();
    }
    const j = new D(k).mul(3).sub(new D(d).mul(2)).toNumber();

    const signals = [];

    // J line extremes
    if (j <= 0) {
      signals.push({ type: 'j_line', direction: 'bullish', strength: 'strong', value: j });
    } else if (j >= 100) {
      signals.push({ type: 'j_line', direction: 'bearish', strength: 'strong', value: j });
    }

    return { k, d, j, signals };
  }

  _computeOBV(closes, volumes) {
    if (closes.length < 2) return { value: null, signals: [] };

    let obv = 0;
    const obvHistory = [0];

    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) {
        obv += volumes[i];
      } else if (closes[i] < closes[i - 1]) {
        obv -= volumes[i];
      }
      obvHistory.push(obv);
    }

    const signals = [];

    // Slope analysis
    const { slopeWindow } = this.indicatorConfig.obv;
    if (obvHistory.length >= slopeWindow) {
      const recentOBV = obvHistory.slice(-slopeWindow);
      const slope = (recentOBV[recentOBV.length - 1] - recentOBV[0]) / slopeWindow;
      
      if (slope > 0) {
        signals.push({ type: 'slope', direction: 'bullish', strength: 'moderate', slope });
      } else if (slope < 0) {
        signals.push({ type: 'slope', direction: 'bearish', strength: 'moderate', slope });
      }
    }

    // Divergence with price
    const divergence = this._detectDivergence(closes.slice(-20), obvHistory.slice(-20));
    if (divergence) {
      signals.push({ type: 'divergence', ...divergence });
    }

    return { value: obv, obvHistory: obvHistory.slice(-50), signals };
  }

  // ===========================================================================
  // SIGNAL GENERATION
  // ===========================================================================

  async _generateSignal(symbol, timeframe) {
    const key = `${symbol}:${timeframe}`;
    const indicators = this.indicatorCache.get(key);

    if (!indicators) {
      return { ok: false, error: { code: 'NO_INDICATORS', message: 'Indicators not computed yet' } };
    }

    // Aggregate all signals
    const allSignals = [];
    let totalScore = 0;
    let bullishCount = 0;
    let bearishCount = 0;

    // Process each indicator
    const breakdown = {};

    for (const [name, data] of Object.entries(indicators)) {
      if (name === 'timestamp' || !data || !data.signals) continue;

      const weight = this.weights[name];
      if (!weight) continue;

      let indicatorScore = 0;

      for (const signal of data.signals) {
        const signalWeight = weight[signal.type] || 1;
        const strengthMultiplier = this._getStrengthMultiplier(signal.strength);
        const directionMultiplier = signal.direction === 'bullish' ? 1 : signal.direction === 'bearish' ? -1 : 0;
        
        const contribution = weight.maxWeight * signalWeight * strengthMultiplier * directionMultiplier;
        indicatorScore += contribution;

        if (signal.direction === 'bullish') bullishCount++;
        else if (signal.direction === 'bearish') bearishCount++;

        allSignals.push({
          indicator: name,
          ...signal,
          contribution: Math.round(contribution * 100) / 100
        });
      }

      // Cap individual indicator score
      indicatorScore = Math.max(-weight.maxWeight, Math.min(weight.maxWeight, indicatorScore));
      totalScore += indicatorScore;
      breakdown[name] = { score: indicatorScore, value: data.value || data.macdLine || data.k };
    }

    // Apply total score cap
    totalScore = Math.max(-this.caps.total, Math.min(this.caps.total, Math.round(totalScore)));

    // Classify signal
    const classification = this._classifySignal(totalScore);
    const direction = classification.includes('BUY') ? 'long' : classification.includes('SELL') ? 'short' : 'neutral';
    
    // Calculate confidence
    const totalIndicators = bullishCount + bearishCount;
    const dominantCount = Math.max(bullishCount, bearishCount);
    const confidence = totalIndicators > 0 
      ? Math.round((dominantCount / totalIndicators) * 100)
      : 0;

    const result = {
      symbol,
      timeframe,
      direction,
      score: totalScore,
      classification,
      confidence,
      bullishCount,
      bearishCount,
      signals: allSignals,
      breakdown,
      timestamp: Date.now()
    };

    this.emit('signalGenerated', result);
    return { ok: true, value: result };
  }

  _classifySignal(score) {
    for (const [name, range] of Object.entries(SIGNAL_CLASSIFICATIONS)) {
      if (score >= range.min && score <= range.max) {
        return name;
      }
    }
    return 'NEUTRAL';
  }

  _getStrengthMultiplier(strength) {
    const multipliers = {
      very_strong: 1.2,
      strong: 1.0,
      moderate: 0.7,
      weak: 0.5,
      extreme: 1.1
    };
    return multipliers[strength] || 1.0;
  }

  // ===========================================================================
  // DIVERGENCE DETECTION
  // ===========================================================================

  _detectDivergence(prices, indicatorValues) {
    if (prices.length < 10 || indicatorValues.length < 10) return null;

    // Find local peaks and troughs
    const pricePeaks = this._findPeaks(prices);
    const priceTroughs = this._findTroughs(prices);
    const indPeaks = this._findPeaks(indicatorValues);
    const indTroughs = this._findTroughs(indicatorValues);

    // Bullish divergence: price makes lower low, indicator makes higher low
    if (priceTroughs.length >= 2 && indTroughs.length >= 2) {
      const recentPriceTrough = priceTroughs[priceTroughs.length - 1];
      const prevPriceTrough = priceTroughs[priceTroughs.length - 2];
      const recentIndTrough = indTroughs[indTroughs.length - 1];
      const prevIndTrough = indTroughs[indTroughs.length - 2];

      if (recentPriceTrough.value < prevPriceTrough.value && 
          recentIndTrough.value > prevIndTrough.value) {
        return { direction: 'bullish', strength: 'strong', type: 'regular' };
      }
    }

    // Bearish divergence: price makes higher high, indicator makes lower high
    if (pricePeaks.length >= 2 && indPeaks.length >= 2) {
      const recentPricePeak = pricePeaks[pricePeaks.length - 1];
      const prevPricePeak = pricePeaks[pricePeaks.length - 2];
      const recentIndPeak = indPeaks[indPeaks.length - 1];
      const prevIndPeak = indPeaks[indPeaks.length - 2];

      if (recentPricePeak.value > prevPricePeak.value && 
          recentIndPeak.value < prevIndPeak.value) {
        return { direction: 'bearish', strength: 'strong', type: 'regular' };
      }
    }

    return null;
  }

  _findPeaks(values) {
    const peaks = [];
    for (let i = 1; i < values.length - 1; i++) {
      if (values[i] > values[i - 1] && values[i] > values[i + 1]) {
        peaks.push({ index: i, value: values[i] });
      }
    }
    return peaks;
  }

  _findTroughs(values) {
    const troughs = [];
    for (let i = 1; i < values.length - 1; i++) {
      if (values[i] < values[i - 1] && values[i] < values[i + 1]) {
        troughs.push({ index: i, value: values[i] });
      }
    }
    return troughs;
  }

  // ===========================================================================
  // MATH HELPERS
  // ===========================================================================

  _sma(values, period) {
    if (values.length < period) return null;
    const slice = values.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  _ema(values, period) {
    if (values.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = this._sma(values.slice(0, period), period);
    
    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  // ===========================================================================
  // MESSAGE HANDLERS
  // ===========================================================================

  async _handleCandleUpdate(payload) {
    const { symbol, timeframe, candle } = payload;
    return this._updateCandle(symbol, timeframe, candle);
  }

  async _handleGenerateSignal(payload) {
    const { symbol, timeframe } = payload;
    return this._generateSignal(symbol, timeframe);
  }

  async _handleGetIndicators(payload) {
    const { symbol, timeframe } = payload;
    const key = `${symbol}:${timeframe}`;
    const indicators = this.indicatorCache.get(key);
    return indicators 
      ? { ok: true, value: indicators }
      : { ok: false, error: { code: 'NOT_FOUND', message: 'No indicators available' } };
  }
}

module.exports = SignalAgent;
