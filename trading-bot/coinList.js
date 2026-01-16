/**
 * CoinListManager - Enterprise-Grade Dynamic Coin List Manager
 * 
 * UPDATED: Scans ALL KuCoin Perpetual Futures every 30 seconds
 * 
 * Features:
 * - Scans ALL USDT perpetual contracts (no volume/spread filters)
 * - 30-second refresh cycle for real-time scanning
 * - Intelligent rate limiting with token bucket algorithm
 * - Circuit breaker pattern for API resilience
 * - Exponential backoff with jitter for retries
 * - Tiered coin classification by liquidity and volume
 * - Real-time health monitoring and diagnostics
 * - Graceful degradation under adverse conditions
 * 
 * @author Trading Bot V5.2
 * @version 2.1.0
 */

const axios = require('axios');
const EventEmitter = require('events');

// ============================================================================
// CONSTANTS
// ============================================================================

const KUCOIN_FUTURES_REST = 'https://api-futures.kucoin.com';

const DEFAULT_CONFIG = {
  // UPDATED: Scan ALL coins (no filters)
  minVolume: 0,                   // No minimum volume filter
  maxSpread: 100,                 // No spread filter (100% = disabled)
  topN: 999,                      // Effectively unlimited
  
  // UPDATED: 30 second refresh interval
  refreshInterval: 30 * 1000,     // 30 seconds
  
  // Rate limiting (KuCoin: 30 requests per 3 seconds for public)
  rateLimitBatchSize: 10,         // Requests per batch
  rateLimitDelayMs: 400,          // Delay between batches
  
  // Retry configuration
  maxRetries: 3,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  
  // Circuit breaker
  circuitBreakerThreshold: 5,     // Failures before opening circuit
  circuitBreakerResetMs: 60000,   // Time before attempting reset
  
  // Tier configuration (by volume ranking)
  tierSizes: {
    tier1: 10,                    // Top 10 by volume (majors)
    tier2: 30,                    // Next 20 (mid-caps)
    tier3: 60                     // Next 30 (small-caps)
  },
  
  // Blacklist (tokens to never trade)
  blacklist: ['LUNAUSDTM', 'USTUSDTM'],
  
  // Timeout
  requestTimeoutMs: 15000
};

// ============================================================================
// RATE LIMITER (Token Bucket Algorithm)
// ============================================================================

class RateLimiter {
  constructor(tokensPerInterval, intervalMs) {
    this.maxTokens = tokensPerInterval;
    this.tokens = tokensPerInterval;
    this.intervalMs = intervalMs;
    this.lastRefill = Date.now();
  }

  async acquire(tokens = 1) {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    // Calculate wait time
    const tokensNeeded = tokens - this.tokens;
    const waitMs = (tokensNeeded / this.maxTokens) * this.intervalMs;
    
    await this.sleep(waitMs);
    this.refill();
    this.tokens -= tokens;
    return true;
  }

  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / this.intervalMs) * this.maxTokens;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

class CircuitBreaker {
  constructor(threshold, resetTimeMs) {
    this.threshold = threshold;
    this.resetTimeMs = resetTimeMs;
    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  canExecute() {
    if (this.state === 'CLOSED') {
      return true;
    }
    
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeMs) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        return true;
      }
      return false;
    }
    
    // HALF_OPEN - allow limited requests
    return true;
  }

  recordSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) {
        this.reset();
      }
    } else {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  reset() {
    this.failures = 0;
    this.state = 'CLOSED';
    this.successCount = 0;
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      threshold: this.threshold
    };
  }
}

// ============================================================================
// COIN DATA STRUCTURE
// ============================================================================

