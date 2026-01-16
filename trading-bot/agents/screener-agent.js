/**
 * ScreenerAgent - High-Speed Continuous Market Scanner
 * 
 * Rapidly scans ALL coins on the exchange in continuous loops.
 * Prioritizes speed: batch processing, parallel execution, minimal latency.
 * 
 * INDICATORS (13 total):
 * RSI, Williams%R, Stochastic, MACD, EMA 9/21/50, ATR, Volume,
 * Stochastic RSI (50/14/4/5), CMF (20)
 * 
 * Scan Cycle:
 * 1. Fetch all active instruments
 * 2. Batch fetch candles (parallel)
 * 3. Compute indicators (parallel workers)
 * 4. Score and rank signals
 * 5. Emit actionable signals
 * 6. Repeat immediately
 */

const { AgentBase, Decimal } = require('./agent-base');
const D = Decimal;

// Indicator thresholds for quick scoring (NO regular RSI - using StochRSI only)
const QUICK_SCORE = {
  WILLIAMS_OVERSOLD: -80,
  WILLIAMS_OVERBOUGHT: -20,
  STOCH_OVERSOLD: 20,
  STOCH_OVERBOUGHT: 80,
  STOCHRSI_OVERSOLD: 20,
  STOCHRSI_OVERBOUGHT: 80,
  CMF_BULLISH: 0.1,
  CMF_BEARISH: -0.1
};

// OPTIMIZED indicator parameters (from backtesting: 64.7% WR, 8.89 PF)
const OPTIMIZED_PARAMS = {
  stochRsi: {
    rsiPeriod: parseInt(process.env.STOCHRSI_RSI_PERIOD) || 21,
    stochPeriod: parseInt(process.env.STOCHRSI_STOCH_PERIOD) || 9,
    kSmooth: parseInt(process.env.STOCHRSI_K_SMOOTH) || 3,
    dSmooth: parseInt(process.env.STOCHRSI_D_SMOOTH) || 3
  },
  ema: {
    fast: parseInt(process.env.EMA_FAST) || 5,
    mid: parseInt(process.env.EMA_MID) || 13,
    slow: parseInt(process.env.EMA_SLOW) || 50
  },
  bollinger: {
    period: parseInt(process.env.BOLLINGER_PERIOD) || 10,
    stdDev: parseFloat(process.env.BOLLINGER_STDDEV) || 1.5
  },
  ao: {
    fast: parseInt(process.env.AO_FAST) || 5,
    slow: parseInt(process.env.AO_SLOW) || 55
  },
  williams: { period: parseInt(process.env.WILLIAMS_PERIOD) || 14 },
  stochastic: { period: parseInt(process.env.STOCHASTIC_PERIOD) || 14 },
  kdj: { period: parseInt(process.env.KDJ_PERIOD) || 9 },
  obv: { smaPeriod: parseInt(process.env.OBV_SMA_PERIOD) || 10 },
  cmf: { period: parseInt(process.env.CMF_PERIOD) || 20 }
};

// MTF Convergence settings - loaded at runtime to ensure dotenv is ready
// NOTE: This gets initialized in the constructor as this.mtfConfig

class ScreenerAgent extends AgentBase {
  constructor(config = {}) {
    super({
      id: 'screener-agent',
      name: 'Screener Agent',
      options: config
    });

    // Dependencies
    this.dataAgent = config.dataAgent;
    this.signalAgent = config.signalAgent;
    this.regimeAgent = config.regimeAgent;

    // Scan configuration
    this.scanInterval = config.scanInterval || 5000; // 5 seconds between full scans
    this.batchSize = config.batchSize || 10; // Parallel requests per batch
    this.timeframes = config.timeframes || ['15min', '1hour'];
    this.primaryTimeframe = config.primaryTimeframe || '15min';
    this.minVolume24h = config.minVolume24h || 0; // Disabled by default for testing
    this.minScore = config.minScore || 15;

    // Available timeframes for switching
    this.availableTimeframes = config.availableTimeframes || ['5min', '15min', '30min', '1hour', '2hour', '4hour'];
    this.activeTimeframe = this.primaryTimeframe;

    // State
    this.instruments = [];
    this.scanResults = new Map();
    this.topSignals = [];
    this.isScanning = false;
    this.scanCount = 0;
    this.lastScanTime = 0;
    this.scanDurations = [];

    // Performance tracking
    this.stats = {
      totalScans: 0,
      totalSymbolsScanned: 0,
      signalsGenerated: 0,
      avgScanDuration: 0,
      fastestScan: Infinity,
      slowestScan: 0
    };

    // Callbacks
    this.onSignal = config.onSignal || (() => {});
    this.onScanComplete = config.onScanComplete || (() => {});

    // MTF Convergence configuration (loaded at runtime after dotenv)
    this.mtfConfig = {
      enabled: process.env.MTF_ENABLED === 'true',
      ltfTimeframes: (process.env.MTF_LTF_TIMEFRAMES || '15min,30min').split(','),
      htfTimeframes: (process.env.MTF_HTF_TIMEFRAMES || '1hour,2hour,4hour').split(','),
      bonuses: {
        ltfConvergence: parseInt(process.env.MTF_LTF_CONVERGENCE_BONUS) || 20,
        htf1h: parseInt(process.env.MTF_HTF_1H_BONUS) || 25,
        htf2h: parseInt(process.env.MTF_HTF_2H_BONUS) || 30,
        htf4h: parseInt(process.env.MTF_HTF_4H_BONUS) || 20,
        pending: parseInt(process.env.MTF_PENDING_BONUS) || 15
      },
      penalties: {
        conflict: parseInt(process.env.MTF_CONFLICT_PENALTY) || 30
      },
      multipliers: {
        fullConvergence: parseFloat(process.env.MTF_FULL_CONVERGENCE_MULTIPLIER) || 1.4,
        threeAlign: parseFloat(process.env.MTF_THREE_ALIGN_MULTIPLIER) || 1.2,
        isolated: parseFloat(process.env.MTF_ISOLATED_MULTIPLIER) || 0.7
      }
    };
    this.log(`MTF Config: enabled=${this.mtfConfig.enabled}, LTF=${this.mtfConfig.ltfTimeframes}, HTF=${this.mtfConfig.htfTimeframes}`);

    // HTF cache - refresh every 10 scans (HTF data changes slowly)
    this.htfCache = new Map(); // symbol:tf -> { candles, analysis, lastUpdate }
    this.htfCacheRefreshInterval = 10; // Refresh every N scans
    this.lastHtfCacheRefresh = 0;
  }

