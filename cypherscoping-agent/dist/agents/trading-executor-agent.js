"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingExecutorAgent = void 0;
const base_agent_1 = require("./base-agent");
const indicator_weights_1 = require("../config/indicator-weights");
class TradingExecutorAgent extends base_agent_1.BaseAgent {
    constructor() {
        super({
            id: 'trading-executor-agent',
            name: 'Trading Executor Agent',
            role: 'Order Execution',
            capabilities: ['order-placement', 'order-management', 'position-tracking', 'execution-optimization'],
            maxConcurrentTasks: 10,
            priority: 3
        });
        this.orderHistory = [];
        this.tradingMode = 'paper';
        this.dailyMetrics = {
            totalPnL: 0,
            winCount: 0,
            lossCount: 0,
            totalTrades: 0,
            maxDrawdown: 0,
            peakEquity: 0
        };
        this.currentEquity = 0;
        this.riskParams = {
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
        this.apiClient = new APIClient();
    }
    async initialize() {
        await this.apiClient.connect();
        this.currentEquity = 10000;
        this.dailyMetrics.peakEquity = this.currentEquity;
    }
    async execute(context) {
        const { symbol, balance, positions } = context;
        const signal = context.marketData['signal'];
        const aiAnalysis = context.marketData['aiAnalysis'];
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
    async openNewPosition(symbol, balance, signal, aiAnalysis, context) {
        const { side, confidence } = signal;
        const { suggestedAction } = aiAnalysis;
        const score = signal.compositeScore;
        const leverage = (0, indicator_weights_1.getRecommendedLeverage)(score, confidence);
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
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async handleExistingPosition(position, signal, context) {
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
                ? position.entryPrice + (position.entryPrice - position.stopLoss) * (1 - this.riskParams.trailingStopTrail / 100)
                : position.entryPrice - (position.stopLoss - position.entryPrice) * (1 - this.riskParams.trailingStopTrail / 100);
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
    calculateCurrentDrawdown() {
        if (this.currentEquity >= this.dailyMetrics.peakEquity) {
            this.dailyMetrics.peakEquity = this.currentEquity;
            return 0;
        }
        return ((this.dailyMetrics.peakEquity - this.currentEquity) / this.dailyMetrics.peakEquity) * 100;
    }
    calculatePositionSize(balance, confidence, leverage) {
        const baseRisk = 0.02;
        const confidenceMultiplier = Math.min(1.5, Math.max(0.5, confidence / 100));
        const size = balance * baseRisk * confidenceMultiplier / leverage;
        return Math.floor(size * 100) / 100;
    }
    calculateTakeProfit(entryPrice, side, targetROI, leverage) {
        const perLegROI = targetROI / leverage;
        if (side === 'long') {
            return entryPrice * (1 + perLegROI / 100);
        }
        else {
            return entryPrice * (1 - perLegROI / 100);
        }
    }
    calculateStopLoss(entryPrice, side, maxROI, leverage) {
        const perLegROI = maxROI / leverage;
        if (side === 'long') {
            return entryPrice * (1 - perLegROI / 100);
        }
        else {
            return entryPrice * (1 + perLegROI / 100);
        }
    }
    async shutdown() {
        await this.apiClient.disconnect();
    }
    setTradingMode(mode) {
        this.tradingMode = mode;
    }
    getTradingMode() {
        return this.tradingMode;
    }
    getDailyMetrics() {
        return { ...this.dailyMetrics };
    }
}
exports.TradingExecutorAgent = TradingExecutorAgent;
class APIClient {
    constructor() {
        this.connected = false;
    }
    async connect() {
        this.connected = true;
    }
    async disconnect() {
        this.connected = false;
    }
    async placeOrder(order) {
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
    async getPosition(symbol) {
        return null;
    }
    async cancelOrder(orderId) {
        return true;
    }
}
//# sourceMappingURL=trading-executor-agent.js.map