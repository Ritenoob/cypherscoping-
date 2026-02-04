"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoinScreenerAgent = void 0;
const base_agent_1 = require("./base-agent");
class CoinScreenerAgent extends base_agent_1.BaseAgent {
    constructor(symbols) {
        super({
            id: 'coin-screener-agent',
            name: 'Coin Screener Agent',
            role: 'Market Scanner',
            capabilities: ['market-scanning', 'opportunity-detection', 'symbol-ranking', 'regime-detection'],
            maxConcurrentTasks: 20,
            priority: 1
        });
        this.symbols = [];
        this.watchedSymbols = new Map();
        this.symbols = symbols || this.getDefaultSymbols();
    }
    async initialize() {
    }
    async execute(context) {
        const results = await this.scanMarket();
        this.watchedSymbols.clear();
        for (const result of results) {
            this.watchedSymbols.set(result.symbol, result);
        }
        const opportunities = results
            .filter(r => r.signal?.authorized)
            .sort((a, b) => (b.signal?.compositeScore || 0) - (a.signal?.compositeScore || 0));
        const byRegime = this.categorizeByRegime(results);
        return {
            success: true,
            action: {
                type: 'screening-complete',
                totalScanned: results.length,
                opportunities: opportunities.length,
                topOpportunities: opportunities.slice(0, 10),
                byRegime
            }
        };
    }
    async scanMarket() {
        const results = [];
        for (const symbol of this.symbols) {
            const result = await this.scanSymbol(symbol);
            if (result) {
                results.push(result);
            }
        }
        return results;
    }
    async scanSymbol(symbol) {
        try {
            const marketData = await this.fetchMarketData(symbol);
            if (!marketData || marketData.ohlcv.length < 50) {
                return null;
            }
            const signal = await this.generateSignal(marketData.ohlcv);
            const regime = this.detectRegime(marketData.ohlcv);
            const score = this.calculateOverallScore(signal, marketData, regime);
            return {
                symbol,
                signal,
                regime,
                overallScore: score,
                metrics: {
                    volatility: this.calculateVolatility(marketData.ohlcv),
                    volumeRatio: this.calculateVolumeRatio(marketData.ohlcv),
                    trendStrength: this.calculateTrendStrength(marketData.ohlcv, regime),
                    liquidity: this.estimateLiquidity(marketData.ohlcv)
                },
                timestamp: Date.now()
            };
        }
        catch (error) {
            return null;
        }
    }
    async fetchMarketData(symbol) {
        return {
            ohlcv: this.generateMockOHLCV(100),
            orderBook: null,
            tradeFlow: null
        };
    }
    generateMockOHLCV(count) {
        const candles = [];
        let price = 50000;
        for (let i = 0; i < count; i++) {
            const volatility = 0.02;
            const change = (Math.random() - 0.5) * volatility * price;
            const open = price;
            const close = price + change;
            const high = Math.max(open, close) + Math.random() * volatility * price * 0.5;
            const low = Math.min(open, close) - Math.random() * volatility * price * 0.5;
            candles.push({
                timestamp: Date.now() - (count - i) * 3600000,
                open,
                high,
                low,
                close,
                volume: Math.random() * 1000000
            });
            price = close;
        }
        return candles;
    }
    async generateSignal(ohlcv) {
        const closes = ohlcv.map(c => c.close);
        const rsi = this.calculateRSI(closes, 14);
        const williamsR = this.calculateWilliamsR(ohlcv);
        const trend = this.calculateTrend(closes);
        let score = 0;
        let side = null;
        if (williamsR < -80 && rsi < 40) {
            score += 50;
            side = 'long';
        }
        else if (williamsR > -20 && rsi > 60) {
            score -= 50;
            side = 'short';
        }
        if (trend === 'up')
            score += 20;
        else if (trend === 'down')
            score -= 20;
        return {
            compositeScore: score,
            authorized: Math.abs(score) >= 75,
            side,
            confidence: Math.min(100, Math.abs(score) + 20),
            triggerCandle: null,
            windowExpires: null,
            indicatorScores: new Map(),
            microstructureScore: 0,
            blockReasons: [],
            confirmations: 0,
            timestamp: Date.now()
        };
    }
    calculateRSI(closes, period) {
        const changes = closes.slice(1).map((c, i) => c - closes[i]);
        const gains = changes.map(c => c > 0 ? c : 0);
        const losses = changes.map(c => c < 0 ? -c : 0);
        let avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
        let avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        return 100 - 100 / (1 + rs);
    }
    calculateWilliamsR(ohlcv) {
        const period = 14;
        const highs = ohlcv.slice(-period).map(c => c.high);
        const lows = ohlcv.slice(-period).map(c => c.low);
        const closes = ohlcv.slice(-period).map(c => c.close);
        const highest = Math.max(...highs);
        const lowest = Math.min(...lows);
        const latestClose = closes[closes.length - 1];
        return ((highest - latestClose) / (highest - lowest)) * -100;
    }
    calculateTrend(closes) {
        const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
        if (closes[closes.length - 1] > sma20 && sma20 > sma50)
            return 'up';
        if (closes[closes.length - 1] < sma20 && sma20 < sma50)
            return 'down';
        return 'neutral';
    }
    detectRegime(ohlcv) {
        const closes = ohlcv.map(c => c.close);
        const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
        const volatility = Math.sqrt(returns.reduce((acc, r) => acc + r * r, 0) / returns.length);
        if (volatility > 0.03)
            return 'volatile';
        const adx = this.estimateADX(ohlcv);
        if (adx > 25)
            return 'trending';
        return 'ranging';
    }
    estimateADX(ohlcv) {
        const closes = ohlcv.map(c => c.close);
        const highs = ohlcv.map(c => c.high);
        const lows = ohlcv.map(c => c.low);
        let trSum = 0;
        for (let i = 1; i < ohlcv.length; i++) {
            const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
            trSum += tr;
        }
        const atr = trSum / ohlcv.length;
        const atrPercent = atr / closes[closes.length - 1] * 100;
        return Math.min(100, atrPercent * 5);
    }
    calculateOverallScore(signal, marketData, regime) {
        let score = 0;
        if (signal.authorized)
            score += 50;
        score += signal.confidence * 0.3;
        if (signal.side === 'long' && regime === 'trending')
            score += 10;
        if (signal.side === 'short' && regime === 'trending')
            score += 10;
        return Math.min(100, score);
    }
    calculateVolatility(ohlcv) {
        const closes = ohlcv.map(c => c.close);
        const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
        return Math.sqrt(returns.reduce((acc, r) => acc + r * r, 0) / returns.length);
    }
    calculateVolumeRatio(ohlcv) {
        const recentVolume = ohlcv.slice(-5).reduce((sum, c) => sum + c.volume, 0);
        const avgVolume = ohlcv.reduce((sum, c) => sum + c.volume, 0) / ohlcv.length;
        return recentVolume / avgVolume;
    }
    calculateTrendStrength(ohlcv, regime) {
        const closes = ohlcv.map(c => c.close);
        const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
        if (regime === 'trending') {
            return Math.abs(sma20 - sma50) / sma50 * 100;
        }
        return 0;
    }
    estimateLiquidity(ohlcv) {
        const avgVolume = ohlcv.reduce((sum, c) => sum + c.volume, 0) / ohlcv.length;
        return Math.min(100, avgVolume / 1000000 * 100);
    }
    categorizeByRegime(results) {
        const categorized = {
            trending: [],
            ranging: [],
            volatile: []
        };
        for (const result of results) {
            categorized[result.regime].push(result);
        }
        for (const regime of Object.keys(categorized)) {
            categorized[regime].sort((a, b) => b.overallScore - a.overallScore);
        }
        return categorized;
    }
    getDefaultSymbols() {
        return [
            'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT',
            'DOGE/USDT', 'MATIC/USDT', 'LINK/USDT', 'AVAX/USDT', 'DOT/USDT',
            'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'BCH/USDT', 'ETC/USDT'
        ];
    }
    async shutdown() {
    }
}
exports.CoinScreenerAgent = CoinScreenerAgent;
//# sourceMappingURL=coin-screener-agent.js.map