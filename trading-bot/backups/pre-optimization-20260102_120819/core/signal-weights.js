/**
 * SIGNAL WEIGHTS CONFIGURATION
 * Adjust indicator importance here
 * Total points should add up to ~100-120
 */

module.exports = {
  // Current weights (your v3.4.2 defaults)
  weights: {
    // RSI - Relative Strength Index (Momentum)
    rsi: {
      max: 25,           // Maximum points for RSI
      oversold: 30,      // Below this = bullish
      oversoldMild: 40,  // Approaching oversold
      overbought: 70,    // Above this = bearish
      overboughtMild: 60 // Approaching overbought
    },

    // Williams %R - Momentum oscillator
    williamsR: {
      max: 20,
      oversold: -80,
      overbought: -20
    },

    // MACD - Trend following
    macd: {
      max: 20
    },

    // Awesome Oscillator - Momentum
    ao: {
      max: 15
    },

    // EMA Trend - Long-term direction
    emaTrend: {
      max: 20
    },

    // Stochastic - Momentum + crossovers
    stochastic: {
      max: 10,
      oversold: 20,
      overbought: 80
    },

    // Bollinger Bands - Volatility
    bollinger: {
      max: 10
    },

    // KDJ - Stochastic extension with J line (momentum)
    kdj: {
      max: 15,
      kPeriod: 9,         // K period (fast stochastic)
      dPeriod: 3,         // D period (smoothing)
      smooth: 3,          // Smoothing factor
      jOversold: 20,      // J line oversold threshold
      jOverbought: 80     // J line overbought threshold
    },

    // OBV - On-Balance Volume (volume momentum)
    obv: {
      max: 10,
      slopeWindow: 14,    // Window for slope calculation
      smoothingEma: 5,    // EMA smoothing period
      zScoreCap: 2.0,     // Cap for z-score normalization
      normalize: true     // Normalize to -100/+100 scale
    },

    // DOM - Depth of Market (LIVE-ONLY, requires WebSocket feed)
    dom: {
      max: 15,
      enabled: false,     // Set to true only when live DOM data available
      liveOnlyValidation: true,  // Flag indicating this requires live data
      depthLevels: [5, 10, 25],  // Depth levels to analyze
      imbalanceThreshold: 0.3,   // 30% imbalance = signal
      spreadWeight: 0.3,         // Weight for spread analysis
      wallDetection: false       // Optional: detect large walls
    }
  },

  // Alternative weight profiles you can switch to
  profiles: {
    // Conservative - Favor trend indicators
    conservative: {
      rsi: { max: 15, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
      williamsR: { max: 10, oversold: -80, overbought: -20 },
      macd: { max: 25 },  // Higher weight on MACD
      ao: { max: 10 },
      emaTrend: { max: 30 },  // Much higher weight on trend
      stochastic: { max: 5, oversold: 20, overbought: 80 },
      bollinger: { max: 5 },
      kdj: { max: 10, kPeriod: 9, dPeriod: 3, smooth: 3, jOversold: 20, jOverbought: 80 },
      obv: { max: 8, slopeWindow: 14, smoothingEma: 5, zScoreCap: 2.0, normalize: true },
      dom: { max: 12, enabled: false, liveOnlyValidation: true, depthLevels: [5,10,25], imbalanceThreshold: 0.3, spreadWeight: 0.3, wallDetection: false }
    },

    // Aggressive - Favor momentum indicators
    aggressive: {
      rsi: { max: 30, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
      williamsR: { max: 25, oversold: -80, overbought: -20 },
      macd: { max: 15 },
      ao: { max: 20 },
      emaTrend: { max: 10 },  // Lower weight on trend
      stochastic: { max: 15, oversold: 20, overbought: 80 },
      bollinger: { max: 5 },
      kdj: { max: 20, kPeriod: 9, dPeriod: 3, smooth: 3, jOversold: 25, jOverbought: 75 },
      obv: { max: 12, slopeWindow: 14, smoothingEma: 5, zScoreCap: 2.0, normalize: true },
      dom: { max: 18, enabled: false, liveOnlyValidation: true, depthLevels: [5,10,25], imbalanceThreshold: 0.25, spreadWeight: 0.3, wallDetection: false }
    },

    // Balanced - Equal distribution
    balanced: {
      rsi: { max: 20, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
      williamsR: { max: 15, oversold: -80, overbought: -20 },
      macd: { max: 15 },
      ao: { max: 15 },
      emaTrend: { max: 15 },
      stochastic: { max: 10, oversold: 20, overbought: 80 },
      bollinger: { max: 10 },
      kdj: { max: 15, kPeriod: 9, dPeriod: 3, smooth: 3, jOversold: 20, jOverbought: 80 },
      obv: { max: 10, slopeWindow: 14, smoothingEma: 5, zScoreCap: 2.0, normalize: true },
      dom: { max: 15, enabled: false, liveOnlyValidation: true, depthLevels: [5,10,25], imbalanceThreshold: 0.3, spreadWeight: 0.3, wallDetection: false }
    },

    // Scalping - Quick signals
    scalping: {
      rsi: { max: 20, oversold: 35, oversoldMild: 45, overbought: 65, overboughtMild: 55 },  // Tighter levels
      williamsR: { max: 25, oversold: -75, overbought: -25 },  // Tighter levels
      macd: { max: 10 },  // Less weight on slower indicator
      ao: { max: 20 },
      emaTrend: { max: 5 },  // Trend less important for scalping
      stochastic: { max: 15, oversold: 25, overbought: 75 },  // Tighter levels
      bollinger: { max: 5 },
      kdj: { max: 18, kPeriod: 9, dPeriod: 3, smooth: 3, jOversold: 30, jOverbought: 70 },
      obv: { max: 8, slopeWindow: 7, smoothingEma: 3, zScoreCap: 2.0, normalize: true },
      dom: { max: 20, enabled: false, liveOnlyValidation: true, depthLevels: [5,10,25], imbalanceThreshold: 0.2, spreadWeight: 0.4, wallDetection: true }
    },

    // Swing Trading - Longer timeframes
    swingTrading: {
      rsi: { max: 20, oversold: 25, oversoldMild: 35, overbought: 75, overboughtMild: 65 },  // Wider levels
      williamsR: { max: 15, oversold: -85, overbought: -15 },  // Wider levels
      macd: { max: 30 },  // High weight - important for swings
      ao: { max: 15 },
      emaTrend: { max: 25 },  // Trend very important
      stochastic: { max: 5, oversold: 15, overbought: 85 },  // Wider levels
      bollinger: { max: 10 },
      kdj: { max: 12, kPeriod: 14, dPeriod: 5, smooth: 3, jOversold: 15, jOverbought: 85 },
      obv: { max: 12, slopeWindow: 21, smoothingEma: 8, zScoreCap: 2.0, normalize: true },
      dom: { max: 10, enabled: false, liveOnlyValidation: true, depthLevels: [10,25,50], imbalanceThreshold: 0.35, spreadWeight: 0.2, wallDetection: false }
    }
  },

  // Active profile (change this to switch)
  activeProfile: 'default',  // Options: 'default', 'conservative', 'aggressive', 'balanced', 'scalping', 'swingTrading'

  // Signal thresholds
  thresholds: {
    strongBuy: 70,    // Score >= this = STRONG_BUY
    buy: 50,          // Score >= this = BUY
    buyWeak: 30,      // Score >= this = BUY (weak)
    strongSell: -70,  // Score <= this = STRONG_SELL
    sell: -50,        // Score <= this = SELL
    sellWeak: -30     // Score <= this = SELL (weak)
  }
};