class CoinData {
  constructor(contract, ticker) {
    this.symbol = contract.symbol;
    this.baseCurrency = contract.baseCurrency;
    this.quoteCurrency = contract.quoteCurrency || 'USDT';

    // Pricing - use contract data as primary source
    this.lastPrice = this.parseFloat(contract.lastTradePrice || ticker?.price);
    this.bestBid = this.parseFloat(ticker?.bestBidPrice || contract.lastTradePrice);
    this.bestAsk = this.parseFloat(ticker?.bestAskPrice || contract.lastTradePrice);
    this.indexPrice = this.parseFloat(contract.indexPrice || ticker?.indexPrice);
    this.markPrice = this.parseFloat(contract.markPrice || ticker?.markPrice);

    // Volume metrics - from contract
    this.volume24h = this.parseFloat(contract.volumeOf24h || ticker?.vol24h);
    this.turnover24h = this.parseFloat(contract.turnoverOf24h || ticker?.turnover24h);

    // Price change - from contract
    this.priceChangePercent = this.parseFloat(contract.priceChgPct || ticker?.priceChgPct) * 100;
    this.highPrice24h = this.parseFloat(contract.highPrice || ticker?.highPrice);
    this.lowPrice24h = this.parseFloat(contract.lowPrice || ticker?.lowPrice);
    
    // Contract specifications
    this.openInterest = this.parseFloat(contract.openInterest);
    this.lotSize = contract.lotSize;
    this.tickSize = contract.tickSize;
    this.multiplier = this.parseFloat(contract.multiplier);
    this.maxLeverage = contract.maxLeverage;
    this.fundingRate = this.parseFloat(contract.fundingFeeRate);
    this.nextFundingTime = contract.nextFundingRateTime;
    
    // Calculated metrics
    this.spread = this.calculateSpread();
    this.spreadPercent = this.calculateSpreadPercent();
    this.volatility24h = this.calculateVolatility();
    this.liquidityScore = this.calculateLiquidityScore();
    
    // Metadata
    this.tier = null;
    this.rank = null;
    this.updatedAt = Date.now();
  }

  parseFloat(value) {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  calculateSpread() {
    if (this.bestBid > 0 && this.bestAsk > 0) {
      return this.bestAsk - this.bestBid;
    }
    return 0;
  }

  calculateSpreadPercent() {
    if (this.bestBid > 0 && this.bestAsk > 0) {
      return ((this.bestAsk - this.bestBid) / this.bestBid) * 100;
    }
    return 0;
  }

  calculateVolatility() {
    if (this.highPrice24h > 0 && this.lowPrice24h > 0 && this.lastPrice > 0) {
      return ((this.highPrice24h - this.lowPrice24h) / this.lastPrice) * 100;
    }
    return 0;
  }

  calculateLiquidityScore() {
    // Composite score: volume (40%), open interest (30%), spread inverse (30%)
    const volumeScore = Math.min(this.turnover24h / 100_000_000, 1) * 40;
    const oiScore = Math.min(this.openInterest / 10_000_000, 1) * 30;
    const spreadScore = this.spreadPercent > 0 
      ? Math.max(0, (0.1 - this.spreadPercent) / 0.1) * 30 
      : 30;
    
    return Math.round(volumeScore + oiScore + spreadScore);
  }

  isValid() {
    return (
      this.symbol &&
      this.lastPrice > 0
    );
  }

  toJSON() {
    return {
      symbol: this.symbol,
      baseCurrency: this.baseCurrency,
      lastPrice: this.lastPrice,
      volume24h: this.volume24h,
      turnover24h: this.turnover24h,
      priceChangePercent: this.priceChangePercent,
      spreadPercent: this.spreadPercent,
      volatility24h: this.volatility24h,
      liquidityScore: this.liquidityScore,
      maxLeverage: this.maxLeverage,
      fundingRate: this.fundingRate,
      tier: this.tier,
      rank: this.rank
    };
  }
}

// ============================================================================
// MAIN CLASS: CoinListManager
// ============================================================================

class CoinListManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // State
    this.coins = new Map();           // symbol -> CoinData
    this.sortedSymbols = [];          // Symbols sorted by rank
    this.tiers = {
      tier1: [],
      tier2: [],
      tier3: [],
      tier4: []  // All remaining
    };
    
    // Timing
    this.lastUpdate = null;
    this.lastSuccessfulUpdate = null;
    this.refreshTimer = null;
    this.updateDuration = 0;
    this.scanCount = 0;
    
    // Infrastructure
    this.rateLimiter = new RateLimiter(30, 3000); // KuCoin: 30 req / 3 sec
    this.circuitBreaker = new CircuitBreaker(
      this.config.circuitBreakerThreshold,
      this.config.circuitBreakerResetMs
    );
    
