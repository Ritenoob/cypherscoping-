/**
 * Live KuCoin Public API Integration Test
 *
 * Tests the actual KuCoin public API endpoints WITHOUT authentication
 * to verify our implementation works in production.
 */

import { CoinScreenerAgent } from '../src/agents/coin-screener-agent';
import { AgentContext } from '../src/types';

// Skip in CI environments to avoid rate limits
// Set RUN_LIVE_TESTS=true to enable
const runLiveTests = process.env.RUN_LIVE_TESTS === 'true';

describe('KuCoin Public API Live Integration', () => {
  const testTimeout = 30000; // 30 seconds for real API calls

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

  (runLiveTests ? test : test.skip)('fetches active symbols from real KuCoin API without credentials', async () => {
    // Verify no credentials are set
    delete process.env.KUCOIN_API_KEY;
    delete process.env.KUCOIN_API_SECRET;
    delete process.env.KUCOIN_API_PASSPHRASE;

    // Use real KuCoin provider
    process.env.MARKET_DATA_PROVIDER = 'kucoin';
    process.env.TRADING_UNIVERSE = undefined; // Force dynamic fetch

    const screener = new CoinScreenerAgent();

    await screener.initialize();

    // Should have fetched symbols from KuCoin
    const provider = (screener as any).provider;
    expect(provider.isMock()).toBe(false);

    // Access the fetched symbols
    const symbols = await provider.fetchActiveSymbols();

    console.log(`\n[Live Test] Fetched ${symbols.length} active perpetual futures from KuCoin`);
    console.log(`[Live Test] Sample symbols:`, symbols.slice(0, 10));

    // Verify we got real data
    expect(symbols.length).toBeGreaterThan(500); // KuCoin has 542+ contracts
    expect(symbols).toContain('ETHUSDTM');
    expect(symbols).toContain('SOLUSDTM');
    expect(symbols).toContain('XRPUSDTM');

    // Verify BTC symbols are in the list (before policy filtering)
    const btcSymbols = symbols.filter((s: string) => s.includes('BTC') || s.includes('XBT'));
    expect(btcSymbols.length).toBeGreaterThan(0);
    console.log(`[Live Test] Found ${btcSymbols.length} BTC-related symbols (before policy filtering)`);

    await screener.shutdown();
  }, testTimeout);

  (runLiveTests ? test : test.skip)('fetches OHLCV data from real KuCoin API without credentials', async () => {
    // Verify no credentials are set
    delete process.env.KUCOIN_API_KEY;
    delete process.env.KUCOIN_API_SECRET;
    delete process.env.KUCOIN_API_PASSPHRASE;

    // Use real KuCoin provider with specific symbols
    process.env.MARKET_DATA_PROVIDER = 'kucoin';
    const testSymbols = ['ETHUSDTM', 'SOLUSDTM', 'XRPUSDTM'];
    process.env.TRADING_UNIVERSE = testSymbols.join(',');

    const screener = new CoinScreenerAgent(testSymbols);
    await screener.initialize();

    const provider = (screener as any).provider;

    // Test fetching OHLCV for multiple symbols
    console.log(`\n[Live Test] Fetching OHLCV data for ${testSymbols.length} symbols...`);

    for (const symbol of testSymbols) {
      const marketData = await provider.fetch(symbol, '30min', 100);

      expect(marketData).toBeTruthy();
      expect(marketData.ohlcv).toBeDefined();
      expect(marketData.ohlcv.length).toBeGreaterThan(0);
      expect(marketData.ohlcv.length).toBeLessThanOrEqual(100);

      const latestCandle = marketData.ohlcv[marketData.ohlcv.length - 1];

      console.log(`[Live Test] ${symbol}: ${marketData.ohlcv.length} candles, latest close: $${latestCandle.close.toFixed(2)}`);

      // Verify candle structure
      expect(latestCandle.timestamp).toBeGreaterThan(0);
      expect(latestCandle.open).toBeGreaterThan(0);
      expect(latestCandle.high).toBeGreaterThan(0);
      expect(latestCandle.low).toBeGreaterThan(0);
      expect(latestCandle.close).toBeGreaterThan(0);
      expect(latestCandle.volume).toBeGreaterThan(0);

      // Verify OHLC logic
      expect(latestCandle.high).toBeGreaterThanOrEqual(latestCandle.low);
      expect(latestCandle.high).toBeGreaterThanOrEqual(latestCandle.open);
      expect(latestCandle.high).toBeGreaterThanOrEqual(latestCandle.close);
      expect(latestCandle.low).toBeLessThanOrEqual(latestCandle.open);
      expect(latestCandle.low).toBeLessThanOrEqual(latestCandle.close);
    }

    await screener.shutdown();
  }, testTimeout);

  (runLiveTests ? test : test.skip)('performs full market scan with real KuCoin API', async () => {
    // Verify no credentials are set
    delete process.env.KUCOIN_API_KEY;
    delete process.env.KUCOIN_API_SECRET;
    delete process.env.KUCOIN_API_PASSPHRASE;

    // Use limited symbol set for faster test
    process.env.MARKET_DATA_PROVIDER = 'kucoin';
    process.env.TRADING_UNIVERSE = 'ETHUSDTM,SOLUSDTM,XRPUSDTM,ADAUSDTM,DOGEUSDTM';

    const screener = new CoinScreenerAgent();
    await screener.initialize();

    console.log('\n[Live Test] Performing full market scan...');
    const startTime = Date.now();

    const result = await screener.execute(baseContext(false));

    const duration = Date.now() - startTime;
    console.log(`[Live Test] Scan completed in ${duration}ms`);

    expect(result.success).toBe(true);
    expect(result.action.type).toBe('screening-complete');
    expect(result.action.totalScanned).toBeGreaterThan(0);

    console.log(`[Live Test] Results:`);
    console.log(`  - Total scanned: ${result.action.totalScanned}`);
    console.log(`  - Opportunities: ${result.action.opportunities}`);
    console.log(`  - Trending: ${result.action.byRegime.trending.length}`);
    console.log(`  - Ranging: ${result.action.byRegime.ranging.length}`);
    console.log(`  - Volatile: ${result.action.byRegime.volatile.length}`);

    if (result.action.topOpportunities && result.action.topOpportunities.length > 0) {
      console.log(`[Live Test] Top opportunity: ${result.action.topOpportunities[0].symbol} (score: ${result.action.topOpportunities[0].overallScore.toFixed(2)})`);
    }

    await screener.shutdown();
  }, testTimeout);

  (runLiveTests ? test : test.skip)('verifies rate limiting with real API', async () => {
    delete process.env.KUCOIN_API_KEY;
    delete process.env.KUCOIN_API_SECRET;
    delete process.env.KUCOIN_API_PASSPHRASE;

    process.env.MARKET_DATA_PROVIDER = 'kucoin';

    const screener = new CoinScreenerAgent(['ETHUSDTM']);
    await screener.initialize();

    const provider = (screener as any).provider;

    console.log('\n[Live Test] Testing rate limiter with 10 concurrent requests...');
    const startTime = Date.now();

    // Make 10 parallel requests
    const promises = Array(10).fill(null).map(() =>
      provider.fetch('ETHUSDTM', '30min', 50)
    );

    const results = await Promise.all(promises);

    const duration = Date.now() - startTime;
    console.log(`[Live Test] 10 requests completed in ${duration}ms (${(duration/10).toFixed(0)}ms per request avg)`);

    // All should succeed
    expect(results.every((r: any) => r !== null)).toBe(true);
    expect(results.every((r: any) => r.ohlcv.length > 0)).toBe(true);

    // Rate limiter should allow ~10 concurrent (configured max)
    // Duration should be < 2 seconds for 10 requests (vs ~10 seconds with old limits)
    expect(duration).toBeLessThan(5000);

    console.log(`[Live Test] Rate limiting working correctly - requests completed in parallel`);

    await screener.shutdown();
  }, testTimeout);

  (runLiveTests ? test : test.skip)('verifies symbol cache behavior with real API', async () => {
    delete process.env.KUCOIN_API_KEY;
    delete process.env.KUCOIN_API_SECRET;
    delete process.env.KUCOIN_API_PASSPHRASE;

    process.env.MARKET_DATA_PROVIDER = 'kucoin';
    process.env.TRADING_UNIVERSE = undefined; // Force dynamic fetch

    const screener = new CoinScreenerAgent();
    await screener.initialize();

    const provider = (screener as any).provider;

    console.log('\n[Live Test] First fetch (should call API)...');
    const startTime1 = Date.now();
    const symbols1 = await provider.fetchActiveSymbols();
    const duration1 = Date.now() - startTime1;

    console.log(`[Live Test] Fetched ${symbols1.length} symbols in ${duration1}ms`);

    console.log('[Live Test] Second fetch (should use cache)...');
    const startTime2 = Date.now();
    const symbols2 = await provider.fetchActiveSymbols();
    const duration2 = Date.now() - startTime2;

    console.log(`[Live Test] Fetched ${symbols2.length} symbols in ${duration2}ms (cached)`);

    // Same data
    expect(symbols2).toEqual(symbols1);

    // Cache should be MUCH faster (< 1ms vs ~200-500ms for API call)
    expect(duration2).toBeLessThan(10);
    console.log(`[Live Test] Cache speedup: ${(duration1/duration2).toFixed(0)}x faster`);

    await screener.shutdown();
  }, testTimeout);
});

// Print instructions if tests are skipped
if (!runLiveTests) {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Live KuCoin API tests SKIPPED');
  console.log('  Set RUN_LIVE_TESTS=true to run tests against real API');
  console.log('  WARNING: Uses real KuCoin API quota (but no credentials needed!)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n');
}
