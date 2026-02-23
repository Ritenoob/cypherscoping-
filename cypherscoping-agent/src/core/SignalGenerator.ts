import { V6_OPTIMIZED_WEIGHTS, getSignalClassification, getRecommendedLeverage, SIGNAL_CLASSIFICATIONS, SCORE_CAPS } from '../config/indicator-weights';
import { WilliamsRIndicator, WilliamsRResult, SignalResult } from '../indicators/WilliamsRIndicator';
import { EntryGates, GateContext, GateResult } from './EntryGates';
import { ConfidenceCalculator, ConfidenceContext } from './ConfidenceCalculator';

export interface IndicatorResults {
  williamsR?: WilliamsRResult;
  [key: string]: {
    value: number | null;
    signal: string;
    score: number;
    signals?: SignalResult[];
  } | WilliamsRResult | undefined;
}

export interface CompositeSignal {
  compositeScore: number;
  authorized: boolean;
  side: 'long' | 'short' | null;
  confidence: number;
  triggerCandle: number | null;
  windowExpires: number | null;
  indicatorScores: Map<string, number>;
  microstructureScore: number;
  blockReasons: string[];
  confirmations: number;
  timestamp: number;
  signalStrength: 'extreme' | 'strong' | 'moderate' | 'weak' | null;
  signalType: 'divergence' | 'crossover' | 'squeeze' | 'golden_death_cross' | 'trend' | 'oversold' | 'overbought' | null;
  signalSource: string;
}

export interface SignalGeneratorConfig {
  entryGates?: {
    enabled?: boolean;
    strictMode?: boolean;
    deadZoneMin?: number;
    thresholdScore?: number;
    thresholdCrossRequired?: boolean;
    minConfidence?: number;
    minIndicatorsAgreeing?: number;
    confluencePercentMin?: number;
    requireTrendAlignment?: boolean;
    maxDrawdownPct?: number;
  };
  confidenceCalculator?: {
    enabled?: boolean;
    chopPenalty?: number;
    volPenaltyHigh?: number;
    volPenaltyMedium?: number;
    conflictPenaltyPerSignal?: number;
    volHighThreshold?: number;
    volMediumThreshold?: number;
  };
  williamsR?: {
    period?: number;
    fastPeriod?: number;
    oversold?: number;
    overbought?: number;
    historyLength?: number;
  };
}

export class SignalGenerator {
  private williamsR: WilliamsRIndicator;
  private entryGates: EntryGates;
  private confidenceCalculator: ConfidenceCalculator;
  private config: SignalGeneratorConfig;

  constructor(config: SignalGeneratorConfig = {}) {
    this.config = {
      entryGates: {
        enabled: true,
        strictMode: false,
        deadZoneMin: 20,
        thresholdScore: 80,
        thresholdCrossRequired: false,
        minConfidence: 70,
        minIndicatorsAgreeing: 4,
        confluencePercentMin: 0.5,
        requireTrendAlignment: true
      },
      confidenceCalculator: {
        enabled: true,
        chopPenalty: 5,
        volPenaltyHigh: 6,
        volPenaltyMedium: 3,
        conflictPenaltyPerSignal: 2,
        volHighThreshold: 6,
        volMediumThreshold: 4
      },
      williamsR: {
        period: 10,
        fastPeriod: 7,
        oversold: -80,
        overbought: -20,
        historyLength: 100
      }
    };

    this.williamsR = new WilliamsRIndicator(this.config.williamsR);
    this.entryGates = new EntryGates(this.config.entryGates);
    this.confidenceCalculator = new ConfidenceCalculator(this.config.confidenceCalculator);
  }

