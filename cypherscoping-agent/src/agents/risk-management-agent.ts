import { BaseAgent } from './base-agent';
import { AgentContext, AgentResult, Position, CompositeSignal } from '../types';
import { getRecommendedLeverage } from '../config/indicator-weights';

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

export class RiskManagementAgent extends BaseAgent {
  private riskConfig: RiskConfig;
  private positionMetrics: PositionMetrics;
  private tradeMetrics: TradeMetrics;

  private circuitBreakerActive: boolean = false;
  private dailyBalance: number = 0;
  private dailyPnL: number = 0;
  private dailyWinCount: number = 0;
  private maxDailyDrawdown: number = 0;

  constructor(riskConfig?: Partial<RiskConfig>) {
    super({
      id: 'risk-management-agent',
      name: 'Risk Management Agent',
      role: 'Risk Control',
      capabilities: ['position-sizing', 'risk-calculation', 'drawdown-protection', 'leverage-optimization', 'circuit-breaker'],
      maxConcurrentTasks: 5,
      priority: 2
    });

    this.riskConfig = {
      stopLossROI: riskConfig?.stopLossROI || 10,
      takeProfitROI: riskConfig?.takeProfitROI || 30,
      breakEvenActivation: riskConfig?.breakEvenActivation || 8,
      breakEvenBuffer: riskConfig?.breakEvenBuffer || 1.0,
      trailingActivation: riskConfig?.trailingActivation || 12,
      trailingDistance: riskConfig?.trailingDistance || 4,
      maxDrawdown: riskConfig?.maxDrawdown || 10,
      maxPositionsPaper: riskConfig?.maxPositionsPaper || 10,
      maxPositionsLive: riskConfig?.maxPositionsLive || 5,
      maxPositionSizePercent: riskConfig?.maxPositionSizePercent || 0.02,
      leverageMin: riskConfig?.leverageMin || 5,
      leverageMax: riskConfig?.leverageMax || 50
    };

    this.positionMetrics = {
      openPositions: 0,
      totalExposureUSD: 0,
      drawdownPercent: 0,
      dailyPnL: 0,
      maxDailyDrawdown: 0,
      consecutiveLosses: 0,
      totalWinRate: 0
    };

    this.tradeMetrics = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnL: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      winRate: 0,
      sharpeRatio: 0
    };

    this.dailyBalance = 0;
    this.dailyPnL = 0;
    this.dailyWinCount = 0;

