import { BaseAgent, AgentContext, AgentResult } from './base-agent';
import { CompositeSignal, AIAnalysis, Position, TradingMode, OrderRequest, OrderResponse } from '../types';
import { getRecommendedLeverage } from '../config/indicator-weights';

export class TradingExecutorAgent extends BaseAgent {
  private apiClient: APIClient;
  private orderHistory: OrderRecord[] = [];
  private tradingMode: TradingMode = 'paper';
  private dailyMetrics: DailyMetrics = {
    totalPnL: 0,
    winCount: 0,
    lossCount: 0,
    totalTrades: 0,
    maxDrawdown: 0,
    peakEquity: 0
  };
  private currentEquity: number = 0;
  private riskParams = {
    stopLossROI: 10,
    takeProfitROI: 30,
    breakEvenActivation: 8,
    breakEvenBuffer: 1,
    trailingStopActivation: 12,
    trailingStopTrail: 4,
    neverUntrail: true,
    circuitBreakerDrawdown: 10,
    maxPositionsPaper: 10,
    maxPositionsLive: 5
  };

  constructor() {
    super({
      id: 'trading-executor-agent',
      name: 'Trading Executor Agent',
      role: 'Order Execution',
      capabilities: ['order-placement', 'order-management', 'position-tracking', 'execution-optimization'],
      maxConcurrentTasks: 10,
      priority: 3
    });
    this.apiClient = new APIClient();
  }

  async initialize(): Promise<void> {
    await this.apiClient.connect();
    this.currentEquity = 10000;
    this.dailyMetrics.peakEquity = this.currentEquity;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { symbol, balance, positions } = context;
    const signal = context.marketData['signal'] as CompositeSignal;
    const aiAnalysis = context.marketData['aiAnalysis'] as AIAnalysis;

    if (!signal || !aiAnalysis) {
      return { success: false, error: 'Missing signal or AI analysis' };
    }

    if (!signal.authorized) {
      return {
        success: true,
        action: { type: 'wait', reason: 'Signal not authorized' }
      };
    }

    const existingPosition = positions.find(p => p.symbol === symbol);

    if (existingPosition) {
      return this.handleExistingPosition(existingPosition, signal, context);
    }

    return this.openNewPosition(symbol, balance, signal, aiAnalysis, context);
  }

