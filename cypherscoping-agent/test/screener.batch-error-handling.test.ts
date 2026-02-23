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

describe('CoinScreenerAgent batch error handling', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  test('handles partial batch failure with mixed success/null/error', async () => {
    await withEnv({
      MARKET_DATA_PROVIDER: 'mock',
      TRADING_UNIVERSE: 'ETHUSDTM,SOLUSDTM,XRPUSDTM,ADAUSDTM,MATICUSDTM'
    }, async () => {
      const symbols = ['ETHUSDTM', 'SOLUSDTM', 'XRPUSDTM', 'ADAUSDTM', 'MATICUSDTM'];
      const screener = new CoinScreenerAgent(symbols);

      // Spy on scanSymbol to control behavior
      const scanSymbolSpy = jest.spyOn(screener as any, 'scanSymbol');

      // Configure per-symbol behavior:
      // Symbol 0 (ETHUSDTM): success
      // Symbol 1 (SOLUSDTM): success
      // Symbol 2 (XRPUSDTM): success
      // Symbol 3 (ADAUSDTM): null (policy rejection)
      // Symbol 4 (MATICUSDTM): error
      scanSymbolSpy
        .mockResolvedValueOnce({ symbol: 'ETHUSDTM', signal: {}, regime: 'trending', overallScore: 50, metrics: {}, timestamp: Date.now() })
        .mockResolvedValueOnce({ symbol: 'SOLUSDTM', signal: {}, regime: 'ranging', overallScore: 40, metrics: {}, timestamp: Date.now() })
        .mockResolvedValueOnce({ symbol: 'XRPUSDTM', signal: {}, regime: 'volatile', overallScore: 30, metrics: {}, timestamp: Date.now() })
        .mockResolvedValueOnce(null) // Policy rejection
        .mockRejectedValueOnce(new Error('Network failure'));

      await screener.initialize();
      const result = await screener.execute(baseContext(false));
      await screener.shutdown();

      // Verify totalScanned = 3 (only successes counted)
      expect(result.success).toBe(true);
      expect(result.action.totalScanned).toBe(3);

      // Verify error logged for rejection
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CoinScreener] Batch scan promise rejected:'),
        expect.stringContaining('Network failure')
      );

      // Null result should not log error (only warning in scanSymbol if policy)
      // Verify we got 3 regime categorizations
      const byRegime = result.action.byRegime;
      expect(Object.values(byRegime).flat().length).toBe(3);
    });
  });

  test('handles entire batch failure with all rejections', async () => {
    await withEnv({
      MARKET_DATA_PROVIDER: 'mock',
      TRADING_UNIVERSE: 'ETHUSDTM,SOLUSDTM,XRPUSDTM,ADAUSDTM,MATICUSDTM'
    }, async () => {
      const symbols = ['ETHUSDTM', 'SOLUSDTM', 'XRPUSDTM', 'ADAUSDTM', 'MATICUSDTM'];
      const screener = new CoinScreenerAgent(symbols);

      // All symbols throw errors
      const scanSymbolSpy = jest.spyOn(screener as any, 'scanSymbol');
      scanSymbolSpy.mockRejectedValue(new Error('All failed'));

      await screener.initialize();
      const result = await screener.execute(baseContext(false));
      await screener.shutdown();

      // Graceful degradation
      expect(result.success).toBe(true);
      expect(result.action.totalScanned).toBe(0);
      expect(result.action.opportunities).toBe(0);

      // Verify 5 error logs
      expect(consoleErrorSpy).toHaveBeenCalledTimes(5);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CoinScreener] Batch scan promise rejected:'),
        expect.stringContaining('All failed')
      );
    });
  });

  test('distinguishes fulfilled-with-null from rejected paths', async () => {
    await withEnv({ MARKET_DATA_PROVIDER: 'mock' }, async () => {
      const symbols = ['ETHUSDTM', 'SOLUSDTM'];
      const screener = new CoinScreenerAgent(symbols);

      const scanSymbolSpy = jest.spyOn(screener as any, 'scanSymbol');

      // Symbol 1: returns null (fulfilled, line 111)
      // Symbol 2: throws error (rejected, line 115)
      scanSymbolSpy
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Rejected error'));

      await screener.initialize();
      const result = await screener.execute(baseContext(false));
      await screener.shutdown();

      // Only rejected path logs error
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CoinScreener] Batch scan promise rejected:'),
        expect.stringContaining('Rejected error')
      );

      // Fulfilled-with-null has no error log
      expect(result.action.totalScanned).toBe(0);
    });
  });

  test('handles empty batch processing edge case', async () => {
    await withEnv({ MARKET_DATA_PROVIDER: 'mock' }, async () => {
      // Empty symbols array - this would throw in constructor, so we need to allow at least one valid symbol
      // But we can test with 0 results by making all return null
      const screener = new CoinScreenerAgent(['ETHUSDTM']);

      const scanSymbolSpy = jest.spyOn(screener as any, 'scanSymbol');
      scanSymbolSpy.mockResolvedValue(null);

      await screener.initialize();
      const result = await screener.execute(baseContext(false));
      await screener.shutdown();

      expect(result.success).toBe(true);
      expect(result.action.totalScanned).toBe(0);
      expect(result.action.opportunities).toBe(0);

      // Empty regime categorization
      const byRegime = result.action.byRegime;
      expect(byRegime.trending).toHaveLength(0);
      expect(byRegime.ranging).toHaveLength(0);
      expect(byRegime.volatile).toHaveLength(0);
    });
  });

  test('ensures concurrent batch processing isolation across failures', async () => {
    await withEnv({
      MARKET_DATA_PROVIDER: 'mock',
      TRADING_UNIVERSE: 'ETHUSDTM,SOLUSDTM,XRPUSDTM,ADAUSDTM,MATICUSDTM,LINKUSDTM,AVAXUSDTM,DOTUSDTM,UNIUSDTM,ATOMUSDTM,LTCUSDTM,BCHUSDTM,ETCUSDTM,DOGEUSDTM'
    }, async () => {
      // 14 symbols → 3 batches (5, 5, 4) with maxConcurrentScans=5
      const symbols = [
        'ETHUSDTM', 'SOLUSDTM', 'XRPUSDTM', 'ADAUSDTM', 'MATICUSDTM',           // Batch 1 - all fail
        'LINKUSDTM', 'AVAXUSDTM', 'DOTUSDTM', 'UNIUSDTM', 'ATOMUSDTM',          // Batch 2 - mixed (2 success, 3 fail)
        'LTCUSDTM', 'BCHUSDTM', 'ETCUSDTM', 'DOGEUSDTM'                         // Batch 3 - all succeed
      ];
      const screener = new CoinScreenerAgent(symbols);

      const scanSymbolSpy = jest.spyOn(screener as any, 'scanSymbol');

      // Batch 1: all fail
      scanSymbolSpy.mockRejectedValueOnce(new Error('B1 fail'));
      scanSymbolSpy.mockRejectedValueOnce(new Error('B1 fail'));
      scanSymbolSpy.mockRejectedValueOnce(new Error('B1 fail'));
      scanSymbolSpy.mockRejectedValueOnce(new Error('B1 fail'));
      scanSymbolSpy.mockRejectedValueOnce(new Error('B1 fail'));

      // Batch 2: 2 successes, 3 failures
      scanSymbolSpy.mockResolvedValueOnce({ symbol: 'LINKUSDTM', signal: {}, regime: 'trending', overallScore: 60, metrics: {}, timestamp: Date.now() });
      scanSymbolSpy.mockResolvedValueOnce({ symbol: 'AVAXUSDTM', signal: {}, regime: 'ranging', overallScore: 70, metrics: {}, timestamp: Date.now() });
      scanSymbolSpy.mockRejectedValueOnce(new Error('B2 fail'));
      scanSymbolSpy.mockRejectedValueOnce(new Error('B2 fail'));
      scanSymbolSpy.mockRejectedValueOnce(new Error('B2 fail'));

      // Batch 3: all succeed
      scanSymbolSpy.mockResolvedValueOnce({ symbol: 'LTCUSDTM', signal: {}, regime: 'volatile', overallScore: 80, metrics: {}, timestamp: Date.now() });
      scanSymbolSpy.mockResolvedValueOnce({ symbol: 'BCHUSDTM', signal: {}, regime: 'trending', overallScore: 90, metrics: {}, timestamp: Date.now() });
      scanSymbolSpy.mockResolvedValueOnce({ symbol: 'ETCUSDTM', signal: {}, regime: 'ranging', overallScore: 85, metrics: {}, timestamp: Date.now() });
      scanSymbolSpy.mockResolvedValueOnce({ symbol: 'DOGEUSDTM', signal: {}, regime: 'volatile', overallScore: 75, metrics: {}, timestamp: Date.now() });

      await screener.initialize();
      const result = await screener.execute(baseContext(false));
      await screener.shutdown();

      // Verify Batch 1 failures don't cascade to Batch 2/3
      expect(result.action.totalScanned).toBe(6); // 0 + 2 + 4

      // Verify error count = 8 (5 from B1 + 3 from B2)
      expect(consoleErrorSpy).toHaveBeenCalledTimes(8);

      // Verify all 6 successful results are categorized
      const byRegime = result.action.byRegime;
      const allResults = Object.values(byRegime).flat();
      expect(allResults.length).toBe(6);
    });
  });
});
