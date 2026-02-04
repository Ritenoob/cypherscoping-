import { BaseAgent, AgentContext, AgentResult } from './base-agent';
import { TradingMode } from '../types';
export declare class TradingExecutorAgent extends BaseAgent {
    private apiClient;
    private orderHistory;
    private tradingMode;
    private dailyMetrics;
    private currentEquity;
    private riskParams;
    constructor();
    initialize(): Promise<void>;
    execute(context: AgentContext): Promise<AgentResult>;
    private openNewPosition;
    private handleExistingPosition;
    private calculateCurrentDrawdown;
    private calculatePositionSize;
    private calculateTakeProfit;
    private calculateStopLoss;
    shutdown(): Promise<void>;
    setTradingMode(mode: TradingMode): void;
    getTradingMode(): TradingMode;
    getDailyMetrics(): DailyMetrics;
}
interface DailyMetrics {
    totalPnL: number;
    winCount: number;
    lossCount: number;
    totalTrades: number;
    maxDrawdown: number;
    peakEquity: number;
}
export {};
//# sourceMappingURL=trading-executor-agent.d.ts.map