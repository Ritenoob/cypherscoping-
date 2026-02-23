export interface ADXResult {
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
  trend: 'trending' | 'ranging' | 'neutral';
}

export class ADXIndicator {
  constructor(private readonly defaultPeriod: number = 14, private readonly scoreMagnitude: number = 20) {}

  calculate(highs: number[], lows: number[], closes: number[], period: number = this.defaultPeriod): ADXResult {
    if (highs.length < period + 2 || lows.length < period + 2 || closes.length < period + 2) {
      return { value: 0, signal: 'neutral', score: 0, trend: 'neutral' };
    }

    const trValues: Array<{ tr: number; plusDM: number; minusDM: number }> = [];
    for (let i = 1; i < closes.length; i++) {
      const high = highs[i];
      const tr = Math.max(high - lows[i], Math.abs(high - closes[i - 1]), Math.abs(closes[i] - lows[i - 1]));
      const plusDM = high > closes[i - 1] ? tr : 0;
      const minusDM = high < closes[i - 1] ? tr : 0;
      trValues.push({ tr, plusDM, minusDM });
    }

    const smoothPlus = this.calculateEMA(trValues.map((v) => v.plusDM), period);
    const smoothMinus = this.calculateEMA(trValues.map((v) => v.minusDM), period);
    if (smoothPlus.length === 0 || smoothMinus.length === 0 || trValues.length <= period) {
      return { value: 0, signal: 'neutral', score: 0, trend: 'neutral' };
    }

    let adxSum = 0;
    for (let i = period; i < trValues.length; i++) {
      adxSum += Math.abs(trValues[i].tr);
    }
    const divisor = trValues.length - period;
    const adx = divisor > 0 ? adxSum / divisor : 0;
    const plusDI = smoothPlus[smoothPlus.length - 1];
    const minusDI = smoothMinus[smoothMinus.length - 1];

    if (adx > 25) {
      if (plusDI > minusDI) {
        return { value: adx, signal: 'bullish', score: this.scoreMagnitude, trend: 'trending' };
      }
      return { value: adx, signal: 'bearish', score: -this.scoreMagnitude, trend: 'trending' };
    }
    if (adx < 20) {
      return { value: adx, signal: 'neutral', score: 0, trend: 'ranging' };
    }
    return { value: adx, signal: 'neutral', score: 0, trend: 'neutral' };
  }

  private calculateEMA(data: number[], period: number): number[] {
    if (data.length === 0) return [];
    const multiplier = 2 / (period + 1);
    let prevEma = data[0];
    const ema: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const currentEma = data[i] * multiplier + prevEma * (1 - multiplier);
      ema.push(currentEma);
      prevEma = currentEma;
    }
    return ema;
  }
}