    this.memory.learn('risk-config', this.riskConfig);
  }

  async initialize(): Promise<void> {
    const savedConfig = this.memory.retrieve('risk-config');
    if (savedConfig) {
      this.riskConfig = { ...this.riskConfig, ...savedConfig };
    }
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const analysis = await this.analyzeRisk(context);
    const recommendations = this.generateRecommendations(context, analysis);

    return {
      success: true,
      action: {
        type: 'risk-analysis',
        analysis,
        recommendations
      }
    };
  }

  private async analyzeRisk(context: AgentContext): Promise<RiskAnalysis> {
    const positions = context.positions;
    const balance = context.balance;
    const signal = context.marketData.signal as CompositeSignal | null;
    const totalExposure = positions.reduce((sum, p) => sum + (p.size * p.entryPrice), 0);
    const latestCandle = context.marketData.ohlcv[context.marketData.ohlcv.length - 1];
    const currentPrice = latestCandle?.close;

    const unrealizedPnLUsd = this.calculateUnrealizedPnlUsd(positions, currentPrice);
    const equity = balance + unrealizedPnLUsd;
    const drawdownPercent = this.calculateDrawdownPercent(equity);
    this.circuitBreakerActive = drawdownPercent >= this.riskConfig.maxDrawdown;

    return {
      balance,
      positions,
      signal,
      positionMetrics: this.updatePositionMetrics(positions, drawdownPercent),
      tradeMetrics: this.tradeMetrics,
      totalExposure,
      drawdownPercent,
      circuitBreakerTriggered: this.circuitBreakerActive,
      analysis: this.analyzeRiskFactors(balance, unrealizedPnLUsd, drawdownPercent, signal)
    };
  }

  private analyzeRiskFactors(balance: number, unrealizedPnL: number, drawdownPercent: number, signal: CompositeSignal | null): RiskFactors {
    const drawdownRisk = this.assessDrawdownRisk(drawdownPercent, this.riskConfig.maxDrawdown);
    const exposureRisk = this.assessExposureRisk(balance, this.positionMetrics.totalExposureUSD);
    const concentrationRisk = this.assessConcentrationRisk(this.positionMetrics.openPositions, this.riskConfig.maxPositionsLive);
    const correlationRisk = 'medium';

    return {
      drawdownRisk,
      exposureRisk,
      concentrationRisk,
      correlationRisk,
      overallRisk: this.calculateOverallRisk(drawdownRisk, exposureRisk, concentrationRisk)
    };
  }

  private assessDrawdownRisk(drawdownPercent: number, maxDrawdown: number): 'low' | 'medium' | 'high' | 'critical' {
    if (drawdownPercent >= maxDrawdown) return 'critical';
    if (drawdownPercent >= maxDrawdown * 0.8) return 'high';
    if (drawdownPercent >= maxDrawdown * 0.5) return 'medium';
    return 'low';
  }

  private assessExposureRisk(balance: number, totalExposure: number): 'low' | 'medium' | 'high' | 'critical' {
    const exposureRatio = balance > 0 ? totalExposure / balance : 0;
    if (exposureRatio >= 0.8) return 'critical';
    if (exposureRatio >= 0.5) return 'high';
    if (exposureRatio >= 0.3) return 'medium';
    return 'low';
  }

  private assessConcentrationRisk(openPositions: number, maxPositions: number): 'low' | 'medium' | 'high' | 'critical' {
    if (openPositions >= maxPositions) return 'critical';
    if (openPositions >= maxPositions * 0.8) return 'high';
    if (openPositions >= maxPositions * 0.6) return 'medium';
    return 'low';
  }

  private calculateOverallRisk(drawdownRisk: string, exposureRisk: string, concentrationRisk: string): 'low' | 'medium' | 'high' | 'critical' {
    const risks = [drawdownRisk, exposureRisk, concentrationRisk];
    const highCount = risks.filter(r => r === 'high' || r === 'critical').length;

    if (highCount >= 2) return 'critical';
    if (highCount >= 1) return 'high';
    if (risks.some(r => r === 'medium')) return 'medium';
    return 'low';
  }

  private updatePositionMetrics(positions: Position[], drawdownPercent: number): PositionMetrics {
    const openPositions = positions.filter((p) => p.size > 0);
    const totalExposureUSD = positions.reduce((sum, p) => sum + (p.size * p.entryPrice), 0);

    return {
      openPositions: openPositions.length,
      totalExposureUSD,
      drawdownPercent,
      dailyPnL: this.positionMetrics.dailyPnL,
      maxDailyDrawdown: this.positionMetrics.maxDailyDrawdown,
      consecutiveLosses: this.positionMetrics.consecutiveLosses,
      totalWinRate: this.tradeMetrics.winRate
    };
  }

  private calculateUnrealizedPnlUsd(positions: Position[], currentPrice?: number): number {
    let unrealizedPnl = 0;

    for (const pos of positions) {
      if (Number.isFinite(pos.pnl)) {
        unrealizedPnl += pos.pnl;
        continue;
      }

      if (!currentPrice || !Number.isFinite(currentPrice) || !pos.entryPrice) continue;

      const directionalMove =
        pos.side === 'long'
          ? (currentPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - currentPrice) / pos.entryPrice;
      unrealizedPnl += directionalMove * pos.entryPrice * pos.size;
    }

    return unrealizedPnl;
  }

  private calculateDrawdownPercent(equity: number): number {
    if (this.dailyBalance === 0) {
      this.dailyBalance = equity;
    }

    this.dailyBalance = Math.max(this.dailyBalance, equity);
    if (this.dailyBalance <= 0) return 0;

    const drawdown = ((this.dailyBalance - equity) / this.dailyBalance) * 100;
    this.maxDailyDrawdown = Math.max(this.maxDailyDrawdown, drawdown);
    return Math.max(0, drawdown);
  }

  private generateRecommendations(context: AgentContext, analysis: RiskAnalysis): RiskRecommendation[] {
    const recommendations: RiskRecommendation[] = [];

    if (analysis.circuitBreakerTriggered) {
      recommendations.push({
        priority: 'CRITICAL',
        type: 'circuit-breaker',
        description: 'Circuit breaker triggered. All trading stopped.',
        action: 'stop-all',
        immediate: true
      });
      return recommendations;
    }

    if (analysis.drawdownPercent >= this.riskConfig.maxDrawdown * 0.8) {
      recommendations.push({
        priority: 'HIGH',
        type: 'reduce-exposure',
        description: `Drawdown at ${analysis.drawdownPercent.toFixed(2)}% exceeds threshold`,
        action: 'reduce-position',
        targetSize: analysis.balance * 0.5,
        immediate: false
      });
    }

    const maxPositions = context.isLiveMode ? this.riskConfig.maxPositionsLive : this.riskConfig.maxPositionsPaper;
    if (analysis.positionMetrics.openPositions >= maxPositions) {
      recommendations.push({
        priority: 'HIGH',
        type: 'max-positions',
        description: `Maximum ${maxPositions} positions open`,
        action: 'wait-for-exit',
        immediate: false
      });
    }

    const { openPositions } = analysis.positionMetrics;
    for (const pos of context.positions) {
      if (!pos.stopLoss) {
        const slPrice = this.calculateStopLoss(pos, analysis.signal || { compositeScore: 0, authorized: false, side: null, confidence: 0, triggerCandle: null, windowExpires: null, indicatorScores: new Map(), microstructureScore: 0, blockReasons: [], confirmations: 0, timestamp: Date.now(), signalStrength: null, signalType: null, signalSource: '' });
        recommendations.push({
          priority: 'HIGH',
          type: 'set-stop-loss',
          description: `Position ${pos.symbol} missing stop loss`,
          action: 'set-sl',
          symbol: pos.symbol,
          suggestedStopLoss: slPrice,
          immediate: true
        });
      }

      if (!pos.takeProfit) {
        const tpPrice = this.calculateTakeProfit(pos, analysis.signal || { compositeScore: 0, authorized: false, side: null, confidence: 0, triggerCandle: null, windowExpires: null, indicatorScores: new Map(), microstructureScore: 0, blockReasons: [], confirmations: 0, timestamp: Date.now(), signalStrength: null, signalType: null, signalSource: '' });
        recommendations.push({
          priority: 'MEDIUM',
          type: 'set-take-profit',
          description: `Position ${pos.symbol} missing take profit`,
          action: 'set-tp',
          symbol: pos.symbol,
          suggestedTakeProfit: tpPrice,
          immediate: false
        });
      }
    }

    return recommendations.sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return order[a.priority] - order[b.priority];
    });
  }

  calculateStopLoss(position: Position, signal: CompositeSignal): number {
    const slPercent = this.riskConfig.stopLossROI;
    if (position.side === 'long') {
      return position.entryPrice * (1 - slPercent / 100 / position.leverage);
    } else {
      return position.entryPrice * (1 + slPercent / 100 / position.leverage);
    }
  }

  calculateTakeProfit(position: Position, signal: CompositeSignal): number {
    const tpPercent = this.riskConfig.takeProfitROI;
    if (position.side === 'long') {
      return position.entryPrice * (1 + tpPercent / 100 / position.leverage);
    } else {
      return position.entryPrice * (1 - tpPercent / 100 / position.leverage);
    }
  }

  calculateBreakEven(position: Position, currentPrice: number): { newStopLoss: number, activated: boolean } {
    const roiPercent = (position.side === 'long')
      ? ((currentPrice - position.entryPrice) / position.entryPrice) * position.leverage * 100
      : ((position.entryPrice - currentPrice) / position.entryPrice * position.leverage * 100);

    if (roiPercent >= this.riskConfig.breakEvenActivation) {
      const bufferPercent = this.riskConfig.breakEvenBuffer;
      const newSL = position.side === 'long'
        ? position.entryPrice * (1 - bufferPercent / 100 / position.leverage)
        : position.entryPrice * (1 + bufferPercent / 100 / position.leverage);

      return {
        newStopLoss: newSL,
        activated: true
      };
    }

    return {
      newStopLoss: position.stopLoss || position.entryPrice,
      activated: false
    };
  }

  calculateTrailingStop(position: Position, currentPrice: number): { newStopLoss: number; activated: boolean } {
    const roiPercent = (position.side === 'long')
      ? ((currentPrice - position.entryPrice) / position.entryPrice * position.leverage * 100)
      : ((position.entryPrice - currentPrice) / position.entryPrice * position.leverage * 100);

    if (roiPercent >= this.riskConfig.trailingActivation) {
      const trailPercent = this.riskConfig.trailingDistance;
      const newSL = position.side === 'long'
        ? currentPrice * (1 - trailPercent / 100 / position.leverage)
        : currentPrice * (1 + trailPercent / 100 / position.leverage);

      return {
        newStopLoss: newSL,
        activated: true
      };
    }

    return {
      newStopLoss: position.stopLoss || position.entryPrice,
      activated: false
    };
  }

  calculatePositionSize(balance: number, confidence: number, signal: CompositeSignal): number {
    const baseSize = balance * this.riskConfig.maxPositionSizePercent;
    const leverage = getRecommendedLeverage(signal.compositeScore, signal.confidence);

    return baseSize * (confidence / 100) * (leverage / 10);
  }

  triggerCircuitBreaker(reason: string): void {
    this.circuitBreakerActive = true;
    this.emit('circuit-breaker-triggered', { reason, timestamp: Date.now() });

    this.memory.learn('circuit-breaker', {
      triggered: true,
      reason,
      timestamp: Date.now()
    });
  }

  resetCircuitBreaker(): void {
    this.circuitBreakerActive = false;
    this.dailyBalance = 0;
    this.dailyPnL = 0;
    this.dailyWinCount = 0;
    this.maxDailyDrawdown = 0;

    this.emit('circuit-breaker-reset', { timestamp: Date.now() });
    this.memory.learn('circuit-breaker', {
      triggered: false,
      reset: true,
      timestamp: Date.now()
    });
  }

  updateDailyMetrics(balance: number, pnl: number, win: boolean): void {
    this.dailyPnL += pnl;

    if (win) {
      this.dailyWinCount++;
    }

    const dailyReturn = (this.dailyPnL / this.dailyBalance) * 100;
    const dailyDrawdown = Math.abs(dailyReturn);

    if (dailyDrawdown > this.maxDailyDrawdown) {
      this.maxDailyDrawdown = dailyDrawdown;
    }

    this.positionMetrics = {
      ...this.positionMetrics,
      dailyPnL: this.dailyPnL,
      maxDailyDrawdown: this.maxDailyDrawdown
    };
  }

  getTradeMetrics(): TradeMetrics {
    return this.tradeMetrics;
  }

  getPositionMetrics(): PositionMetrics {
    return this.positionMetrics;
  }

  getCircuitBreakerStatus(): { active: boolean; reason: string | null } {
    return {
      active: this.circuitBreakerActive,
      reason: this.circuitBreakerActive ? 'Manual trigger' : null
    };
  }

  getRiskLevel(balance: number, signal: CompositeSignal): 'low' | 'medium' | 'high' | 'critical' {
    const { compositeScore, confidence } = signal;
    const leverage = getRecommendedLeverage(compositeScore, confidence);

    if (leverage >= 30) return 'critical';
    if (leverage >= 20) return 'high';
    if (leverage >= 15) return 'medium';
    return 'low';
  }

  async shutdown(): Promise<void> {
    this.memory.learn('risk-config', this.riskConfig);
  }
}

interface RiskAnalysis {
  balance: number;
  positions: Position[];
  signal: CompositeSignal | null;
  positionMetrics: PositionMetrics;
  tradeMetrics: TradeMetrics;
  totalExposure: number;
  drawdownPercent: number;
  circuitBreakerTriggered: boolean;
  analysis: RiskFactors;
}

interface RiskFactors {
  drawdownRisk: 'low' | 'medium' | 'high' | 'critical';
  exposureRisk: 'low' | 'medium' | 'high' | 'critical';
  concentrationRisk: 'low' | 'medium' | 'high' | 'critical';
  correlationRisk: 'low' | 'medium' | 'high' | 'critical';
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
}

interface RiskRecommendation {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  type: string;
  description: string;
  action: string;
  immediate: boolean;
  symbol?: string;
  suggestedStopLoss?: number;
  suggestedTakeProfit?: number;
  targetSize?: number;
}
