import { WalkForwardValidator, TradeSample } from '../src/core/walk-forward-validator';

function buildSamples(count: number, pnlPercent: number): TradeSample[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: Date.now() + i * 60000,
    pnlPercent,
    featureKey: 'trend:strong:trending'
  }));
}

describe('WalkForwardValidator', () => {
  test('passes for positive expectancy and strong profit factor', () => {
    const validator = new WalkForwardValidator();
    const samples = [...buildSamples(18, 1.2), ...buildSamples(12, -0.4)];
    const result = validator.validate(samples);
    expect(result.passed).toBe(true);
    expect(result.outOfSample.expectancyPercent).toBeGreaterThanOrEqual(0.1);
  });

  test('fails when out-of-sample expectancy is negative', () => {
    const validator = new WalkForwardValidator();
    const good = buildSamples(20, 1);
    const bad = buildSamples(10, -1.5).map((s, i) => ({ ...s, timestamp: s.timestamp + 999999 + i }));
    const result = validator.validate([...good, ...bad]);
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain('oos_expectancy_below_threshold');
  });
});
