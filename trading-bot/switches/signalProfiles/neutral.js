/**
 * Neutral Signal Profile
 * 
 * Balanced approach with moderate risk and reward.
 * Default profile for most market conditions.
 */

module.exports = {
  name: 'neutral',
  description: 'Balanced approach - moderate risk/reward for typical conditions',
  
  weights: {
    rsi: 25,
    macd: 20,
    williamsR: 20,
    ao: 15,
    emaTrend: 20,
    stochastic: 10,
    bollinger: 10,
    kdj: 15,
    obv: 10,
    dom: 15
  },
  
  microstructure: {
    buySellRatio: 15,
    priceRatio: 15,
    fundingRate: 15
  },
  
  thresholds: {
    minScoreForEntry: 50,
    strongSignalThreshold: 70,
    minConfidence: 40,
    minIndicatorsAgreeing: 4
  },
  
  riskManagement: {
    stopLossROI: 0.5,
    takeProfitROI: 2.0,
    maxPositionPercent: 2.0,
    maxOpenPositions: 5,
    maxDailyDrawdown: 5.0
  },
  
  leverage: {
    maxLeverage: 50,
    defaultLeverage: 50,
    volatilityReduction: 0.4
  },
  
  filters: {
    requireTrendAlignment: true,
    requireVolumeConfirmation: false,
    avoidFundingExtreme: true,
    minATRPercent: 0.2,
    maxATRPercent: 3.0
  }
};
