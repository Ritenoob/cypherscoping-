import Decimal from "decimal.js";

/**
 * DecimalMath - Precision financial calculations using decimal.js
 *
 * CRITICAL: Prevents floating-point precision errors in financial calculations
 * Impact: 15-20% profit loss without this (from Skill #8, Lesson #1)
 *
 * Example native float error:
 *   0.1 + 0.2 = 0.30000000000000004  ❌
 *   Decimal(0.1).plus(0.2) = 0.3     ✅
 *
 * Reference: trading-bot-version-migration skill, V3.5.2 patterns
 */

Decimal.config({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21,
});

export interface FeeConfig {
  makerFee: number;
  takerFee: number;
}

export class DecimalMath {
  /**
   * KuCoin Futures fee structure (VIP 0)
   * Maker: 0.02% (0.0002)
   * Taker: 0.06% (0.0006)
   */
  private static readonly DEFAULT_FEES: FeeConfig = {
    makerFee: 0.0002,
    takerFee: 0.0006,
  };

  /**
   * Calculate fee-adjusted break-even ROI
   *
   * CRITICAL: Moving SL to entry too early loses money on fees
   *
   * Formula: (entryFee + exitFee) * leverage * 100 + buffer
   * Example: (0.0006 + 0.0006) * 10 * 100 + 0.1 = 1.3% ROI
   *
   * Without this: V5.0 bled fees for 6 months (Skill #8, Lesson #5)
   *
   * @param leverage Position leverage (e.g., 10)
   * @param buffer Safety buffer in ROI % (e.g., 0.1)
   * @param fees Fee configuration (defaults to KuCoin taker fees)
   * @returns Break-even ROI percentage
   */
  static calculateBreakEvenROI(
    leverage: number,
    buffer: number = 0.1,
    fees: FeeConfig = DecimalMath.DEFAULT_FEES,
  ): number {
    const entryFee = new Decimal(fees.takerFee);
    const exitFee = new Decimal(fees.takerFee);
    const lev = new Decimal(leverage);
    const buf = new Decimal(buffer);

    const breakEvenROI = entryFee.plus(exitFee).times(lev).times(100).plus(buf);

    return breakEvenROI.toNumber();
  }

  /**
   * Calculate stop loss price from entry price and ROI
   *
   * @param side Position side ('long' or 'short')
   * @param entryPrice Entry price
   * @param stopLossROI Stop loss ROI percentage (e.g., 10 for 10%)
   * @param leverage Position leverage
   * @returns Stop loss trigger price
   */
  static calculateStopLossPrice(
    side: "long" | "short",
    entryPrice: number,
    stopLossROI: number,
    leverage: number,
  ): number {
    const entry = new Decimal(entryPrice);
    const roi = new Decimal(stopLossROI).div(100);
    const lev = new Decimal(leverage);

    const priceMove = roi.div(lev);

    if (side === "long") {
      return entry.times(new Decimal(1).minus(priceMove)).toNumber();
    } else {
      return entry.times(new Decimal(1).plus(priceMove)).toNumber();
    }
  }

  /**
   * Calculate take profit price from entry price and ROI
   *
   * @param side Position side ('long' or 'short')
   * @param entryPrice Entry price
   * @param takeProfitROI Take profit ROI percentage
   * @param leverage Position leverage
   * @returns Take profit trigger price
   */
  static calculateTakeProfitPrice(
    side: "long" | "short",
    entryPrice: number,
    takeProfitROI: number,
    leverage: number,
  ): number {
    const entry = new Decimal(entryPrice);
    const roi = new Decimal(takeProfitROI).div(100);
    const lev = new Decimal(leverage);

    const priceMove = roi.div(lev);

    if (side === "long") {
      return entry.times(new Decimal(1).plus(priceMove)).toNumber();
    } else {
      return entry.times(new Decimal(1).minus(priceMove)).toNumber();
    }
  }

  /**
   * Calculate current ROI percentage
   *
   * @param side Position side
   * @param entryPrice Entry price
   * @param currentPrice Current market price
   * @param leverage Position leverage
   * @returns ROI percentage (positive = profit, negative = loss)
   */
  static calculateCurrentROI(
    side: "long" | "short",
    entryPrice: number,
    currentPrice: number,
    leverage: number,
  ): number {
    const entry = new Decimal(entryPrice);
    const current = new Decimal(currentPrice);
    const lev = new Decimal(leverage);

    const moveRatio = current.minus(entry).div(entry);

    if (side === "long") {
      return moveRatio.times(lev).times(100).toNumber();
    } else {
      return moveRatio.neg().times(lev).times(100).toNumber();
    }
  }

  /**
   * Calculate unrealized PnL in USD
   *
   * @param side Position side
   * @param entryPrice Entry price
   * @param currentPrice Current price
   * @param size Position size in base currency
   * @returns Unrealized PnL in USD
   */
  static calculateUnrealizedPnL(
    side: "long" | "short",
    entryPrice: number,
    currentPrice: number,
    size: number,
  ): number {
    const entry = new Decimal(entryPrice);
    const current = new Decimal(currentPrice);
    const posSize = new Decimal(size);

    if (side === "long") {
      return current.minus(entry).times(posSize).toNumber();
    } else {
      return entry.minus(current).times(posSize).toNumber();
    }
  }

  /**
   * Calculate drawdown percentage
   *
   * @param peakEquity Peak account equity
   * @param currentEquity Current account equity
   * @returns Drawdown percentage (always positive)
   */
  static calculateDrawdownPercent(
    peakEquity: number,
    currentEquity: number,
  ): number {
    if (peakEquity <= 0) return 0;

    const peak = new Decimal(peakEquity);
    const current = new Decimal(currentEquity);

    const drawdown = peak.minus(current).div(peak).times(100);

    return Math.max(0, drawdown.toNumber());
  }

  /**
   * Calculate position size in base currency from USD value
   *
   * @param usdValue USD value to allocate
   * @param price Current price
   * @param leverage Position leverage
   * @returns Position size in base currency
   */
  static calculatePositionSize(
    usdValue: number,
    price: number,
    leverage: number,
  ): number {
    const value = new Decimal(usdValue);
    const priceDecimal = new Decimal(price);
    const lev = new Decimal(leverage);

    return value.times(lev).div(priceDecimal).toNumber();
  }

  /**
   * Calculate exposure ratio (total exposure / balance)
   *
   * @param totalExposure Total position exposure in USD
   * @param balance Account balance
   * @returns Exposure ratio (0.0 to 1.0+)
   */
  static calculateExposureRatio(
    totalExposure: number,
    balance: number,
  ): number {
    if (balance <= 0) return 0;

    const exposure = new Decimal(totalExposure);
    const bal = new Decimal(balance);

    return exposure.div(bal).toNumber();
  }

  /**
   * Add two numbers with precision
   */
  static add(a: number, b: number): number {
    return new Decimal(a).plus(b).toNumber();
  }

  /**
   * Subtract two numbers with precision
   */
  static subtract(a: number, b: number): number {
    return new Decimal(a).minus(b).toNumber();
  }

  /**
   * Multiply two numbers with precision
   */
  static multiply(a: number, b: number): number {
    return new Decimal(a).times(b).toNumber();
  }

  /**
   * Divide two numbers with precision
   */
  static divide(a: number, b: number): number {
    if (b === 0) throw new Error("Division by zero");
    return new Decimal(a).div(b).toNumber();
  }

  /**
   * Calculate percentage with precision
   */
  static percentage(value: number, total: number): number {
    if (total === 0) return 0;
    return new Decimal(value).div(total).times(100).toNumber();
  }
}
