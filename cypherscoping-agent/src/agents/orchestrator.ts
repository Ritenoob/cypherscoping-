import { AgentOrchestrator } from './base-agent';
import { SignalAnalysisAgent } from './signal-analysis-agent';
import { RiskManagementAgent } from './risk-management-agent';
import { TradingExecutorAgent } from './trading-executor-agent';
import { CoinScreenerAgent } from './coin-screener-agent';
import { AgentContext, CompositeSignal, AIAnalysis, AgentResult, OHLCV, AgentExecutionOptions } from '../types';
import { SymbolPolicyConfig, loadSymbolPolicy, validateSymbolPolicy } from '../config/symbol-policy';
import { AuditLogger } from '../core/audit-logger';
import { randomUUID } from 'crypto';

export interface CypherScopeOrchestratorOptions {
  allToolsAllowed?: boolean;
  optimizeExecution?: boolean;
  enabledTools?: string[];
}

export class CypherScopeOrchestrator {
  private orchestrator: AgentOrchestrator;
  private signalAgent: SignalAnalysisAgent;
  private riskAgent: RiskManagementAgent;
  private tradingAgent: TradingExecutorAgent;
  private screenerAgent: CoinScreenerAgent;
  private isRunning: boolean = false;
  private tradingMode: 'manual' | 'algo' = 'algo';
  private eventHandlers: Map<string, Function[]> = new Map();
  private readonly executionOptions: AgentExecutionOptions;
  private readonly isLiveMode: boolean;
  private readonly symbolPolicy: SymbolPolicyConfig;
  private readonly auditLogger: AuditLogger;

  constructor(options: CypherScopeOrchestratorOptions = {}) {
    this.orchestrator = new AgentOrchestrator();
    this.signalAgent = new SignalAnalysisAgent();
    this.riskAgent = new RiskManagementAgent();
    this.symbolPolicy = loadSymbolPolicy();
    this.tradingAgent = new TradingExecutorAgent();
    this.screenerAgent = new CoinScreenerAgent(this.symbolPolicy.tradingUniverse);
    this.auditLogger = new AuditLogger();
    this.executionOptions = {
      allToolsAllowed: options.allToolsAllowed ?? false,
      optimizeExecution: options.optimizeExecution ?? true,
      enabledTools: options.enabledTools ?? ['signal-engine', 'risk-engine', 'trade-executor', 'market-screener']
    };
    this.isLiveMode = (process.env.TRADING_MODE || 'paper').toLowerCase() === 'live';
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
    const correlationId = randomUUID();
    const toolsScope: 'all' | 'restricted' = this.executionOptions.allToolsAllowed ? 'all' : 'restricted';
    await this.safeAudit({
      timestamp: Date.now(),
      eventType: 'analysis_requested',
      correlationId,
      component: 'orchestrator',
      severity: 'info',
      payload: { symbol }
    });

    const policyCheck = validateSymbolPolicy(symbol, this.symbolPolicy);
    if (!policyCheck.allowed) {
      await this.safeAudit({
        timestamp: Date.now(),
        eventType: 'policy_rejection',
        correlationId,
        component: 'orchestrator',
        severity: 'warn',
        payload: { symbol, code: policyCheck.code, reason: policyCheck.reason }
      });
      return {
        symbol,
        correlationId,
        signal: this.createEmptySignal(),
        aiAnalysis: this.createDefaultAIAnalysis(),
        riskAnalysis: null,
        execution: {
          type: 'blocked',
          code: policyCheck.code,
          reason: policyCheck.reason
        },
        errorCode: policyCheck.code,
        error: policyCheck.reason,
        timestamp: Date.now(),
        durationMs: 0,
        toolsScope
      };
    }

    const startTime = Date.now();
    const context: AgentContext = {
      symbol,
      correlationId,
      timeframe: '30min',
      balance: 10000,
      positions: [],
      openOrders: [],
      isLiveMode: this.isLiveMode,
      executionOptions: this.executionOptions,
      marketData: { ohlcv, orderBook, tradeFlow }
    };

    const [signalResult, riskResult] = await Promise.all([
      this.signalAgent.processTask({
        id: `signal-${symbol}`,
        context
      }),
      this.riskAgent.processTask({
        id: `risk-${symbol}`,
        context
      })
    ]);

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
    const executionAction = executionResult.action || {
      type: 'blocked',
      reason: executionResult.error || 'Execution produced no action'
    };

    const result = {
      symbol,
      correlationId,
      signal: signalResult.signal || this.createEmptySignal(),
      aiAnalysis: signalResult.aiAnalysis || this.createDefaultAIAnalysis(),
      riskAnalysis: riskResult.action,
      execution: executionAction,
      timestamp: Date.now(),
      durationMs: Date.now() - startTime,
      toolsScope
    };
    await this.safeAudit({
      timestamp: Date.now(),
      eventType: 'analysis_completed',
      correlationId,
      component: 'orchestrator',
      severity: 'info',
      payload: { symbol, durationMs: result.durationMs, executionType: result.execution?.type }
    });
    return result;
  }

