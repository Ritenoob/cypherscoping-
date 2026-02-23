export interface CMFResult {
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
}

export class CMFIndicator {
  constructor(private readonly scoreMagnitude: number = 19) {}

  calculate(
    highs: number[],
    lows: number[],
    closes: number[],
    volumes: number[],
    period: number = 20
  ): CMFResult {
    if (
      !Array.isArray(highs) ||
      !Array.isArray(lows) ||
      !Array.isArray(closes) ||
      !Array.isArray(volumes) ||
      closes.length === 0
    ) {
      return { value: 0, signal: 'neutral', score: 0 };
    }

    const window = Math.min(period, highs.length, lows.length, closes.length, volumes.length);
    if (window <= 0) return { value: 0, signal: 'neutral', score: 0 };

    let mfmSum = 0;
    let volSum = 0;

    for (let i = highs.length - window; i < highs.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const close = closes[i];
      const volume = volumes[i];
      const denom = high - low;
      const mfm = denom === 0 ? 0 : ((close - low) - (high - close)) / denom;
      mfmSum += mfm * volume;
      volSum += volume;
    }

    const cmf = volSum === 0 ? 0 : mfmSum / volSum;
    if (cmf > 0.1) {
      return { value: cmf, signal: 'bullish', score: this.scoreMagnitude };
    }
    if (cmf < -0.1) {
      return { value: cmf, signal: 'bearish', score: -this.scoreMagnitude };
    }
    return { value: cmf, signal: 'neutral', score: 0 };
  }
}
