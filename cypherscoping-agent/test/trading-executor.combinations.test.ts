import { TradingExecutorAgent } from '../src/agents/trading-executor-agent';
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

function rankStrength(strength: 'weak' | 'moderate' | 'strong' | 'extreme'): number {
  if (strength === 'extreme') return 4;
  if (strength === 'strong') return 3;
  if (strength === 'moderate') return 2;
  return 1;
}

function makeContext(options: {
  regime: 'trending' | 'ranging' | 'volatile';
  strength: 'weak' | 'moderate' | 'strong' | 'extreme';
  signalType:
    | 'trend'
    | 'crossover'
    | 'squeeze'
    | 'divergence'
    | 'oversold'
    | 'overbought'
    | 'golden_death_cross';
  ts: number;
}): AgentContext {
  return {
    symbol: 'ETHUSDTM',
    timeframe: '30min',
    balance: 10000,
    positions: [],
    openOrders: [],
    isLiveMode: false,
    marketData: {
      ohlcv: [{ timestamp: options.ts, open: 100, high: 101, low: 99, close: 100, volume: 50000 }],
      orderBook: null,
      tradeFlow: null,
      signal: {
        compositeScore: 120,
        authorized: true,
        side: 'long',
        confidence: 86,
        triggerCandle: null,
        windowExpires: null,
        indicatorScores: new Map(),
        microstructureScore: 0,
        blockReasons: [],
        confirmations: 6,
        timestamp: options.ts,
        signalStrength: options.strength,
        signalType: options.signalType,
        signalSource: 'matrix-test'
      },
      aiAnalysis: {
        recommendation: 'buy',
        confidence: 86,
        reasoning: ['matrix test'],
        riskAssessment: 'low',
        marketRegime: options.regime,
        suggestedAction: { type: 'entry' }
      }
    }
  };
}

describe('TradingExecutorAgent combination matrix', () => {
  test('covers every regime x strength combination for trend signals', async () => {
    await withEnv(
      {
        TRADING_MODE: 'paper',
        SIMULATION: 'false',
        FEATURE_ALLOWLIST: undefined,
        FEATURE_DENYLIST: undefined,
        ALLOWED_REGIMES: 'trending,volatile,ranging',
        SIGNAL_TYPE_REGIME_POLICY: 'trend=trending|volatile|ranging',
        IDEMPOTENCY_WINDOW_MS: '1'
      },
      async () => {
        const minStrengthByRegime: Record<'trending' | 'ranging' | 'volatile', 'moderate' | 'strong'> = {
          trending: 'moderate',
          volatile: 'strong',
          ranging: 'strong'
        };
        const regimes: Array<'trending' | 'ranging' | 'volatile'> = ['trending', 'ranging', 'volatile'];
        const strengths: Array<'weak' | 'moderate' | 'strong' | 'extreme'> = ['weak', 'moderate', 'strong', 'extreme'];
        const agent = new TradingExecutorAgent();
        await agent.initialize();
        let ts = Date.now();

        for (const regime of regimes) {
          for (const strength of strengths) {
            ts += 10;
            const context = makeContext({ regime, strength, signalType: 'trend', ts });
            const result = await agent.execute(context);
            const expectedAllowed = rankStrength(strength) >= rankStrength(minStrengthByRegime[regime]);
            if (expectedAllowed) {
              expect(result.action?.type).toBe('open-position');
            } else {
              expect(result.action?.type).toBe('wait');
            }
          }
        }
        await agent.shutdown();
      }
    );
  });

  test('covers every signalType x regime combination for strong signals', async () => {
    await withEnv(
      {
        TRADING_MODE: 'paper',
        SIMULATION: 'false',
        FEATURE_ALLOWLIST: undefined,
        FEATURE_DENYLIST: undefined,
        ALLOWED_REGIMES: 'trending,volatile,ranging',
        IDEMPOTENCY_WINDOW_MS: '1'
      },
      async () => {
        const policy: Record<
          | 'trend'
          | 'crossover'
          | 'squeeze'
          | 'divergence'
          | 'oversold'
          | 'overbought'
          | 'golden_death_cross',
          Array<'trending' | 'ranging' | 'volatile'>
        > = {
          trend: ['trending', 'volatile'],
          crossover: ['trending', 'ranging'],
          squeeze: ['volatile'],
          divergence: ['ranging', 'trending'],
          oversold: ['ranging', 'volatile'],
          overbought: ['ranging', 'volatile'],
          golden_death_cross: ['trending']
        };
        const regimes: Array<'trending' | 'ranging' | 'volatile'> = ['trending', 'ranging', 'volatile'];
        const signalTypes: Array<
          | 'trend'
          | 'crossover'
          | 'squeeze'
          | 'divergence'
          | 'oversold'
          | 'overbought'
          | 'golden_death_cross'
        > = ['trend', 'crossover', 'squeeze', 'divergence', 'oversold', 'overbought', 'golden_death_cross'];

        const agent = new TradingExecutorAgent();
        await agent.initialize();
        let ts = Date.now() + 1000;

        for (const signalType of signalTypes) {
          for (const regime of regimes) {
            ts += 10;
            const context = makeContext({ regime, strength: 'strong', signalType, ts });
            const result = await agent.execute(context);
            const expectedAllowed = policy[signalType].includes(regime);
            if (expectedAllowed) {
              expect(result.action?.type).toBe('open-position');
            } else {
              expect(result.action?.type).toBe('wait');
            }
          }
        }
        await agent.shutdown();
      }
    );
  });
});
