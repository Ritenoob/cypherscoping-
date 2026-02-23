export interface ATRResult {
  value: number;
  signal: 'neutral';
  score: number;
  atrPercent: number;
}

export class ATRIndicator {
  constructor(private readonly defaultPeriod: number = 14) {}

  calculate(highs: number[], lows: number[], closes: number[], period: number = this.defaultPeriod): ATRResult {
    if (highs.length < 2 || lows.length < 2 || closes.length < 2) {
      return { value: 0, signal: 'neutral', score: 0, atrPercent: 0 };
    }

    const trValues: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(closes[i] - lows[i - 1]));
      trValues.push(tr);
    }

    const atr = this.calculateSMA(trValues, period);
    const latestClose = closes[closes.length - 1];
    const atrPercent = latestClose === 0 ? 0 : (atr / latestClose) * 100;

    return { value: atr, signal: 'neutral', score: 0, atrPercent };
  }

  private calculateSMA(data: number[], period: number): number {
    if (data.length === 0) return 0;
    if (data.length < period) {
      return data.reduce((a, b) => a + b, 0) / data.length;
    }
    return data.slice(-period).reduce((a, b) => a + b, 0) / period;
  }
}
