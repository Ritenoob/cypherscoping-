/**
 * Runtime Configuration
 * 
 * Config for toggler, throttle, SL/TP mode, position sizing
 * Based on v3.5 structure with v5.0 enhancements
 * 
 * All values can be overridden via environment variables (.env file)
 */

// Helper to parse boolean env vars
const parseBool = (val, defaultVal) => {
  if (val === undefined || val === null || val === '') return defaultVal;
  return val === 'true' || val === '1' || val === 'yes';
};

// Helper to parse float env vars
const parseFloat = (val, defaultVal) => {
  const parsed = Number(val);
  return isNaN(parsed) ? defaultVal : parsed;
};

// Helper to parse int env vars
const parseInt = (val, defaultVal) => {
  const parsed = Number.parseInt(val, 10);
  return isNaN(parsed) ? defaultVal : parsed;
};

module.exports = {
  // Trading Mode
  mode: process.env.BOT_MODE || 'paper',
  strategyProfile: process.env.STRATEGY_PROFILE || 'neutral',
  
  // Position Sizing
  positionSizing: {
    defaultPercent: parseFloat(process.env.POSITION_SIZE_DEFAULT, 0.5),
    minPercent: parseFloat(process.env.POSITION_SIZE_MIN, 0.1),
    maxPercent: parseFloat(process.env.POSITION_SIZE_MAX, 5.0),
    useVolatilityAdjust: parseBool(process.env.POSITION_VOLATILITY_ADJUST, true),
    atrMultiplier: parseFloat(process.env.POSITION_ATR_MULTIPLIER, 1.0)
  },
  
  // Leverage Settings
  leverage: {
    mode: process.env.LEVERAGE_MODE || 'auto',
    defaultLeverage: parseInt(process.env.LEVERAGE_DEFAULT, 50),
    minLeverage: parseInt(process.env.LEVERAGE_MIN, 1),
    maxLeverage: parseInt(process.env.LEVERAGE_MAX, 100),
    volatilityBased: parseBool(process.env.LEVERAGE_VOLATILITY_BASED, true),
    atrThresholds: {
      low: { atr: parseFloat(process.env.LEVERAGE_ATR_LOW, 0.5), leverage: 75 },
      medium: { atr: parseFloat(process.env.LEVERAGE_ATR_MEDIUM, 1.0), leverage: 50 },
      high: { atr: parseFloat(process.env.LEVERAGE_ATR_HIGH, 2.0), leverage: 25 },
      extreme: { atr: parseFloat(process.env.LEVERAGE_ATR_EXTREME, 3.0), leverage: 10 }
    }
  },
  
  // Stop Loss / Take Profit (ROI-Based) - OPTIMIZED 2026-01-15
  // Key changes: Wider trailing stop, later break-even activation
  riskManagement: {
    mode: process.env.RISK_MODE || 'roi',
    stopLossROI: parseFloat(process.env.STOP_LOSS_ROI, 0.4),      // Tightened from 0.5 to limit losses
    takeProfitROI: parseFloat(process.env.TAKE_PROFIT_ROI, 2.5),  // Increased from 2.0 for better R:R
    trailingStop: {
      enabled: parseBool(process.env.TRAILING_STOP_ENABLED, true),
      activationROI: parseFloat(process.env.TRAILING_STOP_ACTIVATION, 1.5),  // Increased from 1.0
      trailPercent: parseFloat(process.env.TRAILING_STOP_TRAIL, 0.8)         // Widened from 0.3 to let winners run
    },
    breakEven: {
      enabled: parseBool(process.env.BREAK_EVEN_ENABLED, true),
      activationROI: parseFloat(process.env.BREAK_EVEN_ACTIVATION, 2.0),     // Increased from 0.5 - critical fix
      buffer: parseFloat(process.env.BREAK_EVEN_BUFFER, 0.15)                // Increased from 0.1
    },
    maxDailyDrawdown: parseFloat(process.env.MAX_DAILY_DRAWDOWN, 5.0)
  },
  
  // Fee Configuration
  fees: {
    makerFee: parseFloat(process.env.MAKER_FEE, 0.0002),
    takerFee: parseFloat(process.env.TAKER_FEE, 0.0006),
    slippageBuffer: parseFloat(process.env.SLIPPAGE_BUFFER, 0.0002),
    includeInBreakEven: parseBool(process.env.FEES_IN_BREAK_EVEN, true)
  },
  
  // Signal Thresholds - OPTIMIZED 2026-01-15 for higher conviction entries
  signals: {
    minScoreForEntry: parseInt(process.env.SIGNAL_MIN_SCORE, 80),      // Increased from 50 to match screenerConfig
    strongSignalThreshold: parseInt(process.env.SIGNAL_STRONG_SCORE, 100), // Increased from 70
    extremeSignalThreshold: parseInt(process.env.SIGNAL_EXTREME_SCORE, 120), // Increased from 90
    minConfidence: parseInt(process.env.SIGNAL_MIN_CONFIDENCE, 70),    // Increased from 40
    minIndicatorsAgreeing: parseInt(process.env.SIGNAL_MIN_INDICATORS, 4), // Increased from 3
    cooldownMs: parseInt(process.env.SIGNAL_COOLDOWN_MS, 60000)
  },
  
  // Entry Timing
  entryTiming: {
    mode: process.env.ENTRY_MODE || '9th_level',
    orderBookLevels: parseInt(process.env.ENTRY_ORDER_BOOK_LEVELS, 9),
    useVWAP: parseBool(process.env.ENTRY_USE_VWAP, false),
    maxSlippage: parseFloat(process.env.ENTRY_MAX_SLIPPAGE, 0.05)
  },
  
  // Throttling
  throttle: {
    maxTradesPerHour: parseInt(process.env.MAX_TRADES_PER_HOUR, 10),
    maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS, 5),
    minTimeBetweenTrades: parseInt(process.env.MIN_TIME_BETWEEN_TRADES, 60000),
    maxDailyDrawdown: parseFloat(process.env.MAX_DAILY_LOSS, 5.0)
  },
  
  // Timeframe Settings
  timeframes: {
    primary: process.env.PRIMARY_TIMEFRAME || '15min',
    secondary: process.env.SECONDARY_TIMEFRAME || '1hour',
    requireAlignment: parseBool(process.env.REQUIRE_TIMEFRAME_ALIGNMENT, true),
    primaryWeight: parseFloat(process.env.PRIMARY_WEIGHT, 0.6),
    secondaryWeight: parseFloat(process.env.SECONDARY_WEIGHT, 0.4),
    maxDivergence: parseInt(process.env.MAX_TIMEFRAME_DIVERGENCE, 30)
  },
  
  // Coin Selection
  coinSelection: {
    dynamicRanking: parseBool(process.env.DYNAMIC_COIN_RANKING, true),
    topCoinsCount: parseInt(process.env.TOP_COINS_COUNT, 30),
    minVolume24h: parseInt(process.env.MIN_VOLUME_24H, 10000000),
    maxSpreadPercent: parseFloat(process.env.MAX_SPREAD_PERCENT, 0.05),
    defaultSymbols: (process.env.DEFAULT_SYMBOLS || 'BTCUSDTM,ETHUSDTM,SOLUSDTM,XRPUSDTM,BNBUSDTM').split(','),
    blacklist: (process.env.BLACKLIST_SYMBOLS || 'LUNAUSDTM,USTUSDTM').split(',').filter(s => s)
  },
  
  // WebSocket Settings
  websocket: {
    serverPort: parseInt(process.env.WEBSOCKET_PORT, 3001),
    dashboardPort: parseInt(process.env.DASHBOARD_PORT, 3000),
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL, 18000),
    reconnectDelay: parseInt(process.env.RECONNECT_DELAY, 3000),
    tokenRefreshInterval: parseInt(process.env.TOKEN_REFRESH_INTERVAL, 23 * 60 * 60 * 1000)
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    console: parseBool(process.env.LOG_CONSOLE, true),
    file: parseBool(process.env.LOG_FILE, true),
    logDir: process.env.LOG_DIR || './logs',
    maxFiles: parseInt(process.env.LOG_MAX_FILES, 30)
  },
  
  // Feature Toggles
  features: {
    microstructureAnalysis: parseBool(process.env.FEATURE_MICROSTRUCTURE, true),
    multiTimeframeAlignment: parseBool(process.env.FEATURE_MULTI_TIMEFRAME, true),
    dynamicCoinRanking: parseBool(process.env.FEATURE_COIN_RANKING, true),
    paperTradingOptimizer: parseBool(process.env.FEATURE_PAPER_OPTIMIZER, true),
    indicatorEnhancement: parseBool(process.env.FEATURE_INDICATOR_ENHANCEMENT, true),
    orderBookAnalysis: parseBool(process.env.FEATURE_ORDER_BOOK, true),
    trailingStops: parseBool(process.env.FEATURE_TRAILING_STOPS, true),
    breakEvenStops: parseBool(process.env.FEATURE_BREAK_EVEN, true)
  },
  
  // Notifications
  notifications: {
    webhookUrl: process.env.WEBHOOK_URL || null,
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN || null,
      chatId: process.env.TELEGRAM_CHAT_ID || null
    },
    discord: {
      webhookUrl: process.env.DISCORD_WEBHOOK || null
    }
  },
  
  // Debug
  debug: parseBool(process.env.DEBUG_MODE, false)
};
