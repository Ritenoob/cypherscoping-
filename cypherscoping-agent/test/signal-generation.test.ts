import { SignalGenerator } from '../src/core/SignalGenerator';

function indicator(value: number, signal: 'bullish' | 'bearish' | 'neutral', score: number) {
  return { value, signal, score };
}

describe('SignalGenerator', () => {
  test('produces a complete CompositeSignal payload', () => {
    const generator = new SignalGenerator();
    const out = generator.generate(
      {
        williamsR: { value: -82, signal: 'bullish', score: 25, signals: [] } as any,
        rsi: indicator(28, 'bullish', 30),
        macd: indicator(1.2, 'bullish', 25),
        stochastic: indicator(18, 'bullish', 22),
        emaTrend: { value: 1, signal: 'bullish', score: 20, trend: 'up' } as any
      },
      {},
      { prevScore: 0, candleIndex: 10, atrPercent: 1, isChoppy: false, drawdownPct: 0 }
    );

    expect(typeof out.compositeScore).toBe('number');
    expect(out.timestamp).toBeGreaterThan(0);
    expect(out.indicatorScores instanceof Map).toBe(true);
    expect(['long', 'short', null]).toContain(out.side);
    expect(typeof out.authorized).toBe('boolean');
  });

  test('never returns authorized=true with side=null', () => {
    const generator = new SignalGenerator();
    const out = generator.generate(
      {
        williamsR: { value: -50, signal: 'neutral', score: 0, signals: [] } as any,
        rsi: indicator(75, 'bearish', -40),
        macd: indicator(-1, 'bearish', -30),
        stochastic: indicator(85, 'bearish', -28),
        kdj: indicator(90, 'bearish', -20),
        emaTrend: { value: -2, signal: 'bearish', score: -25, trend: 'down' } as any
      },
      {},
      { prevScore: -20, candleIndex: 8, atrPercent: 1, isChoppy: false, drawdownPct: 0 }
    );

    if (out.authorized) {
      expect(out.side).not.toBeNull();
    }
  });
});
