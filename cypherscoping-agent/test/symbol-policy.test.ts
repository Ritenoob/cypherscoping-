import { loadSymbolPolicy, validateSymbolPolicy } from '../src/config/symbol-policy';

function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    previous.set(k, process.env[k]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    run();
  } finally {
    for (const [k, v] of previous.entries()) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('symbol policy', () => {
  test('denies BTC/USDT aliases by default', () => {
    withEnv({ TRADING_UNIVERSE: undefined, DENYLIST_SYMBOLS: undefined, DEFAULT_SYMBOL: undefined }, () => {
      const policy = loadSymbolPolicy();
      const deniedSlash = validateSymbolPolicy('BTC/USDT', policy);
      const deniedXbt = validateSymbolPolicy('XBTUSDTM', policy);

      expect(deniedSlash.allowed).toBe(false);
      expect(deniedSlash.code).toBe('E_SYMBOL_DENIED');
      expect(deniedXbt.allowed).toBe(false);
      expect(deniedXbt.code).toBe('E_SYMBOL_DENIED');
    });
  });

  test('throws E_UNIVERSE_EMPTY when configured universe collapses after denylist', () => {
    withEnv({ TRADING_UNIVERSE: 'BTC/USDT,XBTUSDTM', DENYLIST_SYMBOLS: 'BTC/USDT,XBTUSDTM' }, () => {
      expect(() => loadSymbolPolicy()).toThrow(/E_UNIVERSE_EMPTY/);
    });
  });
});
