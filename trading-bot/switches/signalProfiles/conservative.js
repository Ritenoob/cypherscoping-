/**
 * Conservative Signal Profile
 * 
 * Prioritizes capital preservation over returns.
 * Uses tighter thresholds and lower position sizes.
 */

module.exports = {
  name: 'conservative',
  description: 'Capital preservation focus - fewer trades, higher accuracy',
  
  weights: {
    rsi: 20,
    macd: 15,
    williamsR: 15,
    ao: 10,
    emaTrend: 25,
    stochastic: 8,
    bollinger: 8,
    kdj: 10,
    obv: 8,
    dom: 10
  },
  
  microstructure: {
    buySellRatio: 12,
    priceRatio: 12,
    fundingRate: 12
  },
  
  thresholds: {
    minScoreForEntry: 70,
    strongSignalThreshold: 85,
    minConfidence: 60,
    minIndicatorsAgreeing: 5
  },
  
  riskManagement: {
    stopLossROI: 0.3,
    takeProfitROI: 1.5,
    maxPositionPercent: 1.0,
    maxOpenPositions: 3,
    maxDailyDrawdown: 3.0
  },
  
  leverage: {
    maxLeverage: 25,
    defaultLeverage: 15,
    volatilityReduction: 0.5
  },
  
  filters: {
    requireTrendAlignment: true,
    requireVolumeConfirmation: true,
    avoidFundingExtreme: true,
    minATRPercent: 0.3,
    maxATRPercent: 2.0
  }
};
