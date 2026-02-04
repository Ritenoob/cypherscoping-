import { EventEmitter } from 'events';
export interface SignalResult {
    type: string;
    direction: 'bullish' | 'bearish';
    strength: 'very_strong' | 'strong' | 'moderate' | 'weak' | 'extreme';
    message: string;
    metadata?: Record<string, any>;
    source?: string;
}
export interface WilliamsRResult {
    value: number | null;
    fastValue: number | null;
    oversoldBars: number;
    overboughtBars: number;
    signals: SignalResult[];
}
export declare class WilliamsRIndicator extends EventEmitter {
    private period;
    private fastPeriod;
    private oversoldLevel;
    private overboughtLevel;
    private highs;
    private lows;
    private closes;
    private fastHighs;
    private fastLows;
    private wrHistory;
    private priceHistory;
    private maxHistory;
    private oversoldBars;
    private overboughtBars;
    private currentValue;
    private prevValue;
    private fastValue;
    private prevFastValue;
    constructor(config?: {
        period?: number;
        fastPeriod?: number;
        oversold?: number;
        overbought?: number;
        historyLength?: number;
    });
    update(candle: {
        high: number;
        low: number;
        close: number;
    }): WilliamsRResult;
    getResult(): WilliamsRResult;
    private getCrossover;
    private getFailureSwing;
    private getDivergence;
    private getHiddenDivergence;
    private getZone;
    private getMomentumThrust;
    private getHookPattern;
    private getFastSlowCrossover;
    private findSwingLows;
    private findSwingHighs;
    reset(): void;
}
//# sourceMappingURL=WilliamsRIndicator.d.ts.map