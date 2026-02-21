import { CypherScopeOrchestrator } from '../src/agents/orchestrator';

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

function mockOHLCV() {
  return Array.from({ length: 60 }, (_, i) => ({
    timestamp: Date.now() - (60 - i) * 30 * 60 * 1000,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 1000 + i
  }));
}

describe('CypherScopeOrchestrator symbol policy', () => {
  test('returns E_SYMBOL_NOT_ALLOWED for symbols outside configured universe', async () => {
    await withEnv(
      {
        TRADING_UNIVERSE: 'ETHUSDTM',
        DENYLIST_SYMBOLS: 'BTC/USDT,BTCUSDTM,XBTUSDTM',
        DEFAULT_SYMBOL: 'ETHUSDTM'
      },
      async () => {
        const orchestrator = new CypherScopeOrchestrator();
        await orchestrator.initialize();
        const analysis = await orchestrator.analyzeSymbol('SOLUSDTM', mockOHLCV());
        expect(analysis.errorCode).toBe('E_SYMBOL_NOT_ALLOWED');
        expect(typeof analysis.correlationId).toBe('string');
        await orchestrator.shutdown();
      }
    );
  });
});
