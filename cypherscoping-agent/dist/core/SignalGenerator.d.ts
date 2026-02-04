import { WilliamsRIndicator, WilliamsRResult, SignalResult } from '../indicators/WilliamsRIndicator';
export interface IndicatorResults {
    williamsR: WilliamsRResult;
    [key: string]: {
        value: number | null;
        signal: string;
        score: number;
        signals?: SignalResult[];
    };
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
export declare class SignalGenerator {
    private williamsR;
    private entryGates;
    private confidenceCalculator;
    private config;
    constructor(config?: SignalGeneratorConfig);
    generate(indicatorResults: IndicatorResults, microstructure?: {}, context?: {}): CompositeSignal;
    private calculateBaseConfidence;
    private getStrengthMultiplier;
    private getSignalStrength;
    private getSignalType;
    private checkTrendAlignment;
    private countConflictingSignals;
    reset(): void;
    getWilliamsR(): WilliamsRIndicator;
}
//# sourceMappingURL=SignalGenerator.d.ts.map