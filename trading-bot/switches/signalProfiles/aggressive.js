/**
 * Aggressive Signal Profile
 * 
 * Maximizes trading opportunities with higher risk tolerance.
 * More trades, larger positions, higher leverage.
 */

module.exports = {
  name: 'aggressive',
  description: 'Growth focus - more trades, higher leverage, larger positions',
  
  weights: {
    rsi: 25,
    macd: 25,
    williamsR: 20,
    ao: 20,
    emaTrend: 15,
    stochastic: 12,
    bollinger: 12,
    kdj: 15,
    obv: 12,
    dom: 15
  },
  
  microstructure: {
    buySellRatio: 18,
    priceRatio: 18,
    fundingRate: 18
  },
  
  thresholds: {
    minScoreForEntry: 40,
    strongSignalThreshold: 60,
    minConfidence: 30,
    minIndicatorsAgreeing: 3
  },
  
  riskManagement: {
    stopLossROI: 1.0,
    takeProfitROI: 3.0,
    maxPositionPercent: 5.0,
    maxOpenPositions: 8,
    maxDailyDrawdown: 10.0
  },
  
  leverage: {
    maxLeverage: 100,
    defaultLeverage: 75,
    volatilityReduction: 0.25
  },
  
  filters: {
    requireTrendAlignment: false,
    requireVolumeConfirmation: false,
    avoidFundingExtreme: false,
    minATRPercent: 0.1,
    maxATRPercent: 5.0
  }
};
