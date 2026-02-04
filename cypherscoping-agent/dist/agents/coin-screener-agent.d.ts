import { BaseAgent } from './base-agent';
import { AgentContext, AgentResult, CompositeSignal } from '../types';
export declare class CoinScreenerAgent extends BaseAgent {
    private symbols;
    private watchedSymbols;
    constructor(symbols?: string[]);
    initialize(): Promise<void>;
    execute(context: AgentContext): Promise<AgentResult>;
    private scanMarket;
    private scanSymbol;
    private fetchMarketData;
    private generateMockOHLCV;
    private generateSignal;
    private calculateRSI;
    private calculateWilliamsR;
    private calculateTrend;
    private detectRegime;
    private estimateADX;
    private calculateOverallScore;
    private calculateVolatility;
    private calculateVolumeRatio;
    private calculateTrendStrength;
    private estimateLiquidity;
    private categorizeByRegime;
    private getDefaultSymbols;
    shutdown(): Promise<void>;
}
export interface ScreenerResult {
    symbol: string;
    signal: CompositeSignal;
    regime: 'trending' | 'ranging' | 'volatile';
    overallScore: number;
    metrics: {
        volatility: number;
        volumeRatio: number;
        trendStrength: number;
        liquidity: number;
    };
    timestamp: number;
}
//# sourceMappingURL=coin-screener-agent.d.ts.map