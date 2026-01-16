/**
 * AGGRESSIVE SIGNAL PROFILE
 * Favor momentum indicators, higher risk
 */

module.exports = {
  name: 'aggressive',
  description: 'Aggressive trading profile favoring momentum signals',
  
  weights: {
    rsi: { max: 30, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
    williamsR: { max: 25, oversold: -80, overbought: -20 },
    macd: { max: 15 },
    ao: { max: 20 },
    emaTrend: { max: 10 },
    stochastic: { max: 15, oversold: 20, overbought: 80 },
    bollinger: { max: 5 },
    kdj: { max: 20, kPeriod: 9, dPeriod: 3, smooth: 3, jOversold: 25, jOverbought: 75 },
    obv: { max: 12, slopeWindow: 14, smoothingEma: 5, zScoreCap: 2.0, normalize: true },
    dom: { max: 18, enabled: false, liveOnlyValidation: true, depthLevels: [5,10,25] }
  },
  
  thresholds: {
    strongBuy: 65,
    buy: 45,
    buyWeak: 25,
    strongSell: -65,
    sell: -45,
    sellWeak: -25
  },

  risk: {
    maxLeverage: 20,
    stopLossROI: 0.8,
    takeProfitROI: 3.0,
    positionSize: 0.7
  }
};
