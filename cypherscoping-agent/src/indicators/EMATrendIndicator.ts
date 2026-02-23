export interface EMATrendResult {
  value: number;
  shortEMA: number;
  mediumEMA: number;
  longEMA: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  trend: 'up' | 'down' | 'neutral';
  score: number;
}

export class EMATrendIndicator {
  constructor(private readonly scoreMagnitude: number = 25) {}

  calculate(
    closes: number[],
    shortPeriod: number = 9,
    mediumPeriod: number = 25,
    longPeriod: number = 50
  ): EMATrendResult {
    if (!Array.isArray(closes) || closes.length === 0) {
      return {
        value: 0,
        shortEMA: 0,
        mediumEMA: 0,
        longEMA: 0,
        signal: 'neutral',
        trend: 'neutral',
        score: 0
      };
    }

    const shortSeries = this.calculateEMA(closes, shortPeriod);
    const mediumSeries = this.calculateEMA(closes, mediumPeriod);
    const longSeries = this.calculateEMA(closes, longPeriod);
    const shortEMA = shortSeries[shortSeries.length - 1];
    const mediumEMA = mediumSeries[mediumSeries.length - 1];
    const longEMA = longSeries[longSeries.length - 1];

    if (shortEMA > mediumEMA && mediumEMA > longEMA) {
      return {
        value: shortEMA - longEMA,
        shortEMA,
        mediumEMA,
        longEMA,
        signal: 'bullish',
        trend: 'up',
        score: this.scoreMagnitude
      };
    }
    if (shortEMA < mediumEMA && mediumEMA < longEMA) {
      return {
        value: shortEMA - longEMA,
        shortEMA,
        mediumEMA,
        longEMA,
        signal: 'bearish',
        trend: 'down',
        score: -this.scoreMagnitude
      };
    }
    return {
      value: shortEMA - longEMA,
      shortEMA,
      mediumEMA,
      longEMA,
      signal: 'neutral',
      trend: 'neutral',
      score: 0
    };
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
