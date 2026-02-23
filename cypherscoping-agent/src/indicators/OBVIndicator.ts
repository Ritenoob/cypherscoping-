export interface OBVResult {
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
}

export class OBVIndicator {
  constructor(private readonly scoreMagnitude: number = 18) {}

  calculate(closes: number[], volumes: number[]): OBVResult {
    if (!Array.isArray(closes) || !Array.isArray(volumes) || closes.length === 0 || volumes.length === 0) {
      return { value: 0, signal: 'neutral', score: 0 };
    }

    let obv = 0;
    for (let i = 1; i < Math.min(closes.length, volumes.length); i++) {
      if (closes[i] > closes[i - 1]) obv += volumes[i];
      else if (closes[i] < closes[i - 1]) obv -= volumes[i];
    }

    const smaOBV = obv / 20;
    const trend = obv > smaOBV ? 1 : -1;
    if (trend > 0) {
      return { value: obv, signal: 'bullish', score: this.scoreMagnitude };
    }
    if (trend < 0) {
      return { value: obv, signal: 'bearish', score: -this.scoreMagnitude };
    }
    return { value: obv, signal: 'neutral', score: 0 };
  }
}
