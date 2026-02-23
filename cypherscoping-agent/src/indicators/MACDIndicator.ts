export interface MACDResult {
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
  histogram: number;
}

export class MACDIndicator {
  constructor(
    private readonly fastPeriod: number = 12,
    private readonly slowPeriod: number = 26,
    private readonly signalPeriod: number = 9,
    private readonly scoreMagnitude: number = 18
  ) {}

  calculate(
    closes: number[],
    fastPeriod: number = this.fastPeriod,
    slowPeriod: number = this.slowPeriod,
    signalPeriod: number = this.signalPeriod
  ): MACDResult {
    if (!Array.isArray(closes) || closes.length < Math.max(fastPeriod, slowPeriod) + 1) {
      return { value: 0, signal: 'neutral', score: 0, histogram: 0 };
    }

    const emaFast = this.calculateEMA(closes, fastPeriod);
    const emaSlow = this.calculateEMA(closes, slowPeriod);
    const macdValues = emaFast.map((v, i) => v - emaSlow[i]);
    const macdLine = macdValues[macdValues.length - 1];

    // Preserve legacy behavior: derive signal from recent window.
    const signalWindow = macdValues.slice(-signalPeriod);
    const signalSeries = this.calculateEMA(signalWindow, signalPeriod);
    const signalLine = signalSeries[signalSeries.length - 1];
    const histogram = macdLine - signalLine;

    if (histogram > 0) {
      return { value: macdLine, signal: 'bullish', score: this.scoreMagnitude, histogram };
    }
    if (histogram < 0) {
      return { value: macdLine, signal: 'bearish', score: -this.scoreMagnitude, histogram };
    }
    return { value: macdLine, signal: 'neutral', score: 0, histogram };
  }

  private calculateEMA(data: number[], period: number): number[] {
    if (!Array.isArray(data) || data.length === 0) return [0];
    const multiplier = 2 / (period + 1);
    const ema: number[] = [data[0]];
    for (let i = 1; i < data.length; i++) {
      ema.push((data[i] - ema[i - 1]) * multiplier + ema[i - 1]);
    }
    return ema;
  }
}