  generate(indicatorResults: IndicatorResults, microstructure: any, context: any): CompositeSignal {
    const results = indicatorResults;

    let indicatorScore = 0;
    let microstructureScore = 0;
    let allSignals: SignalResult[] = [];
    let divergenceCount = 0;
    let indicatorsAgreeing: { bullish: number; bearish: number; neutral?: number } = {
      bullish: 0,
      bearish: 0,
      neutral: 0
    };
    let activeIndicators = 0;

    const williamsR = results.williamsR;

    if (williamsR) {
      const wrSignals = williamsR.signals || [];

      for (const signal of wrSignals) {
        const weight = V6_OPTIMIZED_WEIGHTS.WilliamsR?.weight || 28;
        const strengthMultiplier = this.getStrengthMultiplier(signal.strength);

        if (signal.type.includes('divergence')) {
          divergenceCount++;
          indicatorScore += weight * 1.5 * strengthMultiplier;
          allSignals.push({ ...signal, source: 'WilliamsR_Divergence' });
        } else if (signal.type.includes('crossover')) {
          indicatorScore += weight * 1.3 * strengthMultiplier;
          allSignals.push({ ...signal, source: 'WilliamsR_Crossover' });
        } else if (signal.type.includes('oversold')) {
          indicatorScore += weight * 1.2 * strengthMultiplier;
          allSignals.push({ ...signal, source: 'WilliamsR_Oversold' });
        } else if (signal.type.includes('overbought')) {
          indicatorScore += weight * 1.2 * strengthMultiplier;
          allSignals.push({ ...signal, source: 'WilliamsR_Overbought' });
        } else if (signal.type.includes('thrust')) {
          indicatorScore += weight * 1.0 * strengthMultiplier;
          allSignals.push({ ...signal, source: 'WilliamsR_Momentum' });
        } else if (signal.type.includes('zone') || signal.type.includes('hook')) {
          indicatorScore += weight * 0.85 * strengthMultiplier;
          allSignals.push({ ...signal, source: 'WilliamsR_Zone' });
        }

        if (signal.direction === 'bullish') indicatorsAgreeing.bullish++;
        else if (signal.direction === 'bearish') indicatorsAgreeing.bearish++;
      }
    }

    for (const [name, data] of Object.entries(results)) {
      if (name === 'williamsR' || !data) continue;
      const config = V6_OPTIMIZED_WEIGHTS[name.toUpperCase()];
      if (!config?.enabled) continue;

      const weight = V6_OPTIMIZED_WEIGHTS[name.toUpperCase()]?.weight || 20;
      const contribution = ((data as any).score || 0);
      const contributionValue = Math.sign(contribution) * weight;

      if (data.value !== null && data.value !== 0) {
        activeIndicators++;
        indicatorScore += contributionValue;
      }

      if (contributionValue > 0) indicatorsAgreeing.bullish++;
      else if (contributionValue < 0) indicatorsAgreeing.bearish++;

         allSignals.push({
          type: (data as any).signal || 'generic',
          direction: contributionValue > 0 ? 'bullish' as const : contributionValue < 0 ? 'bearish' as const : 'bullish' as const, // Default to bullish for neutral
          strength: 'moderate',
          message: `${name}: ${(data as any).signal || 'value=' + data.value}`,
          metadata: { name, value: data.value },
          source: name
        });
    }

    if (microstructure.buySellRatio) {
      const buySellWeight = V6_OPTIMIZED_WEIGHTS.BuySellRatio?.weight || 18;
      const ratio = microstructure.buySellRatio.ratio || 0.5;

      if (ratio > 0.7) {
        microstructureScore += buySellWeight * (ratio - 0.5) * 2;
      } else if (ratio < 0.3) {
        microstructureScore += buySellWeight * (0.5 - ratio) * 2;
      }
    }

    if (microstructure.domImbalance) {
      const domWeight = V6_OPTIMIZED_WEIGHTS.DOM?.weight || 18;
      const imbalance = microstructure.domImbalance.value || 0;

      microstructureScore += imbalance * domWeight;
    }

    indicatorScore = Math.max(-SCORE_CAPS.indicatorScore, Math.min(SCORE_CAPS.indicatorScore, indicatorScore));
    microstructureScore = Math.max(-SCORE_CAPS.microstructureScore, Math.min(SCORE_CAPS.microstructureScore, microstructureScore));

    const baseTotal = indicatorScore + microstructureScore;
    const totalScore = Math.max(-SCORE_CAPS.totalScore, Math.min(SCORE_CAPS.totalScore, baseTotal));

    const baseConfidence = this.calculateBaseConfidence(indicatorScore, microstructureScore, allSignals.length, indicatorsAgreeing);
    const confidence = this.confidenceCalculator.adjust(baseConfidence, {
      isChoppy: context.isChoppy || false,
      atrPercent: context.atrPercent || null,
      conflictingSignals: this.countConflictingSignals(allSignals)
    });

    const classification = getSignalClassification(totalScore);
    const recommendedLeverage = getRecommendedLeverage(totalScore, confidence);

    const gateContext: GateContext = {
      score: totalScore,
      prevScore: context.prevScore || 0,
      confidence,
      indicatorsAgreeing: indicatorsAgreeing.bullish + indicatorsAgreeing.bearish,
      totalIndicators: activeIndicators,
      agreeingIndicators: allSignals.filter(s => s.source).map(s => s.source!),
      trendAligned: this.checkTrendAlignment(results, totalScore, context),
      drawdownPct: context.drawdownPct || 0,
      atrPercent: context.atrPercent || null,
      conflictingSignals: this.countConflictingSignals(allSignals)
    };

    const gateResult = this.entryGates.evaluate(gateContext);

    let triggerCandle: number | null = null;
    let windowExpires: number | null = null;
    let side: 'long' | 'short' | null = null;

    if (williamsR) {
      for (const signal of williamsR.signals || []) {
        if (signal.type === 'bullish_crossover') {
          side = 'long';
          triggerCandle = results.williamsR?.value ? context.candleIndex || 0 : null;
          windowExpires = Date.now() + 3600000;
          break;
        } else if (signal.type === 'bearish_crossover') {
          side = 'short';
          triggerCandle = results.williamsR?.value ? context.candleIndex || 0 : null;
          windowExpires = Date.now() + 3600000;
          break;
        }
      }
    }

    if (!side) {
      if (totalScore > 0) side = 'long';
      else if (totalScore < 0) side = 'short';
    }

    const scoreQualified = Math.abs(totalScore) >= 75;
    const isAuthorized = gateResult.pass && scoreQualified && side !== null;
    if (isAuthorized && triggerCandle === null) {
      triggerCandle = context.candleIndex || 0;
      windowExpires = Date.now() + 3600000;
    }

    const signalStrength = this.getSignalStrength(classification, allSignals, divergenceCount);

    return {
      compositeScore: totalScore,
      authorized: isAuthorized,
      side,
      confidence,
      triggerCandle,
      windowExpires,
       indicatorScores: new Map(
         Object.entries(results).map(([name, data]) => [name, (data as any).score || 0])
       ),
      microstructureScore,
      blockReasons: gateResult.reasons,
      confirmations: allSignals.length,
      timestamp: Date.now(),
      signalStrength,
      signalType: this.getSignalType(allSignals),
      signalSource: allSignals[0]?.source || 'SignalGenerator'
    };
  }

