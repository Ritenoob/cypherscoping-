export interface VolumeRatioResult {
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
  buyVolume: number;
  sellVolume: number;
}

export interface VolumeRatioCandle {
  open: number;
  close: number;
  volume: number;
}

export class VolumeRatioIndicator {
  calculate(candles: VolumeRatioCandle[], lookback: number = 30): VolumeRatioResult {
    if (!Array.isArray(candles) || candles.length === 0) {
      return { value: 1, signal: 'neutral', score: 0, buyVolume: 0, sellVolume: 0 };
    }

    const window = candles.slice(-Math.max(1, lookback));
    let buyVolume = 0;
    let sellVolume = 0;

    for (const candle of window) {
      if (candle.close > candle.open) {
        buyVolume += candle.volume;
      } else if (candle.close < candle.open) {
        sellVolume += candle.volume;
      } else {
        buyVolume += candle.volume * 0.5;
        sellVolume += candle.volume * 0.5;
      }
    }

    const ratio = buyVolume / (sellVolume + 1e-9);
    if (ratio >= 1.5) {
      return { value: ratio, signal: 'bullish', score: 16, buyVolume, sellVolume };
    }
    if (ratio <= 0.67) {
      return { value: ratio, signal: 'bearish', score: -16, buyVolume, sellVolume };
    }
    return { value: ratio, signal: 'neutral', score: 0, buyVolume, sellVolume };
  }
}
