/**
 * Position Calculator
 * 
 * Critical trading formulas for:
 * - Position sizing
 * - Break-even ROI
 * - Stop Loss / Take Profit levels
 * - Liquidation price estimation
 * - Fee calculations
 */

const Decimal = require('decimal.js');

class PositionCalculator {
  constructor(config = {}) {
    this.defaultLeverage = config.leverage || 50;
    this.makerFee = new Decimal(config.makerFee || 0.0002);
    this.takerFee = new Decimal(config.takerFee || 0.0006);
    this.maintenanceMargin = new Decimal(config.maintenanceMargin || 0.004);
    this.slippageBuffer = new Decimal(config.slippageBuffer || 0.0002);
  }

  /**
   * Calculate position size
   * Formula: size = floor(notional / (price × multiplier) / lotSize) × lotSize
   */
  calculatePositionSize(params) {
    const {
      balance,
      riskPercent,
      entryPrice,
      leverage,
      multiplier = 1,
      lotSize = 1
    } = params;
    
    const balanceD = new Decimal(balance);
    const priceD = new Decimal(entryPrice);
    const leverageD = new Decimal(leverage || this.defaultLeverage);
    const multiplierD = new Decimal(multiplier);
    const lotSizeD = new Decimal(lotSize);
    const riskPercentD = new Decimal(riskPercent);
    
    const notional = balanceD.mul(riskPercentD.div(100)).mul(leverageD);
    
    const rawSize = notional.div(priceD.mul(multiplierD));
    
    const size = rawSize.div(lotSizeD).floor().mul(lotSizeD);
    
    return {
      size: size.toNumber(),
      notional: size.mul(priceD).mul(multiplierD).toNumber(),
      margin: size.mul(priceD).mul(multiplierD).div(leverageD).toNumber()
    };
  }

  /**
   * Calculate break-even ROI
   * Formula: BE_ROI = (entryFee + exitFee) × leverage × 100 + buffer
   */
  calculateBreakEvenROI(params) {
    const {
      leverage,
      isMaker = false,
      buffer = 0.02
    } = params;
    
    const leverageD = new Decimal(leverage || this.defaultLeverage);
    const fee = isMaker ? this.makerFee : this.takerFee;
    const bufferD = new Decimal(buffer);
    
    const totalFees = fee.mul(2);
    
    const breakEvenROI = totalFees.mul(leverageD).mul(100).plus(bufferD);
    
    return {
      breakEvenROI: breakEvenROI.toNumber(),
      totalFeesPercent: totalFees.mul(100).toNumber(),
      feeAdjustedBreakEven: breakEvenROI.toNumber()
    };
  }

  /**
   * Calculate Stop Loss price
   * Formula (Long): SL_price = entry × (1 - (SL_ROI / leverage / 100))
   * Formula (Short): SL_price = entry × (1 + (SL_ROI / leverage / 100))
   */
  calculateStopLoss(params) {
    const {
      entryPrice,
      stopLossROI,
      leverage,
      side
    } = params;
    
    const entryD = new Decimal(entryPrice);
    const roiD = new Decimal(stopLossROI);
    const leverageD = new Decimal(leverage || this.defaultLeverage);
    
    const roiFactor = roiD.div(leverageD).div(100);
    
    let stopPrice;
    if (side === 'long') {
      stopPrice = entryD.mul(new Decimal(1).minus(roiFactor));
    } else {
      stopPrice = entryD.mul(new Decimal(1).plus(roiFactor));
    }
    
    return {
      stopLossPrice: stopPrice.toNumber(),
      distancePercent: roiFactor.mul(100).toNumber(),
      roiAtStop: stopLossROI
    };
  }

