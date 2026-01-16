/**
 * OPTIMIZER CONFIGURATION
 * Configuration for live strategy optimizer
 */

module.exports = {
  // Optimization settings
  enabled: false,  // Enable live optimization
  
  // Evaluation window
  evaluationWindow: 24 * 60 * 60 * 1000,  // 24 hours in ms
  
  // Metrics to optimize
  metrics: {
    winRate: { weight: 0.3, target: 0.55 },
    profitFactor: { weight: 0.3, target: 2.0 },
    sharpeRatio: { weight: 0.2, target: 1.5 },
    maxDrawdown: { weight: 0.2, target: 0.15, minimize: true }
  },
  
  // Confidence gating
  minTradesForEvaluation: 20,
  minConfidenceScore: 0.7,
  
  // Profile switching
  autoSwitch: false,  // Automatically switch to best performing profile
  switchCooldown: 4 * 60 * 60 * 1000,  // 4 hours between switches
  
  // Logging
  logInterval: 60 * 60 * 1000,  // Log stats every hour
  resultsPath: './strategy/optimizer/results'
};
