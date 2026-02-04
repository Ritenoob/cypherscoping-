import { BaseAgent } from './base-agent';
import { AgentContext, AgentResult } from '../types';
export interface SignalContext {
    candleIndex: number;
    prevScore: number;
    atrPercent: number | null;
    isChoppy: boolean;
    conflictingSignals: number;
}
export declare class SignalAnalysisAgent extends BaseAgent {
    private signalGenerator;
    private williamsR;
    private mlEngine;
    private signalHistory;
    constructor();
    initialize(): Promise<void>;
    execute(context: AgentContext): Promise<AgentResult>;
    private buildSignalContext;
    private generateSignal;
    private calculateRSI;
    private calculateStochRSI;
    private calculateStochasticK;
    private calculateMACD;
    private calculateBollingerBands;
    private calculateStochastic;
    private calculateKDJ;
    private calculateEMATrend;
    private calculateAO;
    private calculateEMA;
    private calculateSMA;
    private calculateOBV;
    private calculateCMF;
    private calculateKlinger;
    private calculateADX;
    private calculateATR;
    private calculateATRPercent;
    private detectChoppyMarket;
    private countConflictingSignals;
    private getPreviousScore;
    private recordSignalHistory;
    private addIndexesToOHLCV;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=signal-analysis-agent.d.ts.map