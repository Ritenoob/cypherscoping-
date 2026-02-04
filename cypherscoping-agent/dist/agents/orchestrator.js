"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CypherScopeOrchestrator = void 0;
const base_agent_1 = require("./base-agent");
const signal_analysis_agent_1 = require("./signal-analysis-agent");
const risk_management_agent_1 = require("./risk-management-agent");
const trading_executor_agent_1 = require("./trading-executor-agent");
const coin_screener_agent_1 = require("./coin-screener-agent");
class CypherScopeOrchestrator {
    constructor() {
        this.isRunning = false;
        this.tradingMode = 'algo';
        this.eventHandlers = new Map();
        this.orchestrator = new base_agent_1.AgentOrchestrator();
        this.signalAgent = new signal_analysis_agent_1.SignalAnalysisAgent();
        this.riskAgent = new risk_management_agent_1.RiskManagementAgent();
        this.tradingAgent = new trading_executor_agent_1.TradingExecutorAgent();
        this.screenerAgent = new coin_screener_agent_1.CoinScreenerAgent();
    }
    async initialize() {
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
    async analyzeSymbol(symbol, ohlcv, orderBook, tradeFlow) {
        const context = {
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
    async scanMarket() {
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
    async executeTrade(symbol, action, size) {
        if (this.tradingMode === 'manual' || action === 'close') {
            return this.manualTrade(symbol, action, size);
        }
        else {
            return this.algoTrade(symbol);
        }
    }
    async manualTrade(symbol, action, size) {
        return {
            success: true,
            symbol,
            action,
            size: size || 1,
            timestamp: Date.now(),
            mode: 'manual'
        };
    }
    async algoTrade(symbol) {
        return {
            success: true,
            symbol,
            action: 'buy',
            mode: 'algo',
            timestamp: Date.now()
        };
    }
    setMode(mode) {
        this.tradingMode = mode;
        this.emit('mode-changed', { mode });
    }
    getMode() {
        return this.tradingMode;
    }
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }
    off(event, handler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }
    emit(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => handler(data));
        }
    }
    getStats() {
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
    async shutdown() {
        await this.orchestrator.shutdown();
        this.emit('shutdown', {});
    }
}
exports.CypherScopeOrchestrator = CypherScopeOrchestrator;
//# sourceMappingURL=orchestrator.js.map