    // Axios instance with defaults
    this.http = axios.create({
      baseURL: KUCOIN_FUTURES_REST,
      timeout: this.config.requestTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'KuCoin-Futures-Bot/5.2'
      }
    });
    
    // Statistics
    this.stats = {
      totalRefreshes: 0,
      successfulRefreshes: 0,
      failedRefreshes: 0,
      totalApiCalls: 0,
      failedApiCalls: 0,
      averageRefreshTime: 0,
      totalCoinsScanned: 0
    };
    
    // Health
    this.health = {
      status: 'INITIALIZING',
      lastError: null,
      consecutiveFailures: 0
    };

    // Callbacks
    this.onScanComplete = config.onScanComplete || (() => {});
    this.onCoinUpdate = config.onCoinUpdate || (() => {});
  }

  // --------------------------------------------------------------------------
  // LIFECYCLE METHODS
  // --------------------------------------------------------------------------

  async initialize() {
    this.log('Initializing CoinListManager - Scanning ALL perp futures every 30s');
    
    // Clear any existing timer
    this.stop();
    
    try {
      await this.refresh();
      
      // Schedule periodic refreshes (every 30 seconds)
      this.refreshTimer = setInterval(() => {
        this.refresh().catch(err => {
          this.log(`Scheduled refresh failed: ${err.message}`, 'ERROR');
        });
      }, this.config.refreshInterval);
      
      this.health.status = 'HEALTHY';
      this.emit('initialized', this.getStatus());
      
      this.log(`Initialized with ${this.coins.size} perpetual contracts`);
      this.log(`Refresh interval: ${this.config.refreshInterval / 1000}s`);
      this.log(`Tier 1 (Top 10): ${this.tiers.tier1.join(', ')}`);
      
      return true;
    } catch (error) {
      this.health.status = 'DEGRADED';
      this.health.lastError = error.message;
      this.emit('error', error);
      throw error;
    }
  }

  stop() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.health.status = 'STOPPED';
    this.emit('stopped');
    this.log('CoinListManager stopped');
  }

  // --------------------------------------------------------------------------
  // CORE REFRESH LOGIC - SCANS ALL PERPS
  // --------------------------------------------------------------------------

  async refresh() {
    const startTime = Date.now();
    this.stats.totalRefreshes++;
    this.scanCount++;
    this.lastUpdate = startTime;
    
    // Check circuit breaker
    if (!this.circuitBreaker.canExecute()) {
      const cbState = this.circuitBreaker.getState();
      this.log(`Circuit breaker OPEN (failures: ${cbState.failures}). Skipping scan.`, 'WARN');
      this.emit('circuitOpen', cbState);
      return this.sortedSymbols;
    }
    
    try {
      // Step 1: Fetch ALL active contracts
      const contracts = await this.fetchActiveContracts();
      
      if (!contracts || contracts.length === 0) {
        throw new Error('No active contracts returned from API');
      }
      
      // Step 2: Filter USDT perpetuals only (no volume/spread filters)
      const usdtPerps = this.filterUSDTPerps(contracts);
      this.log(`[SCAN #${this.scanCount}] Found ${usdtPerps.length} USDT perpetual contracts`);
      
      // Step 3: Create CoinData directly from contracts
      const coinsWithData = usdtPerps.map(contract => new CoinData(contract, null));
      
      // Step 4: Sort by volume but keep ALL (no filters)
      const sortedCoins = this.sortAllCoins(coinsWithData);
      
      // Step 5: Update internal state
      this.updateState(sortedCoins);
      
      // Record success
      this.updateDuration = Date.now() - startTime;
      this.lastSuccessfulUpdate = Date.now();
      this.stats.successfulRefreshes++;
      this.stats.totalCoinsScanned += sortedCoins.length;
      this.stats.averageRefreshTime = this.calculateAverageRefreshTime();
      this.health.consecutiveFailures = 0;
      this.health.status = 'HEALTHY';
      this.circuitBreaker.recordSuccess();
      
      const scanResult = {
        scanCount: this.scanCount,
        coinCount: this.coins.size,
        duration: this.updateDuration,
        tiers: this.getTierSummary(),
        timestamp: this.lastSuccessfulUpdate
      };
      
      this.emit('refreshed', scanResult);
      this.onScanComplete(scanResult);
      
      this.log(`[SCAN #${this.scanCount}] Complete: ${this.coins.size} coins in ${this.updateDuration}ms`);
      
      return this.sortedSymbols;
      
    } catch (error) {
      this.stats.failedRefreshes++;
      this.health.consecutiveFailures++;
      this.health.lastError = error.message;
      this.health.status = 'DEGRADED';
      this.circuitBreaker.recordFailure();
      
      this.emit('refreshFailed', {
        error: error.message,
        consecutiveFailures: this.health.consecutiveFailures
      });
      
      this.log(`[SCAN #${this.scanCount}] Failed: ${error.message}`, 'ERROR');
      
      // If we have existing data, continue operating in degraded mode
      if (this.coins.size > 0) {
        this.log('Operating with stale data', 'WARN');
      }
      
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // API METHODS
  // --------------------------------------------------------------------------

  async fetchActiveContracts() {
    return this.executeWithRetry(async () => {
      await this.rateLimiter.acquire();
      this.stats.totalApiCalls++;
      
      const response = await this.http.get('/api/v1/contracts/active');
      
      if (response.data.code !== '200000') {
        throw new Error(`API error: ${response.data.msg || response.data.code}`);
      }
      
      return response.data.data;
    }, 'fetchActiveContracts');
  }

  async fetchTicker(symbol) {
    return this.executeWithRetry(async () => {
      await this.rateLimiter.acquire();
      this.stats.totalApiCalls++;
      
      const response = await this.http.get(`/api/v1/ticker?symbol=${symbol}`);
      
      if (response.data.code !== '200000') {
        throw new Error(`Ticker API error for ${symbol}: ${response.data.msg}`);
      }
      
      return response.data.data;
    }, `fetchTicker:${symbol}`, 2);
  }

  // --------------------------------------------------------------------------
  // RETRY LOGIC
  // --------------------------------------------------------------------------

  async executeWithRetry(fn, operationName, maxRetries = null) {
    const retries = maxRetries ?? this.config.maxRetries;
    let lastError;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (this.isNonRetryableError(error)) {
          throw error;
        }
        
        if (attempt < retries) {
          const delay = this.calculateBackoffDelay(attempt);
          this.log(`${operationName} failed (attempt ${attempt}/${retries}). Retrying in ${delay}ms...`, 'WARN');
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }

  calculateBackoffDelay(attempt) {
    const exponentialDelay = this.config.baseRetryDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    const delay = Math.min(exponentialDelay + jitter, this.config.maxRetryDelayMs);
    return Math.round(delay);
  }

  isNonRetryableError(error) {
    if (error.response) {
      const status = error.response.status;
      return status === 401 || status === 403 || status === 400;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // FILTERING AND SORTING - NO VOLUME/SPREAD FILTERS
  // --------------------------------------------------------------------------

  filterUSDTPerps(contracts) {
    // Filter to USDT perpetuals only - keep ALL regardless of volume
    return contracts.filter(contract => 
      contract.quoteCurrency === 'USDT' &&
      contract.isInverse === false &&
      contract.status === 'Open' &&
      !this.config.blacklist.includes(contract.symbol)
    );
  }

  sortAllCoins(coins) {
    // Sort by volume but keep ALL coins (no filtering)
    return coins
      .filter(coin => coin !== null && coin.isValid())
      .sort((a, b) => {
        // Primary sort: turnover (volume)
        const volumeDiff = b.turnover24h - a.turnover24h;
        if (Math.abs(volumeDiff) > 1000) return volumeDiff;
        
        // Secondary sort: liquidity score
        return b.liquidityScore - a.liquidityScore;
      });
  }

  updateState(sortedCoins) {
    // Clear and rebuild
    this.coins.clear();
    this.sortedSymbols = [];
    
    // Assign ranks and tiers
    const tierSizes = this.config.tierSizes;
    
    sortedCoins.forEach((coin, index) => {
      coin.rank = index + 1;
      
      // Assign tier based on volume ranking
      if (index < tierSizes.tier1) {
        coin.tier = 1;
      } else if (index < tierSizes.tier2) {
        coin.tier = 2;
      } else if (index < tierSizes.tier3) {
        coin.tier = 3;
      } else {
        coin.tier = 4;
      }
      
      this.coins.set(coin.symbol, coin);
      this.sortedSymbols.push(coin.symbol);
      
      // Emit update for each coin
      this.onCoinUpdate(coin);
    });
    
    // Update tier lists
    this.tiers = {
      tier1: this.sortedSymbols.slice(0, tierSizes.tier1),
      tier2: this.sortedSymbols.slice(tierSizes.tier1, tierSizes.tier2),
      tier3: this.sortedSymbols.slice(tierSizes.tier2, tierSizes.tier3),
      tier4: this.sortedSymbols.slice(tierSizes.tier3)
    };
  }

  // --------------------------------------------------------------------------
  // PUBLIC GETTERS
  // --------------------------------------------------------------------------

  getTopCoins(count = 20) {
    return this.sortedSymbols
      .slice(0, count)
      .map(symbol => this.coins.get(symbol))
      .filter(Boolean);
  }

  getSymbols(count = null) {
    if (count) {
      return this.sortedSymbols.slice(0, count);
    }
    return [...this.sortedSymbols];
  }

  getAllSymbols() {
    return [...this.sortedSymbols];
  }

  getCoin(symbol) {
    return this.coins.get(symbol) || null;
  }

  getCoinData(symbol) {
    const coin = this.coins.get(symbol);
    return coin ? coin.toJSON() : null;
  }

  getTiers() {
    return {
      tier1: this.tiers.tier1.map(s => this.getCoinData(s)),
      tier2: this.tiers.tier2.map(s => this.getCoinData(s)),
      tier3: this.tiers.tier3.map(s => this.getCoinData(s)),
      tier4: this.tiers.tier4.map(s => this.getCoinData(s))
    };
  }

  getTierSummary() {
    return {
      tier1: this.tiers.tier1,
      tier2: this.tiers.tier2,
      tier3: this.tiers.tier3,
      tier4: this.tiers.tier4,
      total: this.sortedSymbols.length
    };
  }

  getTierForSymbol(symbol) {
    const coin = this.coins.get(symbol);
    return coin ? coin.tier : null;
  }

  getCoinsByTier(tier) {
    const tierKey = `tier${tier}`;
    if (!this.tiers[tierKey]) return [];
    
    return this.tiers[tierKey]
      .map(symbol => this.coins.get(symbol))
      .filter(Boolean);
  }

  getAllCoins() {
    return Array.from(this.coins.values());
  }

  getCount() {
    return this.coins.size;
  }

  hasSymbol(symbol) {
    return this.coins.has(symbol);
  }

  // --------------------------------------------------------------------------
  // HEALTH AND DIAGNOSTICS
  // --------------------------------------------------------------------------

  getStatus() {
    return {
      health: this.health.status,
      coinCount: this.coins.size,
      scanCount: this.scanCount,
      refreshInterval: this.config.refreshInterval / 1000 + 's',
      lastUpdate: this.lastUpdate ? new Date(this.lastUpdate).toISOString() : null,
      lastSuccessfulUpdate: this.lastSuccessfulUpdate 
        ? new Date(this.lastSuccessfulUpdate).toISOString() 
        : null,
      updateDuration: this.updateDuration,
      consecutiveFailures: this.health.consecutiveFailures,
      lastError: this.health.lastError,
      circuitBreaker: this.circuitBreaker.getState(),
      stats: this.stats,
      tiers: this.getTierSummary()
    };
  }

  getHealth() {
    const now = Date.now();
    const staleness = this.lastSuccessfulUpdate 
      ? Math.round((now - this.lastSuccessfulUpdate) / 1000)
      : null;
    
    let healthStatus = 'HEALTHY';
    const issues = [];
    
    if (this.coins.size === 0) {
      healthStatus = 'CRITICAL';
      issues.push('No coins loaded');
    } else if (staleness !== null && staleness > 120) {
      healthStatus = 'CRITICAL';
      issues.push(`Data is ${staleness} seconds stale`);
    } else if (staleness !== null && staleness > 60) {
      healthStatus = 'DEGRADED';
      issues.push(`Data is ${staleness} seconds stale`);
    }
    
    if (this.circuitBreaker.getState().state === 'OPEN') {
      healthStatus = 'DEGRADED';
      issues.push('Circuit breaker is OPEN');
    }
    
    if (this.health.consecutiveFailures >= 3) {
      healthStatus = healthStatus === 'CRITICAL' ? 'CRITICAL' : 'DEGRADED';
      issues.push(`${this.health.consecutiveFailures} consecutive failures`);
    }
    
    return {
      status: healthStatus,
      coinCount: this.coins.size,
      dataAgeSeconds: staleness,
      issues,
      circuitBreaker: this.circuitBreaker.getState().state,
      lastError: this.health.lastError
    };
  }

  getStats() {
    return {
      ...this.stats,
      scanCount: this.scanCount,
      successRate: this.stats.totalRefreshes > 0 
        ? (this.stats.successfulRefreshes / this.stats.totalRefreshes * 100).toFixed(1) + '%'
        : 'N/A',
      apiSuccessRate: this.stats.totalApiCalls > 0
        ? ((this.stats.totalApiCalls - this.stats.failedApiCalls) / this.stats.totalApiCalls * 100).toFixed(1) + '%'
        : 'N/A',
      avgCoinsPerScan: this.stats.successfulRefreshes > 0
        ? Math.round(this.stats.totalCoinsScanned / this.stats.successfulRefreshes)
        : 0
    };
  }

  // --------------------------------------------------------------------------
  // UTILITY METHODS
  // --------------------------------------------------------------------------

  calculateAverageRefreshTime() {
    if (this.stats.successfulRefreshes === 0) return 0;
    
    const currentAvg = this.stats.averageRefreshTime;
    const weight = 0.2;
    return Math.round(currentAvg * (1 - weight) + this.updateDuration * weight);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [CoinList] [${level}]`;
    
    if (level === 'ERROR') {
      console.error(`${prefix} ${message}`);
    } else if (level === 'WARN') {
      console.warn(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
    
    this.emit('log', { timestamp, level, message });
  }

  // --------------------------------------------------------------------------
  // ADVANCED QUERIES
  // --------------------------------------------------------------------------

  getHighVolatilityCoins(threshold = 5) {
    return this.getAllCoins()
      .filter(coin => coin.volatility24h >= threshold)
      .sort((a, b) => b.volatility24h - a.volatility24h);
  }

  getLowSpreadCoins(maxSpread = 0.03) {
    return this.getAllCoins()
      .filter(coin => coin.spreadPercent <= maxSpread)
      .sort((a, b) => a.spreadPercent - b.spreadPercent);
  }

  getTopMovers(count = 10, direction = 'both') {
    const coins = this.getAllCoins();
    
    if (direction === 'up') {
      return coins
        .filter(c => c.priceChangePercent > 0)
        .sort((a, b) => b.priceChangePercent - a.priceChangePercent)
        .slice(0, count);
    }
    
    if (direction === 'down') {
      return coins
        .filter(c => c.priceChangePercent < 0)
        .sort((a, b) => a.priceChangePercent - b.priceChangePercent)
        .slice(0, count);
    }
    
    // Both directions - sort by absolute change
    return coins
      .sort((a, b) => Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent))
      .slice(0, count);
  }

  getByFundingRate(type = 'positive') {
    const coins = this.getAllCoins();
    
    if (type === 'positive') {
      return coins
        .filter(c => c.fundingRate > 0)
        .sort((a, b) => b.fundingRate - a.fundingRate);
    }
    
    if (type === 'negative') {
      return coins
        .filter(c => c.fundingRate < 0)
        .sort((a, b) => a.fundingRate - b.fundingRate);
    }
    
    return coins.sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));
  }

  findArbitrageOpportunities() {
    return this.getAllCoins()
      .map(coin => {
        if (coin.markPrice > 0 && coin.indexPrice > 0) {
          const basis = ((coin.markPrice - coin.indexPrice) / coin.indexPrice) * 100;
          return { ...coin.toJSON(), basis };
        }
        return null;
      })
      .filter(c => c !== null && Math.abs(c.basis) > 0.1)
      .sort((a, b) => Math.abs(b.basis) - Math.abs(a.basis));
  }

  // --------------------------------------------------------------------------
  // ITERATOR SUPPORT
  // --------------------------------------------------------------------------

  *[Symbol.iterator]() {
    for (const coin of this.coins.values()) {
      yield coin;
    }
  }

  forEach(callback) {
    for (const coin of this.coins.values()) {
      callback(coin);
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance = null;

function getInstance(config = {}) {
  if (!instance) {
    instance = new CoinListManager(config);
  }
  return instance;
}

function createInstance(config = {}) {
  if (instance) {
    instance.stop();
  }
  instance = new CoinListManager(config);
  return instance;
}

// Export both singleton and class
module.exports = getInstance();
module.exports.CoinListManager = CoinListManager;
module.exports.getInstance = getInstance;
module.exports.createInstance = createInstance;
module.exports.CoinData = CoinData;
