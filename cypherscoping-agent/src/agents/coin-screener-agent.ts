import axios, { AxiosInstance } from 'axios';
import pLimit from 'p-limit';
import { BaseAgent } from './base-agent';
import { AgentContext, AgentResult, OHLCV, CompositeSignal } from '../types';
import { loadSymbolPolicy, validateSymbolPolicy } from '../config/symbol-policy';

export class CoinScreenerAgent extends BaseAgent {
  private symbols: string[] = [];
  private watchedSymbols: Map<string, ScreenerResult> = new Map();
  private readonly maxConcurrentScans: number = 5;
  private provider: MarketDataProvider;

  constructor(symbols?: string[]) {
    super({
      id: 'coin-screener-agent',
      name: 'Coin Screener Agent',
      role: 'Market Scanner',
      capabilities: ['market-scanning', 'opportunity-detection', 'symbol-ranking', 'regime-detection'],
      maxConcurrentTasks: 20,
      priority: 1
    });
    const symbolPolicy = loadSymbolPolicy();
    this.symbols = (symbols && symbols.length > 0 ? symbols : symbolPolicy.tradingUniverse).filter((symbol) => {
      const validation = validateSymbolPolicy(symbol, symbolPolicy);
      return validation.allowed;
    });
    if (this.symbols.length === 0) {
      throw new Error('E_UNIVERSE_EMPTY: no allowed symbols available for screener');
    }
    this.provider = this.createDataProvider();
  }

  async initialize(): Promise<void> {
    await this.provider.connect();
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
      this.assertLiveCredentials();
      return new KucoinPerpDataProvider();
    }

    if (forcedProvider === 'kucoin') {
      return new KucoinPerpDataProvider();
    }

    return new MockMarketDataProvider();
  }

  private assertLiveCredentials(): void {
    const required = ['KUCOIN_API_KEY', 'KUCOIN_API_SECRET', 'KUCOIN_API_PASSPHRASE'] as const;
    const missing = required.filter((name) => !(process.env[name] || '').trim());
    if (missing.length > 0) {
      throw new Error(`E_MISSING_CREDENTIALS: Live mode requires ${missing.join(', ')}`);
    }
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
      const symbolPolicy = loadSymbolPolicy();
      const validation = validateSymbolPolicy(symbol, symbolPolicy);
      if (!validation.allowed) {
        console.warn(`[CoinScreener] ${validation.code}: ${validation.reason}`);
        return null;
      }

      const marketData = await this.fetchMarketData(symbol);
      if (!marketData || marketData.ohlcv.length < 50) {
        return null;
      }

      const signal = await this.generateSignal(marketData.ohlcv);
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

  private async generateSignal(ohlcv: OHLCV[]): Promise<CompositeSignal> {
    const closes = ohlcv.map((c) => c.close);
    const rsi = this.calculateRSI(closes, 14);
    const williamsR = this.calculateWilliamsR(ohlcv);
    const trend = this.calculateTrend(closes);

    let score = 0;
    let side: 'long' | 'short' | null = null;

    if (williamsR < -80 && rsi < 40) {
      score += 50;
      side = 'long';
    } else if (williamsR > -20 && rsi > 60) {
      score -= 50;
      side = 'short';
    }

    if (trend === 'up') score += 20;
    else if (trend === 'down') score -= 20;

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

  private calculateRSI(closes: number[], period: number): number {
    const changes = closes.slice(1).map((c, i) => c - closes[i]);
    const gains = changes.map((c) => (c > 0 ? c : 0));
    const losses = changes.map((c) => (c < 0 ? -c : 0));

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private calculateWilliamsR(ohlcv: OHLCV[]): number {
    const period = 14;
    const highs = ohlcv.slice(-period).map((c) => c.high);
    const lows = ohlcv.slice(-period).map((c) => c.low);
    const closes = ohlcv.slice(-period).map((c) => c.close);

    const highest = Math.max(...highs);
    const lowest = Math.min(...lows);
    const latestClose = closes[closes.length - 1];
    const denom = highest - lowest;
    if (denom === 0) return -50;

    return ((highest - latestClose) / denom) * -100;
  }

  private calculateTrend(closes: number[]): 'up' | 'down' | 'neutral' {
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;

    if (closes[closes.length - 1] > sma20 && sma20 > sma50) return 'up';
    if (closes[closes.length - 1] < sma20 && sma20 < sma50) return 'down';
    return 'neutral';
  }

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
  private readonly rateLimiter: ReturnType<typeof pLimit>;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.KUCOIN_API_BASE_URL || 'https://api-futures.kucoin.com',
      timeout: 10000
    });
    const configuredConcurrency = Number(process.env.KUCOIN_MAX_CONCURRENT_REQUESTS || 3);
    const concurrency =
      Number.isFinite(configuredConcurrency) && configuredConcurrency > 0 ? Math.floor(configuredConcurrency) : 3;
    this.rateLimiter = pLimit(concurrency);
  }

  async connect(): Promise<void> {
    await this.client.get('/api/v1/timestamp');
  }

  async disconnect(): Promise<void> {
    return;
  }

  isMock(): boolean {
    return false;
  }

  async fetch(symbol: string, timeframe: string, limit: number): Promise<MarketData | null> {
    return this.rateLimiter(async () => {
      const granularity = this.toGranularity(timeframe);
      const endAt = Math.floor(Date.now() / 1000);
      const startAt = endAt - granularity * limit;
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
          timestamp: Number(row[0]) * 1000,
          open: Number(row[1]),
          high: Number(row[3]),
          low: Number(row[4]),
          close: Number(row[2]),
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
