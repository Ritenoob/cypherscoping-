import { DecimalMath, FeeConfig } from '../src/core/DecimalMath';

describe('DecimalMath', () => {
  describe('Precision Math', () => {
    it('should handle floating-point precision correctly', () => {
      expect(0.1 + 0.2).not.toBe(0.3);

      expect(DecimalMath.add(0.1, 0.2)).toBe(0.3);
    });

    it('should add numbers with precision', () => {
      expect(DecimalMath.add(0.1, 0.2)).toBe(0.3);
      expect(DecimalMath.add(1.23, 4.56)).toBe(5.79);
    });

    it('should subtract numbers with precision', () => {
      expect(DecimalMath.subtract(0.3, 0.1)).toBe(0.2);
      expect(DecimalMath.subtract(5.79, 1.23)).toBe(4.56);
    });

    it('should multiply numbers with precision', () => {
      expect(DecimalMath.multiply(0.1, 0.2)).toBeCloseTo(0.02, 10);
      expect(DecimalMath.multiply(1.5, 2.5)).toBe(3.75);
    });

    it('should divide numbers with precision', () => {
      expect(DecimalMath.divide(0.3, 0.1)).toBe(3);
      expect(DecimalMath.divide(5, 2)).toBe(2.5);
    });

    it('should throw on division by zero', () => {
      expect(() => DecimalMath.divide(5, 0)).toThrow('Division by zero');
    });
  });

  describe('Break-Even ROI Calculation', () => {
    const DEFAULT_FEES: FeeConfig = {
      makerFee: 0.0002,
      takerFee: 0.0006
    };

    it('should calculate fee-adjusted break-even for 10x leverage', () => {
      const breakEven = DecimalMath.calculateBreakEvenROI(10, 0.1, DEFAULT_FEES);
      expect(breakEven).toBeCloseTo(1.3, 10);
    });

    it('should calculate fee-adjusted break-even for 20x leverage', () => {
      const breakEven = DecimalMath.calculateBreakEvenROI(20, 0.1, DEFAULT_FEES);
      expect(breakEven).toBeCloseTo(2.5, 10);
    });

    it('should use default buffer of 0.1', () => {
      const breakEven = DecimalMath.calculateBreakEvenROI(10);
      expect(breakEven).toBeCloseTo(1.3, 10);
    });

    it('should accept custom buffer', () => {
      const breakEven = DecimalMath.calculateBreakEvenROI(10, 0.5, DEFAULT_FEES);
      expect(breakEven).toBeCloseTo(1.7, 10);
    });

    it('should handle high leverage correctly', () => {
      const breakEven = DecimalMath.calculateBreakEvenROI(100, 0.1, DEFAULT_FEES);
      expect(breakEven).toBeCloseTo(12.1, 10);
    });
  });

  describe('Stop Loss Price Calculation', () => {
    it('should calculate SL for long position', () => {
      const sl = DecimalMath.calculateStopLossPrice('long', 50000, 10, 10);
      expect(sl).toBeCloseTo(49500, 2);
    });

    it('should calculate SL for short position', () => {
      const sl = DecimalMath.calculateStopLossPrice('short', 50000, 10, 10);
      expect(sl).toBeCloseTo(50500, 2);
    });

    it('should handle high leverage correctly', () => {
      const sl = DecimalMath.calculateStopLossPrice('long', 3000, 5, 50);
      expect(sl).toBeCloseTo(2997, 2);
    });

    it('should be below entry for long positions', () => {
      const entry = 3500;
      const sl = DecimalMath.calculateStopLossPrice('long', entry, 8, 10);
      expect(sl).toBeLessThan(entry);
    });

    it('should be above entry for short positions', () => {
      const entry = 3500;
      const sl = DecimalMath.calculateStopLossPrice('short', entry, 8, 10);
      expect(sl).toBeGreaterThan(entry);
    });
  });

  describe('Take Profit Price Calculation', () => {
    it('should calculate TP for long position', () => {
      const tp = DecimalMath.calculateTakeProfitPrice('long', 50000, 30, 10);
      expect(tp).toBeCloseTo(51500, 2);
    });

    it('should calculate TP for short position', () => {
      const tp = DecimalMath.calculateTakeProfitPrice('short', 50000, 30, 10);
      expect(tp).toBeCloseTo(48500, 2);
    });

    it('should be above entry for long positions', () => {
      const entry = 3500;
      const tp = DecimalMath.calculateTakeProfitPrice('long', entry, 20, 10);
      expect(tp).toBeGreaterThan(entry);
    });

    it('should be below entry for short positions', () => {
      const entry = 3500;
      const tp = DecimalMath.calculateTakeProfitPrice('short', entry, 20, 10);
      expect(tp).toBeLessThan(entry);
    });
  });

  describe('Current ROI Calculation', () => {
    it('should calculate positive ROI for profitable long', () => {
      const roi = DecimalMath.calculateCurrentROI('long', 3000, 3030, 10);
      expect(roi).toBeCloseTo(10, 2);
    });

    it('should calculate negative ROI for losing long', () => {
      const roi = DecimalMath.calculateCurrentROI('long', 3000, 2970, 10);
      expect(roi).toBeCloseTo(-10, 2);
    });

    it('should calculate positive ROI for profitable short', () => {
      const roi = DecimalMath.calculateCurrentROI('short', 3000, 2970, 10);
      expect(roi).toBeCloseTo(10, 2);
    });

    it('should calculate negative ROI for losing short', () => {
      const roi = DecimalMath.calculateCurrentROI('short', 3000, 3030, 10);
      expect(roi).toBeCloseTo(-10, 2);
    });

    it('should handle zero ROI correctly', () => {
      const roi = DecimalMath.calculateCurrentROI('long', 3000, 3000, 10);
      expect(roi).toBe(0);
    });

    it('should scale with leverage correctly', () => {
      const roi10x = DecimalMath.calculateCurrentROI('long', 3000, 3030, 10);
      const roi20x = DecimalMath.calculateCurrentROI('long', 3000, 3030, 20);
      expect(roi20x).toBeCloseTo(roi10x * 2, 2);
    });
  });

  describe('Unrealized PnL Calculation', () => {
    it('should calculate PnL for profitable long', () => {
      const pnl = DecimalMath.calculateUnrealizedPnL('long', 3000, 3030, 1);
      expect(pnl).toBeCloseTo(30, 2);
    });

    it('should calculate PnL for losing long', () => {
      const pnl = DecimalMath.calculateUnrealizedPnL('long', 3000, 2970, 1);
      expect(pnl).toBeCloseTo(-30, 2);
    });

    it('should calculate PnL for profitable short', () => {
      const pnl = DecimalMath.calculateUnrealizedPnL('short', 3000, 2970, 1);
      expect(pnl).toBeCloseTo(30, 2);
    });

    it('should calculate PnL for losing short', () => {
      const pnl = DecimalMath.calculateUnrealizedPnL('short', 3000, 3030, 1);
      expect(pnl).toBeCloseTo(-30, 2);
    });

    it('should scale with position size', () => {
      const pnl1 = DecimalMath.calculateUnrealizedPnL('long', 3000, 3030, 1);
      const pnl2 = DecimalMath.calculateUnrealizedPnL('long', 3000, 3030, 2);
      expect(pnl2).toBeCloseTo(pnl1 * 2, 2);
    });
  });

  describe('Drawdown Calculation', () => {
    it('should calculate drawdown correctly', () => {
      const dd = DecimalMath.calculateDrawdownPercent(10000, 9500);
      expect(dd).toBeCloseTo(5, 2);
    });

    it('should return 0 for zero or negative peak', () => {
      expect(DecimalMath.calculateDrawdownPercent(0, 1000)).toBe(0);
      expect(DecimalMath.calculateDrawdownPercent(-1000, 500)).toBe(0);
    });

    it('should return 0 when current equals peak', () => {
      const dd = DecimalMath.calculateDrawdownPercent(10000, 10000);
      expect(dd).toBe(0);
    });

    it('should return 0 when current exceeds peak', () => {
      const dd = DecimalMath.calculateDrawdownPercent(10000, 11000);
      expect(dd).toBe(0);
    });

    it('should handle 100% drawdown', () => {
      const dd = DecimalMath.calculateDrawdownPercent(10000, 0);
      expect(dd).toBe(100);
    });
  });

  describe('Position Size Calculation', () => {
    it('should calculate position size correctly', () => {
      const size = DecimalMath.calculatePositionSize(1000, 3000, 10);
      expect(size).toBeCloseTo(3.333, 3);
    });

    it('should scale with leverage', () => {
      const size10x = DecimalMath.calculatePositionSize(1000, 3000, 10);
      const size20x = DecimalMath.calculatePositionSize(1000, 3000, 20);
      expect(size20x).toBeCloseTo(size10x * 2, 3);
    });

    it('should scale with USD value', () => {
      const size1000 = DecimalMath.calculatePositionSize(1000, 3000, 10);
      const size2000 = DecimalMath.calculatePositionSize(2000, 3000, 10);
      expect(size2000).toBeCloseTo(size1000 * 2, 3);
    });
  });

  describe('Exposure Ratio Calculation', () => {
    it('should calculate exposure ratio correctly', () => {
      const ratio = DecimalMath.calculateExposureRatio(8000, 10000);
      expect(ratio).toBeCloseTo(0.8, 10);
    });

    it('should return 0 for zero balance', () => {
      const ratio = DecimalMath.calculateExposureRatio(5000, 0);
      expect(ratio).toBe(0);
    });

    it('should handle ratios > 1', () => {
      const ratio = DecimalMath.calculateExposureRatio(15000, 10000);
      expect(ratio).toBeCloseTo(1.5, 10);
    });
  });

  describe('Percentage Calculation', () => {
    it('should calculate percentage correctly', () => {
      expect(DecimalMath.percentage(50, 200)).toBeCloseTo(25, 10);
      expect(DecimalMath.percentage(75, 100)).toBeCloseTo(75, 10);
    });

    it('should return 0 for zero total', () => {
      expect(DecimalMath.percentage(50, 0)).toBe(0);
    });

    it('should handle 100%', () => {
      expect(DecimalMath.percentage(100, 100)).toBe(100);
    });
  });

  describe('Property-Based Tests (Edge Cases)', () => {
    it('property: long SL always below entry for any valid input', () => {
      const entries = [100, 1000, 10000, 50000];
      const rois = [1, 5, 10, 20, 50];
      const leverages = [1, 5, 10, 20, 50, 100];

      for (const entry of entries) {
        for (const roi of rois) {
          for (const lev of leverages) {
            const sl = DecimalMath.calculateStopLossPrice('long', entry, roi, lev);
            expect(sl).toBeLessThan(entry);
          }
        }
      }
    });

    it('property: short SL always above entry for any valid input', () => {
      const entries = [100, 1000, 10000, 50000];
      const rois = [1, 5, 10, 20, 50];
      const leverages = [1, 5, 10, 20, 50, 100];

      for (const entry of entries) {
        for (const roi of rois) {
          for (const lev of leverages) {
            const sl = DecimalMath.calculateStopLossPrice('short', entry, roi, lev);
            expect(sl).toBeGreaterThan(entry);
          }
        }
      }
    });

    it('property: long TP always above entry for any valid input', () => {
      const entries = [100, 1000, 10000, 50000];
      const rois = [1, 5, 10, 20, 50];
      const leverages = [1, 5, 10, 20, 50, 100];

      for (const entry of entries) {
        for (const roi of rois) {
          for (const lev of leverages) {
            const tp = DecimalMath.calculateTakeProfitPrice('long', entry, roi, lev);
            expect(tp).toBeGreaterThan(entry);
          }
        }
      }
    });

    it('property: break-even ROI scales linearly with leverage', () => {
      const leverages = [5, 10, 20, 50];
      let prevBreakEven = 0;

      for (const lev of leverages) {
        const breakEven = DecimalMath.calculateBreakEvenROI(lev, 0.1);
        expect(breakEven).toBeGreaterThan(prevBreakEven);
        prevBreakEven = breakEven;
      }
    });

    it('property: drawdown percentage bounded [0, 100]', () => {
      const peaks = [5000, 10000, 20000];
      const currents = [0, 2500, 5000, 7500, 10000, 15000];

      for (const peak of peaks) {
        for (const current of currents) {
          const dd = DecimalMath.calculateDrawdownPercent(peak, current);
          expect(dd).toBeGreaterThanOrEqual(0);
          expect(dd).toBeLessThanOrEqual(100);
        }
      }
    });
  });
});
