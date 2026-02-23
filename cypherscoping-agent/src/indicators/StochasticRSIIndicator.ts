export interface StochasticRSIResult {
  value: number;
  k: number;
  d: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
}

export class StochasticRSIIndicator {
  calculate(
    closes: number[],
    rsiPeriod: number = 14,
    stochPeriod: number = 14,
    kPeriod: number = 3,
    dPeriod: number = 3
  ): StochasticRSIResult {
    const rsiSeries = this.calculateRSISeries(closes, rsiPeriod);
    if (rsiSeries.length < stochPeriod + Math.max(kPeriod, dPeriod)) {
      return { value: 50, k: 50, d: 50, signal: 'neutral', score: 0 };
    }

    const stochRsiSeries: number[] = [];
    for (let i = stochPeriod - 1; i < rsiSeries.length; i++) {
      const window = rsiSeries.slice(i - stochPeriod + 1, i + 1);
      const minRsi = Math.min(...window);
      const maxRsi = Math.max(...window);
      const denom = maxRsi - minRsi;
      const normalized = denom === 0 ? 50 : ((rsiSeries[i] - minRsi) / denom) * 100;
      stochRsiSeries.push(normalized);
    }

    const kSeries = this.smaSeries(stochRsiSeries, kPeriod);
    const dSeries = this.smaSeries(kSeries, dPeriod);
    const kValue = kSeries[kSeries.length - 1];
    const dValue = dSeries[dSeries.length - 1];
    const latestRSI = rsiSeries[rsiSeries.length - 1];

    const kOversold = kValue < 20 && dValue < 20;
    const kOverbought = kValue > 80 && dValue > 80;

    if (kOversold) {
      return { value: kValue, k: kValue, d: dValue, signal: 'bullish', score: 20 };
    }
    if (kOverbought) {
      return { value: kValue, k: kValue, d: dValue, signal: 'bearish', score: -20 };
    }
    if (kValue > dValue && kValue > 50 && latestRSI > 50) {
      return { value: kValue, k: kValue, d: dValue, signal: 'bullish', score: 18 };
    }
    if (kValue < dValue && kValue < 50 && latestRSI < 50) {
      return { value: kValue, k: kValue, d: dValue, signal: 'bearish', score: -18 };
    }

    return { value: kValue, k: kValue, d: dValue, signal: 'neutral', score: 0 };
  }

  private calculateRSISeries(closes: number[], period: number): number[] {
    if (closes.length <= period) return [];
    const series: number[] = [];
    for (let i = period; i < closes.length; i++) {
      const window = closes.slice(i - period, i + 1);
      series.push(this.calculateRSI(window, period));
    }
    return series;
  }

  private calculateRSI(closes: number[], period: number): number {
    const changes = closes.slice(1).map((c, i) => c - closes[i]);
    const gains = changes.map((c) => (c > 0 ? c : 0));
    const losses = changes.map((c) => (c < 0 ? Math.abs(c) : 0));
    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private smaSeries(values: number[], period: number): number[] {
    if (values.length < period) return [];
    const out: number[] = [];
    for (let i = period - 1; i < values.length; i++) {
      const window = values.slice(i - period + 1, i + 1);
      out.push(window.reduce((a, b) => a + b, 0) / period);
    }
    return out;
  }
}
