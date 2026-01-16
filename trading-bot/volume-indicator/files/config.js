// Trading Configuration
// Customize these parameters to match your trading style

module.exports = {
  // Automated Exit Strategy
  EXIT_STRATEGY: {
    // When to trigger break-even (in pips)
    BREAK_EVEN_TRIGGER_PIPS: 10,
    
    // How often to trail the stop (in pips)
    TRAILING_STEP_PIPS: 3,
    
    // How much to move SL forward each time (in pips)
    SL_MOVE_PIPS: 1,
    
    // Pip value for calculation (0.01 for most futures)
    PIP_VALUE: 0.01
  },

  // Signal Scoring Weights
  SIGNAL_WEIGHTS: {
    RSI: {
      MAX_CONTRIBUTION: 25,
      OVERSOLD_THRESHOLD: 30,
      OVERBOUGHT_THRESHOLD: 70,
      MODERATE_OVERSOLD: 40,
      MODERATE_OVERBOUGHT: 60
    },
    WILLIAMS_R: {
      MAX_CONTRIBUTION: 20,
      OVERSOLD_THRESHOLD: -80,
      OVERBOUGHT_THRESHOLD: -20,
      MODERATE_OVERSOLD: -70,
      MODERATE_OVERBOUGHT: -30
    },
    AO: {
      MAX_CONTRIBUTION: 15
    },
    MACD: {
      MAX_CONTRIBUTION: 20
    },
    EMA_TREND: {
      MAX_CONTRIBUTION: 20
    }
  },

  // Signal Thresholds
  SIGNAL_THRESHOLDS: {
    // Minimum score to trigger BUY signal
    BUY_THRESHOLD: 40,
    
    // Minimum score to trigger SELL signal (negative)
    SELL_THRESHOLD: -40,
    
    // High confidence threshold
    HIGH_CONFIDENCE: 60,
    
    // Medium confidence threshold
    MEDIUM_CONFIDENCE: 40
  },

  // Technical Indicator Periods
  INDICATORS: {
    RSI_PERIOD: 14,
    WILLIAMS_R_PERIOD: 14,
    ATR_PERIOD: 14,
    MACD_FAST: 12,
    MACD_SLOW: 26,
    MACD_SIGNAL: 9,
    AO_SHORT: 5,
    AO_LONG: 34,
    EMA_50: 50,
    EMA_200: 200
  },

  // Market Data Settings
  MARKET_DATA: {
    // How many candles to keep in memory
    MAX_CANDLES: 200,
    
    // Candle granularity in seconds (60 = 1 minute)
    CANDLE_GRANULARITY: 60,
    
    // Update frequency for positions (milliseconds)
    POSITION_UPDATE_INTERVAL: 3000,
    
    // Update frequency for balance (milliseconds)
    BALANCE_UPDATE_INTERVAL: 10000,
    
    // Position sync interval (milliseconds)
    POSITION_SYNC_INTERVAL: 30000
  },

  // Risk Management
  RISK: {
    // Default leverage if not specified
    DEFAULT_LEVERAGE: 10,
    
    // Maximum leverage allowed
    MAX_LEVERAGE: 100,
    
    // Default stop loss percentage (if no automated strategy)
    DEFAULT_STOP_LOSS_PERCENT: 1.0,
    
    // Maximum position size per symbol (in base currency)
    MAX_POSITION_SIZE: 1.0,
    
    // Minimum order size
    MIN_ORDER_SIZE: 0.001
  },

  // Supported Trading Symbols
  SYMBOLS: {
    BTC: 'XBTUSDTM',
    ETH: 'ETHUSDTM',
    SOL: 'SOLUSDTM'
  },

  // Logging
  LOGGING: {
    // Maximum logs to keep in memory
    MAX_LOGS: 500,
    
    // Log levels: 'error', 'warning', 'info', 'success'
    ENABLED_LEVELS: ['error', 'warning', 'info', 'success'],
    
    // Export logs to file automatically
    AUTO_EXPORT: false,
    
    // Export interval (if AUTO_EXPORT is true)
    EXPORT_INTERVAL: 3600000 // 1 hour
  },

  // WebSocket Settings
  WEBSOCKET: {
    // Port for WebSocket server
    PORT: 3001,
    
    // Reconnect attempts
    MAX_RECONNECT_ATTEMPTS: 5,
    
    // Reconnect delay (milliseconds)
    RECONNECT_DELAY: 5000,
    
    // Ping interval to keep connection alive
    PING_INTERVAL: 30000
  }
};