  private calculateBaseConfidence(
    indicatorScore: number,
    microstructureScore: number,
    signalCount: number,
    indicatorsAgreeing: { bullish: number; bearish: number; neutral?: number }
  ): number {
    let confidence = 50;

    const totalAgreement = Math.max(indicatorsAgreeing.bullish, indicatorsAgreeing.bearish);
    const agreementRatio = totalAgreement / (indicatorsAgreeing.bullish + indicatorsAgreeing.bearish + (indicatorsAgreeing.neutral || 0) + 1);

    confidence += agreementRatio * 30;

    const absScore = Math.abs(indicatorScore);
    if (absScore >= 120) confidence += 20;
    else if (absScore >= 95) confidence += 15;
    else if (absScore >= 80) confidence += 10;
    else if (absScore >= 65) confidence += 5;

    const signalDensity = Math.min(1, signalCount / 10);
    confidence += signalDensity * 20;

    return confidence;
  }

  private getStrengthMultiplier(strength: string | null): number {
    switch (strength) {
      case 'very_strong': return 1.5;
      case 'strong': return 1.0;
      case 'moderate': return 0.6;
      case 'weak': return 0.3;
      case 'extreme': return 1.3;
      default: return 1.0;
    }
  }

  private getSignalStrength(classification: any, signals: SignalResult[], divergenceCount: number): 'extreme' | 'strong' | 'moderate' | 'weak' | null {
    if (divergenceCount > 0) return 'extreme';
    if (classification.max >= 130) return 'extreme';
    if (classification.max >= 95) return 'strong';
    if (classification.max >= 65) return 'moderate';
    if (classification.max >= 40) return 'weak';
    return null;
  }

  private getSignalType(signals: SignalResult[]): 'divergence' | 'crossover' | 'squeeze' | 'golden_death_cross' | 'trend' | 'oversold' | 'overbought' | null {
    for (const signal of signals) {
      if (signal.type.includes('divergence')) return 'divergence';
      if (signal.type.includes('crossover')) return 'crossover';
      if (signal.type.includes('squeeze')) return 'squeeze';
      if (signal.type.includes('golden_death') || signal.type.includes('death_cross')) return 'golden_death_cross';
    }
    return null;
  }

  private checkTrendAlignment(results: IndicatorResults, score: number, context: any): boolean {
    const mtfAligned = context && typeof context.mtfAligned === 'boolean' ? context.mtfAligned : true;
    if (results.emaTrend && (results.emaTrend as any).trend) {
      const trend = (results.emaTrend as any).trend;
      const localAligned =
        (score > 0 && (trend === 'bullish' || trend === 'up')) ||
        (score < 0 && (trend === 'bearish' || trend === 'down'));
      return localAligned && mtfAligned;
    }
    return false;
  }

  private countConflictingSignals(signals: SignalResult[]): number {
    const bullish = signals.filter(s => s.direction === 'bullish').length;
    const bearish = signals.filter(s => s.direction === 'bearish').length;
    return Math.min(bullish, bearish);
  }

  reset(): void {
    this.williamsR.reset();
  }

  getWilliamsR(): WilliamsRIndicator {
    return this.williamsR;
  }
}
