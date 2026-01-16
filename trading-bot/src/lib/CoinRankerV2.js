/**
 * Coin Ranker V2 - Dynamic Coin Ranking System
 * 
 * Features:
 * - Multi-factor ranking (volume, volatility, momentum, liquidity)
 * - Real-time score updates
 * - Tiered classification for position sizing
 * - Correlation-aware portfolio construction
 */

const Decimal = require('decimal.js');

class CoinRankerV2 {
  constructor(config = {}) {
    this.weights = {
      volume: config.volumeWeight || 0.30,
      volatility: config.volatilityWeight || 0.25,
      momentum: config.momentumWeight || 0.20,
      liquidity: config.liquidityWeight || 0.15,
      trend: config.trendWeight || 0.10
    };
    
    this.updateInterval = config.updateInterval || 5 * 60 * 1000;
    this.maxCoins = config.maxCoins || 50;
    
    this.coinScores = new Map();
    this.rankings = [];
    this.lastUpdate = null;
  }

  calculateScore(coinData, historicalCandles) {
    const volumeScore = this._calculateVolumeScore(coinData);
    const volatilityScore = this._calculateVolatilityScore(historicalCandles);
    const momentumScore = this._calculateMomentumScore(historicalCandles);
    const liquidityScore = this._calculateLiquidityScore(coinData);
    const trendScore = this._calculateTrendScore(historicalCandles);
    
    const totalScore = 
      volumeScore * this.weights.volume +
      volatilityScore * this.weights.volatility +
      momentumScore * this.weights.momentum +
      liquidityScore * this.weights.liquidity +
      trendScore * this.weights.trend;
    
    return {
      total: totalScore,
      components: {
        volume: volumeScore,
        volatility: volatilityScore,
        momentum: momentumScore,
        liquidity: liquidityScore,
        trend: trendScore
      }
    };
  }

  _calculateVolumeScore(coinData) {
    const volume = coinData.turnover24h || 0;
    
    if (volume >= 1_000_000_000) return 100;
    if (volume >= 500_000_000) return 90;
    if (volume >= 100_000_000) return 80;
    if (volume >= 50_000_000) return 70;
    if (volume >= 10_000_000) return 60;
    if (volume >= 5_000_000) return 50;
    if (volume >= 1_000_000) return 40;
    return 30;
  }

  _calculateVolatilityScore(candles) {
    if (!candles || candles.length < 20) return 50;
    
    const returns = [];
    for (let i = 1; i < candles.length; i++) {
      returns.push((candles[i].close - candles[i-1].close) / candles[i-1].close);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const annualizedVol = Math.sqrt(variance) * Math.sqrt(252 * 24) * 100;
    
    if (annualizedVol >= 150) return 30;
    if (annualizedVol >= 100) return 50;
    if (annualizedVol >= 60) return 80;
    if (annualizedVol >= 40) return 90;
    if (annualizedVol >= 20) return 70;
    return 40;
  }

  _calculateMomentumScore(candles) {
    if (!candles || candles.length < 20) return 50;
    
    const recent = candles.slice(-20);
    const priceChange = (recent[recent.length - 1].close - recent[0].close) / recent[0].close * 100;
    
    let upDays = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].close > recent[i-1].close) upDays++;
    }
    const consistency = upDays / (recent.length - 1);
    
    let score = 50;
    
    if (Math.abs(priceChange) < 1) {
      score = 40;
    } else if (Math.abs(priceChange) < 5) {
      score = 60;
    } else if (Math.abs(priceChange) < 15) {
      score = 80;
    } else {
      score = 70;
    }
    
    if (consistency > 0.6 || consistency < 0.4) {
      score += 10;
    }
    
    return Math.min(100, score);
  }

  _calculateLiquidityScore(coinData) {
    const spread = coinData.bestAsk && coinData.bestBid 
      ? (coinData.bestAsk - coinData.bestBid) / coinData.bestBid * 100
      : 1;
    
    if (spread <= 0.01) return 100;
    if (spread <= 0.02) return 90;
    if (spread <= 0.03) return 80;
    if (spread <= 0.05) return 70;
    if (spread <= 0.1) return 60;
    return 50;
  }

  _calculateTrendScore(candles) {
    if (!candles || candles.length < 50) return 50;
    
    const closes = candles.map(c => c.close);
    
    const ema20 = this._calculateEMA(closes, 20);
    const ema50 = this._calculateEMA(closes, 50);
    
    const currentPrice = closes[closes.length - 1];
    
    let score = 50;
    
    if (currentPrice > ema20 && ema20 > ema50) {
      score = 80;
    } else if (currentPrice < ema20 && ema20 < ema50) {
      score = 80;
    } else if (currentPrice > ema20 || currentPrice > ema50) {
      score = 65;
    } else {
      score = 50;
    }
    
    return score;
  }

  _calculateEMA(values, period) {
    if (values.length < period) return values[values.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }

  updateRankings(coinsData) {
    const scores = [];
    
    for (const [symbol, data] of Object.entries(coinsData)) {
      const score = this.calculateScore(data.info, data.candles);
      this.coinScores.set(symbol, score);
      scores.push({ symbol, ...score });
    }
    
    this.rankings = scores
      .sort((a, b) => b.total - a.total)
      .slice(0, this.maxCoins);
    
    this.lastUpdate = Date.now();
    
    return this.rankings;
  }

  getTieredCoins() {
    const tier1 = this.rankings.slice(0, 5).map(r => r.symbol);
    const tier2 = this.rankings.slice(5, 15).map(r => r.symbol);
    const tier3 = this.rankings.slice(15, 30).map(r => r.symbol);
    
    return { tier1, tier2, tier3 };
  }

  getPositionSizeMultiplier(symbol) {
    const tiers = this.getTieredCoins();
    
    if (tiers.tier1.includes(symbol)) return 1.0;
    if (tiers.tier2.includes(symbol)) return 0.75;
    if (tiers.tier3.includes(symbol)) return 0.5;
    return 0.25;
  }

  getTopSymbols(count = 20) {
    return this.rankings.slice(0, count).map(r => r.symbol);
  }

  getScoreBreakdown(symbol) {
    return this.coinScores.get(symbol) || null;
  }

  getRankings() {
    return this.rankings;
  }
}

module.exports = CoinRankerV2;
