import { AgentOrchestrator } from './base-agent';
import { SignalAnalysisAgent } from './signal-analysis-agent';
import { RiskManagementAgent } from './risk-management-agent';
import { TradingExecutorAgent } from './trading-executor-agent';
import { CoinScreenerAgent } from './coin-screener-agent';
import { AgentContext, CompositeSignal, AIAnalysis, AgentResult, OHLCV } from '../types';

export class CypherScopeOrchestrator {
  private orchestrator: AgentOrchestrator;
  private signalAgent: SignalAnalysisAgent;
  private riskAgent: RiskManagementAgent;
  private tradingAgent: TradingExecutorAgent;
  private screenerAgent: CoinScreenerAgent;
  private isRunning: boolean = false;
  private tradingMode: 'manual' | 'algo' = 'algo';
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor() {
    this.orchestrator = new AgentOrchestrator();
    this.signalAgent = new SignalAnalysisAgent();
    this.riskAgent = new RiskManagementAgent();
    this.tradingAgent = new TradingExecutorAgent();
    this.screenerAgent = new CoinScreenerAgent();
  }

  async initialize(): Promise<void> {
    await this.signalAgent.initialize();
    await this.riskAgent.initialize();
    await this.tradingAgent.initialize();
    await this.screenerAgent.initialize();

    this.orchestrator.registerAgent(this.signalAgent);
    this.orchestrator.registerAgent(this.riskAgent);
    this.orchestrator.registerAgent(this.tradingAgent);
    this.orchestrator.registerAgent(this.screenerAgent);

    this.emit('initialized', { mode: this.tradingMode });
  }

  async analyzeSymbol(symbol: string, ohlcv: OHLCV[], orderBook?: any, tradeFlow?: any): Promise<AnalysisResult> {
    const context: AgentContext = {
      symbol,
      timeframe: '30min',
      balance: 10000,
      positions: [],
      openOrders: [],
      isLiveMode: false,
      marketData: { ohlcv, orderBook, tradeFlow }
    };

    const signalResult = await this.signalAgent.processTask({
      id: `signal-${symbol}`,
      context
    });

    const riskResult = await this.riskAgent.processTask({
      id: `risk-${symbol}`,
      context
    });

    const executionResult = await this.tradingAgent.processTask({
      id: `exec-${symbol}`,
      context: {
        ...context,
        marketData: {
          ...context.marketData,
          signal: signalResult.signal,
          aiAnalysis: signalResult.aiAnalysis
        }
      }
    });

    return {
      symbol,
      signal: signalResult.signal || {
        compositeScore: 0,
        authorized: false,
        side: null,
        confidence: 0,
        triggerCandle: null,
        windowExpires: null,
        indicatorScores: new Map(),
        microstructureScore: 0,
        blockReasons: [],
        confirmations: 0,
        timestamp: Date.now()
      },
      aiAnalysis: signalResult.aiAnalysis || {
        recommendation: 'hold',
        confidence: 0,
        reasoning: [],
        riskAssessment: 'low',
        marketRegime: 'ranging',
        suggestedAction: { type: 'wait' }
      },
      riskAnalysis: riskResult.action,
      execution: executionResult.action,
      timestamp: Date.now()
    };
  }

  async scanMarket(): Promise<ScanResult> {
    const result = await this.screenerAgent.processTask({
      id: 'market-scan',
      context: {
        symbol: 'ALL',
        timeframe: '30min',
        balance: 10000,
        positions: [],
        openOrders: [],
        marketData: { ohlcv: [], orderBook: null, tradeFlow: null }
      }
    });

    return result.action;
  }

  async executeTrade(symbol: string, action: 'buy' | 'sell' | 'close', size?: number): Promise<TradeResult> {
    if (this.tradingMode === 'manual' || action === 'close') {
      return this.manualTrade(symbol, action, size);
    } else {
      return this.algoTrade(symbol);
    }
  }

  private async manualTrade(symbol: string, action: 'buy' | 'sell' | 'close', size?: number): Promise<TradeResult> {
    return {
      success: true,
      symbol,
      action,
      size: size || 1,
      timestamp: Date.now(),
      mode: 'manual'
    };
  }

  private async algoTrade(symbol: string): Promise<TradeResult> {
    return {
      success: true,
      symbol,
      action: 'buy',
      mode: 'algo',
      timestamp: Date.now()
    };
  }

  setMode(mode: 'manual' | 'algo'): void {
    this.tradingMode = mode;
    this.emit('mode-changed', { mode });
  }

  getMode(): 'manual' | 'algo' {
    return this.tradingMode;
  }

  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  getStats(): any {
    return {
      mode: this.tradingMode,
      orchestrator: this.orchestrator.getStats(),
      agents: {
        signalAnalysis: this.signalAgent.getState(),
        riskManagement: this.riskAgent.getState(),
        tradingExecutor: this.tradingAgent.getState(),
        coinScreener: this.screenerAgent.getState()
      }
    };
  }

  async shutdown(): Promise<void> {
    await this.orchestrator.shutdown();
    this.emit('shutdown', {});
  }
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
