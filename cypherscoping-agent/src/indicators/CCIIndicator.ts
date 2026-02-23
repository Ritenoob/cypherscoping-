export interface CCIResult {
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
}

export class CCIIndicator {
  calculate(highs: number[], lows: number[], closes: number[], period: number = 20): CCIResult {
    if (
      !Array.isArray(highs) ||
      !Array.isArray(lows) ||
      !Array.isArray(closes) ||
      highs.length < period ||
      lows.length < period ||
      closes.length < period
    ) {
      return { value: 0, signal: 'neutral', score: 0 };
    }

    const typicalPrices = highs.map((h, i) => (h + lows[i] + closes[i]) / 3);
    const window = typicalPrices.slice(-period);
    const sma = window.reduce((a, b) => a + b, 0) / period;
    const meanDeviation = window.reduce((a, b) => a + Math.abs(b - sma), 0) / period;
    if (meanDeviation === 0) return { value: 0, signal: 'neutral', score: 0 };

    const latestTp = window[window.length - 1];
    const cci = (latestTp - sma) / (0.015 * meanDeviation);

    if (cci > 100) {
      return { value: cci, signal: 'bearish', score: -15 };
    }
    if (cci < -100) {
      return { value: cci, signal: 'bullish', score: 15 };
    }
    return { value: cci, signal: 'neutral', score: 0 };
  }
}
