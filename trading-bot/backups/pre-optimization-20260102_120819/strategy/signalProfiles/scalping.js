/**
 * SCALPING SIGNAL PROFILE
 * Quick signals with tighter thresholds
 */

module.exports = {
  name: 'scalping',
  description: 'Scalping profile for quick trades with tight stops',
  
  weights: {
    rsi: { max: 20, oversold: 35, oversoldMild: 45, overbought: 65, overboughtMild: 55 },
    williamsR: { max: 25, oversold: -75, overbought: -25 },
    macd: { max: 10 },
    ao: { max: 20 },
    emaTrend: { max: 5 },
    stochastic: { max: 15, oversold: 25, overbought: 75 },
    bollinger: { max: 5 },
    kdj: { max: 18, kPeriod: 9, dPeriod: 3, smooth: 3, jOversold: 30, jOverbought: 70 },
    obv: { max: 8, slopeWindow: 7, smoothingEma: 3, zScoreCap: 2.0, normalize: true },
    dom: { max: 20, enabled: false, liveOnlyValidation: true, depthLevels: [5,10,25] }
  },
  
  thresholds: {
    strongBuy: 60,
    buy: 40,
    buyWeak: 20,
    strongSell: -60,
    sell: -40,
    sellWeak: -20
  },

  risk: {
    maxLeverage: 15,
    stopLossROI: 0.2,
    takeProfitROI: 0.8,
    positionSize: 0.6
  }
};
