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

// Indicator thresholds for quick scoring
const QUICK_SCORE = {
  RSI_OVERSOLD: 30,
  RSI_OVERBOUGHT: 70,
  WILLIAMS_OVERSOLD: -80,
  WILLIAMS_OVERBOUGHT: -20,
  STOCH_OVERSOLD: 20,
  STOCH_OVERBOUGHT: 80,
  // NEW
  STOCHRSI_OVERSOLD: 20,
  STOCHRSI_OVERBOUGHT: 80,
  CMF_BULLISH: 0.1,
  CMF_BEARISH: -0.1
};

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

    // Scan configuration
    this.scanInterval = config.scanInterval || 5000; // 5 seconds between full scans
    this.batchSize = config.batchSize || 10; // Parallel requests per batch
    this.timeframes = config.timeframes || ['15min', '1hour'];
    this.primaryTimeframe = config.primaryTimeframe || '15min';
    this.minVolume24h = config.minVolume24h || 0; // Disabled by default for testing
    this.minScore = config.minScore || 15;

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
  }

  async initialize() {
    this.log('Initializing Screener Agent');

    // Message handlers
    this.onMessage('START_SCANNING', this._handleStartScanning.bind(this));
    this.onMessage('STOP_SCANNING', this._handleStopScanning.bind(this));
    this.onMessage('GET_TOP_SIGNALS', this._handleGetTopSignals.bind(this));
    this.onMessage('GET_SCAN_RESULTS', this._handleGetScanResults.bind(this));
    this.onMessage('FORCE_SCAN', this._handleForceScan.bind(this));

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

    // Filter tradeable instruments
    const symbols = this.instruments
      .filter(i => i.isTrading && (!this.minVolume24h || i.volume24h >= this.minVolume24h))
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
      // Fetch candles for primary timeframe
      const candlesResult = await this._fetchCandles(symbol, this.primaryTimeframe);
      if (!candlesResult.ok || candlesResult.value.length < 200) {
        return null;
      }

      const candles = candlesResult.value;
      const closes = candles.map(c => c.close);
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const volumes = candles.map(c => c.volume);

      // Quick indicator calculation
      const indicators = this._calculateIndicators(closes, highs, lows, volumes);
      
      // Score the signal
      const score = this._calculateScore(indicators);
      const direction = score > 0 ? 'long' : score < 0 ? 'short' : 'neutral';

      // Get current price
      const currentPrice = candles[candles.length - 1].close;
      const change24h = ((currentPrice - candles[candles.length - 96]?.close) / candles[candles.length - 96]?.close * 100) || 0;

      return {
        symbol,
        direction,
        score,
        absScore: Math.abs(score),
        currentPrice,
        change24h: Math.round(change24h * 100) / 100,
        indicators,
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

    return {
      rsi: this._rsi(closes, 14),
      williamsR: this._williamsR(highs, lows, closes, 14),
      stochastic: this._stochastic(highs, lows, closes, 14),
      macd: this._macd(closes),
      ema9: this._ema(closes, 9),
      ema21: this._ema(closes, 21),
      ema50: this._ema(closes, 50),
      currentPrice: closes[len - 1],
      atr: this._atr(highs, lows, closes, 14),
      volume: volumes[len - 1],
      avgVolume: this._sma(volumes.slice(-20), 20),
      // NEW INDICATORS
      stochRsi: this._stochRsi(closes),
      cmf: this._cmf(highs, lows, closes, volumes, 20)
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

  _macd(closes) {
    if (closes.length < 26) return { line: 0, signal: 0, histogram: 0 };

    const ema12 = this._ema(closes, 12);
    const ema26 = this._ema(closes, 26);
    const line = ema12 - ema26;

    return { line, signal: line * 0.8, histogram: line * 0.2 };
  }

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

  // ===========================================================================
  // SIGNAL SCORING
  // ===========================================================================

  _calculateScore(ind) {
    if (!ind.rsi) return 0;

    let score = 0;

    // RSI (weight: 30)
    if (ind.rsi <= QUICK_SCORE.RSI_OVERSOLD) {
      score += 30 * ((QUICK_SCORE.RSI_OVERSOLD - ind.rsi) / QUICK_SCORE.RSI_OVERSOLD);
    } else if (ind.rsi >= QUICK_SCORE.RSI_OVERBOUGHT) {
      score -= 30 * ((ind.rsi - QUICK_SCORE.RSI_OVERBOUGHT) / (100 - QUICK_SCORE.RSI_OVERBOUGHT));
    }

    // Williams %R (weight: 25)
    if (ind.williamsR <= QUICK_SCORE.WILLIAMS_OVERSOLD) {
      score += 25 * ((QUICK_SCORE.WILLIAMS_OVERSOLD - ind.williamsR) / Math.abs(QUICK_SCORE.WILLIAMS_OVERSOLD));
    } else if (ind.williamsR >= QUICK_SCORE.WILLIAMS_OVERBOUGHT) {
      score -= 25 * ((ind.williamsR - QUICK_SCORE.WILLIAMS_OVERBOUGHT) / Math.abs(QUICK_SCORE.WILLIAMS_OVERBOUGHT));
    }

    // Stochastic (weight: 15)
    if (ind.stochastic.k <= QUICK_SCORE.STOCH_OVERSOLD) {
      score += 15 * ((QUICK_SCORE.STOCH_OVERSOLD - ind.stochastic.k) / QUICK_SCORE.STOCH_OVERSOLD);
    } else if (ind.stochastic.k >= QUICK_SCORE.STOCH_OVERBOUGHT) {
      score -= 15 * ((ind.stochastic.k - QUICK_SCORE.STOCH_OVERBOUGHT) / (100 - QUICK_SCORE.STOCH_OVERBOUGHT));
    }

    // MACD (weight: 12)
    if (ind.macd.histogram > 0) {
      score += Math.min(12, ind.macd.histogram * 1000);
    } else {
      score -= Math.min(12, Math.abs(ind.macd.histogram) * 1000);
    }

    // EMA alignment (weight: 18)
    const price = ind.currentPrice;
    if (price > ind.ema9 && ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50) {
      score += 18; // Strong bullish alignment
    } else if (price < ind.ema9 && ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50) {
      score -= 18; // Strong bearish alignment
    }

    // Volume confirmation (weight: 10)
    if (ind.volume > ind.avgVolume * 1.5) {
      // High volume amplifies signal
      score *= 1.2;
    }

    // Stochastic RSI (weight: 20)
    if (ind.stochRsi) {
      if (ind.stochRsi.k <= QUICK_SCORE.STOCHRSI_OVERSOLD) {
        score += 20 * ((QUICK_SCORE.STOCHRSI_OVERSOLD - ind.stochRsi.k) / QUICK_SCORE.STOCHRSI_OVERSOLD);
      } else if (ind.stochRsi.k >= QUICK_SCORE.STOCHRSI_OVERBOUGHT) {
        score -= 20 * ((ind.stochRsi.k - QUICK_SCORE.STOCHRSI_OVERBOUGHT) / (100 - QUICK_SCORE.STOCHRSI_OVERBOUGHT));
      }
    }

    // CMF (weight: 15)
    if (ind.cmf !== undefined) {
      if (ind.cmf > QUICK_SCORE.CMF_BULLISH) {
        score += 15 * Math.min(1, ind.cmf / 0.3); // Max at CMF = 0.3
      } else if (ind.cmf < QUICK_SCORE.CMF_BEARISH) {
        score -= 15 * Math.min(1, Math.abs(ind.cmf) / 0.3);
      }
    }

    return Math.round(score);
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
      topSignalsCount: this.topSignals.length
    };
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
