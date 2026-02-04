"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskManagementAgent = void 0;
const base_agent_1 = require("./base-agent");
const indicator_weights_1 = require("../config/indicator-weights");
class RiskManagementAgent extends base_agent_1.BaseAgent {
    constructor(riskConfig) {
        super({
            id: 'risk-management-agent',
            name: 'Risk Management Agent',
            role: 'Risk Control',
            capabilities: ['position-sizing', 'risk-calculation', 'drawdown-protection', 'leverage-optimization', 'circuit-breaker'],
            maxConcurrentTasks: 5,
            priority: 2
        });
        this.circuitBreakerActive = false;
        this.dailyBalance = 0;
        this.dailyPnL = 0;
        this.dailyWinCount = 0;
        this.maxDailyDrawdown = 0;
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
    async initialize() {
        const savedConfig = this.memory.retrieve('risk-config');
        if (savedConfig) {
            this.riskConfig = { ...this.riskConfig, ...savedConfig };
        }
    }
    async execute(context) {
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
    async analyzeRisk(context) {
        const positions = context.positions;
        const balance = context.balance;
        const signal = context.marketData.signal;
        const openPositions = positions.filter(p => p.stopLoss === null || p.takeProfit === null);
        const totalExposure = positions.reduce((sum, p) => sum + (p.size * p.entryPrice), 0);
        let unrealizedPnL = 0;
        for (const pos of positions) {
            const currentPrice = context.marketData.ohlcv[context.marketData.ohlcv.length - 1].close;
            const side = pos.side;
            const leverage = pos.leverage;
            let pnl;
            if (side === 'long') {
                pnl = ((currentPrice - pos.entryPrice) / pos.entryPrice) * leverage * 100;
            }
            else {
                pnl = ((pos.entryPrice - currentPrice) / pos.entryPrice) * leverage * 100;
            }
            unrealizedPnL += pnl;
        }
        const drawdownPercent = 0;
        return {
            balance,
            positions,
            signal,
            positionMetrics: this.updatePositionMetrics(positions, balance),
            tradeMetrics: this.tradeMetrics,
            totalExposure,
            drawdownPercent,
            circuitBreakerTriggered: this.circuitBreakerActive,
            analysis: this.analyzeRiskFactors(balance, unrealizedPnL, drawdownPercent, signal)
        };
    }
    analyzeRiskFactors(balance, unrealizedPnL, drawdownPercent, signal) {
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
    assessDrawdownRisk(drawdownPercent, maxDrawdown) {
        if (drawdownPercent >= maxDrawdown)
            return 'critical';
        if (drawdownPercent >= maxDrawdown * 0.8)
            return 'high';
        if (drawdownPercent >= maxDrawdown * 0.5)
            return 'medium';
        return 'low';
    }
    assessExposureRisk(balance, totalExposure) {
        const exposureRatio = balance > 0 ? totalExposure / balance : 0;
        if (exposureRatio >= 0.8)
            return 'critical';
        if (exposureRatio >= 0.5)
            return 'high';
        if (exposureRatio >= 0.3)
            return 'medium';
        return 'low';
    }
    assessConcentrationRisk(openPositions, maxPositions) {
        if (openPositions >= maxPositions)
            return 'critical';
        if (openPositions >= maxPositions * 0.8)
            return 'high';
        if (openPositions >= maxPositions * 0.6)
            return 'medium';
        return 'low';
    }
    calculateOverallRisk(drawdownRisk, exposureRisk, concentrationRisk) {
        const risks = [drawdownRisk, exposureRisk, concentrationRisk];
        const highCount = risks.filter(r => r === 'high' || r === 'critical').length;
        if (highCount >= 2)
            return 'critical';
        if (highCount >= 1)
            return 'high';
        return 'low';
    }
    updatePositionMetrics(positions, balance) {
        const openPositions = positions.filter(p => p.stopLoss === null || p.takeProfit === null);
        const totalExposureUSD = positions.reduce((sum, p) => sum + (p.size * p.entryPrice), 0);
        return {
            openPositions: openPositions.length,
            totalExposureUSD,
            drawdownPercent: this.positionMetrics.drawdownPercent,
            dailyPnL: this.positionMetrics.dailyPnL,
            maxDailyDrawdown: this.positionMetrics.maxDailyDrawdown,
            consecutiveLosses: this.positionMetrics.consecutiveLosses,
            totalWinRate: this.tradeMetrics.winRate
        };
    }
    generateRecommendations(context, analysis) {
        const recommendations = [];
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
            return order[a.priority] - b.priority;
        });
    }
    calculateStopLoss(position, signal) {
        const slPercent = this.riskConfig.stopLossROI;
        if (position.side === 'long') {
            return position.entryPrice * (1 - slPercent / 100 / position.leverage);
        }
        else {
            return position.entryPrice * (1 + slPercent / 100 / position.leverage);
        }
    }
    calculateTakeProfit(position, signal) {
        const tpPercent = this.riskConfig.takeProfitROI;
        if (position.side === 'long') {
            return position.entryPrice * (1 + tpPercent / 100 / position.leverage);
        }
        else {
            return position.entryPrice * (1 - tpPercent / 100 / position.leverage);
        }
    }
    calculateBreakEven(position, currentPrice) {
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
            newStopLoss: position.stopLoss,
            activated: false
        };
    }
    calculateTrailingStop(position, currentPrice) {
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
            newStopLoss: position.stopLoss,
            activated: false
        };
    }
    calculatePositionSize(balance, confidence, signal) {
        const baseSize = balance * this.riskConfig.maxPositionSizePercent;
        const leverage = (0, indicator_weights_1.getRecommendedLeverage)(signal.compositeScore, signal.confidence);
        return baseSize * (confidence / 100) * (leverage / 10);
    }
    triggerCircuitBreaker(reason) {
        this.circuitBreakerActive = true;
        this.emit('circuit-breaker-triggered', { reason, timestamp: Date.now() });
        this.memory.learn('circuit-breaker', {
            triggered: true,
            reason,
            timestamp: Date.now()
        });
    }
    resetCircuitBreaker() {
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
    updateDailyMetrics(balanace, pnl, win) {
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
    getTradeMetrics() {
        return this.tradeMetrics;
    }
    getPositionMetrics() {
        return this.positionMetrics;
    }
    getCircuitBreakerStatus() {
        return {
            active: this.circuitBreakerActive,
            reason: this.circuitBreakerActive ? 'Manual trigger' : null
        };
    }
    getRiskLevel(balance, signal) {
        const { compositeScore, confidence } = signal;
        const leverage = (0, indicator_weights_1.getRecommendedLeverage)(compositeScore, confidence);
        if (leverage >= 30)
            return 'critical';
        if (leverage >= 20)
            return 'high';
        if (leverage >= 15)
            return 'medium';
        return 'low';
    }
    async shutdown() {
        this.memory.learn('risk-config', this.riskConfig);
    }
}
exports.RiskManagementAgent = RiskManagementAgent;
//# sourceMappingURL=risk-management-agent.js.map