export interface KDJResult {
  value: number;
  k: number;
  d: number;
  j: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
}

export class KDJIndicator {
  private prevK: number = 50;
  private prevD: number = 50;

  constructor(private readonly scoreMagnitude: number = 17) {}

  calculate(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = 9,
    kSmooth: number = 3,
    dSmooth: number = 3
  ): KDJResult {
    if (!Array.isArray(highs) || !Array.isArray(lows) || !Array.isArray(closes) || closes.length === 0) {
      return { value: 50, k: 50, d: 50, j: 50, signal: 'neutral', score: 0 };
    }

    const sliceHighs = highs.slice(-period);
    const sliceLows = lows.slice(-period);
    const sliceCloses = closes.slice(-period);
    const highestHigh = Math.max(...sliceHighs);
    const lowestLow = Math.min(...sliceLows);
    const latestClose = sliceCloses[sliceCloses.length - 1];
    const denom = highestHigh - lowestLow;
    const rsv = denom === 0 ? 50 : ((latestClose - lowestLow) / denom) * 100;

    const kAlpha = 1 / Math.max(1, kSmooth);
    const dAlpha = 1 / Math.max(1, dSmooth);
    const k = (1 - kAlpha) * this.prevK + kAlpha * rsv;
    const d = (1 - dAlpha) * this.prevD + dAlpha * k;
    const j = 3 * k - 2 * d;

    this.prevK = k;
    this.prevD = d;

    if (j < 0 && rsv < 20) {
      return { value: j, k, d, j, signal: 'bullish', score: this.scoreMagnitude };
    }
    if (j > 100 && rsv > 80) {
      return { value: j, k, d, j, signal: 'bearish', score: -this.scoreMagnitude };
    }
    return { value: j, k, d, j, signal: 'neutral', score: 0 };
  }
}