  async scanMarket(): Promise<ScanResult> {
    const correlationId = randomUUID();
    const result = await this.screenerAgent.processTask({
      id: 'market-scan',
      context: {
        correlationId,
        symbol: 'ALL',
        timeframe: '30min',
        balance: 10000,
        positions: [],
        openOrders: [],
        isLiveMode: this.isLiveMode,
        executionOptions: this.executionOptions,
        marketData: { ohlcv: [], orderBook: null, tradeFlow: null }
      }
    });

    await this.safeAudit({
      timestamp: Date.now(),
      eventType: 'market_scan_completed',
      correlationId,
      component: 'orchestrator',
      severity: 'info',
      payload: {
        totalScanned: result.action?.totalScanned,
        opportunities: result.action?.opportunities
      }
    });

    return result.action;
  }

  async executeTrade(symbol: string, action: 'buy' | 'sell' | 'close', size?: number): Promise<TradeResult> {
    const correlationId = randomUUID();
    const policyCheck = validateSymbolPolicy(symbol, this.symbolPolicy);
    if (!policyCheck.allowed) {
      await this.safeAudit({
        timestamp: Date.now(),
        eventType: 'policy_rejection',
        correlationId,
        component: 'orchestrator',
        severity: 'warn',
        payload: { symbol, action, size, code: policyCheck.code, reason: policyCheck.reason }
      });
      return {
        success: false,
        correlationId,
        symbol,
        action,
        size,
        timestamp: Date.now(),
        mode: this.tradingMode,
        errorCode: policyCheck.code,
        error: policyCheck.reason || 'Symbol blocked by policy'
      };
    }

    const result = await this.tradingAgent.executeDirectTrade(symbol, action, size || 1);
    if (!result.success) {
      await this.safeAudit({
        timestamp: Date.now(),
        eventType: 'trade_failed',
        correlationId,
        component: 'orchestrator',
        severity: 'warn',
        payload: { symbol, action, size, errorCode: result.errorCode, error: result.error }
      });
      return {
        success: false,
        correlationId,
        symbol,
        action,
        size,
        timestamp: Date.now(),
        mode: this.tradingMode,
        errorCode: result.errorCode,
        error: result.error || 'Execution failed'
      };
    }

    const tradeResult = {
      success: true,
      correlationId,
      symbol,
      action,
      size,
      mode: this.tradingMode,
      timestamp: Date.now(),
      execution: result.action
    };
    await this.safeAudit({
      timestamp: Date.now(),
      eventType: 'trade_completed',
      correlationId,
      component: 'orchestrator',
      severity: 'info',
      payload: {
        symbol,
        action,
        size,
        executionType: tradeResult.execution?.type
      }
    });
    return tradeResult;
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
      },
      performance: {
        trading: this.tradingAgent.getDailyMetrics(),
        signalFeatures: this.tradingAgent.getSignalPerformance()
      },
      executionOptions: this.executionOptions,
      symbolPolicy: this.symbolPolicy
    };
  }

  private createEmptySignal(): CompositeSignal {
    return {
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
    };
  }

  private createDefaultAIAnalysis(): AIAnalysis {
    return {
      recommendation: 'hold',
      confidence: 0,
      reasoning: [],
      riskAssessment: 'low',
      marketRegime: 'ranging',
      suggestedAction: { type: 'wait' }
    };
  }

  async shutdown(): Promise<void> {
    await this.orchestrator.shutdown();
    this.emit('shutdown', {});
  }

  private async safeAudit(event: Parameters<AuditLogger['log']>[0]): Promise<void> {
    try {
      await this.auditLogger.log(event);
    } catch (error) {
      console.warn('[CypherScope] audit logger failure:', (error as Error).message);
    }
  }
}

interface AnalysisResult {
  symbol: string;
  correlationId: string;
  signal: CompositeSignal;
  aiAnalysis: AIAnalysis;
  riskAnalysis: any;
  execution: any;
  errorCode?: string;
  error?: string;
  timestamp: number;
  durationMs: number;
  toolsScope: 'all' | 'restricted';
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
  correlationId: string;
  symbol: string;
  action: string;
  size?: number;
  timestamp: number;
  mode: string;
  errorCode?: string;
  execution?: any;
  error?: string;
}