  /**
   * Calculate Take Profit price
   * Formula (Long): TP_price = entry × (1 + (TP_ROI / leverage / 100))
   * Formula (Short): TP_price = entry × (1 - (TP_ROI / leverage / 100))
   */
  calculateTakeProfit(params) {
    const {
      entryPrice,
      takeProfitROI,
      leverage,
      side
    } = params;
    
    const entryD = new Decimal(entryPrice);
    const roiD = new Decimal(takeProfitROI);
    const leverageD = new Decimal(leverage || this.defaultLeverage);
    
    const roiFactor = roiD.div(leverageD).div(100);
    
    let tpPrice;
    if (side === 'long') {
      tpPrice = entryD.mul(new Decimal(1).plus(roiFactor));
    } else {
      tpPrice = entryD.mul(new Decimal(1).minus(roiFactor));
    }
    
    return {
      takeProfitPrice: tpPrice.toNumber(),
      distancePercent: roiFactor.mul(100).toNumber(),
      roiAtTP: takeProfitROI
    };
  }

  /**
   * Calculate Liquidation price
   * Formula (Long): liq = entry × (1 - (1/leverage) × (1 - maintMargin))
   * Formula (Short): liq = entry × (1 + (1/leverage) × (1 - maintMargin))
   */
  calculateLiquidationPrice(params) {
    const {
      entryPrice,
      leverage,
      side
    } = params;
    
    const entryD = new Decimal(entryPrice);
    const leverageD = new Decimal(leverage || this.defaultLeverage);
    
    const marginFactor = new Decimal(1).div(leverageD);
    const adjustedFactor = marginFactor.mul(new Decimal(1).minus(this.maintenanceMargin));
    
    let liqPrice;
    if (side === 'long') {
      liqPrice = entryD.mul(new Decimal(1).minus(adjustedFactor));
    } else {
      liqPrice = entryD.mul(new Decimal(1).plus(adjustedFactor));
    }
    
    return {
      liquidationPrice: liqPrice.toNumber(),
      distancePercent: adjustedFactor.mul(100).toNumber(),
      marginRatio: marginFactor.mul(100).toNumber()
    };
  }

  /**
   * Calculate ROI from entry and exit prices
   */
  calculateROI(params) {
    const {
      entryPrice,
      exitPrice,
      leverage,
      side
    } = params;
    
    const entryD = new Decimal(entryPrice);
    const exitD = new Decimal(exitPrice);
    const leverageD = new Decimal(leverage || this.defaultLeverage);
    
    let priceChange;
    if (side === 'long') {
      priceChange = exitD.minus(entryD).div(entryD);
    } else {
      priceChange = entryD.minus(exitD).div(entryD);
    }
    
    const roi = priceChange.mul(leverageD).mul(100);
    
    const totalFees = this.takerFee.mul(2);
    const feeAdjustedROI = roi.minus(totalFees.mul(100));
    
    return {
      grossROI: roi.toNumber(),
      netROI: feeAdjustedROI.toNumber(),
      priceChangePercent: priceChange.mul(100).toNumber(),
      feesPercent: totalFees.mul(100).toNumber()
    };
  }

  /**
   * Calculate complete position details
   */
  calculatePosition(params) {
    const {
      balance,
      riskPercent,
      entryPrice,
      leverage,
      side,
      stopLossROI,
      takeProfitROI,
      multiplier = 1,
      lotSize = 1
    } = params;
    
    const position = this.calculatePositionSize({
      balance,
      riskPercent,
      entryPrice,
      leverage,
      multiplier,
      lotSize
    });
    
    const breakEven = this.calculateBreakEvenROI({ leverage });
    
    const stopLoss = this.calculateStopLoss({
      entryPrice,
      stopLossROI,
      leverage,
      side
    });
    
    const takeProfit = this.calculateTakeProfit({
      entryPrice,
      takeProfitROI,
      leverage,
      side
    });
    
    const liquidation = this.calculateLiquidationPrice({
      entryPrice,
      leverage,
      side
    });
    
    const riskReward = new Decimal(takeProfitROI).div(stopLossROI).toNumber();
    
    return {
      size: position.size,
      notional: position.notional,
      margin: position.margin,
      leverage,
      side,
      entry: entryPrice,
      stopLoss: stopLoss.stopLossPrice,
      takeProfit: takeProfit.takeProfitPrice,
      liquidation: liquidation.liquidationPrice,
      breakEvenROI: breakEven.breakEvenROI,
      riskRewardRatio: riskReward,
      maxLoss: position.margin * (stopLossROI / 100),
      maxProfit: position.margin * (takeProfitROI / 100)
    };
  }
}

module.exports = PositionCalculator;
