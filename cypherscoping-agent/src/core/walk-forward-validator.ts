export interface TradeSample {
  timestamp: number;
  pnlPercent: number;
  featureKey: string;
}

export interface ValidationMetrics {
  trades: number;
  winRate: number;
  expectancyPercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
}

export interface ValidationResult {
  inSample: ValidationMetrics;
  outOfSample: ValidationMetrics;
  passed: boolean;
  reasons: string[];
}

export interface ValidationConfig {
  inSampleRatio: number;
  minTrades: number;
  minOutSampleExpectancy: number;
  minOutSampleProfitFactor: number;
  maxOutSampleDrawdown: number;
}

const DEFAULT_CONFIG: ValidationConfig = {
  inSampleRatio: 0.7,
  minTrades: 20,
  minOutSampleExpectancy: 0.1,
  minOutSampleProfitFactor: 1.1,
  maxOutSampleDrawdown: 12
};

export class WalkForwardValidator {
  private readonly config: ValidationConfig;

  constructor(config?: Partial<ValidationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  validate(samples: TradeSample[]): ValidationResult {
    const ordered = [...samples].sort((a, b) => a.timestamp - b.timestamp);
    const splitIndex = Math.max(1, Math.floor(ordered.length * this.config.inSampleRatio));
    const inSampleTrades = ordered.slice(0, splitIndex);
    const outOfSampleTrades = ordered.slice(splitIndex);

    const inSample = this.computeMetrics(inSampleTrades);
    const outOfSample = this.computeMetrics(outOfSampleTrades);
    const reasons: string[] = [];

    if (ordered.length < this.config.minTrades) reasons.push('insufficient_total_trades');
    if (outOfSample.trades < Math.max(5, Math.floor(this.config.minTrades * 0.2))) reasons.push('insufficient_oos_trades');
    if (outOfSample.expectancyPercent < this.config.minOutSampleExpectancy) reasons.push('oos_expectancy_below_threshold');
    if (outOfSample.profitFactor < this.config.minOutSampleProfitFactor) reasons.push('oos_profit_factor_below_threshold');
    if (outOfSample.maxDrawdownPercent > this.config.maxOutSampleDrawdown) reasons.push('oos_drawdown_above_threshold');

    return {
      inSample,
      outOfSample,
      passed: reasons.length === 0,
      reasons
    };
  }

  private computeMetrics(samples: TradeSample[]): ValidationMetrics {
    if (samples.length === 0) {
      return {
        trades: 0,
        winRate: 0,
        expectancyPercent: 0,
        profitFactor: 0,
        maxDrawdownPercent: 0
      };
    }

    let wins = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let equity = 100;
    let peak = 100;
    let maxDrawdown = 0;
    let totalPnl = 0;

    for (const sample of samples) {
      totalPnl += sample.pnlPercent;
      if (sample.pnlPercent >= 0) {
        wins += 1;
        grossProfit += sample.pnlPercent;
      } else {
        grossLoss += Math.abs(sample.pnlPercent);
      }

      equity *= 1 + sample.pnlPercent / 100;
      peak = Math.max(peak, equity);
      const drawdown = ((peak - equity) / peak) * 100;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return {
      trades: samples.length,
      winRate: wins / samples.length,
      expectancyPercent: totalPnl / samples.length,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0,
      maxDrawdownPercent: maxDrawdown
    };
  }
}
