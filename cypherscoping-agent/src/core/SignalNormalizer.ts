import { SignalResult } from "../indicators/WilliamsRIndicator";
import { ScoreTier } from "../types";

export interface IndicatorWithSignals {
  signals?: SignalResult[];
}

export type NormalizerIndicatorResults = Record<string, unknown>;

export const STRENGTH_MULTIPLIERS = {
  very_strong: 1.2,
  strong: 1.0,
  moderate: 0.7,
  weak: 0.5,
  extreme: 1.1,
} as const;

export const SIGNAL_PRIORITY = {
  bullish_divergence: 1,
  bearish_divergence: 1,

  bullish_crossover: 2,
  bearish_crossover: 2,
  bullish_pattern: 2,
  bearish_pattern: 2,
  bullish_breakout: 2,
  bearish_breakout: 2,

  bullish_zone: 3,
  bearish_zone: 3,
  bullish_momentum: 3,
  bearish_momentum: 3,

  bullish_level: 4,
  bearish_level: 4,
} as const;

export class SignalNormalizer {
  private readonly scoreRanges = {
    min: -130,
    max: 130,
    tiers: {
      EXTREME_BUY: { min: 90, max: 130 },
      STRONG_BUY: { min: 70, max: 89 },
      BUY: { min: 20, max: 69 },
      NEUTRAL: { min: -19, max: 19 },
      SELL: { min: -69, max: -20 },
      STRONG_SELL: { min: -89, max: -70 },
      EXTREME_SELL: { min: -130, max: -90 },
    },
  };

  constructor() {}

  getStrengthMultiplier(strength: string | null): number {
    if (!strength) return 1.0;

    const multiplier =
      STRENGTH_MULTIPLIERS[strength as keyof typeof STRENGTH_MULTIPLIERS];
    return multiplier !== undefined ? multiplier : 1.0;
  }

  classifyScore(score: number): ScoreTier {
    if (score >= 90) return "EXTREME_BUY";
    if (score >= 70) return "STRONG_BUY";
    if (score >= 20) return "BUY";
    if (score > -20) return "NEUTRAL";
    if (score >= -69) return "SELL";
    if (score >= -89) return "STRONG_SELL";
    return "EXTREME_SELL";
  }

  getHighestPrioritySignal(signals: SignalResult[]): SignalResult | null {
    if (signals.length === 0) return null;

    return signals.reduce((highest, signal) => {
      const signalPriority =
        SIGNAL_PRIORITY[signal.type as keyof typeof SIGNAL_PRIORITY] ?? 999;
      const highestPriority =
        SIGNAL_PRIORITY[highest.type as keyof typeof SIGNAL_PRIORITY] ?? 999;

      return signalPriority < highestPriority ? signal : highest;
    });
  }

  validateSignal(signal: SignalResult, indicatorName: string): void {
    const required = ["type", "direction", "strength", "message"];

    for (const field of required) {
      if (!(field in signal)) {
        throw new Error(
          `Missing field '${field}' in signal from ${indicatorName}`,
        );
      }
    }

    if (!["bullish", "bearish"].includes(signal.direction)) {
      throw new Error(
        `Invalid direction '${signal.direction}' from ${indicatorName}`,
      );
    }

    if (!(signal.strength in STRENGTH_MULTIPLIERS)) {
      throw new Error(
        `Invalid strength '${signal.strength}' from ${indicatorName}`,
      );
    }
  }

  normalize(
    indicatorName: string,
    signals: SignalResult[],
  ): { indicator: string; signals: SignalResult[]; timestamp: number } {
    for (const signal of signals) {
      this.validateSignal(signal, indicatorName);
    }

    return {
      indicator: indicatorName,
      signals,
      timestamp: Date.now(),
    };
  }

  generateComposite(
    indicatorResults: NormalizerIndicatorResults,
    _microstructure: unknown,
  ): {
    normalizedScore: number;
    normalizedTier: ScoreTier;
    normalizedConfidence: number;
    signalPriorityBreakdown: Record<string, number>;
    strengthMultipliersUsed: Record<string, number>;
  } {
    let normalizedScore = 0;
    const signalPriorityBreakdown: Record<string, number> = {};
    const strengthMultipliersUsed: Record<string, number> = {};

    const allSignals: SignalResult[] = [];

    const williamsRData = indicatorResults.williamsR as
      | IndicatorWithSignals
      | undefined;
    if (williamsRData?.signals) {
      allSignals.push(...williamsRData.signals);
    }

    for (const [name, data] of Object.entries(indicatorResults)) {
      if (name === "williamsR" || !data) continue;
      const indicatorData = data as IndicatorWithSignals;
      if (indicatorData.signals) {
        allSignals.push(...indicatorData.signals);
      }
    }

    for (const signal of allSignals) {
      const multiplier = this.getStrengthMultiplier(signal.strength);
      const priorityWeight =
        SIGNAL_PRIORITY[signal.type as keyof typeof SIGNAL_PRIORITY] ?? 4;

      let contribution = 10;
      if (priorityWeight === 1) contribution *= 1.2;
      else if (priorityWeight === 2) contribution *= 1.0;
      else if (priorityWeight === 3) contribution *= 0.7;
      else if (priorityWeight === 4) contribution *= 0.5;

      contribution *= multiplier;

      if (signal.direction === "bullish") normalizedScore += contribution;
      else if (signal.direction === "bearish") normalizedScore -= contribution;

      const signedContribution =
        signal.direction === "bearish" ? -contribution : contribution;
      signalPriorityBreakdown[signal.type] =
        (signalPriorityBreakdown[signal.type] || 0) + signedContribution;
      strengthMultipliersUsed[signal.strength] = multiplier;
    }

    normalizedScore = Math.max(-130, Math.min(130, normalizedScore));

    const normalizedConfidence = Math.min(100, 50 + allSignals.length * 5);

    return {
      normalizedScore,
      normalizedTier: this.classifyScore(normalizedScore),
      normalizedConfidence,
      signalPriorityBreakdown,
      strengthMultipliersUsed,
    };
  }
}
