import axios from 'axios';
import { CoinScreenerAgent } from '../src/agents/coin-screener-agent';
import { AgentContext } from '../src/types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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

describe('CoinScreenerAgent dynamic market discovery', () => {
  let mockAxiosInstance: any;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    mockAxiosInstance = {
      get: jest.fn(),
      defaults: {}
    };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test('fetches all active perpetual futures symbols from KuCoin', async () => {
    await withEnv(
      {
        MARKET_DATA_PROVIDER: 'kucoin',
        KUCOIN_API_KEY: 'key',
        KUCOIN_API_SECRET: 'secret',
        KUCOIN_API_PASSPHRASE: 'passphrase',
        TRADING_UNIVERSE: undefined, // Ensure no override
        DENYLIST_SYMBOLS: undefined
      },
      async () => {
        // Mock active contracts endpoint response
        mockAxiosInstance.get.mockImplementation((endpoint: string) => {
          if (endpoint === '/api/v1/timestamp') {
            return Promise.resolve({ data: { code: '200000' } });
          }
          if (endpoint === '/api/v1/contracts/active') {
            return Promise.resolve({
              data: {
                code: '200000',
                data: [
                  { symbol: 'ETHUSDTM', status: 'Open' },
                  { symbol: 'BTCUSDTM', status: 'Open' }, // Will be filtered by denylist
                  { symbol: 'SOLUSDTM', status: 'Open' },
                  { symbol: 'XRPUSDTM', status: 'Open' },
                  { symbol: 'ADAUSDTM', status: 'Open' }
                ]
              }
            });
          }
          return Promise.resolve({ data: { code: '200000' } });
        });

        const screener = new CoinScreenerAgent();
        await screener.initialize();

        // Verify symbols were fetched dynamically
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Fetching active perpetual futures symbols from KuCoin')
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Found 5 active perpetual futures markets')
        );

        // BTCUSDTM should be filtered out by default denylist
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Filtering out denied symbol: BTCUSDTM')
        );

        // Should have 4 allowed symbols (5 - 1 denied)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('After policy filtering: 4 allowed symbols')
        );

        await screener.shutdown();
      }
    );
  });

  test('uses TRADING_UNIVERSE override instead of dynamic fetch', async () => {
    await withEnv(
      {
        MARKET_DATA_PROVIDER: 'kucoin',
        KUCOIN_API_KEY: 'key',
        KUCOIN_API_SECRET: 'secret',
        KUCOIN_API_PASSPHRASE: 'passphrase',
        TRADING_UNIVERSE: 'ETHUSDTM,SOLUSDTM',
        DENYLIST_SYMBOLS: undefined
      },
      async () => {
        mockAxiosInstance.get.mockResolvedValue({ data: { code: '200000' } });

        const screener = new CoinScreenerAgent();
        await screener.initialize();

        // Should use override, not fetch from API
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Using TRADING_UNIVERSE override instead of dynamic market scan')
        );

        // Should NOT call active contracts endpoint
        const activeContractsCalls = mockAxiosInstance.get.mock.calls.filter(
          (call: any[]) => call[0] === '/api/v1/contracts/active'
        );
        expect(activeContractsCalls.length).toBe(0);

        await screener.shutdown();
      }
    );
  });

  test('caches fetched symbols for 1 hour to reduce API calls', async () => {
    await withEnv(
      {
        MARKET_DATA_PROVIDER: 'kucoin',
        KUCOIN_API_KEY: 'key',
        KUCOIN_API_SECRET: 'secret',
        KUCOIN_API_PASSPHRASE: 'passphrase',
        TRADING_UNIVERSE: undefined,
        DENYLIST_SYMBOLS: undefined
      },
      async () => {
        let callCount = 0;
        mockAxiosInstance.get.mockImplementation((endpoint: string) => {
          if (endpoint === '/api/v1/timestamp') {
            return Promise.resolve({ data: { code: '200000' } });
          }
          if (endpoint === '/api/v1/contracts/active') {
            callCount++;
            return Promise.resolve({
              data: {
                code: '200000',
                data: [
                  { symbol: 'ETHUSDTM' },
                  { symbol: 'SOLUSDTM' }
                ]
              }
            });
          }
          return Promise.resolve({ data: { code: '200000' } });
        });

        // Create screener - should fetch from API
        const screener = new CoinScreenerAgent();
        await screener.initialize();
        expect(callCount).toBe(1);

        // Access provider to test direct cache behavior
        const provider = (screener as any).provider;

        // Second call to fetchActiveSymbols should use cache
        await provider.fetchActiveSymbols();

        // Should have logged cache usage
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Using cached symbols')
        );

        // Should still only have 1 API call (cache hit)
        expect(callCount).toBe(1);

        await screener.shutdown();
      }
    );
  });

  test('falls back to stale cache if API fails', async () => {
    await withEnv(
      {
        MARKET_DATA_PROVIDER: 'kucoin',
        KUCOIN_API_KEY: 'key',
        KUCOIN_API_SECRET: 'secret',
        KUCOIN_API_PASSPHRASE: 'passphrase',
        TRADING_UNIVERSE: undefined,
        DENYLIST_SYMBOLS: undefined
      },
      async () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        let callCount = 0;
        mockAxiosInstance.get.mockImplementation((endpoint: string) => {
          if (endpoint === '/api/v1/timestamp') {
            return Promise.resolve({ data: { code: '200000' } });
          }
          if (endpoint === '/api/v1/contracts/active') {
            callCount++;
            if (callCount === 1) {
              // First call succeeds
              return Promise.resolve({
                data: {
                  code: '200000',
                  data: [{ symbol: 'ETHUSDTM' }]
                }
              });
            } else {
              // Second call fails
              return Promise.reject(new Error('API temporarily unavailable'));
            }
          }
          return Promise.resolve({ data: { code: '200000' } });
        });

        // Create screener and populate cache
        const screener = new CoinScreenerAgent();
        await screener.initialize();

        // Access provider to test direct cache behavior
        const provider = (screener as any).provider;

        // Verify cache was populated
        expect(provider.symbolCache).toBeTruthy();
        expect(callCount).toBe(1);

        // Expire cache to force re-fetch
        provider.symbolCache.timestamp = 0;

        // Second call should attempt refresh but fall back to stale cache
        const symbols = await provider.fetchActiveSymbols();

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to fetch active symbols')
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Using stale cache as fallback')
        );

        // Should return cached symbols despite API failure
        expect(symbols).toEqual(['ETHUSDTM']);

        await screener.shutdown();

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      }
    );
  });

  test('handles non-200000 KuCoin response code gracefully', async () => {
    await withEnv(
      {
        MARKET_DATA_PROVIDER: 'kucoin',
        KUCOIN_API_KEY: 'key',
        KUCOIN_API_SECRET: 'secret',
        KUCOIN_API_PASSPHRASE: 'passphrase',
        TRADING_UNIVERSE: undefined,
        DENYLIST_SYMBOLS: undefined
      },
      async () => {
        mockAxiosInstance.get.mockImplementation((endpoint: string) => {
          if (endpoint === '/api/v1/timestamp') {
            return Promise.resolve({ data: { code: '200000' } });
          }
          if (endpoint === '/api/v1/contracts/active') {
            return Promise.resolve({
              data: {
                code: '500000',
                msg: 'Internal server error'
              }
            });
          }
          return Promise.resolve({ data: { code: '200000' } });
        });

        const screener = new CoinScreenerAgent();

        await expect(screener.initialize()).rejects.toThrow(/Internal server error/);
      }
    );
  });

  test('mock provider returns default symbols without API call', async () => {
    await withEnv(
      {
        MARKET_DATA_PROVIDER: 'mock',
        TRADING_UNIVERSE: undefined,
        DENYLIST_SYMBOLS: undefined
      },
      async () => {
        const screener = new CoinScreenerAgent();
        await screener.initialize();

        // Mock provider should not call KuCoin API
        const activeContractsCalls = mockAxiosInstance.get.mock.calls.filter(
          (call: any[]) => call[0] === '/api/v1/contracts/active'
        );
        expect(activeContractsCalls.length).toBe(0);

        // Should still have symbols from mock provider
        const result = await screener.execute(baseContext(false));
        expect(result.success).toBe(true);
        expect(result.action.totalScanned).toBeGreaterThan(0);

        await screener.shutdown();
      }
    );
  });

  test('uses explicit symbols parameter without fetching from API', async () => {
    await withEnv(
      {
        MARKET_DATA_PROVIDER: 'kucoin',
        KUCOIN_API_KEY: 'key',
        KUCOIN_API_SECRET: 'secret',
        KUCOIN_API_PASSPHRASE: 'passphrase',
        TRADING_UNIVERSE: 'ETHUSDTM,SOLUSDTM',
        DENYLIST_SYMBOLS: undefined
      },
      async () => {
        mockAxiosInstance.get.mockResolvedValue({ data: { code: '200000' } });

        // Pass explicit symbols to constructor
        const screener = new CoinScreenerAgent(['ETHUSDTM', 'SOLUSDTM']);
        await screener.initialize();

        // Should NOT fetch from API (symbols already provided)
        const activeContractsCalls = mockAxiosInstance.get.mock.calls.filter(
          (call: any[]) => call[0] === '/api/v1/contracts/active'
        );
        expect(activeContractsCalls.length).toBe(0);

        await screener.shutdown();
      }
    );
  });
});
