import { SignalNormalizer } from '../src/core/SignalNormalizer';

describe('SignalNormalizer', () => {
  let normalizer: SignalNormalizer;

  beforeEach(() => {
    normalizer = new SignalNormalizer();
  });

  describe('Strength Multipliers', () => {
    it('should use skill spec multipliers', () => {
      expect(normalizer.getStrengthMultiplier('very_strong')).toBe(1.2);
      expect(normalizer.getStrengthMultiplier('strong')).toBe(1.0);
      expect(normalizer.getStrengthMultiplier('moderate')).toBe(0.7);
      expect(normalizer.getStrengthMultiplier('weak')).toBe(0.5);
      expect(normalizer.getStrengthMultiplier('extreme')).toBe(1.1);
    });

    it('should return default multiplier for unknown strength', () => {
      expect(normalizer.getStrengthMultiplier('invalid' as any)).toBe(1.0);
      expect(normalizer.getStrengthMultiplier(null)).toBe(1.0);
    });
  });

  describe('7-Tier Classification', () => {
    it('should classify EXTREME_BUY at boundary (90)', () => {
      expect(normalizer.classifyScore(90)).toBe('EXTREME_BUY');
      expect(normalizer.classifyScore(130)).toBe('EXTREME_BUY');
    });

    it('should classify STRONG_BUY at boundary (70)', () => {
      expect(normalizer.classifyScore(70)).toBe('STRONG_BUY');
      expect(normalizer.classifyScore(89)).toBe('STRONG_BUY');
    });

    it('should classify BUY at boundary (20)', () => {
      expect(normalizer.classifyScore(20)).toBe('BUY');
      expect(normalizer.classifyScore(50)).toBe('BUY');
      expect(normalizer.classifyScore(69)).toBe('BUY');
    });

    it('should classify NEUTRAL at boundaries (-19 to 19)', () => {
      expect(normalizer.classifyScore(19)).toBe('NEUTRAL');
      expect(normalizer.classifyScore(0)).toBe('NEUTRAL');
      expect(normalizer.classifyScore(-19)).toBe('NEUTRAL');
    });

    it('should classify SELL at boundary (-20)', () => {
      expect(normalizer.classifyScore(-20)).toBe('SELL');
      expect(normalizer.classifyScore(-50)).toBe('SELL');
      expect(normalizer.classifyScore(-69)).toBe('SELL');
    });

    it('should classify STRONG_SELL and EXTREME_SELL correctly', () => {
      expect(normalizer.classifyScore(-70)).toBe('STRONG_SELL');
      expect(normalizer.classifyScore(-89)).toBe('STRONG_SELL');
      expect(normalizer.classifyScore(-90)).toBe('EXTREME_SELL');
      expect(normalizer.classifyScore(-130)).toBe('EXTREME_SELL');
    });
  });

  describe('Signal Priority Hierarchy', () => {
    it('should prioritize divergence over level signals', () => {
      const signals = [
        { type: 'bullish_level', direction: 'bullish' as const, strength: 'moderate' as const, message: 'Level signal', metadata: {}, source: 'RSI' },
        { type: 'bullish_divergence', direction: 'bullish' as const, strength: 'strong' as const, message: 'Divergence signal', metadata: {}, source: 'RSI' }
      ];

      const highest = normalizer.getHighestPrioritySignal(signals);
      expect(highest!.type).toBe('bullish_divergence');
    });

    it('should prioritize crossover over zone signals', () => {
      const signals = [
        { type: 'bullish_zone', direction: 'bullish' as const, strength: 'moderate' as const, message: 'Zone signal', metadata: {}, source: 'WR' },
        { type: 'bullish_crossover', direction: 'bullish' as const, strength: 'strong' as const, message: 'Crossover signal', metadata: {}, source: 'MACD' }
      ];

      const highest = normalizer.getHighestPrioritySignal(signals);
      expect(highest!.type).toBe('bullish_crossover');
    });

    it('should handle all 4 priority tiers', () => {
      const signals = [
        { type: 'bullish_level', direction: 'bullish' as const, strength: 'weak' as const, message: 'Tier 4', metadata: {}, source: 'A' },
        { type: 'bullish_zone', direction: 'bullish' as const, strength: 'moderate' as const, message: 'Tier 3', metadata: {}, source: 'B' },
        { type: 'bullish_crossover', direction: 'bullish' as const, strength: 'strong' as const, message: 'Tier 2', metadata: {}, source: 'C' },
        { type: 'bullish_divergence', direction: 'bullish' as const, strength: 'very_strong' as const, message: 'Tier 1', metadata: {}, source: 'D' }
      ];

      const highest = normalizer.getHighestPrioritySignal(signals);
      expect(highest!.type).toBe('bullish_divergence');
      expect(highest!.message).toBe('Tier 1');
    });
  });

  describe('normalize() validation', () => {
    it('should throw error for missing required fields', () => {
      const invalidSignal = { type: 'test', direction: 'bullish' } as any;
      expect(() => normalizer.validateSignal(invalidSignal, 'TestIndicator')).toThrow('Missing field');
    });

    it('should throw error for invalid direction', () => {
      const invalidSignal = {
        type: 'test',
        direction: 'invalid',
        strength: 'strong',
        message: 'test',
        metadata: {}
      } as any;
      expect(() => normalizer.validateSignal(invalidSignal, 'TestIndicator')).toThrow('Invalid direction');
    });

    it('should throw error for invalid strength', () => {
      const invalidSignal = {
        type: 'test',
        direction: 'bullish',
        strength: 'invalid',
        message: 'test',
        metadata: {}
      } as any;
      expect(() => normalizer.validateSignal(invalidSignal, 'TestIndicator')).toThrow('Invalid strength');
    });

    it('should accept valid signal', () => {
      const validSignal = {
        type: 'bullish_crossover',
        direction: 'bullish' as const,
        strength: 'strong' as const,
        message: 'Valid signal',
        metadata: {}
      };
      expect(() => normalizer.validateSignal(validSignal, 'MACD')).not.toThrow();
    });
  });

  describe('generateComposite()', () => {
    const makeSignal = (type: string, direction: 'bullish' | 'bearish', strength: string) => ({
      type, direction, strength, message: `${type} signal`, metadata: {}, source: 'test'
    });

    it('should return zero score for empty indicator results', () => {
      const result = normalizer.generateComposite({}, null);
      expect(result.normalizedScore).toBe(0);
      expect(result.normalizedTier).toBe('NEUTRAL');
      expect(result.normalizedConfidence).toBe(50);
      expect(result.signalPriorityBreakdown).toEqual({});
      expect(result.strengthMultipliersUsed).toEqual({});
    });

    it('should score bullish signals positively', () => {
      const result = normalizer.generateComposite({
        williamsR: {
          signals: [makeSignal('bullish_crossover', 'bullish', 'strong')]
        }
      }, null);
      expect(result.normalizedScore).toBeGreaterThan(0);
      expect(result.normalizedTier).toBe('NEUTRAL');
    });

    it('should score bearish signals negatively', () => {
      const result = normalizer.generateComposite({
        williamsR: {
          signals: [makeSignal('bearish_crossover', 'bearish', 'strong')]
        }
      }, null);
      expect(result.normalizedScore).toBeLessThan(0);
      expect(result.signalPriorityBreakdown['bearish_crossover']).toBeLessThan(0);
    });

    it('should apply strength multipliers correctly', () => {
      const strongResult = normalizer.generateComposite({
        rsi: { signals: [makeSignal('bullish_zone', 'bullish', 'very_strong')] }
      }, null);
      const weakResult = normalizer.generateComposite({
        rsi: { signals: [makeSignal('bullish_zone', 'bullish', 'weak')] }
      }, null);
      expect(strongResult.normalizedScore).toBeGreaterThan(weakResult.normalizedScore);
      expect(strongResult.strengthMultipliersUsed['very_strong']).toBe(1.2);
      expect(weakResult.strengthMultipliersUsed['weak']).toBe(0.5);
    });

    it('should apply priority weighting correctly', () => {
      const tier1 = normalizer.generateComposite({
        a: { signals: [makeSignal('bullish_divergence', 'bullish', 'strong')] }
      }, null);
      const tier4 = normalizer.generateComposite({
        a: { signals: [makeSignal('bullish_level', 'bullish', 'strong')] }
      }, null);
      expect(tier1.normalizedScore).toBe(12);
      expect(tier4.normalizedScore).toBe(5);
    });

    it('should clamp score at -130/+130', () => {
      const signals = Array.from({ length: 20 }, () =>
        makeSignal('bullish_divergence', 'bullish', 'very_strong')
      );
      const result = normalizer.generateComposite({
        test: { signals }
      }, null);
      expect(result.normalizedScore).toBe(130);

      const bearishSignals = Array.from({ length: 20 }, () =>
        makeSignal('bearish_divergence', 'bearish', 'very_strong')
      );
      const bearishResult = normalizer.generateComposite({
        test: { signals: bearishSignals }
      }, null);
      expect(bearishResult.normalizedScore).toBe(-130);
    });

    it('should calculate confidence based on signal count', () => {
      expect(normalizer.generateComposite({}, null).normalizedConfidence).toBe(50);
      const oneSignal = normalizer.generateComposite({
        a: { signals: [makeSignal('bullish_zone', 'bullish', 'strong')] }
      }, null);
      expect(oneSignal.normalizedConfidence).toBe(55);
      const tenSignals = normalizer.generateComposite({
        a: { signals: Array.from({ length: 10 }, () =>
          makeSignal('bullish_zone', 'bullish', 'strong')
        )}
      }, null);
      expect(tenSignals.normalizedConfidence).toBe(100);
    });

    it('should partially cancel mixed bullish/bearish signals', () => {
      const result = normalizer.generateComposite({
        a: { signals: [
          makeSignal('bullish_crossover', 'bullish', 'strong'),
          makeSignal('bearish_crossover', 'bearish', 'strong'),
        ]}
      }, null);
      expect(result.normalizedScore).toBe(0);
    });

    it('should collect signals from williamsR and other indicators', () => {
      const result = normalizer.generateComposite({
        williamsR: { signals: [makeSignal('bullish_zone', 'bullish', 'strong')] },
        rsi: { signals: [makeSignal('bullish_zone', 'bullish', 'strong')] },
      }, null);
      expect(result.normalizedScore).toBe(14);
      expect(result.normalizedConfidence).toBe(60);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty signals array', () => {
      const result = normalizer.getHighestPrioritySignal([]);
      expect(result).toBeNull();
    });

    it('should handle null strength in getStrengthMultiplier', () => {
      expect(normalizer.getStrengthMultiplier(null)).toBe(1.0);
    });
  });
});
