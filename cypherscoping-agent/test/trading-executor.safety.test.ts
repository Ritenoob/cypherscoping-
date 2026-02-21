import { TradingExecutorAgent } from '../src/agents/trading-executor-agent';
import { AgentContext } from '../src/types';
import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';

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

describe('TradingExecutorAgent safety guards', () => {
  function makeOpenSignalContext(options?: {
    regime?: 'trending' | 'ranging' | 'volatile';
    strength?: 'weak' | 'moderate' | 'strong' | 'extreme';
    riskAssessment?: 'low' | 'medium' | 'high';
    balance?: number;
  }): AgentContext {
    const regime = options?.regime || 'trending';
    const strength = options?.strength || 'strong';
    return {
      symbol: 'ETHUSDTM',
      timeframe: '30min',
      balance: options?.balance || 10000,
      positions: [],
      openOrders: [],
      isLiveMode: false,
      marketData: {
        ohlcv: [{ timestamp: Date.now(), open: 100, high: 101, low: 99, close: 100, volume: 10000 }],
        orderBook: null,
        tradeFlow: null,
        signal: {
          compositeScore: 120,
          authorized: true,
          side: 'long',
          confidence: 85,
          triggerCandle: null,
          windowExpires: null,
          indicatorScores: new Map(),
          microstructureScore: 0,
          blockReasons: [],
          confirmations: 0,
          timestamp: Date.now(),
          signalStrength: strength,
          signalType: 'trend',
          signalSource: 'test'
        },
        aiAnalysis: {
          recommendation: 'buy',
          confidence: 85,
          reasoning: [],
          riskAssessment: options?.riskAssessment || 'low',
          marketRegime: regime,
          suggestedAction: { type: 'entry' }
        }
      }
    };
  }

  function makeCloseSignalContext(options: {
    openedAt: number;
    pnlPercent: number;
    regime?: 'trending' | 'ranging' | 'volatile';
  }): AgentContext {
    const regime = options.regime || 'trending';
    return {
      symbol: 'ETHUSDTM',
      timeframe: '30min',
      balance: 10000,
      positions: [
        {
          symbol: 'ETHUSDTM',
          side: 'long',
          entryPrice: 100,
          size: 1,
          leverage: 10,
          stopLoss: 95,
          takeProfit: 120,
          timestamp: options.openedAt,
          pnl: options.pnlPercent,
          pnlPercent: options.pnlPercent
        }
      ],
      openOrders: [],
      isLiveMode: false,
      marketData: {
        ohlcv: [{ timestamp: Date.now(), open: 100, high: 101, low: 99, close: 100, volume: 10000 }],
        orderBook: null,
        tradeFlow: null,
        signal: {
          compositeScore: 90,
          authorized: true,
          side: 'long',
          confidence: 82,
          triggerCandle: null,
          windowExpires: null,
          indicatorScores: new Map(),
          microstructureScore: 0,
          blockReasons: [],
          confirmations: 0,
          timestamp: Date.now(),
          signalStrength: 'strong',
          signalType: 'trend',
          signalSource: 'test'
        },
        aiAnalysis: {
          recommendation: 'buy',
          confidence: 82,
          reasoning: [],
          riskAssessment: 'low',
          marketRegime: regime,
          suggestedAction: { type: 'wait' }
        }
      }
    };
  }

  test('blocks denied symbol in direct trade path', async () => {
    await withEnv({ TRADING_MODE: 'paper', SIMULATION: 'false' }, async () => {
      const agent = new TradingExecutorAgent();
      await agent.initialize();
      const result = await agent.executeDirectTrade('BTC/USDT', 'buy', 1);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('E_SYMBOL_DENIED');
      await agent.shutdown();
    });
  });

  test('blocks duplicate manual orders via idempotency policy', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'cypher-idem-'));
    const storePath = path.join(tempDir, 'idempotency-store.json');
    await withEnv({ TRADING_MODE: 'paper', SIMULATION: 'false', IDEMPOTENCY_STORE_PATH: storePath }, async () => {
      const agent = new TradingExecutorAgent();
      await agent.initialize();

      const first = await agent.executeDirectTrade('ETHUSDTM', 'buy', 1);
      expect(first.success).toBe(true);

      const second = await agent.executeDirectTrade('ETHUSDTM', 'buy', 1);
      expect(second.success).toBe(false);
      expect(second.errorCode).toBe('E_DUPLICATE_ORDER');
      await agent.shutdown();
    });
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('persists idempotency keys across restarts', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'cypher-idem-'));
    const storePath = path.join(tempDir, 'idempotency-store.json');
    await withEnv(
      {
        TRADING_MODE: 'paper',
        SIMULATION: 'false',
        IDEMPOTENCY_STORE_PATH: storePath
      },
      async () => {
        const firstAgent = new TradingExecutorAgent();
        await firstAgent.initialize();
        const first = await firstAgent.executeDirectTrade('ETHUSDTM', 'buy', 1);
        expect(first.success).toBe(true);
        await firstAgent.shutdown();

        const secondAgent = new TradingExecutorAgent();
        await secondAgent.initialize();
        const second = await secondAgent.executeDirectTrade('ETHUSDTM', 'buy', 1);
        expect(second.success).toBe(false);
        expect(second.errorCode).toBe('E_DUPLICATE_ORDER');
        await secondAgent.shutdown();
      }
    );
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('uses time-based invalidation exit for stale low-ROI positions', async () => {
    await withEnv({ TRADING_MODE: 'paper', SIMULATION: 'false' }, async () => {
      const agent = new TradingExecutorAgent();
      await agent.initialize();
      const stalePositionTimestamp = Date.now() - 4 * 60 * 60 * 1000;
      const context: AgentContext = {
        symbol: 'ETHUSDTM',
        timeframe: '30min',
        balance: 10000,
        positions: [
          {
            symbol: 'ETHUSDTM',
            side: 'long',
            entryPrice: 100,
            size: 1,
            leverage: 5,
            stopLoss: 95,
            takeProfit: 130,
            timestamp: stalePositionTimestamp,
            pnl: 0.5,
            pnlPercent: 0.5
          }
        ],
        openOrders: [],
        isLiveMode: false,
        marketData: {
          ohlcv: [{ timestamp: Date.now(), open: 100, high: 101, low: 99, close: 100, volume: 10000 }],
          orderBook: null,
          tradeFlow: null,
          signal: {
            compositeScore: 90,
            authorized: true,
            side: 'long',
            confidence: 85,
            triggerCandle: null,
            windowExpires: null,
            indicatorScores: new Map(),
            microstructureScore: 0,
            blockReasons: [],
            confirmations: 0,
            timestamp: Date.now(),
            signalStrength: 'strong',
            signalType: 'trend',
            signalSource: 'test'
          },
          aiAnalysis: {
            recommendation: 'buy',
            confidence: 85,
            reasoning: [],
            riskAssessment: 'low',
            marketRegime: 'trending',
            suggestedAction: { type: 'entry' }
          }
        }
      };
      const result = await agent.execute(context);
      expect(result.success).toBe(true);
      expect(result.action?.type).toBe('close-position');
      expect(result.action?.reason).toMatch(/time-based invalidation/i);
      await agent.shutdown();
    });
  });

  test('rejects live mode when simulation is enabled', async () => {
    await withEnv(
      {
        TRADING_MODE: 'live',
        SIMULATION: 'true',
        KUCOIN_API_KEY: undefined,
        KUCOIN_API_SECRET: undefined,
        KUCOIN_API_PASSPHRASE: undefined
      },
      async () => {
        const agent = new TradingExecutorAgent();
        await expect(agent.initialize()).rejects.toThrow(/live mode cannot use simulation adapter/i);
      }
    );
  });

  test('requires KuCoin credentials in live mode', async () => {
    await withEnv(
      {
        TRADING_MODE: 'live',
        SIMULATION: 'false',
        KUCOIN_API_KEY: undefined,
        KUCOIN_API_SECRET: undefined,
        KUCOIN_API_PASSPHRASE: undefined
      },
      async () => {
        const agent = new TradingExecutorAgent();
        await expect(agent.initialize()).rejects.toThrow(/requires KUCOIN_API_KEY/i);
      }
    );
  });

  test('blocks execution when authorized signal has null side', async () => {
    await withEnv({ TRADING_MODE: 'paper', SIMULATION: 'false' }, async () => {
      const agent = new TradingExecutorAgent();
      await agent.initialize();

      const context: AgentContext = {
        symbol: 'ETHUSDTM',
        timeframe: '30min',
        balance: 10000,
        positions: [],
        openOrders: [],
        isLiveMode: false,
        marketData: {
          ohlcv: [{ timestamp: Date.now(), open: 1, high: 1, low: 1, close: 1, volume: 1 }],
          orderBook: null,
          tradeFlow: null,
          signal: {
            compositeScore: 100,
            authorized: true,
            side: null,
            confidence: 90,
            triggerCandle: null,
            windowExpires: null,
            indicatorScores: new Map(),
            microstructureScore: 0,
            blockReasons: [],
            confirmations: 0,
            timestamp: Date.now()
          },
          aiAnalysis: {
            recommendation: 'buy',
            confidence: 90,
            reasoning: [],
            riskAssessment: 'low',
            marketRegime: 'trending',
            suggestedAction: { type: 'entry' }
          }
        }
      };

      const result = await agent.execute(context);
      expect(result.success).toBe(true);
      expect(result.action?.type).toBe('wait');
      expect(result.action?.reason).toMatch(/missing side/i);
      await agent.shutdown();
    });
  });

  test('blocks weak signals in volatile regime by regime policy', async () => {
    await withEnv({ TRADING_MODE: 'paper', SIMULATION: 'false' }, async () => {
      const agent = new TradingExecutorAgent();
      await agent.initialize();

      const context = makeOpenSignalContext({ regime: 'volatile', strength: 'moderate' });
      const result = await agent.execute(context);
      expect(result.success).toBe(true);
      expect(result.action?.type).toBe('wait');
      expect(String(result.action?.reason || '')).toMatch(/strength .* below .* requirement/i);
      await agent.shutdown();
    });
  });

  test('blocks ranging regime when globally disallowed', async () => {
    await withEnv({ TRADING_MODE: 'paper', SIMULATION: 'false', ALLOWED_REGIMES: 'trending,volatile' }, async () => {
      const agent = new TradingExecutorAgent();
      await agent.initialize();

      const context = makeOpenSignalContext({ regime: 'ranging', strength: 'strong' });
      const result = await agent.execute(context);
      expect(result.success).toBe(true);
      expect(result.action?.type).toBe('wait');
      expect(String(result.action?.reason || '')).toMatch(/blocked by global policy/i);
      await agent.shutdown();
    });
  });

  test('uses smaller position size in volatile regime than trending', async () => {
    await withEnv({ TRADING_MODE: 'paper', SIMULATION: 'false', IDEMPOTENCY_WINDOW_MS: '100' }, async () => {
      const agent = new TradingExecutorAgent();
      await agent.initialize();

      const trendingContext = makeOpenSignalContext({ regime: 'trending', strength: 'strong', balance: 100000 });
      const volatileContext = makeOpenSignalContext({ regime: 'volatile', strength: 'strong', balance: 100000 });
      const baseTs = Date.now();
      if (trendingContext.marketData.signal) trendingContext.marketData.signal.timestamp = baseTs;
      if (volatileContext.marketData.signal) volatileContext.marketData.signal.timestamp = baseTs + 200;

      const trendingResult = await agent.execute(trendingContext);
      const volatileResult = await agent.execute(volatileContext);

      expect(trendingResult.success).toBe(true);
      expect(volatileResult.success).toBe(true);
      expect(trendingResult.action?.type).toBe('open-position');
      expect(volatileResult.action?.type).toBe('open-position');
      expect(Number(volatileResult.action?.size || 0)).toBeLessThan(Number(trendingResult.action?.size || 0));
      await agent.shutdown();
    });
  });

  test('killswitch disables degrading regime+feature after repeated losses', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'cypher-killswitch-'));
    const storePath = path.join(tempDir, 'idempotency-store.json');
    await withEnv(
      {
        TRADING_MODE: 'paper',
        SIMULATION: 'false',
        IDEMPOTENCY_WINDOW_MS: '100',
        IDEMPOTENCY_STORE_PATH: storePath,
        MIN_FEATURE_SAMPLE: '99',
        KILLSWITCH_WINDOW_TRADES: '4',
        KILLSWITCH_MIN_TRADES: '4',
        KILLSWITCH_MIN_EXPECTANCY: '-0.1',
        KILLSWITCH_MIN_PROFIT_FACTOR: '0.8',
        KILLSWITCH_MAX_DRAWDOWN: '1.5'
      },
      async () => {
        const agent = new TradingExecutorAgent();
        await agent.initialize();
        const staleOpenedAt = Date.now() - 4 * 60 * 60 * 1000;
        const baseTs = Date.now();

        for (let i = 0; i < 4; i++) {
          const openContext = makeOpenSignalContext({ regime: 'trending', strength: 'strong' });
          if (openContext.marketData.signal) openContext.marketData.signal.timestamp = baseTs + i * 200;
          const openResult = await agent.execute(openContext);
          expect(openResult.success).toBe(true);
          expect(openResult.action?.type).toBe('open-position');

          const closeContext = makeCloseSignalContext({ openedAt: staleOpenedAt, pnlPercent: -1, regime: 'trending' });
          if (closeContext.marketData.signal) closeContext.marketData.signal.timestamp = baseTs + i * 200 + 100;
          const closeResult = await agent.execute(closeContext);
          expect(closeResult.success).toBe(true);
          expect(closeResult.action?.type).toBe('close-position');
        }

        const blockedContext = makeOpenSignalContext({ regime: 'trending', strength: 'strong' });
        if (blockedContext.marketData.signal) blockedContext.marketData.signal.timestamp = baseTs + 2000;
        const blockedResult = await agent.execute(blockedContext);
        expect(blockedResult.success).toBe(true);
        expect(blockedResult.action?.type).toBe('wait');
        expect(String(blockedResult.action?.reason || '')).toMatch(/feature temporarily disabled/i);
        await agent.shutdown();
      }
    );
    rmSync(tempDir, { recursive: true, force: true });
  });
});
