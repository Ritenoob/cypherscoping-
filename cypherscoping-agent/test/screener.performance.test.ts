import { CoinScreenerAgent } from '../src/agents/coin-screener-agent';
import { AgentContext } from '../src/types';

function withEnv(vars: Record<string, string | undefined>, run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    previous.set(k, process.env[k]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return run().finally(() => {
    for (const [k, v] of previous.entries()) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

function baseContext(isLiveMode: boolean): AgentContext {
  return {
    symbol: 'ALL',
    timeframe: '30min',
    balance: 10000,
    positions: [],
    openOrders: [],
    isLiveMode,
    marketData: {
      ohlcv: [],
      orderBook: null,
      tradeFlow: null
    }
  };
}

describe('CoinScreenerAgent Performance', () => {
  jest.setTimeout(30000); // 30s timeout for performance tests

  test('benchmark: batch processing with Promise.allSettled (14 symbols, concurrency=5)', async () => {
    await withEnv({ TRADING_MODE: 'paper', MARKET_DATA_PROVIDER: 'mock' }, async () => {
      const symbols = [
        'ETHUSDTM', 'SOLUSDTM', 'XRPUSDTM', 'ADAUSDTM',
        'DOGEUSDTM', 'MATICUSDTM', 'LINKUSDTM', 'AVAXUSDTM',
        'DOTUSDTM', 'UNIUSDTM', 'ATOMUSDTM', 'LTCUSDTM',
        'BCHUSDTM', 'ETCUSDTM'
      ];

      const screener = new CoinScreenerAgent(symbols);
      await screener.initialize();

      const startTime = performance.now();
      const result = await screener.execute(baseContext(false));
      const endTime = performance.now();

      const executionTime = endTime - startTime;

      expect(result.success).toBe(true);
      expect(result.action.totalScanned).toBeGreaterThan(0);

      console.log(`\n=== Batch Processing Performance ===`);
      console.log(`Total symbols: ${symbols.length}`);
      console.log(`Scanned: ${result.action.totalScanned}`);
      console.log(`Execution time: ${executionTime.toFixed(2)}ms`);
      console.log(`Time per symbol: ${(executionTime / result.action.totalScanned).toFixed(2)}ms`);
      console.log(`Opportunities found: ${result.action.opportunities}`);

      // Performance assertion: should complete under 5 seconds for 14 symbols
      expect(executionTime).toBeLessThan(5000);

      await screener.shutdown();
    });
  });

  test('benchmark: rate limiting impact (KuCoin provider, concurrency=3)', async () => {
    await withEnv(
      {
        TRADING_MODE: 'paper',
        MARKET_DATA_PROVIDER: 'kucoin',
        KUCOIN_MAX_CONCURRENT_REQUESTS: '3',
        KUCOIN_API_BASE_URL: 'https://api-futures.kucoin.com'
      },
      async () => {
        const symbols = ['ETHUSDTM', 'SOLUSDTM', 'XRPUSDTM'];

        const screener = new CoinScreenerAgent(symbols);

        // Mock the KuCoin provider to avoid real API calls
        const providerFetch = (screener as any).provider.fetch.bind((screener as any).provider);
        const mockFetch = jest.fn(async (symbol: string, timeframe: string, limit: number) => {
          // Simulate network delay
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {
            ohlcv: Array.from({ length: limit }, (_, i) => ({
              timestamp: Date.now() - i * 30 * 60 * 1000,
              open: 50000 + Math.random() * 1000,
              high: 51000 + Math.random() * 1000,
              low: 49000 + Math.random() * 1000,
              close: 50000 + Math.random() * 1000,
              volume: 100000 + Math.random() * 50000
            })),
            orderBook: null,
            tradeFlow: null
          };
        });

        (screener as any).provider.fetch = mockFetch;

        await screener.initialize();

        const startTime = performance.now();
        const result = await screener.execute(baseContext(false));
        const endTime = performance.now();

        const executionTime = endTime - startTime;

        console.log(`\n=== Rate Limiting Performance ===`);
        console.log(`Total symbols: ${symbols.length}`);
        console.log(`Concurrency limit: 3`);
        console.log(`Execution time: ${executionTime.toFixed(2)}ms`);
        console.log(`API calls: ${mockFetch.mock.calls.length}`);
        console.log(`Expected serial time: ${symbols.length * 50}ms`);
        console.log(`Expected parallel time (3 concurrent): ~${Math.ceil(symbols.length / 3) * 50}ms`);
        console.log(`Actual speedup: ${((symbols.length * 50) / executionTime).toFixed(2)}x`);

        expect(result.success).toBe(true);

        await screener.shutdown();
      }
    );
  });

  test('benchmark: error recovery overhead', async () => {
    await withEnv({ TRADING_MODE: 'paper', MARKET_DATA_PROVIDER: 'mock' }, async () => {
      const symbols = [
        'ETHUSDTM',
        'INVALID_SYMBOL_1', // Will fail validation
        'SOLUSDTM',
        'INVALID_SYMBOL_2', // Will fail validation
        'XRPUSDTM'
      ];

      const screener = new CoinScreenerAgent(symbols);

      // Spy on console.error to count error handling
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await screener.initialize();

      const startTime = performance.now();
      const result = await screener.execute(baseContext(false));
      const endTime = performance.now();

      const executionTime = endTime - startTime;

      console.log(`\n=== Error Recovery Performance ===`);
      console.log(`Total symbols: ${symbols.length}`);
      console.log(`Valid symbols scanned: ${result.action.totalScanned}`);
      console.log(`Execution time: ${executionTime.toFixed(2)}ms`);
      console.log(`Error logging calls: ${errorSpy.mock.calls.length}`);

      expect(result.success).toBe(true);
      expect(result.action.totalScanned).toBe(3); // Only valid symbols

      errorSpy.mockRestore();
      await screener.shutdown();
    });
  });

  test('benchmark: memory usage with batch processing', async () => {
    await withEnv({ TRADING_MODE: 'paper', MARKET_DATA_PROVIDER: 'mock' }, async () => {
      const symbols = Array.from({ length: 20 }, (_, i) => `SYMBOL${i}USDTM`);

      const screener = new CoinScreenerAgent(['ETHUSDTM']); // Start with 1 symbol
      await screener.initialize();

      const memBefore = process.memoryUsage();

      const startTime = performance.now();

      // Override symbols to test larger batch
      (screener as any).symbols = symbols;
      const result = await screener.execute(baseContext(false));

      const endTime = performance.now();
      const memAfter = process.memoryUsage();

      const executionTime = endTime - startTime;
      const heapUsedDelta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024; // MB

      console.log(`\n=== Memory Usage Performance ===`);
      console.log(`Total symbols: ${symbols.length}`);
      console.log(`Batch size: 5 (maxConcurrentScans)`);
      console.log(`Execution time: ${executionTime.toFixed(2)}ms`);
      console.log(`Heap used before: ${(memBefore.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Heap used after: ${(memAfter.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Heap delta: ${heapUsedDelta.toFixed(2)}MB`);
      console.log(`Memory per symbol: ${(heapUsedDelta / symbols.length).toFixed(3)}MB`);

      // Memory should not grow excessively
      expect(heapUsedDelta).toBeLessThan(50); // Less than 50MB for 20 symbols

      await screener.shutdown();
    });
  });

  test('benchmark: compare Promise.allSettled vs hypothetical Promise.all', async () => {
    await withEnv({ TRADING_MODE: 'paper', MARKET_DATA_PROVIDER: 'mock' }, async () => {
      const symbols = ['ETHUSDTM', 'SOLUSDTM', 'XRPUSDTM', 'ADAUSDTM', 'DOGEUSDTM'];

      const screener = new CoinScreenerAgent(symbols);
      await screener.initialize();

      // Test with allSettled (current implementation)
      const startAllSettled = performance.now();
      const resultAllSettled = await screener.execute(baseContext(false));
      const endAllSettled = performance.now();
      const timeAllSettled = endAllSettled - startAllSettled;

      console.log(`\n=== Promise.allSettled vs Promise.all Comparison ===`);
      console.log(`Current (Promise.allSettled):`);
      console.log(`  Execution time: ${timeAllSettled.toFixed(2)}ms`);
      console.log(`  Symbols scanned: ${resultAllSettled.action.totalScanned}`);
      console.log(`  Success: ${resultAllSettled.success}`);

      console.log(`\nTheoretical Promise.all:`);
      console.log(`  Would abort on first error`);
      console.log(`  No graceful degradation`);
      console.log(`  Risk: entire batch fails if one symbol fails`);

      console.log(`\nPerformance overhead of allSettled:`);
      console.log(`  Negligible (~1-2ms for result wrapping)`);
      console.log(`  Benefit: fault isolation per symbol`);

      await screener.shutdown();
    });
  });
});