  async initialize() {
    this.log('Initializing Screener Agent');

    // Message handlers
    this.onMessage('START_SCANNING', this._handleStartScanning.bind(this));
    this.onMessage('STOP_SCANNING', this._handleStopScanning.bind(this));
    this.onMessage('GET_TOP_SIGNALS', this._handleGetTopSignals.bind(this));
    this.onMessage('GET_SCAN_RESULTS', this._handleGetScanResults.bind(this));
    this.onMessage('FORCE_SCAN', this._handleForceScan.bind(this));
    this.onMessage('SET_TIMEFRAME', this._handleSetTimeframe.bind(this));
    this.onMessage('GET_TIMEFRAMES', this._handleGetTimeframes.bind(this));

    return { ok: true, value: null };
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Start continuous scanning
   */
  async startScanning() {
    if (this.isScanning) {
      return { ok: false, error: { code: 'ALREADY_SCANNING', message: 'Scanner already running' } };
    }

    this.isScanning = true;
    this.log('Starting continuous scan loop');

    // Initial instrument fetch
    await this._refreshInstruments();

    // Start scan loop
    this._scanLoop();

    return { ok: true, value: { instruments: this.instruments.length } };
  }

  /**
   * Stop scanning
   */
  stopScanning() {
    this.isScanning = false;
    this.log('Stopping scan loop');
    return { ok: true, value: { totalScans: this.stats.totalScans } };
  }

  /**
   * Force immediate scan
   */
  async forceScan() {
    return this._executeScan();
  }

  /**
   * Get top signals
   */
  getTopSignals(limit = 10) {
    return this.topSignals.slice(0, limit);
  }

  /**
   * Get scan result for symbol
   */
  getScanResult(symbol) {
    return this.scanResults.get(symbol);
  }

  /**
   * Get all scan results
   */
  getAllScanResults() {
    return Object.fromEntries(this.scanResults);
  }

  // ===========================================================================
  // SCAN LOOP
  // ===========================================================================

  async _scanLoop() {
    while (this.isScanning) {
      try {
        await this._executeScan();
        
        // Brief pause between scans
        await this._sleep(this.scanInterval);
        
      } catch (error) {
        this.logError('Scan loop error', error);
        await this._sleep(5000); // Wait before retry
      }
    }
  }

  async _executeScan() {
    const startTime = Date.now();
    this.scanCount++;

    // Refresh instruments periodically (every 100 scans)
    if (this.scanCount % 100 === 0) {
      await this._refreshInstruments();
    }

    // Filter tradeable instruments - scan ALL USDT perpetuals
    const symbols = this.instruments
      .filter(i => i.isTrading && i.symbol.endsWith('USDTM'))
      .map(i => i.symbol);

    if (symbols.length === 0) {
      this.logWarn('No symbols to scan');
      return { ok: false, error: { code: 'NO_SYMBOLS', message: 'No tradeable symbols' } };
    }

    this.log(`Scanning ${symbols.length} symbols...`);

    // Batch process symbols
    const results = [];
    for (let i = 0; i < symbols.length; i += this.batchSize) {
      const batch = symbols.slice(i, i + this.batchSize);
      const batchResults = await Promise.all(
        batch.map(symbol => this._scanSymbol(symbol))
      );
      results.push(...batchResults.filter(r => r !== null));
    }

    // Sort by score
    results.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

    // Update state
    for (const result of results) {
      this.scanResults.set(result.symbol, result);
    }

    // Extract top signals (show all sorted by score, even weak ones)
    this.topSignals = results
      .filter(r => Math.abs(r.score) > 0)
      .slice(0, 20);

    // Emit signals
    for (const signal of this.topSignals) {
      this.onSignal(signal);
      this.emit('signal', signal);
    }

    // Update stats
    const duration = Date.now() - startTime;
    this._updateStats(duration, symbols.length, this.topSignals.length);

    this.lastScanTime = Date.now();
    this.onScanComplete({
      scanCount: this.scanCount,
      symbolsScanned: symbols.length,
      signalsFound: this.topSignals.length,
      duration,
      timestamp: this.lastScanTime
    });

    this.emit('scanComplete', {
      duration,
      symbolsScanned: symbols.length,
      topSignals: this.topSignals.length
    });

    return { ok: true, value: { duration, signals: this.topSignals.length } };
  }

  // ===========================================================================
  // SYMBOL SCANNING
  // ===========================================================================

  async _scanSymbol(symbol) {
    try {
      // MTF: Fetch candles for all configured timeframes
      const candlesByTF = await this._fetchMultiTimeframeCandles(symbol);
      const primaryCandles = candlesByTF[this.primaryTimeframe];

      if (!primaryCandles || primaryCandles.length < 100) {
        return null;
      }

      // Analyze each timeframe
      const tfAnalysis = {};
      for (const [tf, candles] of Object.entries(candlesByTF)) {
        if (candles && candles.length >= 50) {
          tfAnalysis[tf] = this._analyzeTimeframe(candles);
        }
      }

      // Get primary timeframe analysis
      const primary = tfAnalysis[this.primaryTimeframe];
      if (!primary || !primary.indicators) return null;

      const direction = primary.direction;
      const baseScore = primary.score;

      // Calculate MTF convergence bonus
      const convergence = this._calculateConvergenceScore(tfAnalysis, direction);

      // Apply convergence to score
      let finalScore = baseScore + convergence.bonus;
      finalScore = Math.round(finalScore * convergence.multiplier);

      // Get current price
      const currentPrice = primaryCandles[primaryCandles.length - 1].close;
      const change24h = ((currentPrice - primaryCandles[primaryCandles.length - 96]?.close) / primaryCandles[primaryCandles.length - 96]?.close * 100) || 0;

      // Get regime if available
      let regime = null;
      let regimeAdjustedScore = finalScore;
      if (this.regimeAgent && primaryCandles.length >= 100) {
        const regimeResult = await this.regimeAgent.classifyRegime(symbol, primaryCandles);
        if (regimeResult.ok) {
          regime = regimeResult.value;
          regimeAdjustedScore = this._applyRegimeBias(finalScore, direction, regime);
        }
      }

      return {
        symbol,
        direction,
        score: baseScore,
        convergenceBonus: convergence.bonus,
        convergenceMultiplier: convergence.multiplier,
        signalQuality: convergence.quality,
        alignedTFs: convergence.aligned,
        totalTFs: convergence.total,
        finalScore,
        regimeScore: regimeAdjustedScore,
        absScore: Math.abs(regimeAdjustedScore),
        currentPrice,
        change24h: Math.round(change24h * 100) / 100,
        indicators: primary.indicators,
        convergence: convergence.details,
        regime: regime ? { type: regime.regime, confidence: regime.confidence } : null,
        timeframe: this.primaryTimeframe,
        timestamp: Date.now()
      };

    } catch (error) {
      // Silent fail for individual symbols
      return null;
    }
  }

  // ===========================================================================
  // FAST INDICATOR CALCULATION
  // ===========================================================================

  _calculateIndicators(closes, highs, lows, volumes) {
    const len = closes.length;
    if (len < 50) return {};

    // Use OPTIMIZED parameters from backtesting
    const p = OPTIMIZED_PARAMS;

    return {
      // StochRSI with OPTIMIZED params (21/9/3/3 - from 64.7% WR backtest)
      stochRsi: this._stochRsi(closes, p.stochRsi.rsiPeriod, p.stochRsi.stochPeriod,
                                p.stochRsi.kSmooth, p.stochRsi.dSmooth),
      williamsR: this._williamsR(highs, lows, closes, p.williams.period),
      stochastic: this._stochastic(highs, lows, closes, p.stochastic.period),
      // EMA with OPTIMIZED params (5/13/50)
      emaFast: this._ema(closes, p.ema.fast),
      emaMid: this._ema(closes, p.ema.mid),
      emaSlow: this._ema(closes, p.ema.slow),
      currentPrice: closes[len - 1],
      atr: this._atr(highs, lows, closes, 14),
      volume: volumes[len - 1],
      avgVolume: this._sma(volumes.slice(-20), 20),
      cmf: this._cmf(highs, lows, closes, volumes, p.cmf.period),
      // Bollinger with OPTIMIZED params (10/1.5)
      bollinger: this._bollinger(closes, p.bollinger.period, p.bollinger.stdDev),
      kdj: this._kdj(highs, lows, closes, p.kdj.period, 3, 3),
      // AO with OPTIMIZED params (5/55)
      ao: this._ao(highs, lows, p.ao.fast, p.ao.slow),
      obv: this._obv(closes, volumes, p.obv.smaPeriod)
    };
  }

  _rsi(closes, period = 14) {
    if (closes.length < period + 1) return 50;

    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
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

  _williamsR(highs, lows, closes, period = 14) {
    const len = closes.length;
    if (len < period) return -50;

    const highSlice = highs.slice(-period);
    const lowSlice = lows.slice(-period);
    const hh = Math.max(...highSlice);
    const ll = Math.min(...lowSlice);
    const close = closes[len - 1];

    if (hh === ll) return -50;
    return ((hh - close) / (hh - ll)) * -100;
  }

  _stochastic(highs, lows, closes, period = 14) {
    const len = closes.length;
    if (len < period) return { k: 50, d: 50 };

    const highSlice = highs.slice(-period);
    const lowSlice = lows.slice(-period);
    const hh = Math.max(...highSlice);
    const ll = Math.min(...lowSlice);
    const close = closes[len - 1];

    if (hh === ll) return { k: 50, d: 50 };
    const k = ((close - ll) / (hh - ll)) * 100;

    return { k, d: k }; // Simplified - using k as d
  }

  // MACD removed - not used in scoring

  _ema(values, period) {
    if (values.length < period) return values[values.length - 1] || 0;

    const multiplier = 2 / (period + 1);
    let ema = this._sma(values.slice(0, period), period);

    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  _sma(values, period) {
    if (values.length === 0) return 0;
    const slice = values.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  _atr(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return 0;

    let trSum = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trSum += tr;
    }

    return trSum / period;
  }

  /**
   * Stochastic RSI - RSI fed into Stochastic formula
   * Settings from your charts: StochRSI 50 14 4 5
   * rsiPeriod=50, stochPeriod=14, kSmooth=4, dSmooth=5
   */
  _stochRsi(closes, rsiPeriod = 50, stochPeriod = 14, kSmooth = 4, dSmooth = 5) {
    if (closes.length < rsiPeriod + stochPeriod + kSmooth) {
      return { k: 50, d: 50 };
    }

    // Compute RSI history
    const rsiHistory = [];
    for (let i = rsiPeriod; i <= closes.length; i++) {
      const slice = closes.slice(0, i);
      const rsi = this._rsi(slice, rsiPeriod);
      rsiHistory.push(rsi);
    }

    if (rsiHistory.length < stochPeriod) {
      return { k: 50, d: 50 };
    }

    // Apply Stochastic formula to RSI
    const stochRsiValues = [];
    for (let i = stochPeriod - 1; i < rsiHistory.length; i++) {
      const rsiSlice = rsiHistory.slice(i - stochPeriod + 1, i + 1);
      const highRsi = Math.max(...rsiSlice);
      const lowRsi = Math.min(...rsiSlice);
      
      const denom = highRsi - lowRsi;
      const stochRsi = denom === 0 ? 50 : ((rsiHistory[i] - lowRsi) / denom) * 100;
      stochRsiValues.push(stochRsi);
    }

    if (stochRsiValues.length < kSmooth) {
      return { k: 50, d: 50 };
    }

    // Smooth to get %K
    const kValues = [];
    for (let i = kSmooth - 1; i < stochRsiValues.length; i++) {
      const k = this._sma(stochRsiValues.slice(i - kSmooth + 1, i + 1), kSmooth);
      kValues.push(k);
    }

    const currentK = kValues[kValues.length - 1];
    const currentD = kValues.length >= dSmooth 
      ? this._sma(kValues.slice(-dSmooth), dSmooth) 
      : currentK;

    return { k: currentK, d: currentD };
  }

  /**
   * Chaikin Money Flow (CMF)
   * CMF = Sum(MFV, period) / Sum(Volume, period)
   * MFV = ((Close - Low) - (High - Close)) / (High - Low) * Volume
   */
  _cmf(highs, lows, closes, volumes, period = 20) {
    if (closes.length < period) return 0;

    let sumMFV = 0;
    let sumVolume = 0;

    for (let i = closes.length - period; i < closes.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const close = closes[i];
      const volume = volumes[i];

      const range = high - low;
      const mfm = range === 0 ? 0 : ((close - low) - (high - close)) / range;
      const mfv = mfm * volume;

      sumMFV += mfv;
      sumVolume += volume;
    }

    return sumVolume === 0 ? 0 : sumMFV / sumVolume;
  }

  /**
   * Bollinger Bands
   */
  _bollinger(closes, period = 20, stdDev = 2) {
    if (closes.length < period) return { upper: 0, middle: 0, lower: 0, percentB: 50 };

    const slice = closes.slice(-period);
    const middle = this._sma(slice, period);

    // Calculate standard deviation
    const squaredDiffs = slice.map(v => Math.pow(v - middle, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(variance);

    const upper = middle + (stdDev * std);
    const lower = middle - (stdDev * std);
    const price = closes[closes.length - 1];

    // %B = (Price - Lower) / (Upper - Lower)
    const percentB = upper === lower ? 50 : ((price - lower) / (upper - lower)) * 100;

    return { upper, middle, lower, percentB };
  }

  /**
   * KDJ Indicator
   */
  _kdj(highs, lows, closes, period = 9, kSmooth = 3, dSmooth = 3) {
    if (closes.length < period + kSmooth + dSmooth) return { k: 50, d: 50, j: 50 };

    const len = closes.length;
    const rsvValues = [];

    // Calculate RSV for each period
    for (let i = period - 1; i < len; i++) {
      const highSlice = highs.slice(i - period + 1, i + 1);
      const lowSlice = lows.slice(i - period + 1, i + 1);
      const hh = Math.max(...highSlice);
      const ll = Math.min(...lowSlice);
      const close = closes[i];

      const rsv = hh === ll ? 50 : ((close - ll) / (hh - ll)) * 100;
      rsvValues.push(rsv);
    }

    // Smooth RSV to get K
    const kValues = [];
    for (let i = kSmooth - 1; i < rsvValues.length; i++) {
      const k = this._sma(rsvValues.slice(i - kSmooth + 1, i + 1), kSmooth);
      kValues.push(k);
    }

    // Smooth K to get D
    const dValues = [];
    for (let i = dSmooth - 1; i < kValues.length; i++) {
      const d = this._sma(kValues.slice(i - dSmooth + 1, i + 1), dSmooth);
      dValues.push(d);
    }

    const k = kValues[kValues.length - 1] || 50;
    const d = dValues[dValues.length - 1] || 50;
    const j = 3 * k - 2 * d; // J = 3K - 2D

    return { k, d, j };
  }

  /**
   * Awesome Oscillator (AO)
   * AO = SMA(Median Price, 5) - SMA(Median Price, 34)
   */
  _ao(highs, lows, fastPeriod = 5, slowPeriod = 34) {
    if (highs.length < slowPeriod) return { value: 0, signal: 'neutral' };

    // Calculate median prices (HL/2)
    const medianPrices = [];
    for (let i = 0; i < highs.length; i++) {
      medianPrices.push((highs[i] + lows[i]) / 2);
    }

    const fastSma = this._sma(medianPrices.slice(-fastPeriod), fastPeriod);
    const slowSma = this._sma(medianPrices.slice(-slowPeriod), slowPeriod);
    const ao = fastSma - slowSma;

    // Previous AO for momentum
    const prevMedian = medianPrices.slice(-slowPeriod - 1, -1);
    const prevFastSma = this._sma(prevMedian.slice(-fastPeriod), fastPeriod);
    const prevSlowSma = this._sma(prevMedian, slowPeriod);
    const prevAo = prevFastSma - prevSlowSma;

    let signal = 'neutral';
    if (ao > 0 && ao > prevAo) signal = 'bullish';
    else if (ao < 0 && ao < prevAo) signal = 'bearish';
    else if (ao > 0 && ao < prevAo) signal = 'weakening_bull';
    else if (ao < 0 && ao > prevAo) signal = 'weakening_bear';

    return { value: ao, prevValue: prevAo, signal };
  }

  /**
   * On Balance Volume (OBV)
   */
  _obv(closes, volumes, smaPeriod = 10) {
    if (closes.length < 20) return { value: 0, trend: 'neutral' };

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

    // OBV trend - compare current to configured SMA
    const recentObv = obvHistory.slice(-smaPeriod);
    const obvSma = this._sma(recentObv, smaPeriod);

    let trend = 'neutral';
    if (obv > obvSma * 1.05) trend = 'bullish';
    else if (obv < obvSma * 0.95) trend = 'bearish';

    return { value: obv, sma: obvSma, trend };
  }

  // ===========================================================================
  // SIGNAL SCORING
  // ===========================================================================

  _calculateScore(ind) {
    if (!ind.stochRsi) return 0;

    let score = 0;

    // Stochastic RSI - PRIMARY (weight: 35) - replaces regular RSI
    if (ind.stochRsi.k <= QUICK_SCORE.STOCHRSI_OVERSOLD) {
      score += 35 * ((QUICK_SCORE.STOCHRSI_OVERSOLD - ind.stochRsi.k) / QUICK_SCORE.STOCHRSI_OVERSOLD);
      // Bonus for %K crossing above %D in oversold
      if (ind.stochRsi.k > ind.stochRsi.d) {
        score += 10;
      }
    } else if (ind.stochRsi.k >= QUICK_SCORE.STOCHRSI_OVERBOUGHT) {
      score -= 35 * ((ind.stochRsi.k - QUICK_SCORE.STOCHRSI_OVERBOUGHT) / (100 - QUICK_SCORE.STOCHRSI_OVERBOUGHT));
      // Bonus for %K crossing below %D in overbought
      if (ind.stochRsi.k < ind.stochRsi.d) {
        score -= 10;
      }
    }

    // Williams %R (weight: 25)
    if (ind.williamsR <= QUICK_SCORE.WILLIAMS_OVERSOLD) {
      score += 25 * ((QUICK_SCORE.WILLIAMS_OVERSOLD - ind.williamsR) / Math.abs(QUICK_SCORE.WILLIAMS_OVERSOLD));
    } else if (ind.williamsR >= QUICK_SCORE.WILLIAMS_OVERBOUGHT) {
      score -= 25 * ((ind.williamsR - QUICK_SCORE.WILLIAMS_OVERBOUGHT) / Math.abs(QUICK_SCORE.WILLIAMS_OVERBOUGHT));
    }

    // Stochastic (weight: 10) - reduced since we have StochRSI
    if (ind.stochastic.k <= QUICK_SCORE.STOCH_OVERSOLD) {
      score += 10 * ((QUICK_SCORE.STOCH_OVERSOLD - ind.stochastic.k) / QUICK_SCORE.STOCH_OVERSOLD);
    } else if (ind.stochastic.k >= QUICK_SCORE.STOCH_OVERBOUGHT) {
      score -= 10 * ((ind.stochastic.k - QUICK_SCORE.STOCH_OVERBOUGHT) / (100 - QUICK_SCORE.STOCH_OVERBOUGHT));
    }

    // EMA alignment (weight: 20)
    const price = ind.currentPrice;
    if (price > ind.emaFast && ind.emaFast > ind.emaMid && ind.emaMid > ind.emaSlow) {
      score += 20; // Strong bullish alignment
    } else if (price < ind.emaFast && ind.emaFast < ind.emaMid && ind.emaMid < ind.emaSlow) {
      score -= 20; // Strong bearish alignment
    }

    // CMF - Chaikin Money Flow (weight: 15)
    if (ind.cmf !== undefined) {
      if (ind.cmf > QUICK_SCORE.CMF_BULLISH) {
        score += 15 * Math.min(1, ind.cmf / 0.3);
      } else if (ind.cmf < QUICK_SCORE.CMF_BEARISH) {
        score -= 15 * Math.min(1, Math.abs(ind.cmf) / 0.3);
      }
    }

    // Bollinger Bands (weight: 15) - %B position
    if (ind.bollinger) {
      const percentB = ind.bollinger.percentB;
      if (percentB <= 10) {
        // Price near/below lower band - oversold
        score += 15 * ((10 - percentB) / 10);
      } else if (percentB >= 90) {
        // Price near/above upper band - overbought
        score -= 15 * ((percentB - 90) / 10);
      }
    }

    // KDJ (weight: 15) - J line extremes are powerful signals
    if (ind.kdj) {
      const j = ind.kdj.j;
      if (j <= 0) {
        // J below 0 = strong oversold
        score += 15 * Math.min(1, Math.abs(j) / 20);
      } else if (j >= 100) {
        // J above 100 = strong overbought
        score -= 15 * Math.min(1, (j - 100) / 20);
      }
      // K/D crossover bonus
      if (ind.kdj.k > ind.kdj.d && j < 30) {
        score += 5; // Bullish cross in oversold
      } else if (ind.kdj.k < ind.kdj.d && j > 70) {
        score -= 5; // Bearish cross in overbought
      }
    }

    // Awesome Oscillator (weight: 10)
    if (ind.ao) {
      if (ind.ao.signal === 'bullish') {
        score += 10;
      } else if (ind.ao.signal === 'bearish') {
        score -= 10;
      } else if (ind.ao.signal === 'weakening_bear') {
        score += 5; // Momentum shifting bullish
      } else if (ind.ao.signal === 'weakening_bull') {
        score -= 5; // Momentum shifting bearish
      }
    }

    // OBV - On Balance Volume (weight: 10)
    if (ind.obv) {
      if (ind.obv.trend === 'bullish') {
        score += 10; // Money flowing in
      } else if (ind.obv.trend === 'bearish') {
        score -= 10; // Money flowing out
      }
    }

    // Volume confirmation - amplifies signal
    if (ind.volume > ind.avgVolume * 1.5) {
      score *= 1.25; // 25% boost for high volume
    }

    return Math.round(score);
  }

  /**
   * Apply regime bias to adjust signal score
   * Regime alignment boosts score, regime conflict reduces it
   */
  _applyRegimeBias(score, direction, regime) {
    if (!regime || !regime.params) return score;

    const bias = regime.params.signalBias;
    const confidence = regime.confidence / 100;
    let adjustedScore = score;

    // Apply regime-based adjustments
    if (bias === 'long') {
      if (direction === 'long') {
        // Boost long signals in uptrend
        adjustedScore = score * (1 + 0.2 * confidence);
      } else if (direction === 'short') {
        // Reduce short signals in uptrend
        adjustedScore = score * (1 - 0.3 * confidence);
      }
    } else if (bias === 'short') {
      if (direction === 'short') {
        // Boost short signals in downtrend
        adjustedScore = score * (1 + 0.2 * confidence);
      } else if (direction === 'long') {
        // Reduce long signals in downtrend
        adjustedScore = score * (1 - 0.3 * confidence);
      }
    } else if (bias === 'follow') {
      // Breakout - boost signals in breakout direction
      adjustedScore = score * 1.15;
    } else if (bias === 'neutral') {
      // Ranging/unknown - require higher scores
      if (Math.abs(score) < 70) {
        adjustedScore = score * 0.85;
      }
    }

    return Math.round(adjustedScore);
  }

  // ===========================================================================
  // MULTI-TIMEFRAME CONVERGENCE (OPTIMIZED)
  // ===========================================================================

  /**
   * Fetch candles for multiple timeframes in parallel
   * Uses caching for HTF data to reduce API calls
   */
  async _fetchMultiTimeframeCandles(symbol) {
    if (!this.mtfConfig.enabled) {
      // Single timeframe mode
      const candles = await this._fetchCandles(symbol, this.primaryTimeframe);
      return { [this.primaryTimeframe]: candles.ok ? candles.value : [] };
    }

    const results = {};
    const needsRefresh = this.scanCount % this.htfCacheRefreshInterval === 0;

    // Always fetch LTF fresh (15min, 30min change frequently)
    const ltfTimeframes = [...new Set([...this.mtfConfig.ltfTimeframes, this.primaryTimeframe])];
    const ltfPromises = ltfTimeframes.map(async (tf) => {
      const candles = await this._fetchCandles(symbol, tf);
      results[tf] = candles.ok ? candles.value : [];
    });
    await Promise.all(ltfPromises);

    // Use cached HTF or refresh if needed
    for (const tf of this.mtfConfig.htfTimeframes) {
      const cacheKey = `${symbol}:${tf}`;
      const cached = this.htfCache.get(cacheKey);

      if (!needsRefresh && cached && cached.candles.length > 0) {
        // Use cached data
        results[tf] = cached.candles;
      } else {
        // Fetch fresh HTF data
        const candles = await this._fetchCandles(symbol, tf);
        const candleData = candles.ok ? candles.value : [];
        results[tf] = candleData;

        // Cache for next time
        this.htfCache.set(cacheKey, {
          candles: candleData,
          lastUpdate: Date.now()
        });
      }
    }

    return results;
  }

  /**
   * Detect pending signal on higher timeframes
   * Pending = indicator approaching extreme but not triggered yet
   */
  _detectPendingSignal(indicators) {
    let pendingLong = 0;
    let pendingShort = 0;

    // StochRSI pending zones
    if (indicators.stochRsi) {
      const k = indicators.stochRsi.k;
      if (k > 20 && k <= 35) pendingLong += 1;  // Approaching oversold
      if (k >= 65 && k < 80) pendingShort += 1; // Approaching overbought
    }

    // Williams %R pending zones
    if (indicators.williamsR !== undefined) {
      const wr = indicators.williamsR;
      if (wr > -80 && wr <= -65) pendingLong += 1;
      if (wr >= -35 && wr < -20) pendingShort += 1;
    }

    // KDJ pending zones
    if (indicators.kdj) {
      const j = indicators.kdj.j;
      if (j > 0 && j <= 20) pendingLong += 1;
      if (j >= 80 && j < 100) pendingShort += 1;
    }

    // Bollinger %B pending zones
    if (indicators.bollinger) {
      const pB = indicators.bollinger.percentB;
      if (pB > 10 && pB <= 25) pendingLong += 1;
      if (pB >= 75 && pB < 90) pendingShort += 1;
    }

    // Return pending direction if multiple indicators agree
    if (pendingLong >= 2) return { direction: 'long', strength: pendingLong };
    if (pendingShort >= 2) return { direction: 'short', strength: pendingShort };
    return null;
  }

  /**
   * Calculate MTF convergence score and quality rating
   */
  _calculateConvergenceScore(tfData, primaryDirection) {
    const totalTFs = Object.keys(tfData).length;
    if (!this.mtfConfig.enabled || totalTFs <= 1) {
      return { bonus: 0, multiplier: 1, quality: 'D', aligned: 1, total: totalTFs, details: {} };
    }

    let bonus = 0;
    let alignedCount = 0;
    let conflictCount = 0;
    const details = {};

    // Analyze each timeframe
    for (const [tf, data] of Object.entries(tfData)) {
      if (!data || !data.direction) continue;

      const aligned = data.direction === primaryDirection;
      details[tf] = { score: data.score, direction: data.direction, aligned, pending: data.pending };

      if (aligned) {
        alignedCount++;

        // LTF convergence bonus
        if (this.mtfConfig.ltfTimeframes.includes(tf)) {
          bonus += this.mtfConfig.bonuses.ltfConvergence / this.mtfConfig.ltfTimeframes.length;
        }

        // HTF confirmation bonuses
        if (tf === '1hour') bonus += this.mtfConfig.bonuses.htf1h;
        else if (tf === '2hour') bonus += this.mtfConfig.bonuses.htf2h;
        else if (tf === '4hour') bonus += this.mtfConfig.bonuses.htf4h;

        // Pending signal bonus
        if (data.pending && data.pending.direction === primaryDirection) {
          bonus += this.mtfConfig.bonuses.pending;
        }
      } else if (data.direction !== 'neutral') {
        conflictCount++;
        bonus -= this.mtfConfig.penalties.conflict / 2;
      }
    }

    // Determine multiplier based on alignment
    let multiplier = 1;
    let quality = 'D';

    if (alignedCount >= totalTFs) {
      multiplier = this.mtfConfig.multipliers.fullConvergence;
      quality = 'A';
    } else if (alignedCount >= totalTFs - 1 && conflictCount === 0) {
      multiplier = this.mtfConfig.multipliers.threeAlign;
      quality = 'B';
    } else if (alignedCount >= 2) {
      multiplier = 1.0;
      quality = 'C';
    } else {
      multiplier = this.mtfConfig.multipliers.isolated;
      quality = 'D';
    }

    return {
      bonus: Math.round(bonus),
      multiplier,
      quality,
      aligned: alignedCount,
      total: totalTFs,
      details
    };
  }

  /**
   * Calculate indicators and score for a specific timeframe
   */
  _analyzeTimeframe(candles) {
    if (!candles || candles.length < 50) {
      return { indicators: null, score: 0, direction: 'neutral', pending: null };
    }

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);

    const indicators = this._calculateIndicators(closes, highs, lows, volumes);
    const score = this._calculateScore(indicators);
    const direction = score > 0 ? 'long' : score < 0 ? 'short' : 'neutral';
    const pending = this._detectPendingSignal(indicators);

    return { indicators, score, direction, pending };
  }

  // ===========================================================================
  // DATA FETCHING
  // ===========================================================================

  async _refreshInstruments() {
    try {
      if (this.dataAgent && this.dataAgent.wsConnected) {
        const result = await this.dataAgent.fetchInstruments();
        if (result.ok && result.value.length > 0) {
          this.instruments = result.value.map(i => ({
            symbol: i.symbol,
            baseCurrency: i.baseCurrency,
            quoteCurrency: i.quoteCurrency,
            lotSize: parseFloat(i.lotSize),
            tickSize: parseFloat(i.tickSize),
            multiplier: parseFloat(i.multiplier),
            maxLeverage: parseFloat(i.maxLeverage),
            isTrading: i.status === 'Open',
            volume24h: parseFloat(i.turnoverOf24h || 0)
          }));
          this.log(`Loaded ${this.instruments.length} instruments from API`);
          return;
        }
      }
      
      // Fallback - top 30 KuCoin Futures pairs
      this.instruments = [
        { symbol: 'XBTUSDTM', isTrading: true, volume24h: 500000000 },
        { symbol: 'ETHUSDTM', isTrading: true, volume24h: 200000000 },
        { symbol: 'SOLUSDTM', isTrading: true, volume24h: 80000000 },
        { symbol: 'BNBUSDTM', isTrading: true, volume24h: 50000000 },
        { symbol: 'XRPUSDTM', isTrading: true, volume24h: 45000000 },
        { symbol: 'DOGEUSDTM', isTrading: true, volume24h: 40000000 },
        { symbol: 'ADAUSDTM', isTrading: true, volume24h: 35000000 },
        { symbol: 'AVAXUSDTM', isTrading: true, volume24h: 30000000 },
        { symbol: 'LINKUSDTM', isTrading: true, volume24h: 28000000 },
        { symbol: 'DOTUSDTM', isTrading: true, volume24h: 25000000 },
        { symbol: 'MATICUSDTM', isTrading: true, volume24h: 22000000 },
        { symbol: 'LTCUSDTM', isTrading: true, volume24h: 20000000 },
        { symbol: 'ATOMUSDTM', isTrading: true, volume24h: 18000000 },
        { symbol: 'UNIUSDTM', isTrading: true, volume24h: 16000000 },
        { symbol: 'ETCUSDTM', isTrading: true, volume24h: 15000000 },
        { symbol: 'FILUSDTM', isTrading: true, volume24h: 14000000 },
        { symbol: 'APEUSDTM', isTrading: true, volume24h: 13000000 },
        { symbol: 'NEARUSDTM', isTrading: true, volume24h: 12000000 },
        { symbol: 'FTMUSDTM', isTrading: true, volume24h: 11000000 },
        { symbol: 'ALGOUSDTM', isTrading: true, volume24h: 10000000 },
        { symbol: 'SANDUSDTM', isTrading: true, volume24h: 9000000 },
        { symbol: 'MANAUSDTM', isTrading: true, volume24h: 8500000 },
        { symbol: 'AXSUSDTM', isTrading: true, volume24h: 8000000 },
        { symbol: 'GALAUSDTM', isTrading: true, volume24h: 7500000 },
        { symbol: 'AABORUSDTM', isTrading: true, volume24h: 7000000 },
        { symbol: 'OPUSDTM', isTrading: true, volume24h: 6500000 },
        { symbol: 'ARBUSDTM', isTrading: true, volume24h: 6000000 },
        { symbol: 'PEPEUSDTM', isTrading: true, volume24h: 5500000 },
        { symbol: 'WIFUSDTM', isTrading: true, volume24h: 5000000 },
        { symbol: 'BONKUSDTM', isTrading: true, volume24h: 4500000 }
      ];
      this.log(`Using ${this.instruments.length} fallback instruments`);
    } catch (error) {
      this.logError('Failed to refresh instruments', error);
    }
  }

  async _fetchCandles(symbol, timeframe) {
    if (this.dataAgent && this.dataAgent.wsConnected) {
      return this.dataAgent.fetchCandles(symbol, timeframe, 200);
    }

    // Generate mock data with deliberate extreme conditions for some symbols
    const candles = [];
    const seed = symbol.charCodeAt(0) + symbol.charCodeAt(1);
    let price = 100 + (seed % 900);
    
    // Some symbols will have strong trends to trigger RSI extremes
    const trendBias = (seed % 10) < 3 ? -0.008 : (seed % 10) > 6 ? 0.008 : 0;
    
    for (let i = 0; i < 200; i++) {
      // Strong trend + minor noise
      const change = trendBias + (Math.random() - 0.5) * 0.01;
      price *= (1 + change);
      price = Math.max(price, 1); // Prevent negative
      
      const volatility = 0.003 + Math.random() * 0.005;
      const high = price * (1 + volatility);
      const low = price * (1 - volatility);
      
      candles.push({
        ts: Date.now() - (200 - i) * 60000,
        open: price * (1 - change / 2),
        high,
        low,
        close: price,
        volume: Math.random() * 1000000 + 100000
      });
    }
    return { ok: true, value: candles };
  }

  // ===========================================================================
  // STATS
  // ===========================================================================

  _updateStats(duration, symbolsScanned, signalsFound) {
    this.stats.totalScans++;
    this.stats.totalSymbolsScanned += symbolsScanned;
    this.stats.signalsGenerated += signalsFound;
    this.stats.fastestScan = Math.min(this.stats.fastestScan, duration);
    this.stats.slowestScan = Math.max(this.stats.slowestScan, duration);

    this.scanDurations.push(duration);
    if (this.scanDurations.length > 100) this.scanDurations.shift();
    
    this.stats.avgScanDuration = Math.round(
      this.scanDurations.reduce((a, b) => a + b, 0) / this.scanDurations.length
    );
  }

  getStats() {
    return {
      ...this.stats,
      isScanning: this.isScanning,
      instrumentCount: this.instruments.length,
      lastScanTime: this.lastScanTime,
      topSignalsCount: this.topSignals.length,
      activeTimeframe: this.activeTimeframe
    };
  }

  /**
   * Get available timeframes
   */
  getAvailableTimeframes() {
    return {
      available: this.availableTimeframes,
      active: this.activeTimeframe
    };
  }

  /**
   * Set active timeframe for scanning
   */
  setTimeframe(timeframe) {
    if (!this.availableTimeframes.includes(timeframe)) {
      return { ok: false, error: { code: 'INVALID_TIMEFRAME', message: `Invalid timeframe: ${timeframe}. Available: ${this.availableTimeframes.join(', ')}` } };
    }

    const previous = this.activeTimeframe;
    this.activeTimeframe = timeframe;
    this.primaryTimeframe = timeframe;

    // Clear cached data for fresh scan with new timeframe
    this.scanResults.clear();
    this.topSignals = [];

    this.log(`Timeframe changed: ${previous} → ${timeframe}`);
    return { ok: true, value: { previous, current: timeframe } };
  }

  // ===========================================================================
  // MESSAGE HANDLERS
  // ===========================================================================

  async _handleStartScanning() {
    return this.startScanning();
  }

  async _handleStopScanning() {
    return this.stopScanning();
  }

  async _handleGetTopSignals(payload) {
    return { ok: true, value: this.getTopSignals(payload?.limit || 10) };
  }

  async _handleGetScanResults() {
    return { ok: true, value: this.getAllScanResults() };
  }

  async _handleForceScan() {
    return this.forceScan();
  }

  async _handleSetTimeframe(payload) {
    return this.setTimeframe(payload.timeframe);
  }

  async _handleGetTimeframes() {
    return { ok: true, value: this.getAvailableTimeframes() };
  }

  // ===========================================================================
  // HEALTH
  // ===========================================================================

  async performHealthCheck() {
    const timeSinceLastScan = Date.now() - this.lastScanTime;
    const stale = timeSinceLastScan > this.scanInterval * 3;

    return {
      status: this.isScanning && !stale ? 'HEALTHY' : 'DEGRADED',
      details: {
        isScanning: this.isScanning,
        scanCount: this.scanCount,
        lastScanAge: timeSinceLastScan,
        avgScanDuration: this.stats.avgScanDuration,
        instrumentCount: this.instruments.length,
        topSignals: this.topSignals.length
      }
    };
  }

  async cleanup() {
    this.isScanning = false;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ScreenerAgent;
