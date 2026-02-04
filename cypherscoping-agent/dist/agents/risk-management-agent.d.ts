import { BaseAgent } from './base-agent';
import { AgentContext, AgentResult, Position, CompositeSignal } from '../types';
export interface RiskConfig {
    stopLossROI: number;
    takeProfitROI: number;
    breakEvenActivation: number;
    breakEvenBuffer: number;
    trailingActivation: number;
    trailingDistance: number;
    maxDrawdown: number;
    maxPositionsPaper: number;
    maxPositionsLive: number;
    maxPositionSizePercent: number;
    leverageMin: number;
    leverageMax: number;
}
export interface PositionMetrics {
    openPositions: number;
    totalExposureUSD: number;
    drawdownPercent: number;
    dailyPnL: number;
    maxDailyDrawdown: number;
    consecutiveLosses: number;
    totalWinRate: number;
}
export interface TradeMetrics {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalPnL: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
    winRate: number;
    sharpeRatio: number;
}
export declare class RiskManagementAgent extends BaseAgent {
    private riskConfig;
    private positionMetrics;
    private tradeMetrics;
    private circuitBreakerActive;
    private dailyBalance;
    private dailyPnL;
    private dailyWinCount;
    private maxDailyDrawdown;
    constructor(riskConfig?: Partial<RiskConfig>);
    initialize(): Promise<void>;
    execute(context: AgentContext): Promise<AgentResult>;
    private analyzeRisk;
    private analyzeRiskFactors;
    private assessDrawdownRisk;
    private assessExposureRisk;
    private assessConcentrationRisk;
    private calculateOverallRisk;
    private updatePositionMetrics;
    private generateRecommendations;
    calculateStopLoss(position: Position, signal: CompositeSignal): number;
    calculateTakeProfit(position: Position, signal: CompositeSignal): number;
    calculateBreakEven(position: Position, currentPrice: number): {
        newStopLoss: number;
        activated: boolean;
    };
    calculateTrailingStop(position: Position, currentPrice: number): {
        newStopLoss: number;
        activated: boolean;
    };
    calculatePositionSize(balance: number, confidence: number, signal: CompositeSignal): number;
    triggerCircuitBreaker(reason: string): void;
    resetCircuitBreaker(): void;
    updateDailyMetrics(balanace: number, pnl: number, win: boolean): void;
    getTradeMetrics(): TradeMetrics;
    getPositionMetrics(): PositionMetrics;
    getCircuitBreakerStatus(): {
        active: boolean;
        reason: string | null;
    };
    getRiskLevel(balance: number, signal: CompositeSignal): 'low' | 'medium' | 'high' | 'critical';
    shutdown(): Promise<void>;
}
//# sourceMappingURL=risk-management-agent.d.ts.map