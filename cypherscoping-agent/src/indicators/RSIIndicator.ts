export interface RSIResult {
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
}

export class RSIIndicator {
  constructor(
    private readonly defaultPeriod: number = 14,
    private readonly oversold: number = 30,
    private readonly overbought: number = 70,
    private readonly scoreMagnitude: number = 40
  ) {}

  calculate(closes: number[], period: number = this.defaultPeriod): RSIResult {
    if (!Array.isArray(closes) || closes.length < period + 1) {
      return { value: 50, signal: 'neutral', score: 0 };
    }

    const changes = closes.slice(1).map((c, i) => c - closes[i]);
    const gains = changes.map((c) => (c > 0 ? c : 0));
    const losses = changes.map((c) => (c < 0 ? Math.abs(c) : 0));

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
    const rs = this.safeRelativeStrength(avgGain, avgLoss);
    const rsi = 100 - 100 / (1 + rs);

    if (rsi <= this.oversold) {
      return { value: rsi, signal: 'bullish', score: this.scoreMagnitude };
    }
    if (rsi >= this.overbought) {
      return { value: rsi, signal: 'bearish', score: -this.scoreMagnitude };
    }
    return { value: rsi, signal: 'neutral', score: 0 };
  }

  private safeRelativeStrength(avgGain: number, avgLoss: number): number {
    if (avgLoss === 0 && avgGain === 0) return 1;
    if (avgLoss === 0) return Number.POSITIVE_INFINITY;
    return avgGain / avgLoss;
  }
}
