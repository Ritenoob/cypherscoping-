export interface KlingerResult {
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
}

export class KlingerIndicator {
  calculate(
    highs: number[],
    lows: number[],
    closes: number[],
    volumes: number[],
    fastPeriod: number = 34,
    slowPeriod: number = 55,
    _signalPeriod: number = 13
  ): KlingerResult {
    if (
      !Array.isArray(highs) ||
      !Array.isArray(lows) ||
      !Array.isArray(closes) ||
      !Array.isArray(volumes) ||
      closes.length === 0
    ) {
      return { value: 0, signal: 'neutral', score: 0 };
    }

    const length = Math.min(highs.length, lows.length, closes.length, volumes.length);
    if (length === 0) return { value: 0, signal: 'neutral', score: 0 };

    const vfHistory: number[] = [];
    let fastValue = 0;
    let slowValue = 0;

    for (let i = 0; i < length; i++) {
      const high = highs[i];
      const low = lows[i];
      const close = closes[i];
      const volume = volumes[i];
      const hlc = (high + low + close) / 3;
      const dm = high - low;

      let trend = 0;
      if (i > 0) {
        const prevHLC = (highs[i - 1] + lows[i - 1] + closes[i - 1]) / 3;
        trend = hlc > prevHLC ? 1 : hlc < prevHLC ? -1 : 0;
      }

      const cm = trend === 0 ? dm : trend + dm;
      const dmAbs = Math.abs(dm);
      const ratio = dmAbs === 0 ? 0 : cm / dmAbs;
      const vf = volume * (2 * (ratio - 1) - 1) * trend * 100;
      vfHistory.push(vf);

      fastValue = this.calculateEMA(vfHistory.slice(-Math.max(1, fastPeriod)), Math.max(1, fastPeriod)).slice(-1)[0] || 0;
      slowValue = this.calculateEMA(vfHistory.slice(-Math.max(1, slowPeriod)), Math.max(1, slowPeriod)).slice(-1)[0] || 0;
    }

    const signalValue = fastValue - slowValue;
    if (signalValue > 0) {
      return { value: signalValue, signal: 'bullish', score: Math.abs(signalValue) * 10 };
    }
    if (signalValue < 0) {
      return { value: signalValue, signal: 'bearish', score: Math.abs(signalValue) * 10 };
    }
    return { value: signalValue, signal: 'neutral', score: 0 };
  }

  private calculateEMA(data: number[], period: number): number[] {
    if (data.length === 0) return [0];
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
