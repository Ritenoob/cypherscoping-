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

describe('CoinScreenerAgent provider policy', () => {
  test('rejects live mode with simulated market data configuration', async () => {
    await withEnv({ TRADING_MODE: 'live', SIMULATION: 'true' }, async () => {
      expect(() => new CoinScreenerAgent()).toThrow(/live mode cannot use simulated market data/i);
    });
  });

  test('allows live mode with KuCoin public API (no credentials required)', async () => {
    await withEnv(
      {
        TRADING_MODE: 'live',
        SIMULATION: 'false',
        KUCOIN_API_KEY: undefined,
        KUCOIN_API_SECRET: undefined,
        KUCOIN_API_PASSPHRASE: undefined
      },
      async () => {
        // Public API endpoints don't require credentials for market data
        expect(() => new CoinScreenerAgent(['ETHUSDTM'])).not.toThrow();
      }
    );
  });

  test('allows paper mode with mock provider', async () => {
    await withEnv({ TRADING_MODE: 'paper', SIMULATION: 'false', MARKET_DATA_PROVIDER: 'mock' }, async () => {
      const screener = new CoinScreenerAgent(['ETHUSDTM']);
      await screener.initialize();
      const result = await screener.execute(baseContext(false));
      expect(result.success).toBe(true);
      expect(result.action.type).toBe('screening-complete');
      await screener.shutdown();
    });
  });

  test('allows paper trading without any credentials (uses public API)', async () => {
    await withEnv(
      {
        TRADING_MODE: 'paper',
        MARKET_DATA_PROVIDER: 'kucoin',
        KUCOIN_API_KEY: undefined,
        KUCOIN_API_SECRET: undefined,
        KUCOIN_API_PASSPHRASE: undefined
      },
      async () => {
        // Paper trading with KuCoin provider works without credentials (public API)
        expect(() => new CoinScreenerAgent(['ETHUSDTM'])).not.toThrow();
      }
    );
  });

  test('rejects invalid base URL formats for SSRF protection', async () => {
    const invalidURLs = [
      { url: 'http://api-futures.kucoin.com', desc: 'HTTP (non-HTTPS)' },
      { url: 'https://localhost:8080', desc: 'localhost' },
      { url: 'https://127.0.0.1:8080', desc: 'private IP' },
      { url: 'https://api-futures.kucoin.com/extra/path', desc: 'URL with path suffix' },
      { url: 'https://api-futures-kucoin.com', desc: 'similar but not exact match' }
    ];

    for (const { url, desc } of invalidURLs) {
      await withEnv(
        {
          KUCOIN_API_BASE_URL: url,
          MARKET_DATA_PROVIDER: 'kucoin'
        },
        async () => {
          expect(() => new CoinScreenerAgent(['ETHUSDTM'])).toThrow(/E_INVALID_BASE_URL/);
          expect(() => new CoinScreenerAgent(['ETHUSDTM'])).toThrow(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
      );
    }
  });

  test('rejects live mode with mock provider at runtime', async () => {
    // Test constructor-time validation (forced mock provider in live mode)
    await withEnv(
      {
        TRADING_MODE: 'live',
        MARKET_DATA_PROVIDER: 'mock'
      },
      async () => {
        expect(() => new CoinScreenerAgent(['ETHUSDTM'])).toThrow(/mock market data provider is not allowed in live mode/);
      }
    );

    // Test runtime validation (execute with isLiveMode=true and mock provider)
    await withEnv(
      {
        TRADING_MODE: 'paper',
        MARKET_DATA_PROVIDER: 'mock'
      },
      async () => {
        const screener = new CoinScreenerAgent(['ETHUSDTM']);
        await screener.initialize();

        // Execute with isLiveMode=true (runtime check at line 38-42)
        const result = await screener.execute(baseContext(true));

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Live mode cannot run screener with mock market data provider/);

        await screener.shutdown();
      }
    );
  });
});