  private async openNewPosition(
    symbol: string,
    balance: number,
    signal: CompositeSignal,
    aiAnalysis: AIAnalysis,
    context: AgentContext
  ): Promise<AgentResult> {
    const { side, confidence } = signal;
    const { suggestedAction } = aiAnalysis;

    const score = signal.compositeScore;
    const leverage = getRecommendedLeverage(score, confidence);
    const positionSize = this.calculatePositionSize(balance, confidence, leverage);

    const maxPositions = this.tradingMode === 'paper' 
      ? this.riskParams.maxPositionsPaper 
      : this.riskParams.maxPositionsLive;

    if (context.positions.length >= maxPositions) {
      return {
        success: false,
        error: `Max positions (${maxPositions}) reached`
      };
    }

    try {
      const order = await this.apiClient.placeOrder({
        id: `order-${Date.now()}`,
        symbol,
        side: side === 'long' ? 'buy' : 'sell',
        type: 'market',
        size: positionSize,
        leverage,
        timestamp: Date.now()
      });

      const takeProfit = this.calculateTakeProfit(order.price, side, this.riskParams.takeProfitROI, leverage);
      const stopLoss = this.calculateStopLoss(order.price, side, this.riskParams.stopLossROI, leverage);

      await this.apiClient.placeOrder({
        id: `tp-${order.id}`,
        symbol,
        side: side === 'long' ? 'sell' : 'buy',
        type: 'limit',
        size: positionSize,
        price: takeProfit,
        reduceOnly: true
      });

      await this.apiClient.placeOrder({
        id: `sl-${order.id}`,
        symbol,
        side: side === 'long' ? 'sell' : 'buy',
        type: 'stop',
        size: positionSize,
        price: stopLoss,
        reduceOnly: true
      });

      this.orderHistory.push({
        orderId: order.id,
        symbol,
        side,
        size: positionSize,
        leverage,
        entryPrice: order.price,
        takeProfit,
        stopLoss,
        timestamp: Date.now(),
        status: 'open'
      });

      return {
        success: true,
        action: {
          type: 'open-position',
          orderId: order.id,
          symbol,
          side,
          size: positionSize,
          leverage,
          entryPrice: order.price,
          stopLoss,
          takeProfit
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  private async handleExistingPosition(
    position: Position,
    signal: CompositeSignal,
    context: AgentContext
  ): Promise<AgentResult> {
    const { side, compositeScore } = signal;

    const currentDrawdown = this.calculateCurrentDrawdown();
    if (currentDrawdown >= this.riskParams.circuitBreakerDrawdown) {
      return {
        success: true,
        action: {
          type: 'emergency-close-all',
          reason: `Circuit breaker: ${currentDrawdown.toFixed(2)}% drawdown exceeded limit of ${this.riskParams.circuitBreakerDrawdown}%`,
          positions: context.positions
        }
      };
    }

    if (position.side !== side) {
      if (Math.abs(compositeScore) > 100) {
        return {
          success: true,
          action: {
            type: 'reverse-position',
            currentPosition: position,
            reason: 'Strong signal in opposite direction'
          }
        };
      }
    }

    if (position.pnlPercent >= this.riskParams.breakEvenActivation && !position.stopLoss) {
      const newStopLoss = side === 'long' 
        ? position.entryPrice * (1 + this.riskParams.breakEvenBuffer / 100)
        : position.entryPrice * (1 - this.riskParams.breakEvenBuffer / 100);

      return {
        success: true,
        action: {
          type: 'set-break-even',
          symbol: position.symbol,
          newStopLoss,
          currentPnl: position.pnlPercent
        }
      };
    }

    if (position.pnlPercent >= this.riskParams.trailingStopActivation && position.takeProfit) {
      const newTakeProfit = side === 'long'
        ? position.entryPrice + (position.entryPrice - position.stopLoss!) * (1 - this.riskParams.trailingStopTrail / 100)
        : position.entryPrice - (position.stopLoss! - position.entryPrice) * (1 - this.riskParams.trailingStopTrail / 100);

      if (!this.riskParams.neverUntrail || (side === 'long' && newTakeProfit > position.takeProfit) || (side === 'short' && newTakeProfit < position.takeProfit)) {
        return {
          success: true,
          action: {
            type: 'trail-take-profit',
            symbol: position.symbol,
            newTakeProfit,
            currentPnl: position.pnlPercent
          }
        };
      }
    }

    return {
      success: true,
      action: {
        type: 'hold',
        position,
        reason: 'No action required'
      }
    };
  }

  private calculateCurrentDrawdown(): number {
    if (this.currentEquity >= this.dailyMetrics.peakEquity) {
      this.dailyMetrics.peakEquity = this.currentEquity;
      return 0;
    }
    return ((this.dailyMetrics.peakEquity - this.currentEquity) / this.dailyMetrics.peakEquity) * 100;
  }

  private calculatePositionSize(balance: number, confidence: number, leverage: number): number {
    const baseRisk = 0.02;
    const confidenceMultiplier = Math.min(1.5, Math.max(0.5, confidence / 100));
    const size = balance * baseRisk * confidenceMultiplier / leverage;
    return Math.floor(size * 100) / 100;
  }

  private calculateTakeProfit(entryPrice: number, side: 'long' | 'short', targetROI: number, leverage: number): number {
    const perLegROI = targetROI / leverage;
    if (side === 'long') {
      return entryPrice * (1 + perLegROI / 100);
    } else {
      return entryPrice * (1 - perLegROI / 100);
    }
  }

  private calculateStopLoss(entryPrice: number, side: 'long' | 'short', maxROI: number, leverage: number): number {
    const perLegROI = maxROI / leverage;
    if (side === 'long') {
      return entryPrice * (1 - perLegROI / 100);
    } else {
      return entryPrice * (1 + perLegROI / 100);
    }
  }

  async shutdown(): Promise<void> {
    await this.apiClient.disconnect();
  }

  setTradingMode(mode: TradingMode): void {
    this.tradingMode = mode;
  }

  getTradingMode(): TradingMode {
    return this.tradingMode;
  }

  getDailyMetrics(): DailyMetrics {
    return { ...this.dailyMetrics };
  }
}

interface DailyMetrics {
  totalPnL: number;
  winCount: number;
  lossCount: number;
  totalTrades: number;
  maxDrawdown: number;
  peakEquity: number;
}

class APIClient {
  private connected: boolean = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    return {
      id: order.id || `order-${Date.now()}`,
      success: true,
      symbol: order.symbol,
      price: 50000 + Math.random() * 1000,
      size: order.size,
      filledSize: order.size,
      fee: order.size * 0.0005,
      timestamp: Date.now()
    };
  }

  async getPosition(symbol: string): Promise<Position | null> {
    return null;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    return true;
  }
}

interface OrderRecord {
  orderId: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  leverage: number;
  entryPrice: number;
  takeProfit?: number;
  stopLoss?: number;
  timestamp: number;
  status: string;
}
