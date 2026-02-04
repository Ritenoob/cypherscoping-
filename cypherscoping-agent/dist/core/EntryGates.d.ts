export interface GateConfig {
    enabled?: boolean;
    strictMode?: boolean;
    deadZoneMin?: number;
    thresholdScore?: number;
    thresholdCrossRequired?: boolean;
    minConfidence?: number;
    minIndicatorsAgreeing?: number;
    confluencePercentMin?: number;
    requireTrendAlignment?: boolean;
    maxDrawdownPct?: number | null;
}
export interface GateContext {
    score: number;
    prevScore: number;
    confidence: number;
    indicatorsAgreeing: number;
    totalIndicators: number;
    agreeingIndicators: string[];
    trendAligned: boolean;
    drawdownPct: number;
    atrPercent: number | null;
    conflictingSignals: number;
}
export interface GateResult {
    pass: boolean;
    reasons: string[];
    applied: boolean;
    thresholdUsed?: number;
}
export interface ConfidenceAdjustment {
    chopPenalty: number;
    volPenaltyHigh: number;
    volPenaltyMedium: number;
    conflictPenaltyPerSignal: number;
    isChoppy: boolean;
    atrPercent: number;
    conflictingSignals: number;
}
export declare class EntryGates {
    private config;
    constructor(config?: GateConfig);
    evaluate(context: GateContext): GateResult;
}
export declare class ConfidenceCalculator {
    private config;
    constructor(config?: {
        chopPenalty?: number;
        volPenaltyHigh?: number;
        volPenaltyMedium?: number;
        conflictPenaltyPerSignal?: number;
        volHighThreshold?: number;
        volMediumThreshold?: number;
    });
    adjust(baseConfidence: number, context: ConfidenceAdjustment): number;
    isMarketChoppy(atrPercent: number, volatility: number): boolean;
    getVolatilityRegime(atrPercent: number): 'LOW' | 'MEDIUM' | 'HIGH';
}
//# sourceMappingURL=EntryGates.d.ts.map