/**
 * SCREENER CONFIGURATION
 * Configuration for dual-timeframe screener
 */

module.exports = {
  // Trading pairs to monitor
  pairs: [
    'XBTUSDTM',  // Bitcoin
    'ETHUSDTM',  // Ethereum
    'SOLUSDTM',  // Solana
    // Add more pairs from config/pairs.json
  ],

  // Timeframes
  timeframes: {
    primary: '5m',    // Primary timeframe for signals
    secondary: '15m'  // Secondary timeframe for confirmation
  },

  // Indicator configurations
  indicators: {
    rsi: {
      enabled: true,
      period: 14
    },
    macd: {
      enabled: true,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9
    },
    williamsR: {
      enabled: true,
      period: 14
    },
    ao: {
      enabled: true,
      fastPeriod: 5,
      slowPeriod: 34
    },
    kdj: {
      enabled: true,
      kPeriod: 9,
      dPeriod: 3,
      smooth: 3
    },
    obv: {
      enabled: true,
      slopeWindow: 14,
      smoothingEma: 5,
      zScoreCap: 2.0,
      normalize: true
    }
  },

  // Data feed settings
  dataFeed: {
    type: 'kucoin',  // 'kucoin' | 'binance' | 'mock'
    wsEndpoint: 'wss://ws-api-futures.kucoin.com',
    restEndpoint: 'https://api-futures.kucoin.com',
    reconnectDelay: 5000,  // ms
    maxReconnectAttempts: 10,
    pingInterval: 30000  // ms
  },

  // Signal emission settings
  signalOutput: {
    console: true,       // Log to console
    file: true,          // Write to file
    filePath: './logs/screener-signals.jsonl',
    websocket: true,     // Emit via WebSocket
    wsPort: 3002
  },

  // Screening rules
  screening: {
    minVolume: 1000000,  // Minimum 24h volume in USD
    maxSpread: 0.1,      // Maximum spread %
    requireAlignment: true,  // Require both timeframes to align
    minConfidence: 60    // Minimum signal confidence score
  },

  // Performance settings
  performance: {
    batchSize: 10,       // Number of pairs to process in parallel
    updateInterval: 1000, // ms between updates
    cacheEnabled: true,
    cacheTTL: 60000      // ms
  }
};
