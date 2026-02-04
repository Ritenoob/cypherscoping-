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
export declare class ConfidenceCalculator {
    private config;
    constructor(config?: ConfidenceConfig);
    adjust(baseConfidence: number, context: ConfidenceContext): number;
    isMarketChoppy(atrPercent: number, volatility: number): boolean;
    getVolatilityRegime(atrPercent: number): 'LOW' | 'MEDIUM' | 'HIGH';
}
//# sourceMappingURL=ConfidenceCalculator.d.ts.map