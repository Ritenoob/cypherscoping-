import { CompositeSignal, AIAnalysis, OHLCV } from '../types';
export declare class CypherScopeOrchestrator {
    private orchestrator;
    private signalAgent;
    private riskAgent;
    private tradingAgent;
    private screenerAgent;
    private isRunning;
    private tradingMode;
    private eventHandlers;
    constructor();
    initialize(): Promise<void>;
    analyzeSymbol(symbol: string, ohlcv: OHLCV[], orderBook?: any, tradeFlow?: any): Promise<AnalysisResult>;
    scanMarket(): Promise<ScanResult>;
    executeTrade(symbol: string, action: 'buy' | 'sell' | 'close', size?: number): Promise<TradeResult>;
    private manualTrade;
    private algoTrade;
    setMode(mode: 'manual' | 'algo'): void;
    getMode(): 'manual' | 'algo';
    on(event: string, handler: Function): void;
    off(event: string, handler: Function): void;
    private emit;
    getStats(): any;
    shutdown(): Promise<void>;
}
interface AnalysisResult {
    symbol: string;
    signal: CompositeSignal;
    aiAnalysis: AIAnalysis;
    riskAnalysis: any;
    execution: any;
    timestamp: number;
}
interface ScanResult {
    type: string;
    totalScanned: number;
    opportunities: number;
    topOpportunities: any[];
    byRegime: Record<string, any[]>;
}
interface TradeResult {
    success: boolean;
    symbol: string;
    action: string;
    size?: number;
    timestamp: number;
    mode: string;
    error?: string;
}
export {};
//# sourceMappingURL=orchestrator.d.ts.map