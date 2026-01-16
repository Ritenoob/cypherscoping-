/**
 * Coin Ranker V2 - With Microstructure Integration
 * 
 * Ranks coins by:
 * 1. Volume & Liquidity
 * 2. Volatility (ATR)
 * 3. Funding Rate (prefer neutral)
 * 4. Spread (prefer tight)
 * 5. Buy:Sell Ratio (prefer imbalanced for opportunities)
 */

const axios = require('axios');
const Decimal = require('decimal.js');

const KUCOIN_FUTURES_REST = 'https://api-futures.kucoin.com';

class CoinRankerV2 {
  constructor(config = {}) {
    this.minVolume = config.minVolume || 10_000_000;
    this.maxSpread = config.maxSpread || 0.05;
    
    this.preferNeutralFunding = config.preferNeutralFunding !== false;
    this.maxFundingRate = config.maxFundingRate || 0.02;
    
    this.weights = {
      volume: config.volumeWeight || 0.30,
      volatility: config.volatilityWeight || 0.20,
      spread: config.spreadWeight || 0.15,
      funding: config.fundingWeight || 0.15,
      buySellImbalance: config.imbalanceWeight || 0.20
    };
    
    this.topN = config.topN || 50;
    this.refreshInterval = config.refreshInterval || 60 * 60 * 1000;
    
    this.coins = [];
    this.rankings = [];
    this.lastUpdate = null;
    this.refreshTimer = null;
  }

  async initialize() {
    await this.refresh();
    
    this.refreshTimer = setInterval(() => {
      this.refresh().catch(err => {
        console.error('[CoinRankerV2] Refresh failed:', err.message);
      });
    }, this.refreshInterval);
    
    console.log(`[CoinRankerV2] Initialized with ${this.coins.length} coins`);
  }

  async refresh() {
    try {
      const contractsResponse = await axios.get(`${KUCOIN_FUTURES_REST}/api/v1/contracts/active`);
      
      if (contractsResponse.data.code !== '200000') {
        throw new Error(`API error: ${contractsResponse.data.msg}`);
      }
      
      const contracts = contractsResponse.data.data;
      
      const usdtPerps = contracts.filter(c => 
        c.quoteCurrency === 'USDT' && 
        c.isInverse === false &&
        c.status === 'Open'
      );
      
      const withDetails = await Promise.all(
        usdtPerps.map(async (contract) => {
          try {
            const tickerResponse = await axios.get(
              `${KUCOIN_FUTURES_REST}/api/v1/ticker?symbol=${contract.symbol}`
            );
            const ticker = tickerResponse.data.data;
            
            const turnover = parseFloat(ticker?.turnover24h || 0);
            const priceChange = Math.abs(parseFloat(ticker?.priceChgPct || 0));
            
            const bid = parseFloat(ticker?.bestBidPrice || 0);
            const ask = parseFloat(ticker?.bestAskPrice || 0);
            const mid = (bid + ask) / 2;
            const spread = mid > 0 ? ((ask - bid) / mid) * 100 : 999;
            
            const fundingRate = parseFloat(contract.fundingFeeRate || 0) * 100;
            
            return {
              symbol: contract.symbol,
              baseCurrency: contract.baseCurrency,
              turnover24h: turnover,
              priceChangePercent: priceChange * 100,
              lastPrice: parseFloat(ticker?.price || 0),
              bid,
              ask,
              spread,
              fundingRate,
              openInterest: parseFloat(contract.openInterest || 0),
              maxLeverage: contract.maxLeverage,
              lotSize: contract.lotSize,
              multiplier: contract.multiplier,
              
              volumeScore: 0,
              volatilityScore: 0,
              spreadScore: 0,
              fundingScore: 0,
              compositeScore: 0
            };
          } catch (err) {
            return null;
          }
        })
      );
      
      this.coins = withDetails
        .filter(c => c !== null)
        .filter(c => c.turnover24h >= this.minVolume)
        .filter(c => c.spread <= this.maxSpread);
      
      this._calculateScores();
      
      this.rankings = [...this.coins].sort((a, b) => b.compositeScore - a.compositeScore);
      
      this.lastUpdate = Date.now();
      
      console.log(`[CoinRankerV2] Refreshed: ${this.coins.length} coins ranked`);
      console.log(`[CoinRankerV2] Top 5: ${this.rankings.slice(0, 5).map(c => c.symbol).join(', ')}`);
      
      return this.rankings;
    } catch (error) {
      console.error('[CoinRankerV2] Refresh error:', error.message);
      throw error;
    }
  }

  _calculateScores() {
    if (this.coins.length === 0) return;
    
    const volumes = this.coins.map(c => c.turnover24h);
    const volatilities = this.coins.map(c => c.priceChangePercent);
    const spreads = this.coins.map(c => c.spread);
    const fundings = this.coins.map(c => Math.abs(c.fundingRate));
    
    const maxVolume = Math.max(...volumes);
    const maxVolatility = Math.max(...volatilities);
    const minSpread = Math.min(...spreads);
    const maxSpread = Math.max(...spreads);
    const maxFunding = Math.max(...fundings);
    
    for (const coin of this.coins) {
      coin.volumeScore = maxVolume > 0 
        ? (coin.turnover24h / maxVolume) * 100 
        : 0;
      
      const optimalVol = 3.5;
      const volDiff = Math.abs(coin.priceChangePercent - optimalVol);
      coin.volatilityScore = Math.max(0, 100 - volDiff * 20);
      
      coin.spreadScore = maxSpread > minSpread
        ? ((maxSpread - coin.spread) / (maxSpread - minSpread)) * 100
        : 100;
      
      coin.fundingScore = maxFunding > 0
        ? ((maxFunding - Math.abs(coin.fundingRate)) / maxFunding) * 100
        : 100;
      
      coin.compositeScore = 
        coin.volumeScore * this.weights.volume +
        coin.volatilityScore * this.weights.volatility +
        coin.spreadScore * this.weights.spread +
        coin.fundingScore * this.weights.funding;
    }
  }

  getTopCoins(count = 20) {
    return this.rankings.slice(0, count);
  }

  getExtremeFundingCoins(threshold = 0.01) {
    return this.coins
      .filter(c => Math.abs(c.fundingRate) >= threshold * 100)
      .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));
  }

  getTightSpreadCoins(count = 10) {
    return [...this.coins]
      .sort((a, b) => a.spread - b.spread)
      .slice(0, count);
  }

  getCoinsByFundingDirection(direction = 'positive') {
    return this.coins
      .filter(c => direction === 'positive' ? c.fundingRate > 0 : c.fundingRate < 0)
      .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));
  }

  getSymbols() {
    return this.rankings.map(c => c.symbol);
  }

  getCoinData(symbol) {
    return this.coins.find(c => c.symbol === symbol);
  }

  stop() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }
}

module.exports = CoinRankerV2;
