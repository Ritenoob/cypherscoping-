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

  test('rejects live mode without required KuCoin credentials', async () => {
    await withEnv(
      {
        TRADING_MODE: 'live',
        SIMULATION: 'false',
        KUCOIN_API_KEY: undefined,
        KUCOIN_API_SECRET: undefined,
        KUCOIN_API_PASSPHRASE: undefined
      },
      async () => {
        expect(() => new CoinScreenerAgent(['ETHUSDTM'])).toThrow(/E_MISSING_CREDENTIALS/i);
      }
    );
  });

  test('allows live mode when required KuCoin credentials are present', async () => {
    await withEnv(
      {
        TRADING_MODE: 'live',
        SIMULATION: 'false',
        KUCOIN_API_KEY: 'key',
        KUCOIN_API_SECRET: 'secret',
        KUCOIN_API_PASSPHRASE: 'passphrase'
      },
      async () => {
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
});
