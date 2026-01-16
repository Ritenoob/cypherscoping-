/**
 * BALANCED SIGNAL PROFILE
 * Equal distribution of weights
 */

module.exports = {
  name: 'balanced',
  description: 'Balanced trading profile with equal indicator weights',
  
  weights: {
    rsi: { max: 20, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
    williamsR: { max: 15, oversold: -80, overbought: -20 },
    macd: { max: 15 },
    ao: { max: 15 },
    emaTrend: { max: 15 },
    stochastic: { max: 10, oversold: 20, overbought: 80 },
    bollinger: { max: 10 },
    kdj: { max: 15, kPeriod: 9, dPeriod: 3, smooth: 3, jOversold: 20, jOverbought: 80 },
    obv: { max: 10, slopeWindow: 14, smoothingEma: 5, zScoreCap: 2.0, normalize: true },
    dom: { max: 15, enabled: false, liveOnlyValidation: true, depthLevels: [5,10,25] }
  },
  
  thresholds: {
    strongBuy: 70,
    buy: 50,
    buyWeak: 30,
    strongSell: -70,
    sell: -50,
    sellWeak: -30
  },

  risk: {
    maxLeverage: 10,
    stopLossROI: 0.5,
    takeProfitROI: 2.0,
    positionSize: 0.5
  }
};
