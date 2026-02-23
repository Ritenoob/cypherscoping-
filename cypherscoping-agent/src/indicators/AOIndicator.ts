export interface AOResult {
  value: number;
  ao: number;
  histogram: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
}

export class AOIndicator {
  constructor(private readonly scoreMagnitude: number = 17) {}

  calculate(highs: number[], lows: number[], fastPeriod: number = 5, slowPeriod: number = 34): AOResult {
    if (!Array.isArray(highs) || !Array.isArray(lows) || highs.length === 0 || lows.length === 0) {
      return { value: 0, ao: 0, histogram: 0, signal: 'neutral', score: 0 };
    }

    const medianPrices = highs.map((h, i) => (h + lows[i]) / 2);
    const smaFast = this.calculateSMA(medianPrices, fastPeriod);
    const smaSlow = this.calculateSMA(medianPrices, slowPeriod);
    const ao = smaFast - smaSlow;
    const prevAO = this.calculateSMA(medianPrices.slice(0, -2), slowPeriod);
    const histogram = ao > 0 && ao > prevAO ? this.scoreMagnitude : ao < 0 && ao < prevAO ? this.scoreMagnitude : 0;

    if (ao > 0) {
      return { value: ao, ao, histogram, signal: 'bullish', score: this.scoreMagnitude };
    }
    if (ao < 0) {
      return { value: ao, ao, histogram, signal: 'bearish', score: -this.scoreMagnitude };
    }
    return { value: ao, ao, histogram, signal: 'neutral', score: 0 };
  }

  private calculateSMA(data: number[], period: number): number {
    if (data.length === 0) return 0;
    if (data.length < period) return data.reduce((a, b) => a + b, 0) / data.length;
    return data.slice(-period).reduce((a, b) => a + b, 0) / period;
  }
}
