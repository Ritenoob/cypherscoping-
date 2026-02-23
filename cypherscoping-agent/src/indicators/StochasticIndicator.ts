export interface StochasticResult {
  value: number;
  k: number;
  d: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
}

export class StochasticIndicator {
  constructor(
    private readonly defaultKPeriod: number = 14,
    private readonly defaultDPeriod: number = 3,
    private readonly scoreMagnitude: number = 18
  ) {}

  calculate(
    highs: number[],
    lows: number[],
    closes: number[],
    kPeriod: number = this.defaultKPeriod,
    dPeriod: number = this.defaultDPeriod
  ): StochasticResult {
    if (!highs.length || !lows.length || !closes.length) {
      return { value: 50, k: 50, d: 50, signal: 'neutral', score: 0 };
    }

    const period = kPeriod + dPeriod + 2;
    const sliceHighs = highs.slice(-period);
    const sliceLows = lows.slice(-period);
    const latestClose = closes[closes.length - 1];
    const lowestLow = Math.min(...sliceLows);
    const highestHigh = Math.max(...sliceHighs);
    const range = highestHigh - lowestLow;

    const k = range === 0 ? 50 : ((latestClose - lowestLow) / range) * 100;
    const kValues = Array.from({ length: Math.max(1, kPeriod) }, () => k);
    const d = this.calculateD(kValues, dPeriod);

    const kOversold = k < 20 && d < 20;
    const kOverbought = k > 80 && d > 80;

    if (kOversold) {
      return { value: k, k, d, signal: 'bullish', score: this.scoreMagnitude };
    }
    if (kOverbought) {
      return { value: k, k, d, signal: 'bearish', score: -this.scoreMagnitude };
    }
    return { value: k, k, d, signal: 'neutral', score: 0 };
  }

  private calculateD(kValues: number[], dPeriod: number): number {
    const values = kValues.slice(-Math.max(1, dPeriod));
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }
}
