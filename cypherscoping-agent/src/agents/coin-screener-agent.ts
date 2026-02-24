import axios, { AxiosInstance } from 'axios';
import Bottleneck from 'bottleneck';
import { BaseAgent } from './base-agent';
import { AgentContext, AgentResult, OHLCV, CompositeSignal } from '../types';
import { loadSymbolPolicy, validateSymbolPolicy } from '../config/symbol-policy';
import { SignalAnalysisAgent } from './signal-analysis-agent';

export class CoinScreenerAgent extends BaseAgent {
  private symbols: string[] = [];
  private watchedSymbols: Map<string, ScreenerResult> = new Map();
  private readonly maxConcurrentScans: number = 5;
  private provider: MarketDataProvider;
  private symbolsInitialized: boolean = false;
  private signalAgent: SignalAnalysisAgent;

  constructor(symbols?: string[]) {
    super({
      id: 'coin-screener-agent',
      name: 'Coin Screener Agent',
      role: 'Market Scanner',
      capabilities: ['market-scanning', 'opportunity-detection', 'symbol-ranking', 'regime-detection'],
      maxConcurrentTasks: 20,
      priority: 1
    });

    // If explicit symbols provided, use them immediately
    if (symbols && symbols.length > 0) {
      const symbolPolicy = loadSymbolPolicy();
      this.symbols = symbols.filter((symbol) => {
        const validation = validateSymbolPolicy(symbol, symbolPolicy);
        return validation.allowed;
      });
      this.symbolsInitialized = true;

      if (this.symbols.length === 0) {
        throw new Error('E_UNIVERSE_EMPTY: no allowed symbols available for screener');
      }
    }
    // Otherwise, symbols will be fetched dynamically during initialize()

    this.provider = this.createDataProvider();
    this.signalAgent = new SignalAnalysisAgent();
  }

  async initialize(): Promise<void> {
    await this.provider.connect();
    await this.signalAgent.initialize();

    // Fetch dynamic symbols if not already initialized
    if (!this.symbolsInitialized) {
      await this.initializeSymbols();
    }
  }

