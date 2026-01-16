/**
 * Leverage Calculator
 * 
 * Volatility-aware leverage and position sizing.
 * Based on ATR percentage and risk parameters.
 */

const Decimal = require('decimal.js');

class LeverageCalculator {
  constructor(config = {}) {
    this.baseLeverage = config.baseLeverage || 50;
    this.maxLeverage = config.maxLeverage || 100;
    this.minLeverage = config.minLeverage || 1;
    
    this.atrThresholds = config.atrThresholds || {
      veryLow: { max: 0.3, leverage: 100 },
      low: { max: 0.5, leverage: 75 },
      medium: { max: 1.0, leverage: 50 },
      high: { max: 2.0, leverage: 25 },
      veryHigh: { max: 3.0, leverage: 10 },
      extreme: { max: Infinity, leverage: 5 }
    };
    
    this.riskMultiplier = config.riskMultiplier || 1.0;
  }

  calculateOptimalLeverage(atrPercent, volatilityFactor = 1.0) {
    let recommendedLeverage = this.baseLeverage;
    
    for (const [level, threshold] of Object.entries(this.atrThresholds)) {
      if (atrPercent <= threshold.max) {
        recommendedLeverage = threshold.leverage;
        break;
      }
    }
    
    recommendedLeverage = Math.round(recommendedLeverage * volatilityFactor);
    
    return Math.max(this.minLeverage, Math.min(this.maxLeverage, recommendedLeverage));
  }

  calculatePositionSize(params) {
    const {
      balance,
      riskPercent,
      entryPrice,
      stopLossPrice,
      leverage
    } = params;
    
    const balanceD = new Decimal(balance);
    const entryD = new Decimal(entryPrice);
    const stopD = new Decimal(stopLossPrice);
    const riskD = new Decimal(riskPercent).div(100);
    
    const riskAmount = balanceD.mul(riskD);
    const priceDiff = entryD.minus(stopD).abs();
    const priceDiffPercent = priceDiff.div(entryD);
    
    const positionValue = riskAmount.div(priceDiffPercent);
    
    const margin = positionValue.div(leverage);
    
    return {
      positionValue: positionValue.toNumber(),
      margin: margin.toNumber(),
      riskAmount: riskAmount.toNumber(),
      leverage
    };
  }

  calculateBreakEvenMove(params) {
    const {
      entryPrice,
      leverage,
      makerFee = 0.0002,
      takerFee = 0.0006,
      isMaker = false
    } = params;
    
    const fee = isMaker ? makerFee : takerFee;
    const totalFees = new Decimal(fee).mul(2);
    
    const breakEvenPercent = totalFees.div(leverage).mul(100);
    
    const entryD = new Decimal(entryPrice);
    const breakEvenMoveUp = entryD.mul(new Decimal(1).plus(breakEvenPercent.div(100)));
    const breakEvenMoveDown = entryD.mul(new Decimal(1).minus(breakEvenPercent.div(100)));
    
    return {
      breakEvenPercent: breakEvenPercent.toNumber(),
      breakEvenROI: totalFees.mul(leverage).mul(100).toNumber(),
      longBreakEven: breakEvenMoveUp.toNumber(),
      shortBreakEven: breakEvenMoveDown.toNumber()
    };
  }

  calculateRiskRewardRatio(params) {
    const {
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      leverage
    } = params;
    
    const entryD = new Decimal(entryPrice);
    const stopD = new Decimal(stopLossPrice);
    const tpD = new Decimal(takeProfitPrice);
    
    const riskDistance = entryD.minus(stopD).abs();
    const rewardDistance = tpD.minus(entryD).abs();
    
    const riskPercent = riskDistance.div(entryD).mul(leverage).mul(100);
    const rewardPercent = rewardDistance.div(entryD).mul(leverage).mul(100);
    
    const ratio = rewardDistance.div(riskDistance);
    
    return {
      riskPercent: riskPercent.toNumber(),
      rewardPercent: rewardPercent.toNumber(),
      ratio: ratio.toNumber(),
      riskROI: riskPercent.toNumber(),
      rewardROI: rewardPercent.toNumber()
    };
  }

  getVolatilityCategory(atrPercent) {
    if (atrPercent <= 0.3) return 'veryLow';
    if (atrPercent <= 0.5) return 'low';
    if (atrPercent <= 1.0) return 'medium';
    if (atrPercent <= 2.0) return 'high';
    if (atrPercent <= 3.0) return 'veryHigh';
    return 'extreme';
  }

  recommendSettings(atrPercent, accountBalance) {
    const leverage = this.calculateOptimalLeverage(atrPercent);
    const volatilityCategory = this.getVolatilityCategory(atrPercent);
    
    let positionSizePercent;
    let stopLossROI;
    let takeProfitROI;
    
    switch (volatilityCategory) {
      case 'veryLow':
        positionSizePercent = 3.0;
        stopLossROI = 0.3;
        takeProfitROI = 1.0;
        break;
      case 'low':
        positionSizePercent = 2.0;
        stopLossROI = 0.4;
        takeProfitROI = 1.5;
        break;
      case 'medium':
        positionSizePercent = 1.5;
        stopLossROI = 0.5;
        takeProfitROI = 2.0;
        break;
      case 'high':
        positionSizePercent = 1.0;
        stopLossROI = 0.7;
        takeProfitROI = 2.5;
        break;
      case 'veryHigh':
        positionSizePercent = 0.5;
        stopLossROI = 1.0;
        takeProfitROI = 3.0;
        break;
      default:
        positionSizePercent = 0.25;
        stopLossROI = 1.5;
        takeProfitROI = 4.0;
    }
    
    return {
      leverage,
      volatilityCategory,
      atrPercent,
      positionSizePercent,
      stopLossROI,
      takeProfitROI,
      maxMargin: new Decimal(accountBalance).mul(positionSizePercent / 100).toNumber()
    };
  }
}

module.exports = LeverageCalculator;
