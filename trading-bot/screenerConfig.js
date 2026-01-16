/**
 * Screener Configuration
 * 
 * Configuration for the coin screener engine including
 * timeframes, thresholds, and indicator parameters.
 * 
 * All values can be overridden via environment variables (.env file)
 */

// Helper functions
const parseFloat = (val, defaultVal) => {
  const parsed = Number(val);
  return isNaN(parsed) ? defaultVal : parsed;
};

const parseInt = (val, defaultVal) => {
  const parsed = Number.parseInt(val, 10);
  return isNaN(parsed) ? defaultVal : parsed;
};

const parseBool = (val, defaultVal) => {
  if (val === undefined || val === null || val === '') return defaultVal;
  return val === 'true' || val === '1' || val === 'yes';
};

const parseArray = (val, defaultVal) => {
  if (!val) return defaultVal;
  return val.split(',').map(s => s.trim()).filter(s => s);
};

const parseNumberArray = (val, defaultVal) => {
  if (!val) return defaultVal;
  return val.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
};

module.exports = {
  // Timeframe settings - REVERSED MTF (78% Win Rate Config)
  // KEY: Lower TF = Entry timing, Higher TF = Trend confirmation
  primaryTimeframe: process.env.PRIMARY_TIMEFRAME || '5min',      // Entry timing
  secondaryTimeframe: process.env.SECONDARY_TIMEFRAME || '30min', // Trend confirmation
  
  // Default symbols (will be dynamically updated by coinList)
  // Note: KuCoin uses XBTUSDTM for Bitcoin, not BTCUSDTM
  symbols: parseArray(process.env.DEFAULT_SYMBOLS, [
    'XBTUSDTM',
    'ETHUSDTM',
    'SOLUSDTM',
    'XRPUSDTM',
    'DOGEUSDTM'
  ]),
  
  // Signal thresholds - OPTIMIZED 2026-01-15 for higher conviction entries
  thresholds: {
    minScore: parseInt(process.env.SIGNAL_MIN_SCORE, 85),       // Increased from 80 - quality over quantity
    strongScore: parseInt(process.env.SIGNAL_STRONG_SCORE, 100), // Strong signal threshold
    extremeScore: parseInt(process.env.SIGNAL_EXTREME_SCORE, 120), // Extreme conviction
    minConfidence: parseInt(process.env.SIGNAL_MIN_CONFIDENCE, 75), // Increased from 70
    minIndicatorsAgreeing: parseInt(process.env.SIGNAL_MIN_INDICATORS, 4), // Minimum 4 indicators
    requireDivergence: true  // NEW: Require at least one divergence signal
  },

  // Alignment settings - OPTIMIZED 2026-01-14
  alignment: {
    requireBothTimeframes: parseBool(process.env.REQUIRE_TIMEFRAME_ALIGNMENT, false),
    requireFullAlignment: parseBool(process.env.REQUIRE_FULL_ALIGNMENT, true), // NEW
    primaryWeight: parseFloat(process.env.PRIMARY_WEIGHT, 0.7),   // Increased from 0.6
    secondaryWeight: parseFloat(process.env.SECONDARY_WEIGHT, 0.3), // Decreased from 0.4
    maxTimeframeDivergence: parseInt(process.env.MAX_TIMEFRAME_DIVERGENCE, 25), // Decreased from 30
    minAlignedConfidence: parseInt(process.env.MIN_ALIGNED_CONFIDENCE, 65) // NEW
  },
  
  // Indicator parameters
  indicatorParams: {
    rsi: {
      period: parseInt(process.env.RSI_PERIOD, 14),
      oversold: parseInt(process.env.RSI_OVERSOLD, 30),
      overbought: parseInt(process.env.RSI_OVERBOUGHT, 70),
      historyLength: parseInt(process.env.INDICATOR_HISTORY_LENGTH, 50)
    },
    
    macd: {
      fastPeriod: parseInt(process.env.MACD_FAST, 12),
      slowPeriod: parseInt(process.env.MACD_SLOW, 26),
      signalPeriod: parseInt(process.env.MACD_SIGNAL, 9),
      historyLength: parseInt(process.env.INDICATOR_HISTORY_LENGTH, 50)
    },
    
    williamsR: {
      period: parseInt(process.env.WILLIAMS_PERIOD, 14),
      oversold: parseInt(process.env.WILLIAMS_OVERSOLD, -80),
      overbought: parseInt(process.env.WILLIAMS_OVERBOUGHT, -20),
      historyLength: parseInt(process.env.INDICATOR_HISTORY_LENGTH, 50)
    },
    
    ao: {
      fastPeriod: parseInt(process.env.AO_FAST, 5),
      slowPeriod: parseInt(process.env.AO_SLOW, 34),
      historyLength: parseInt(process.env.INDICATOR_HISTORY_LENGTH, 50)
    },
    
    stochRSI: {
      rsiPeriod: parseInt(process.env.STOCHRSI_RSI_PERIOD, 14),
      stochPeriod: parseInt(process.env.STOCHRSI_STOCH_PERIOD, 14),
      kSmooth: parseInt(process.env.STOCHRSI_K_SMOOTH, 3),
      dSmooth: parseInt(process.env.STOCHRSI_D_SMOOTH, 3),
      oversold: parseInt(process.env.STOCHRSI_OVERSOLD, 20),
      overbought: parseInt(process.env.STOCHRSI_OVERBOUGHT, 80),
      historyLength: parseInt(process.env.INDICATOR_HISTORY_LENGTH, 50)
    },
    
    bollinger: {
      period: parseInt(process.env.BOLLINGER_PERIOD, 20),
      stdDev: parseFloat(process.env.BOLLINGER_STDDEV, 2),
      historyLength: parseInt(process.env.INDICATOR_HISTORY_LENGTH, 50)
    },
    
    emaTrend: {
      shortPeriod: parseInt(process.env.EMA_SHORT, 9),
      mediumPeriod: parseInt(process.env.EMA_MEDIUM, 21),
      longPeriod: parseInt(process.env.EMA_LONG, 50),
      trendPeriod: parseInt(process.env.EMA_TREND, 200),
      historyLength: parseInt(process.env.INDICATOR_HISTORY_LENGTH, 50)
    },
    
    kdj: {
      kPeriod: parseInt(process.env.KDJ_K_PERIOD, 9),
      dPeriod: parseInt(process.env.KDJ_D_PERIOD, 3),
      smooth: parseInt(process.env.KDJ_SMOOTH, 3),
      jOversold: 20,
      jOverbought: 80,
      historyLength: parseInt(process.env.INDICATOR_HISTORY_LENGTH, 50)
    },
    
    obv: {
      slopeWindow: parseInt(process.env.OBV_SLOPE_WINDOW, 14),
      smoothingEma: parseInt(process.env.OBV_SMOOTHING, 5),
      zScoreCap: 2.0,
      historyLength: 100
    },
    
    dom: {
      depthLevels: parseNumberArray(process.env.DOM_DEPTH_LEVELS, [5, 10, 25]),
      imbalanceThresholdLong: parseFloat(process.env.DOM_IMBALANCE_LONG, 0.60),
      imbalanceThresholdShort: parseFloat(process.env.DOM_IMBALANCE_SHORT, 0.40),
      spreadMaxPercent: parseFloat(process.env.MAX_SPREAD_PERCENT, 0.05),
      wallDetectionEnabled: true,
      micropriceBias: true,
      historyLength: parseInt(process.env.INDICATOR_HISTORY_LENGTH, 50)
    }
  },
  
  // Microstructure analyzer parameters
  microstructureParams: {
    buySellRatio: {
      windowMs: parseInt(process.env.BUYSELL_WINDOW_MS, 60000),
      shortWindowMs: parseInt(process.env.BUYSELL_SHORT_WINDOW, 5000),
      longWindowMs: parseInt(process.env.BUYSELL_LONG_WINDOW, 300000),
      imbalanceThresholdStrong: parseFloat(process.env.BUYSELL_IMBALANCE_STRONG, 0.70),
      imbalanceThresholdExtreme: parseFloat(process.env.BUYSELL_IMBALANCE_EXTREME, 0.80),
      exhaustionReversal: 0.15,
      minTradesForSignal: parseInt(process.env.MIN_TRADES_FOR_SIGNAL, 50),
      maxHistory: 100
    },
    
    priceRatio: {
      spreadThresholdWarn: parseFloat(process.env.PRICE_SPREAD_WARN, 0.02),
      spreadThresholdCritical: parseFloat(process.env.PRICE_SPREAD_CRITICAL, 0.05),
      basisThresholdModerate: parseFloat(process.env.PRICE_BASIS_MODERATE, 0.05),
      basisThresholdExtreme: parseFloat(process.env.PRICE_BASIS_EXTREME, 0.15),
      convergenceThreshold: 0.02,
      divergenceThreshold: 0.08,
      maxHistory: 100
    },
    
    fundingRate: {
      extremeThreshold: parseFloat(process.env.FUNDING_EXTREME_THRESHOLD, 0.01),
      highThreshold: parseFloat(process.env.FUNDING_HIGH_THRESHOLD, 0.005),
      changeThreshold: parseFloat(process.env.FUNDING_CHANGE_THRESHOLD, 0.003),
      fundingInterval: 8 * 60 * 60 * 1000,
      maxHistory: 100
    }
  },
  
  // Output settings
  outputs: {
    console: parseBool(process.env.LOG_CONSOLE, true),
    file: parseBool(process.env.LOG_FILE, true),
    logDir: process.env.LOG_DIR || './logs',
    webhook: process.env.WEBHOOK_URL || null
  },
  
  // Internal settings
  internals: {
    maxCandleBuffer: parseInt(process.env.MAX_CANDLE_BUFFER, 1000),
    signalCooldownMs: parseInt(process.env.SIGNAL_COOLDOWN_MS, 60000),
    reconnectDelayMs: parseInt(process.env.RECONNECT_DELAY, 3000),
    pingIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL, 18000),
    tokenRefreshMs: parseInt(process.env.TOKEN_REFRESH_INTERVAL, 23 * 60 * 60 * 1000)
  }
};