  private async initializeSymbols(): Promise<void> {
    const symbolPolicy = loadSymbolPolicy();

    console.log('[CoinScreener] Initializing symbols...');
    console.log(`[CoinScreener] TRADING_UNIVERSE env var: ${process.env.TRADING_UNIVERSE || 'NOT SET'}`);

    // Check for manual override via TRADING_UNIVERSE env var
    if (process.env.TRADING_UNIVERSE && process.env.TRADING_UNIVERSE.trim().length > 0) {
      console.log('[CoinScreener] Using TRADING_UNIVERSE override instead of dynamic market scan');
      this.symbols = symbolPolicy.tradingUniverse.filter((symbol) => {
        const validation = validateSymbolPolicy(symbol, symbolPolicy);
        return validation.allowed;
      });
    } else {
      // Fetch all active perpetual futures symbols from KuCoin
      console.log('[CoinScreener] Fetching active perpetual futures symbols from KuCoin...');
      const allSymbols = await this.provider.fetchActiveSymbols();
      console.log(`[CoinScreener] Found ${allSymbols.length} active perpetual futures markets`);

      // Apply ONLY denylist filtering (not tradingUniverse)
      // When fetching all perpetuals, we want all of them except denied symbols
      const denylistCanonical = new Set(symbolPolicy.denylistSymbols.map(s => {
        const canonical = s.trim().toUpperCase().replace(/[-_:]/g, '/').replace(/\//g, '');
        if (canonical === 'BTCUSDT' || canonical === 'BTCUSDTM') return 'BTCUSDTM';
        if (canonical === 'XBTUSDT' || canonical === 'XBTUSDTM') return 'XBTUSDTM';
        return canonical;
      }));

      this.symbols = allSymbols.filter((symbol) => {
        const canonical = symbol.trim().toUpperCase();
        const isDenied = denylistCanonical.has(canonical);
        if (isDenied) {
          console.log(`[CoinScreener] Filtering out denied symbol: ${symbol}`);
        }
        return !isDenied;
      });

      console.log(`[CoinScreener] After denylist filtering: ${this.symbols.length} allowed symbols`);
    }

    if (this.symbols.length === 0) {
      throw new Error('E_UNIVERSE_EMPTY: no allowed symbols available for screener');
    }

    this.symbolsInitialized = true;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    if (context.isLiveMode && this.provider.isMock()) {
      return {
        success: false,
        error: 'Live mode cannot run screener with mock market data provider'
      };
    }

    const results = await this.scanMarket();

    this.watchedSymbols.clear();
    for (const result of results) {
      this.watchedSymbols.set(result.symbol, result);
    }

    const opportunities = results
      .filter((r) => r.signal?.authorized)
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

  private createDataProvider(): MarketDataProvider {
    const mode = (process.env.TRADING_MODE || 'paper').toLowerCase();
    const simulationEnabled = (process.env.SIMULATION || '').toLowerCase() === 'true';
    const forcedProvider = (process.env.MARKET_DATA_PROVIDER || '').toLowerCase();

    if (forcedProvider === 'mock') {
      if (mode === 'live') {
        throw new Error('Invalid configuration: mock market data provider is not allowed in live mode');
      }
      return new MockMarketDataProvider();
    }

    if (mode === 'live') {
      if (simulationEnabled) {
        throw new Error('Invalid configuration: live mode cannot use simulated market data');
      }
      // Note: Credentials validated later during trading operations, not for market data
      console.log('[CoinScreener] Using KuCoin public API for market data (no credentials required)');
    }

    if (forcedProvider === 'kucoin' || mode === 'live') {
      return new KucoinPerpDataProvider();
    }

    return new MockMarketDataProvider();
  }

  private async scanMarket(): Promise<ScreenerResult[]> {
    const results: ScreenerResult[] = [];
    for (let i = 0; i < this.symbols.length; i += this.maxConcurrentScans) {
      const batch = this.symbols.slice(i, i + this.maxConcurrentScans);
      const batchResults = await Promise.allSettled(batch.map((symbol) => this.scanSymbol(symbol)));
      for (const batchResult of batchResults) {
        if (batchResult.status === 'fulfilled' && batchResult.value) {
          results.push(batchResult.value);
          continue;
        }
        if (batchResult.status === 'rejected') {
          console.error('[CoinScreener] Batch scan promise rejected:', (batchResult.reason as Error).message);
        }
      }
    }

    return results;
  }

  private async scanSymbol(symbol: string): Promise<ScreenerResult | null> {
    try {
      // Symbol validation already done during initialization
      // Only check denylist as a safety check
      const symbolPolicy = loadSymbolPolicy();
      const canonical = symbol.trim().toUpperCase();
      const denylistCanonical = new Set(symbolPolicy.denylistSymbols.map(s => {
        const c = s.trim().toUpperCase().replace(/[-_:]/g, '/').replace(/\//g, '');
        if (c === 'BTCUSDT' || c === 'BTCUSDTM') return 'BTCUSDTM';
        if (c === 'XBTUSDT' || c === 'XBTUSDTM') return 'XBTUSDTM';
        return c;
      }));

      if (denylistCanonical.has(canonical)) {
        console.warn(`[CoinScreener] Symbol ${symbol} is in denylist`);
        return null;
      }

      const marketData = await this.fetchMarketData(symbol);
      if (!marketData || marketData.ohlcv.length < 50) {
        return null;
      }

      // Use SignalAnalysisAgent for full indicator analysis (RSI, Williams %R, MACD, etc.)
      const context: AgentContext = {
        symbol,
        correlationId: `screener-${symbol}-${Date.now()}`,
        timeframe: '30min',
        balance: 10000,
        positions: [],
        openOrders: [],
        isLiveMode: false,
        executionOptions: {
          allToolsAllowed: false,
          optimizeExecution: true,
          enabledTools: ['signal-analysis']
        },
        marketData: {
          ohlcv: marketData.ohlcv,
          orderBook: marketData.orderBook,
          tradeFlow: marketData.tradeFlow
        }
      };

      const signalResult = await this.signalAgent.execute(context);
      const signal = signalResult.signal || this.createEmptySignal();
      const regime = this.detectRegime(marketData.ohlcv);
      const score = this.calculateOverallScore(signal, regime);

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
    } catch (error) {
      console.error(`[CoinScreener] Failed to scan ${symbol}:`, (error as Error).message);
      return null;
    }
  }

  private async fetchMarketData(symbol: string): Promise<MarketData | null> {
    return this.provider.fetch(symbol, '30min', 120);
  }

  private createEmptySignal(): CompositeSignal {
    return {
      compositeScore: 0,
      authorized: false,
      side: null,
      confidence: 0,
      triggerCandle: null,
      windowExpires: null,
      indicatorScores: {},
      microstructureScore: 0,
      blockReasons: [],
      confirmations: 0,
      timestamp: Date.now(),
      signalStrength: null,
      signalType: null,
      signalSource: 'CoinScreener'
    };
  }

  // ===================================================================
  // NOTE: generateSignal(), calculateRSI(), calculateWilliamsR(), and
  // calculateTrend() methods have been REMOVED.
  //
  // The CoinScreenerAgent now uses SignalAnalysisAgent.execute() for
  // all indicator analysis. This ensures:
  // 1. All 18 indicators are used (not just RSI + Williams %R)
  // 2. Divergence and crossover detection works
  // 3. No duplicate code to maintain
  // 4. indicatorScores is properly populated
  //
  // See: cypherscoping-agent/docs/SCREENER_INDICATOR_INTEGRATION_ERROR.md
  // ===================================================================

  private detectRegime(ohlcv: OHLCV[]): 'trending' | 'ranging' | 'volatile' {
    const closes = ohlcv.map((c) => c.close);
    const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
    const volatility = Math.sqrt(returns.reduce((acc, r) => acc + r * r, 0) / returns.length);

    if (volatility > 0.03) return 'volatile';

    const adx = this.estimateADX(ohlcv);
    if (adx > 25) return 'trending';

    return 'ranging';
  }

  private estimateADX(ohlcv: OHLCV[]): number {
    const closes = ohlcv.map((c) => c.close);
    const highs = ohlcv.map((c) => c.high);
    const lows = ohlcv.map((c) => c.low);

    let trSum = 0;
    for (let i = 1; i < ohlcv.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trSum += tr;
    }

    const atr = trSum / ohlcv.length;
    const atrPercent = (atr / closes[closes.length - 1]) * 100;
    return Math.min(100, atrPercent * 5);
  }

  private calculateOverallScore(signal: CompositeSignal, regime: string): number {
    let score = 0;
    if (signal.authorized) score += 50;
    score += signal.confidence * 0.3;
    if (signal.side === 'long' && regime === 'trending') score += 10;
    if (signal.side === 'short' && regime === 'trending') score += 10;
    return Math.min(100, score);
  }

  private calculateVolatility(ohlcv: OHLCV[]): number {
    const closes = ohlcv.map((c) => c.close);
    const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
    return Math.sqrt(returns.reduce((acc, r) => acc + r * r, 0) / returns.length);
  }

  private calculateVolumeRatio(ohlcv: OHLCV[]): number {
    const recentVolume = ohlcv.slice(-5).reduce((sum, c) => sum + c.volume, 0);
    const avgVolume = ohlcv.reduce((sum, c) => sum + c.volume, 0) / ohlcv.length;
    return recentVolume / avgVolume;
  }

  private calculateTrendStrength(ohlcv: OHLCV[], regime: string): number {
    const closes = ohlcv.map((c) => c.close);
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;

    if (regime === 'trending') {
      return (Math.abs(sma20 - sma50) / sma50) * 100;
    }
    return 0;
  }

  private estimateLiquidity(ohlcv: OHLCV[]): number {
    const avgVolume = ohlcv.reduce((sum, c) => sum + c.volume, 0) / ohlcv.length;
    return Math.min(100, (avgVolume / 1000000) * 100);
  }

  private categorizeByRegime(results: ScreenerResult[]): Record<string, ScreenerResult[]> {
    const categorized: Record<string, ScreenerResult[]> = {
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

  private getDefaultSymbols(): string[] {
    return [
      'ETHUSDTM',
      'SOLUSDTM',
      'XRPUSDTM',
      'ADAUSDTM',
      'DOGEUSDTM',
      'MATICUSDTM',
      'LINKUSDTM',
      'AVAXUSDTM',
      'DOTUSDTM',
      'UNIUSDTM',
      'ATOMUSDTM',
      'LTCUSDTM',
      'BCHUSDTM',
      'ETCUSDTM'
    ];
  }

  async shutdown(): Promise<void> {
    await this.provider.disconnect();
  }
}

interface MarketDataProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  fetch(symbol: string, timeframe: string, limit: number): Promise<MarketData | null>;
  fetchActiveSymbols(): Promise<string[]>;
  isMock(): boolean;
}

class MockMarketDataProvider implements MarketDataProvider {
  async connect(): Promise<void> {
    return;
  }

  async disconnect(): Promise<void> {
    return;
  }

  isMock(): boolean {
    return true;
  }

  async fetchActiveSymbols(): Promise<string[]> {
    // Return default perpetual futures symbols for testing
    return [
      'ETHUSDTM',
      'SOLUSDTM',
      'XRPUSDTM',
      'ADAUSDTM',
      'DOGEUSDTM',
      'MATICUSDTM',
      'LINKUSDTM',
      'AVAXUSDTM',
      'DOTUSDTM',
      'UNIUSDTM',
      'ATOMUSDTM',
      'LTCUSDTM',
      'BCHUSDTM',
      'ETCUSDTM'
    ];
  }

  async fetch(symbol: string, timeframe: string, limit: number): Promise<MarketData | null> {
    return {
      ohlcv: this.generateDeterministicOHLCV(symbol, timeframe, limit),
      orderBook: null,
      tradeFlow: null
    };
  }

  private generateDeterministicOHLCV(symbol: string, timeframe: string, count: number): OHLCV[] {
    const candles: OHLCV[] = [];
    const seed = this.hash(`${symbol}:${timeframe}`);
    let price = 50000 + (seed % 8000);
    const frameMs = timeframe === '30min' ? 30 * 60 * 1000 : 60 * 60 * 1000;

    for (let i = 0; i < count; i++) {
      const phase = (seed % 31) + i;
      const wave = Math.sin(phase / 5) * 0.01;
      const drift = ((seed % 17) - 8) * 0.0001;
      const changePct = wave + drift;
      const open = price;
      const close = Math.max(1, open * (1 + changePct));
      const high = Math.max(open, close) * 1.002;
      const low = Math.min(open, close) * 0.998;

      candles.push({
        timestamp: Date.now() - (count - i) * frameMs,
        open,
        high,
        low,
        close,
        volume: 100000 + ((seed + i * 97) % 400000)
      });
      price = close;
    }

    return candles;
  }

  private hash(input: string): number {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = (h << 5) - h + input.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }
}

class KucoinPerpDataProvider implements MarketDataProvider {
  private readonly client: AxiosInstance;
  private readonly rateLimiter: Bottleneck;
  private symbolCache: { symbols: string[]; timestamp: number } | null = null;
  private readonly SYMBOL_CACHE_TTL = 3600000; // 1 hour in milliseconds

  private static readonly ALLOWED_BASE_URLS = [
    'https://api-futures.kucoin.com',
    'https://api-sandbox-futures.kucoin.com'
  ];

  private static validateBaseURL(url: string): string {
    if (!KucoinPerpDataProvider.ALLOWED_BASE_URLS.includes(url)) {
      throw new Error(
        `E_INVALID_BASE_URL: ${url} is not an allowed KuCoin endpoint. ` +
        `Allowed: ${KucoinPerpDataProvider.ALLOWED_BASE_URLS.join(', ')}`
      );
    }
    return url;
  }

  constructor() {
    const baseURL = process.env.KUCOIN_API_BASE_URL || 'https://api-futures.kucoin.com';
    this.client = axios.create({
      baseURL: KucoinPerpDataProvider.validateBaseURL(baseURL),
      timeout: 10000
    });

    // Configure rate limiting for PUBLIC endpoints
    // KuCoin Public Futures API: 4,000 requests per 30 seconds (VIP0, no auth)
    // OHLCV weight = 3, so ~1,333 kline requests per 30s
    // Reference: https://www.kucoin.com/docs-new/rate-limit
    const configuredConcurrency = Number(process.env.KUCOIN_MAX_CONCURRENT_REQUESTS || 10);
    const maxConcurrent = Math.min(
      20,  // Upper bound for public endpoints (higher than authenticated)
      Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
        ? Math.floor(configuredConcurrency)
        : 10
    );

    this.rateLimiter = new Bottleneck({
      maxConcurrent,                // Max 10 simultaneous requests (configurable)
      minTime: 25,                  // Min 25ms between requests = max 40 req/sec per worker
      reservoir: 1333,              // Token bucket: 1,333 OHLCV requests (4000/weight3)
      reservoirRefreshAmount: 1333, // Refill to 1,333
      reservoirRefreshInterval: 30000  // Every 30 seconds (public API quota)
    });

    // Retry on 429 (rate limit exceeded) with exponential backoff
    this.rateLimiter.on('failed', async (error: any, jobInfo) => {
      if (error?.response?.status === 429) {
        const retryAfter = Number(error.response.headers['retry-after']) || 5;
        console.warn(`[RateLimit] 429 received, retrying after ${retryAfter}s`);
        return retryAfter * 1000; // Return delay in ms to trigger retry
      }
      // Don't retry other errors
      return undefined;
    });
  }

  async connect(): Promise<void> {
    // Public endpoint - no authentication required
    await this.client.get('/api/v1/timestamp');
    console.log('[KuCoinProvider] Connected to KuCoin public API (no credentials required)');
  }

  async disconnect(): Promise<void> {
    return;
  }

  isMock(): boolean {
    return false;
  }

  async fetchActiveSymbols(): Promise<string[]> {
    // Check cache first
    const now = Date.now();
    if (this.symbolCache && (now - this.symbolCache.timestamp) < this.SYMBOL_CACHE_TTL) {
      console.log(`[KuCoinProvider] Using cached symbols (${this.symbolCache.symbols.length} symbols)`);
      return this.symbolCache.symbols;
    }

    return this.rateLimiter.schedule(async () => {
      const endpoint = '/api/v1/contracts/active';

      try {
        const response = await this.client.get(endpoint);

        if (response.data?.code !== '200000') {
          throw new Error(response.data?.msg || 'KuCoin active contracts request failed');
        }

        const contracts = response.data?.data;
        if (!Array.isArray(contracts)) {
          throw new Error('Invalid response format from KuCoin active contracts endpoint');
        }

        // Extract symbols from active contracts
        // KuCoin returns objects with a "symbol" field (e.g., "ETHUSDTM")
        const symbols = contracts
          .map((contract: any) => contract.symbol)
          .filter((symbol: string) => typeof symbol === 'string' && symbol.length > 0);

        console.log(`[KuCoinProvider] Fetched ${symbols.length} active perpetual futures symbols`);

        // Update cache
        this.symbolCache = {
          symbols,
          timestamp: Date.now()
        };

        return symbols;
      } catch (error) {
        const err = error as Error;
        console.error(`[KuCoinProvider] Failed to fetch active symbols: ${err.message}`);

        // If we have stale cache, return it as fallback
        if (this.symbolCache) {
          console.warn('[KuCoinProvider] Using stale cache as fallback');
          return this.symbolCache.symbols;
        }

        throw error;
      }
    });
  }

  async fetch(symbol: string, timeframe: string, limit: number): Promise<MarketData | null> {
    return this.rateLimiter.schedule(async () => {
      const granularity = this.toGranularity(timeframe);
      const endAt = Date.now(); // KuCoin expects milliseconds
      const startAt = endAt - (granularity * 60 * 1000 * limit); // Convert minutes to milliseconds
      const endpoint = `/api/v1/kline/query?symbol=${encodeURIComponent(symbol)}&granularity=${granularity}&from=${startAt}&to=${endAt}`;

      const response = await this.client.get(endpoint);
      if (response.data?.code !== '200000') {
        throw new Error(response.data?.msg || 'KuCoin kline request failed');
      }

      const rows = response.data?.data;
      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      const ohlcv = rows
        .map((row: any[]) => ({
          timestamp: Number(row[0]), // Already in milliseconds
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volume: Number(row[5])
        }))
        .filter((c: OHLCV) => Number.isFinite(c.close) && c.close > 0)
        .sort((a: OHLCV, b: OHLCV) => a.timestamp - b.timestamp);

      return {
        ohlcv,
        orderBook: null,
        tradeFlow: null
      };
    });
  }

  private toGranularity(timeframe: string): number {
    switch (timeframe) {
      case '5min':
        return 5;
      case '15min':
        return 15;
      case '30min':
        return 30;
      case '1hour':
        return 60;
      case '4hour':
        return 240;
      default:
        return 30;
    }
  }
}

interface MarketData {
  ohlcv: OHLCV[];
  orderBook: any;
  tradeFlow: any;
}

export interface ScreenerResult {
  symbol: string;
  signal: CompositeSignal;
  regime: 'trending' | 'ranging' | 'volatile';
  overallScore: number;
  metrics: {
    volatility: number;
    volumeRatio: number;
    trendStrength: number;
    liquidity: number;
  };
  timestamp: number;
}
