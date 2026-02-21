import { SignalGenerator } from '../src/core/SignalGenerator';

describe('Signal authorization/side consistency', () => {
  test('authorized signals always include a non-null side', () => {
    const generator = new SignalGenerator();
    const signal = generator.generate(
      {
        williamsR: {
          value: -85,
          signal: 'bullish',
          score: 30,
          signals: [
            {
              type: 'bullish_crossover',
              direction: 'bullish',
              strength: 'strong',
              message: 'Bullish crossover',
              source: 'WilliamsR'
            }
          ]
        } as any,
        rsi: { value: 25, signal: 'bullish', score: 30 },
        macd: { value: 1.2, signal: 'bullish', score: 25 },
        stochastic: { value: 15, signal: 'bullish', score: 22 },
        emaTrend: { value: 2, signal: 'bullish', score: 20, trend: 'bullish' } as any
      },
      { buySellRatio: { ratio: 0.8 } },
      { prevScore: 0, candleIndex: 25, atrPercent: 1, isChoppy: false, drawdownPct: 0 }
    );

    if (signal.authorized) {
      expect(signal.side).not.toBeNull();
      expect(['long', 'short']).toContain(signal.side);
    } else {
      expect(signal.side).toBeTruthy();
    }
  });
});
