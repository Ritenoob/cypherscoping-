import { OHLCV } from '../types';

export interface PumpAlertResult {
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
  conditionsMet: number;
}

export class PumpAlertIndicator {
  calculate(
    candles: OHLCV[],
    volumeLookback: number = 20,
    atrPeriod: number = 14,
    momentumPeriod: number = 5
  ): PumpAlertResult {
    if (!Array.isArray(candles) || candles.length < Math.max(volumeLookback + 1, atrPeriod + 1, momentumPeriod + 1)) {
      return { value: 0, signal: 'neutral', score: 0, conditionsMet: 0 };
    }

    const current = candles[candles.length - 1];
    const volumes = candles.map((c) => c.volume);
    const closes = candles.map((c) => c.close);
    const recentVolumes = volumes.slice(-(volumeLookback + 1), -1);
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const volumeRatio = avgVolume > 0 ? current.volume / avgVolume : 1;

    const trValues: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const prevClose = candles[i - 1].close;
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - prevClose),
        Math.abs(candles[i].low - prevClose)
      );
      trValues.push(tr);
    }
    const recentAtr = this.sma(trValues.slice(-atrPeriod));
    const baselineAtr = this.sma(trValues.slice(-(atrPeriod + volumeLookback), -atrPeriod));
    const atrRatio = baselineAtr > 0 ? recentAtr / baselineAtr : 1;

    const pastPrice = closes[closes.length - 1 - momentumPeriod];
    const momentumPct = pastPrice === 0 ? 0 : ((current.close - pastPrice) / pastPrice) * 100;

    let conditionsMet = 0;
    if (volumeRatio >= 2.5) conditionsMet++;
    if (atrRatio >= 1.5) conditionsMet++;
    if (Math.abs(momentumPct) >= 1.5) conditionsMet++;

    if (conditionsMet >= 2) {
      if (momentumPct > 0) {
        return { value: momentumPct, signal: 'bullish', score: 20 + conditionsMet * 5, conditionsMet };
      }
      if (momentumPct < 0) {
        return { value: momentumPct, signal: 'bearish', score: -(20 + conditionsMet * 5), conditionsMet };
      }
    }

    return { value: momentumPct, signal: 'neutral', score: 0, conditionsMet };
  }

  private sma(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}
