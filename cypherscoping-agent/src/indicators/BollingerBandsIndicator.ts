export interface BollingerBandsResult {
  value: number;
  upper: number;
  middle: number;
  lower: number;
  percentB: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
}

export class BollingerBandsIndicator {
  constructor(
    private readonly defaultPeriod: number = 20,
    private readonly defaultMultiplier: number = 2,
    private readonly scoreMagnitude: number = 20
  ) {}

  calculate(
    closes: number[],
    period: number = this.defaultPeriod,
    multiplier: number = this.defaultMultiplier
  ): BollingerBandsResult {
    if (!Array.isArray(closes) || closes.length < period) {
      return {
        value: 0.5,
        upper: 0,
        middle: 0,
        lower: 0,
        percentB: 0.5,
        signal: 'neutral',
        score: 0
      };
    }

    const middle = this.calculateSMA(closes, period);
    const window = closes.slice(-period);
    const variance = window.reduce((acc, v) => acc + (v - middle) * (v - middle), 0) / period;
    const stdDev = Math.sqrt(variance);
    const upper = middle + multiplier * stdDev;
    const lower = middle - multiplier * stdDev;
    const latest = closes[closes.length - 1];
    const width = upper - lower;
    const percentB = width === 0 ? 0.5 : (latest - lower) / width;

    if (latest < lower) {
      return {
        value: percentB,
        upper,
        middle,
        lower,
        percentB,
        signal: 'bullish',
        score: this.scoreMagnitude
      };
    }
    if (latest > upper) {
      return {
        value: percentB,
        upper,
        middle,
        lower,
        percentB,
        signal: 'bearish',
        score: -this.scoreMagnitude
      };
    }
    return {
      value: percentB,
      upper,
      middle,
      lower,
      percentB,
      signal: 'neutral',
      score: 0
    };
  }

  private calculateSMA(data: number[], period: number): number {
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }
}
