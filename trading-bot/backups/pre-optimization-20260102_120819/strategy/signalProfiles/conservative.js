/**
 * CONSERVATIVE SIGNAL PROFILE
 * Favor trend indicators, lower risk
 */

module.exports = {
  name: 'conservative',
  description: 'Conservative trading profile favoring trend confirmation',
  
  weights: {
    rsi: { max: 15, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
    williamsR: { max: 10, oversold: -80, overbought: -20 },
    macd: { max: 25 },
    ao: { max: 10 },
    emaTrend: { max: 30 },
    stochastic: { max: 5, oversold: 20, overbought: 80 },
    bollinger: { max: 5 },
    kdj: { max: 10, kPeriod: 9, dPeriod: 3, smooth: 3, jOversold: 20, jOverbought: 80 },
    obv: { max: 8, slopeWindow: 14, smoothingEma: 5, zScoreCap: 2.0, normalize: true },
    dom: { max: 12, enabled: false, liveOnlyValidation: true, depthLevels: [5,10,25] }
  },
  
  thresholds: {
    strongBuy: 75,
    buy: 55,
    buyWeak: 35,
    strongSell: -75,
    sell: -55,
    sellWeak: -35
  },

  risk: {
    maxLeverage: 5,
    stopLossROI: 0.3,
    takeProfitROI: 1.5,
    positionSize: 0.3
  }
};
