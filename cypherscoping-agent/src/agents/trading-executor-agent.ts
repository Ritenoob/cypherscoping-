import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { BaseAgent } from './base-agent';
import { AgentContext, AgentResult, CompositeSignal, Position, TradingMode, OrderRequest, OrderResponse, AIAnalysis } from '../types';
import { getRecommendedLeverage } from '../config/indicator-weights';
import { SymbolPolicyConfig, loadSymbolPolicy, validateSymbolPolicy } from '../config/symbol-policy';
import { IdempotencyStore } from '../core/idempotency-store';
import { AuditLogger } from '../core/audit-logger';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

export class TradingExecutorAgent extends BaseAgent {
  private exchangeAdapter: ExchangeAdapter = new SimulatedExchangeAdapter();
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
  private readonly symbolPolicy: SymbolPolicyConfig;
  private readonly idempotencyWindowMs: number = Number(process.env.IDEMPOTENCY_WINDOW_MS || 5 * 60 * 1000);
  private readonly processedOrderKeys: Map<string, number> = new Map();
  private readonly idempotencyStore: IdempotencyStore;
  private readonly auditLogger: AuditLogger;
  private readonly liveHistoryPath: string;
  private readonly positionLifecycle: Map<string, PositionLifecycleState> = new Map();
  private readonly signalPerformance: Map<string, FeaturePerformance> = new Map();
  private readonly featureAllowlist: Set<string>;
  private readonly featureDenylist: Set<string>;
  private readonly globallyAllowedRegimes: Set<MarketRegime>;
  private readonly signalTypeRegimePolicy: Map<string, Set<MarketRegime>>;
  private readonly minStrengthByRegime: Map<MarketRegime, SignalStrength>;
  private lossStreak: number = 0;
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
    maxPositionsLive: 5,
    maxExposureRatio: Number(process.env.MAX_EXPOSURE_RATIO || 0.8),
    maxRiskPerTrade: Number(process.env.MAX_RISK_PER_TRADE || 0.02),
    minPositionSize: Number(process.env.MIN_POSITION_SIZE || 0.01),
    partialTakeProfitROI: Number(process.env.PARTIAL_TAKE_PROFIT_ROI || 12),
    timeInvalidationMinutes: Number(process.env.TIME_INVALIDATION_MINUTES || 180),
    timeInvalidationMinRoi: Number(process.env.TIME_INVALIDATION_MIN_ROI || 2),
    premiseBreakMinutes: Number(process.env.PREMISE_BREAK_MINUTES || 30),
    premiseBreakScore: Number(process.env.PREMISE_BREAK_SCORE || 110),
    featureDisableMs: Number(process.env.FEATURE_DISABLE_HOURS || 6) * 60 * 60 * 1000,
    minFeatureSample: Number(process.env.MIN_FEATURE_SAMPLE || 6),
    killswitchWindowTrades: Number(process.env.KILLSWITCH_WINDOW_TRADES || 8),
    killswitchMinTrades: Number(process.env.KILLSWITCH_MIN_TRADES || 4),
    killswitchMinExpectancy: Number(process.env.KILLSWITCH_MIN_EXPECTANCY || -0.1),
    killswitchMinProfitFactor: Number(process.env.KILLSWITCH_MIN_PROFIT_FACTOR || 0.8),
    killswitchMaxDrawdown: Number(process.env.KILLSWITCH_MAX_DRAWDOWN || 2.5)
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
    this.symbolPolicy = loadSymbolPolicy();
    this.idempotencyStore = new IdempotencyStore();
    this.auditLogger = new AuditLogger();
    const explicitHistory = process.env.STRATEGY_TRADES_PATH;
    const localDataPath = path.join(process.cwd(), 'data', 'trade-history-live.json');
    const parentDataPath = path.join(process.cwd(), '..', 'data', 'trade-history-live.json');
    this.liveHistoryPath = explicitHistory || (this.pathExistsSync(localDataPath) ? localDataPath : parentDataPath);
    this.featureAllowlist = this.parseFeatureSet(process.env.FEATURE_ALLOWLIST);
    this.featureDenylist = this.parseFeatureSet(process.env.FEATURE_DENYLIST);
    this.globallyAllowedRegimes = this.parseRegimeSet(process.env.ALLOWED_REGIMES || 'trending,volatile');
    this.signalTypeRegimePolicy = this.parseSignalTypeRegimePolicy(process.env.SIGNAL_TYPE_REGIME_POLICY);
    this.minStrengthByRegime = this.parseMinStrengthByRegime(process.env.MIN_SIGNAL_STRENGTH_BY_REGIME);
  }

  async initialize(): Promise<void> {
    this.tradingMode = this.resolveTradingMode();
    this.exchangeAdapter = this.createExchangeAdapter(this.tradingMode);
    await this.exchangeAdapter.connect();
    const loaded = await this.idempotencyStore.load();
    for (const [key, ts] of loaded.entries()) {
      this.processedOrderKeys.set(key, ts);
    }
    this.pruneIdempotencyCache();

    this.currentEquity = 10000;
    this.dailyMetrics.peakEquity = this.currentEquity;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { symbol, balance, positions } = context;
    const correlationId = context.correlationId || randomUUID();
    const symbolValidation = validateSymbolPolicy(symbol, this.symbolPolicy);
    if (!symbolValidation.allowed) {
      await this.safeAudit({
        timestamp: Date.now(),
        eventType: 'policy_rejection',
        correlationId,
        component: 'trading-executor',
        severity: 'warn',
        payload: { symbol, code: symbolValidation.code, reason: symbolValidation.reason, mode: 'signal' }
      });
      return {
        success: false,
        errorCode: symbolValidation.code,
        error: symbolValidation.reason || 'Symbol blocked by policy'
      };
    }

    const signal = context.marketData.signal as CompositeSignal | undefined;
    const aiAnalysis = context.marketData.aiAnalysis;

    if (!signal || !aiAnalysis) {
      return { success: false, error: 'Missing signal or AI analysis' };
    }

    if (!signal.authorized) {
      return {
        success: true,
        action: { type: 'wait', reason: 'Signal not authorized' }
      };
    }

    if (!signal.side) {
      return {
        success: true,
        action: { type: 'wait', reason: 'Authorized signal missing side; execution blocked' }
      };
    }

    if (signal.confidence < 75 || aiAnalysis.riskAssessment === 'high') {
      return {
        success: true,
        action: {
          type: 'wait',
          reason: 'Signal quality threshold not met for execution'
        }
      };
    }
    const regimeGate = this.evaluateRegimeCompatibility(signal, aiAnalysis);
    if (!regimeGate.allowed) {
      return {
        success: true,
        action: {
          type: 'wait',
          reason: regimeGate.reason
        }
      };
    }

    const featureKey = this.buildFeatureKey(signal, aiAnalysis);
    if (!this.isFeatureEnabled(featureKey)) {
      return {
        success: true,
        action: {
          type: 'wait',
          reason: `Feature temporarily disabled due to poor expectancy: ${featureKey}`
        }
      };
    }

    const existingPosition = positions.find((p) => p.symbol === symbol);
    if (existingPosition) {
      return this.handleExistingPosition(existingPosition, signal, context, aiAnalysis, correlationId);
    }

    return this.openNewPosition(symbol, balance, signal, context, aiAnalysis, correlationId, featureKey);
  }

  async executeDirectTrade(
    symbol: string,
    action: 'buy' | 'sell' | 'close',
    size: number = 1
  ): Promise<AgentResult> {
    const correlationId = randomUUID();
    const symbolValidation = validateSymbolPolicy(symbol, this.symbolPolicy);
    if (!symbolValidation.allowed) {
      await this.safeAudit({
        timestamp: Date.now(),
        eventType: 'policy_rejection',
        correlationId,
        component: 'trading-executor',
        severity: 'warn',
        payload: { symbol, action, size, code: symbolValidation.code, reason: symbolValidation.reason, mode: 'manual' }
      });
      return {
        success: false,
        errorCode: symbolValidation.code,
        error: symbolValidation.reason || 'Symbol blocked by policy'
      };
    }

    if (size <= 0) {
      return { success: false, error: 'Trade size must be greater than 0' };
    }

    try {
      const idempotencyKey = this.createManualOrderKey(symbol, action, size);
      if (this.isDuplicateOrder(idempotencyKey)) {
        await this.safeAudit({
          timestamp: Date.now(),
          eventType: 'duplicate_order_rejected',
          correlationId,
          component: 'trading-executor',
          severity: 'warn',
          payload: { symbol, action, size, idempotencyKey }
        });
        return {
          success: false,
          errorCode: 'E_DUPLICATE_ORDER',
          error: 'Duplicate manual order request blocked by idempotency policy'
        };
      }

      let side: 'buy' | 'sell';
      let closingPosition: Position | null = null;
      if (action === 'close') {
        const position = await this.exchangeAdapter.getPosition(symbol);
        if (!position) {
          return { success: false, error: `No open position found for ${symbol}` };
        }
        closingPosition = position;
        side = position.side === 'long' ? 'sell' : 'buy';
      } else {
        side = action;
      }

      const response = await this.exchangeAdapter.placeOrder({
        id: idempotencyKey,
        symbol,
        side,
        type: 'market',
        size,
        leverage: 5,
        reduceOnly: action === 'close',
        timestamp: Date.now()
      });

      if (!response.success) {
        await this.safeAudit({
          timestamp: Date.now(),
          eventType: 'order_failed',
          correlationId,
          component: 'trading-executor',
          severity: 'warn',
          payload: { symbol, action, size, reason: response.error }
        });
        return { success: false, error: response.error || 'Order rejected by exchange' };
      }

      this.recordOrderKey(idempotencyKey);
      await this.persistIdempotencyState();
      if (closingPosition) {
        await this.recordTradeOutcome(symbol, closingPosition.pnlPercent, correlationId);
      }
      await this.safeAudit({
        timestamp: Date.now(),
        eventType: 'order_accepted',
        correlationId,
        component: 'trading-executor',
        severity: 'info',
        payload: { symbol, action, size: response.filledSize || size, orderId: response.orderId || response.id }
      });

      return {
        success: true,
        action: {
          type: action === 'close' ? 'close-position' : 'direct-trade',
          symbol,
          side,
          size: response.filledSize || size,
          orderId: response.orderId || response.id,
          price: response.price,
          mode: this.tradingMode
        }
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private resolveTradingMode(): TradingMode {
    const mode = (process.env.TRADING_MODE || 'paper').toLowerCase();
    return mode === 'live' ? 'live' : 'paper';
  }

  private createExchangeAdapter(mode: TradingMode): ExchangeAdapter {
    const simulationEnabled = (process.env.SIMULATION || '').toLowerCase() === 'true';

    if (mode === 'live') {
      if (simulationEnabled) {
        throw new Error('Invalid configuration: live mode cannot use simulation adapter');
      }
      const apiKey = process.env.KUCOIN_API_KEY;
      const apiSecret = process.env.KUCOIN_API_SECRET;
      const apiPassphrase = process.env.KUCOIN_API_PASSPHRASE;
      if (!apiKey || !apiSecret || !apiPassphrase) {
        throw new Error('Live mode requires KUCOIN_API_KEY, KUCOIN_API_SECRET, and KUCOIN_API_PASSPHRASE');
      }
      return new KucoinPerpExchangeAdapter(apiKey, apiSecret, apiPassphrase);
    }

    return new SimulatedExchangeAdapter();
  }

  private async openNewPosition(
    symbol: string,
    balance: number,
    signal: CompositeSignal,
    context: AgentContext,
    aiAnalysis: AIAnalysis,
    correlationId: string,
    featureKey: string
  ): Promise<AgentResult> {
    const { side, confidence } = signal;
    if (!side) {
      return { success: false, error: 'Signal side is null' };
    }

    const leverage = getRecommendedLeverage(signal.compositeScore, confidence);
    const maxPositions =
      this.tradingMode === 'paper' ? this.riskParams.maxPositionsPaper : this.riskParams.maxPositionsLive;
    const currentDrawdown = this.calculateCurrentDrawdown();
    const positionSize = this.calculatePositionSize(
      balance,
      signal,
      leverage,
      currentDrawdown,
      aiAnalysis.marketRegime
    );
    if (currentDrawdown >= this.riskParams.circuitBreakerDrawdown) {
      await this.safeAudit({
        timestamp: Date.now(),
        eventType: 'risk_rejection',
        correlationId,
        component: 'trading-executor',
        severity: 'warn',
        payload: { symbol, code: 'E_RISK_CIRCUIT_BREAKER', drawdownPercent: currentDrawdown }
      });
      return {
        success: false,
        errorCode: 'E_RISK_CIRCUIT_BREAKER',
        error: `Circuit breaker active at ${currentDrawdown.toFixed(2)}% drawdown`
      };
    }

    if (context.positions.length >= maxPositions) {
      return { success: false, error: `Max positions (${maxPositions}) reached` };
    }

    const latestClose = context.marketData.ohlcv[context.marketData.ohlcv.length - 1]?.close;
    const currentExposure = context.positions.reduce((sum, p) => sum + p.size * p.entryPrice, 0);
    const projectedExposure = currentExposure + positionSize * (latestClose || 0);
    if (balance > 0 && projectedExposure / balance > this.riskParams.maxExposureRatio) {
      await this.safeAudit({
        timestamp: Date.now(),
        eventType: 'risk_rejection',
        correlationId,
        component: 'trading-executor',
        severity: 'warn',
        payload: {
          symbol,
          code: 'E_RISK_MAX_EXPOSURE',
          projectedExposure,
          balance,
          maxExposureRatio: this.riskParams.maxExposureRatio
        }
      });
      return {
        success: false,
        errorCode: 'E_RISK_MAX_EXPOSURE',
        error: `Projected exposure exceeds ${(this.riskParams.maxExposureRatio * 100).toFixed(0)}% of balance`
      };
    }

    const idempotencyKey = this.createSignalOrderKey(symbol, signal);
    if (this.isDuplicateOrder(idempotencyKey)) {
      await this.safeAudit({
        timestamp: Date.now(),
        eventType: 'duplicate_order_rejected',
        correlationId,
        component: 'trading-executor',
        severity: 'warn',
        payload: { symbol, idempotencyKey, mode: 'signal' }
      });
      return {
        success: true,
        action: {
          type: 'wait',
          reason: 'Duplicate signal order blocked by idempotency policy'
        }
      };
    }

    try {
      const order = await this.exchangeAdapter.placeOrder({
        id: idempotencyKey,
        symbol,
        side: side === 'long' ? 'buy' : 'sell',
        type: 'market',
        size: positionSize,
        leverage,
        timestamp: Date.now()
      });

      if (!order.success || !order.price) {
        await this.safeAudit({
          timestamp: Date.now(),
          eventType: 'order_failed',
          correlationId,
          component: 'trading-executor',
          severity: 'warn',
          payload: { symbol, side, reason: order.error || 'Entry order failed' }
        });
        return { success: false, error: order.error || 'Entry order failed' };
      }

      this.recordOrderKey(idempotencyKey);
      await this.persistIdempotencyState();
      await this.safeAudit({
        timestamp: Date.now(),
        eventType: 'order_accepted',
        correlationId,
        component: 'trading-executor',
        severity: 'info',
        payload: { symbol, side, size: positionSize, orderId: order.id }
      });

      const takeProfit = this.calculateTakeProfit(order.price, side, this.riskParams.takeProfitROI, leverage);
      const stopLoss = this.calculateStopLoss(order.price, side, this.riskParams.stopLossROI, leverage);

      await this.exchangeAdapter.placeOrder({
        id: `tp-${order.id}`,
        symbol,
        side: side === 'long' ? 'sell' : 'buy',
        type: 'limit',
        size: positionSize,
        price: takeProfit,
        leverage,
        timestamp: Date.now(),
        reduceOnly: true
      });

      await this.exchangeAdapter.placeOrder({
        id: `sl-${order.id}`,
        symbol,
        side: side === 'long' ? 'sell' : 'buy',
        type: 'stop',
        size: positionSize,
        price: stopLoss,
        leverage,
        timestamp: Date.now(),
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
        status: 'open',
        featureKey
      });

      this.positionLifecycle.set(symbol, {
        openedAt: Date.now(),
        partialTaken: false,
        featureKey,
        entryScore: signal.compositeScore,
        entryConfidence: signal.confidence,
        regime: aiAnalysis.marketRegime
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
      return { success: false, error: (error as Error).message };
    }
  }

  private async handleExistingPosition(
    position: Position,
    signal: CompositeSignal,
    context: AgentContext,
    aiAnalysis: AIAnalysis,
    correlationId: string
  ): Promise<AgentResult> {
    const { side, compositeScore } = signal;
    const currentDrawdown = this.calculateCurrentDrawdown();
    const lifecycle = this.positionLifecycle.get(position.symbol);
    const positionAgeMinutes = Math.max(0, (Date.now() - position.timestamp) / 60000);

    if (currentDrawdown >= this.riskParams.circuitBreakerDrawdown) {
      await this.recordTradeOutcome(position.symbol, position.pnlPercent, correlationId);
      await this.safeAudit({
        timestamp: Date.now(),
        eventType: 'risk_exit',
        correlationId,
        component: 'trading-executor',
        severity: 'warn',
        payload: { symbol: position.symbol, reason: 'circuit_breaker', pnlPercent: position.pnlPercent }
      });
      return {
        success: true,
        action: {
          type: 'emergency-close-all',
          reason: `Circuit breaker: ${currentDrawdown.toFixed(2)}% drawdown exceeded limit of ${this.riskParams.circuitBreakerDrawdown}%`,
          positions: context.positions
        }
      };
    }

    if (
      position.side !== side &&
      Math.abs(compositeScore) >= this.riskParams.premiseBreakScore &&
      positionAgeMinutes <= this.riskParams.premiseBreakMinutes
    ) {
      await this.recordTradeOutcome(position.symbol, position.pnlPercent, correlationId);
      return {
        success: true,
        action: {
          type: 'close-position',
          symbol: position.symbol,
          reduceOnly: true,
          reason: 'Premise break: strong opposite signal during early trade window',
          currentPnl: position.pnlPercent
        }
      };
    }

    if (
      positionAgeMinutes >= this.riskParams.timeInvalidationMinutes &&
      position.pnlPercent < this.riskParams.timeInvalidationMinRoi
    ) {
      await this.recordTradeOutcome(position.symbol, position.pnlPercent, correlationId);
      return {
        success: true,
        action: {
          type: 'close-position',
          symbol: position.symbol,
          reduceOnly: true,
          reason: 'Time-based invalidation: trade did not reach minimum ROI within hold window',
          currentPnl: position.pnlPercent
        }
      };
    }

    if (position.pnlPercent >= this.riskParams.partialTakeProfitROI && lifecycle && !lifecycle.partialTaken) {
      lifecycle.partialTaken = true;
      this.positionLifecycle.set(position.symbol, lifecycle);
      return {
        success: true,
        action: {
          type: 'partial-take-profit',
          symbol: position.symbol,
          closeFraction: 0.5,
          reason: 'Locking gains on quality signal follow-through',
          currentPnl: position.pnlPercent
        }
      };
    }

    if (position.pnlPercent >= this.riskParams.breakEvenActivation && !position.stopLoss) {
      const newStopLoss =
        side === 'long'
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

    if (position.pnlPercent >= this.riskParams.trailingStopActivation && position.takeProfit && position.stopLoss) {
      const newTakeProfit =
        side === 'long'
          ? position.entryPrice + (position.entryPrice - position.stopLoss) * (1 - this.riskParams.trailingStopTrail / 100)
          : position.entryPrice - (position.stopLoss - position.entryPrice) * (1 - this.riskParams.trailingStopTrail / 100);

      if (
        !this.riskParams.neverUntrail ||
        (side === 'long' && newTakeProfit > position.takeProfit) ||
        (side === 'short' && newTakeProfit < position.takeProfit)
      ) {
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
        reason: `No action required (${aiAnalysis.marketRegime} regime)`
      }
    };
  }

  private calculateCurrentDrawdown(): number {
    if (this.dailyMetrics.peakEquity <= 0) return 0;
    if (this.currentEquity >= this.dailyMetrics.peakEquity) {
      this.dailyMetrics.peakEquity = this.currentEquity;
      return 0;
    }
    return ((this.dailyMetrics.peakEquity - this.currentEquity) / this.dailyMetrics.peakEquity) * 100;
  }

  private calculatePositionSize(
    balance: number,
    signal: CompositeSignal,
    leverage: number,
    drawdownPct: number,
    regime: MarketRegime
  ): number {
    const scoreEdge = Math.min(1.5, Math.max(0.3, Math.abs(signal.compositeScore) / 100));
    const confidenceEdge = Math.min(1.3, Math.max(0.5, signal.confidence / 100));
    const drawdownScale =
      drawdownPct >= 8 ? 0.35 : drawdownPct >= 5 ? 0.6 : drawdownPct >= 3 ? 0.8 : 1;
    const streakScale = Math.max(0.4, 1 - this.lossStreak * 0.15);
    const regimeScale = this.regimeSizeMultiplier(regime);
    const riskFraction =
      this.riskParams.maxRiskPerTrade * scoreEdge * confidenceEdge * drawdownScale * streakScale * regimeScale;
    const notionalRisk = balance * riskFraction;
    const rawSize = leverage > 0 ? notionalRisk / leverage : 0;
    const clipped = Math.max(this.riskParams.minPositionSize, rawSize);
    return Math.floor(clipped * 100) / 100;
  }

  private regimeSizeMultiplier(regime: MarketRegime): number {
    if (regime === 'volatile') return Number(process.env.VOLATILE_SIZE_MULTIPLIER || 0.7);
    if (regime === 'ranging') return Number(process.env.RANGING_SIZE_MULTIPLIER || 0.5);
    return Number(process.env.TRENDING_SIZE_MULTIPLIER || 1.0);
  }

  private calculateTakeProfit(entryPrice: number, side: 'long' | 'short', targetROI: number, leverage: number): number {
    const perLegROI = targetROI / leverage;
    return side === 'long' ? entryPrice * (1 + perLegROI / 100) : entryPrice * (1 - perLegROI / 100);
  }

  private calculateStopLoss(entryPrice: number, side: 'long' | 'short', maxROI: number, leverage: number): number {
    const perLegROI = maxROI / leverage;
    return side === 'long' ? entryPrice * (1 - perLegROI / 100) : entryPrice * (1 + perLegROI / 100);
  }

  private buildFeatureKey(signal: CompositeSignal, aiAnalysis: AIAnalysis): string {
    const type = signal.signalType || 'trend';
    const strength = signal.signalStrength || 'weak';
    return `${type}:${strength}:${aiAnalysis.marketRegime}`;
  }

  private evaluateRegimeCompatibility(
    signal: CompositeSignal,
    aiAnalysis: AIAnalysis
  ): { allowed: boolean; reason?: string } {
    const regime = aiAnalysis.marketRegime;
    if (!this.globallyAllowedRegimes.has(regime)) {
      return {
        allowed: false,
        reason: `Regime ${regime} blocked by global policy`
      };
    }

    const signalType = signal.signalType || 'trend';
    const allowedRegimes = this.signalTypeRegimePolicy.get(signalType);
    if (allowedRegimes && !allowedRegimes.has(regime)) {
      return {
        allowed: false,
        reason: `Signal type ${signalType} not allowed in ${regime} regime`
      };
    }

    const minStrength = this.minStrengthByRegime.get(regime);
    const actualStrength = signal.signalStrength || 'weak';
    if (minStrength && this.strengthRank(actualStrength) < this.strengthRank(minStrength)) {
      return {
        allowed: false,
        reason: `Signal strength ${actualStrength} below ${minStrength} requirement for ${regime}`
      };
    }
    return { allowed: true };
  }

  private parseRegimeSet(raw: string): Set<MarketRegime> {
    const allowed = new Set<MarketRegime>();
    const tokens = raw.split(',').map((token) => token.trim().toLowerCase());
    for (const token of tokens) {
      if (token === 'trending' || token === 'ranging' || token === 'volatile') {
        allowed.add(token);
      }
    }
    if (allowed.size === 0) {
      allowed.add('trending');
    }
    return allowed;
  }

  private parseSignalTypeRegimePolicy(raw?: string): Map<string, Set<MarketRegime>> {
    const defaults = [
      'trend=trending|volatile',
      'crossover=trending|ranging',
      'squeeze=volatile',
      'divergence=ranging|trending',
      'oversold=ranging|volatile',
      'overbought=ranging|volatile',
      'golden_death_cross=trending'
    ];
    const policy = new Map<string, Set<MarketRegime>>();
    const entries = (raw || defaults.join(';'))
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const entry of entries) {
      const [type, regimesRaw] = entry.split('=').map((v) => v.trim());
      if (!type || !regimesRaw) continue;
      const regimes = regimesRaw
        .split('|')
        .map((regime) => regime.trim().toLowerCase())
        .filter((regime): regime is MarketRegime => regime === 'trending' || regime === 'ranging' || regime === 'volatile');
      if (regimes.length > 0) {
        policy.set(type, new Set(regimes));
      }
    }
    return policy;
  }

  private parseMinStrengthByRegime(raw?: string): Map<MarketRegime, SignalStrength> {
    const defaults = 'trending:moderate,volatile:strong,ranging:strong';
    const map = new Map<MarketRegime, SignalStrength>();
    const entries = (raw || defaults)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    for (const entry of entries) {
      const [regimeRaw, strengthRaw] = entry.split(':').map((v) => v.trim().toLowerCase());
      if (!regimeRaw || !strengthRaw) continue;
      const isRegime = regimeRaw === 'trending' || regimeRaw === 'ranging' || regimeRaw === 'volatile';
      const isStrength = strengthRaw === 'weak' || strengthRaw === 'moderate' || strengthRaw === 'strong' || strengthRaw === 'extreme';
      if (isRegime && isStrength) {
        map.set(regimeRaw, strengthRaw);
      }
    }
    return map;
  }

  private strengthRank(strength: SignalStrength): number {
    switch (strength) {
      case 'extreme':
        return 4;
      case 'strong':
        return 3;
      case 'moderate':
        return 2;
      default:
        return 1;
    }
  }

  private isFeatureEnabled(featureKey: string): boolean {
    if (this.featureAllowlist.size > 0 && !this.featureAllowlist.has(featureKey)) return false;
    if (this.featureDenylist.has(featureKey)) return false;
    const perf = this.signalPerformance.get(featureKey);
    if (!perf) return true;
    if (perf.disabledUntil && perf.disabledUntil > Date.now()) return false;
    return true;
  }

  private parseFeatureSet(raw?: string): Set<string> {
    if (!raw) return new Set();
    return new Set(
      raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }

  private pathExistsSync(target: string): boolean {
    try {
      require('fs').accessSync(target);
      return true;
    } catch {
      return false;
    }
  }

  private async recordTradeOutcome(symbol: string, pnlPercent: number, correlationId?: string): Promise<void> {
    const lifecycle = this.positionLifecycle.get(symbol);
    if (!lifecycle) return;

    const perf = this.signalPerformance.get(lifecycle.featureKey) || {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnlPercent: 0,
      avgWinPercent: 0,
      avgLossPercent: 0,
      expectancyPercent: 0,
      profitFactor: 0
    };

    perf.trades += 1;
    perf.totalPnlPercent += pnlPercent;
    if (pnlPercent >= 0) {
      perf.wins += 1;
      perf.avgWinPercent = ((perf.avgWinPercent * (perf.wins - 1)) + pnlPercent) / perf.wins;
      this.lossStreak = 0;
      this.dailyMetrics.winCount += 1;
    } else {
      perf.losses += 1;
      perf.avgLossPercent =
        ((perf.avgLossPercent * (perf.losses - 1)) + Math.abs(pnlPercent)) / perf.losses;
      this.lossStreak += 1;
      this.dailyMetrics.lossCount += 1;
    }

    perf.expectancyPercent = perf.totalPnlPercent / perf.trades;
    perf.profitFactor = perf.avgLossPercent > 0 ? (perf.avgWinPercent * Math.max(1, perf.wins)) / (perf.avgLossPercent * Math.max(1, perf.losses)) : 0;
    perf.recentPnlPercent = perf.recentPnlPercent || [];
    perf.recentPnlPercent.push(pnlPercent);
    if (perf.recentPnlPercent.length > this.riskParams.killswitchWindowTrades) {
      perf.recentPnlPercent.shift();
    }
    this.signalPerformance.set(lifecycle.featureKey, perf);
    this.dailyMetrics.totalTrades += 1;
    this.dailyMetrics.totalPnL += pnlPercent;
    this.currentEquity *= 1 + pnlPercent / 100;
    this.dailyMetrics.peakEquity = Math.max(this.dailyMetrics.peakEquity, this.currentEquity);
    this.dailyMetrics.maxDrawdown = Math.max(this.dailyMetrics.maxDrawdown, this.calculateCurrentDrawdown());
    this.evaluateFeatureHealth(lifecycle.featureKey);
    await this.safeAudit({
      timestamp: Date.now(),
      eventType: 'trade_outcome',
      correlationId: correlationId || randomUUID(),
      component: 'trading-executor',
      severity: 'info',
      payload: {
        symbol,
        featureKey: lifecycle.featureKey,
        pnlPercent,
        expectancyPercent: perf.expectancyPercent,
        profitFactor: perf.profitFactor,
        trades: perf.trades
      }
    });
    const recordPaperTrades = String(process.env.RECORD_PAPER_TRADES || '').toLowerCase() === 'true';
    const shouldRecordHistory =
      process.env.NODE_ENV !== 'test' && (this.tradingMode === 'live' || recordPaperTrades);
    if (shouldRecordHistory) {
      await this.appendLiveTradeSample({
        timestamp: Date.now(),
        pnlPercent,
        featureKey: lifecycle.featureKey,
        symbol,
        mode: this.tradingMode
      });
    }
    this.positionLifecycle.delete(symbol);
  }

  private evaluateFeatureHealth(featureKey: string): void {
    const perf = this.signalPerformance.get(featureKey);
    if (!perf) return;

    const recent = this.computeRecentFeatureMetrics(perf.recentPnlPercent || []);
    if (
      recent.trades >= this.riskParams.killswitchMinTrades &&
      (recent.expectancy < this.riskParams.killswitchMinExpectancy ||
        recent.profitFactor < this.riskParams.killswitchMinProfitFactor ||
        recent.maxDrawdown > this.riskParams.killswitchMaxDrawdown)
    ) {
      perf.disabledUntil = Date.now() + this.riskParams.featureDisableMs;
      this.signalPerformance.set(featureKey, perf);
      return;
    }

    if (perf.trades < this.riskParams.minFeatureSample) return;
    if (perf.expectancyPercent < 0 || perf.profitFactor < 0.9) {
      perf.disabledUntil = Date.now() + this.riskParams.featureDisableMs;
      this.signalPerformance.set(featureKey, perf);
    }
  }

  private computeRecentFeatureMetrics(values: number[]): {
    trades: number;
    expectancy: number;
    profitFactor: number;
    maxDrawdown: number;
  } {
    if (values.length === 0) {
      return { trades: 0, expectancy: 0, profitFactor: 0, maxDrawdown: 0 };
    }
    let total = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let equity = 100;
    let peak = 100;
    let maxDrawdown = 0;
    for (const pnlPercent of values) {
      total += pnlPercent;
      if (pnlPercent >= 0) grossProfit += pnlPercent;
      else grossLoss += Math.abs(pnlPercent);
      equity *= 1 + pnlPercent / 100;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
    }
    return {
      trades: values.length,
      expectancy: total / values.length,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0,
      maxDrawdown
    };
  }

  private createSignalOrderKey(symbol: string, signal: CompositeSignal): string {
    const bucket = Math.floor((signal.timestamp || Date.now()) / this.idempotencyWindowMs);
    const side = signal.side || 'none';
    return `signal-${symbol}-${side}-${bucket}`;
  }

  private createManualOrderKey(symbol: string, action: 'buy' | 'sell' | 'close', size: number): string {
    const bucket = Math.floor(Date.now() / this.idempotencyWindowMs);
    return `manual-${symbol}-${action}-${size}-${bucket}`;
  }

  private isDuplicateOrder(key: string): boolean {
    this.pruneIdempotencyCache();
    return this.processedOrderKeys.has(key);
  }

  private recordOrderKey(key: string): void {
    this.processedOrderKeys.set(key, Date.now());
  }

  private pruneIdempotencyCache(): void {
    const now = Date.now();
    for (const [existingKey, ts] of this.processedOrderKeys.entries()) {
      if (now - ts > this.idempotencyWindowMs) {
        this.processedOrderKeys.delete(existingKey);
      }
    }
  }

  private async persistIdempotencyState(): Promise<void> {
    this.pruneIdempotencyCache();
    await this.idempotencyStore.save(this.processedOrderKeys);
  }

  private async safeAudit(event: Parameters<AuditLogger['log']>[0]): Promise<void> {
    try {
      await this.auditLogger.log(event);
    } catch (error) {
      console.warn('[CypherScope] audit logger failure:', (error as Error).message);
    }
  }

  private async appendLiveTradeSample(sample: {
    timestamp: number;
    pnlPercent: number;
    featureKey: string;
    symbol: string;
    mode?: TradingMode;
  }): Promise<void> {
    try {
      const resolved = path.isAbsolute(this.liveHistoryPath)
        ? this.liveHistoryPath
        : path.join(process.cwd(), this.liveHistoryPath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });

      let existing: Array<{
        timestamp: number;
        pnlPercent: number;
        featureKey: string;
        symbol?: string;
        mode?: TradingMode;
      }> = [];
      try {
        const raw = await fs.readFile(resolved, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) existing = parsed;
      } catch {
        existing = [];
      }

      const duplicate = existing.some(
        (x) =>
          x.timestamp === sample.timestamp &&
          x.pnlPercent === sample.pnlPercent &&
          x.featureKey === sample.featureKey &&
          (x.symbol || '') === sample.symbol
      );
      if (!duplicate) {
        existing.push(sample);
        existing.sort((a, b) => a.timestamp - b.timestamp);
        await fs.writeFile(resolved, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
      }
    } catch (error) {
      console.warn('[CypherScope] live history append failure:', (error as Error).message);
    }
  }

  async shutdown(): Promise<void> {
    await this.persistIdempotencyState();
    await this.exchangeAdapter.disconnect();
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

  getSignalPerformance(): Record<string, FeaturePerformance> {
    return Object.fromEntries(this.signalPerformance.entries());
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

interface PositionLifecycleState {
  openedAt: number;
  partialTaken: boolean;
  featureKey: string;
  entryScore: number;
  entryConfidence: number;
  regime: string;
}

interface FeaturePerformance {
  trades: number;
  wins: number;
  losses: number;
  totalPnlPercent: number;
  avgWinPercent: number;
  avgLossPercent: number;
  expectancyPercent: number;
  profitFactor: number;
  recentPnlPercent?: number[];
  disabledUntil?: number;
}

interface ExchangeAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  placeOrder(order: OrderRequest): Promise<OrderResponse>;
  getPosition(symbol: string): Promise<Position | null>;
  cancelOrder(orderId: string): Promise<boolean>;
}

class SimulatedExchangeAdapter implements ExchangeAdapter {
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    if (!this.connected) {
      return {
        id: order.id,
        success: false,
        timestamp: Date.now(),
        error: 'Simulated exchange not connected'
      };
    }

    const basePrice = Number(process.env.SIMULATED_MARK_PRICE || 50000);
    return {
      id: order.id || `order-${Date.now()}`,
      success: true,
      price: order.price || basePrice,
      size: order.size,
      filledSize: order.size,
      fee: order.size * 0.0005,
      timestamp: Date.now()
    };
  }

  async getPosition(_symbol: string): Promise<Position | null> {
    return null;
  }

  async cancelOrder(_orderId: string): Promise<boolean> {
    return this.connected;
  }
}

class KucoinPerpExchangeAdapter implements ExchangeAdapter {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly apiPassphrase: string;

  private static readonly ALLOWED_BASE_URLS = [
    'https://api-futures.kucoin.com',
    'https://api-sandbox-futures.kucoin.com'
  ];

  private static validateBaseURL(url: string): string {
    if (!KucoinPerpExchangeAdapter.ALLOWED_BASE_URLS.includes(url)) {
      throw new Error(
        `E_INVALID_BASE_URL: ${url} is not an allowed KuCoin endpoint. ` +
        `Allowed: ${KucoinPerpExchangeAdapter.ALLOWED_BASE_URLS.join(', ')}`
      );
    }
    return url;
  }

  constructor(apiKey: string, apiSecret: string, apiPassphrase: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.apiPassphrase = apiPassphrase;
    const baseURL = process.env.KUCOIN_API_BASE_URL || 'https://api-futures.kucoin.com';
    this.client = axios.create({
      baseURL: KucoinPerpExchangeAdapter.validateBaseURL(baseURL),
      timeout: 10000
    });
  }

  async connect(): Promise<void> {
    await this.client.get('/api/v1/timestamp');
  }

  async disconnect(): Promise<void> {
    return;
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    const payload: Record<string, unknown> = {
      clientOid: order.id || `oid-${Date.now()}`,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      size: String(order.size),
      leverage: String(order.leverage)
    };

    if (order.price) payload.price = String(order.price);
    if (order.reduceOnly) payload.reduceOnly = true;

    const data = await this.privateRequest('POST', '/api/v1/orders', payload);
    const orderId = data?.orderId || data?.id;
    return {
      id: order.id,
      orderId,
      success: Boolean(orderId),
      price: order.price,
      size: order.size,
      filledSize: order.size,
      timestamp: Date.now(),
      error: orderId ? undefined : 'KuCoin did not return orderId'
    };
  }

  async getPosition(symbol: string): Promise<Position | null> {
    try {
      const data = await this.privateRequest('GET', `/api/v1/position?symbol=${encodeURIComponent(symbol)}`);
      if (!data || !data.currentQty) return null;
      const qty = Number(data.currentQty);
      if (!qty) return null;
      return {
        symbol,
        side: qty > 0 ? 'long' : 'short',
        entryPrice: Number(data.avgEntryPrice || data.entryPrice || 0),
        size: Math.abs(qty),
        leverage: Number(data.leverage || 1),
        stopLoss: data.stopLossPrice ? Number(data.stopLossPrice) : null,
        takeProfit: data.takeProfitPrice ? Number(data.takeProfitPrice) : null,
        timestamp: Date.now(),
        pnl: Number(data.unrealisedPnl || 0),
        pnlPercent: Number(data.unrealisedPnlPcnt || 0) * 100
      };
    } catch {
      return null;
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const data = await this.privateRequest('DELETE', `/api/v1/orders/${orderId}`);
    return Boolean(data?.cancelledOrderIds || data?.orderId);
  }

  private async privateRequest(method: 'GET' | 'POST' | 'DELETE', endpoint: string, body?: Record<string, unknown>): Promise<any> {
    const now = Date.now().toString();
    const requestPath = endpoint;
    const payload = body ? JSON.stringify(body) : '';
    const prehash = `${now}${method}${requestPath}${payload}`;
    const signature = crypto.createHmac('sha256', this.apiSecret).update(prehash).digest('base64');
    const passphrase = crypto.createHmac('sha256', this.apiSecret).update(this.apiPassphrase).digest('base64');

    const headers = {
      'KC-API-KEY': this.apiKey,
      'KC-API-SIGN': signature,
      'KC-API-TIMESTAMP': now,
      'KC-API-PASSPHRASE': passphrase,
      'KC-API-KEY-VERSION': '2'
    };

    const response = await this.client.request({
      method,
      url: endpoint,
      headers,
      data: body
    });

    if (response.data?.code !== '200000') {
      throw new Error(response.data?.msg || 'KuCoin request failed');
    }

    return response.data?.data;
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
  featureKey?: string;
}

type MarketRegime = 'trending' | 'ranging' | 'volatile';
type SignalStrength = 'weak' | 'moderate' | 'strong' | 'extreme';
