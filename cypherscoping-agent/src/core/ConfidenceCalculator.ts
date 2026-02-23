export interface ConfidenceConfig {
  enabled?: boolean;
  chopPenalty?: number;
  volPenaltyHigh?: number;
  volPenaltyMedium?: number;
  conflictPenaltyPerSignal?: number;
  volHighThreshold?: number;
  volMediumThreshold?: number;
}

export interface ConfidenceContext {
  isChoppy: boolean;
  atrPercent: number;
  conflictingSignals: number;
}

export class ConfidenceCalculator {
  private config: ConfidenceConfig;

  constructor(config: ConfidenceConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,  // CRITICAL: Safety controls should default to enabled
      chopPenalty: config.chopPenalty ?? 5,
      volPenaltyHigh: config.volPenaltyHigh ?? 6,
      volPenaltyMedium: config.volPenaltyMedium ?? 3,
      conflictPenaltyPerSignal: config.conflictPenaltyPerSignal ?? 2,
      volHighThreshold: config.volHighThreshold ?? 6,
      volMediumThreshold: config.volMediumThreshold ?? 4
    };
  }

  adjust(baseConfidence: number, context: ConfidenceContext): number {
    if (!this.config.enabled) return baseConfidence;

    let confidence = Number(baseConfidence || 0);

    const isChoppy = context.isChoppy === true;
    const atrPercent = context.atrPercent;
    const conflictingSignals = Number(context.conflictingSignals || 0);

    if (isChoppy) {
      confidence -= this.config.chopPenalty!;
    }

    if (atrPercent !== undefined && atrPercent !== null) {
      if (atrPercent >= this.config.volHighThreshold!) {
        confidence -= this.config.volPenaltyHigh!;
      } else if (atrPercent >= this.config.volMediumThreshold!) {
        confidence -= this.config.volPenaltyMedium!;
      }
    }

    if (conflictingSignals > 0) {
      confidence -= conflictingSignals * this.config.conflictPenaltyPerSignal!;
    }

    return Math.max(0, Math.min(100, confidence));
  }

  isMarketChoppy(atrPercent: number, volatility: number): boolean {
    return atrPercent < 2 && volatility < 0.01;
  }

  getVolatilityRegime(atrPercent: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (atrPercent < 2) return 'LOW';
    if (atrPercent < 4) return 'MEDIUM';
    return 'HIGH';
  }
}
