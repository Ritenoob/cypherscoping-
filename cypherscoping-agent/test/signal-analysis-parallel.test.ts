import { SignalAnalysisAgent } from '../src/agents/signal-analysis-agent';
import { AuditLogger } from '../src/core/audit-logger';
import { AgentContext, OHLCVWithIndex } from '../src/types';

describe('SignalAnalysisAgent Parallel Scoring', () => {
  let agent: SignalAnalysisAgent;
  let auditLoggerSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.ENABLE_SIGNAL_NORMALIZER = 'true';
    process.env.TRADING_MODE = 'paper';

    agent = new SignalAnalysisAgent();
    auditLoggerSpy = jest.spyOn(AuditLogger.prototype, 'log');
  });

  afterEach(() => {
    delete process.env.ENABLE_SIGNAL_NORMALIZER;
    jest.restoreAllMocks();
  });

  it('should run both scorers in parallel and attach normalized result', async () => {
    const mockOHLCV: OHLCVWithIndex[] = Array.from({ length: 100 }, (_, i) => ({
      timestamp: Date.now() - (100 - i) * 60000,
      open: 2000 + i * 0.5,
      high: 2005 + i * 0.5,
      low: 1995 + i * 0.5,
      close: 2000 + i * 0.5,
      volume: 1000000,
      index: i
    }));

    const context: AgentContext = {
      symbol: 'ETHUSDTM',
      correlationId: 'test-correlation-id',
      timeframe: '15m',
      balance: 10000,
      positions: [],
      openOrders: [],
      isLiveMode: false,
      marketData: {
        ohlcv: mockOHLCV,
        orderBook: null,
        tradeFlow: null,
        microstructure: {
          buySellRatio: { ratio: 0.75, buyVolume: 75000, sellVolume: 25000 },
          domImbalance: { value: 0.2 }
        }
      }
    };

    const signalContext = {
      prevScore: 0,
      isChoppy: false,
      atrPercent: 1.5,
      candleIndex: 100,
      mtfAligned: true,
      conflictingSignals: 0
    };

    const signal = await (agent as any).generateSignal(
      context,
      mockOHLCV,
      signalContext
    );

    expect(signal.normalizedResult).toBeDefined();
    expect(signal.normalizedResult).toHaveProperty('normalizedScore');
    expect(signal.normalizedResult).toHaveProperty('normalizedTier');
    expect(signal.normalizedResult).toHaveProperty('normalizedConfidence');
    expect(signal.normalizedResult).toHaveProperty('signalPriorityBreakdown');
    expect(signal.normalizedResult).toHaveProperty('strengthMultipliersUsed');

    const auditCalls = auditLoggerSpy.mock.calls;
    const comparisonEvent = auditCalls.find(
      call => call[0].eventType === 'parallel_score_comparison'
    );

    expect(comparisonEvent).toBeDefined();
    expect(comparisonEvent![0].payload).toHaveProperty('currentScore');
    expect(comparisonEvent![0].payload).toHaveProperty('normalizedScore');
    expect(comparisonEvent![0].payload).toHaveProperty('currentTier');
    expect(comparisonEvent![0].payload).toHaveProperty('normalizedTier');
    expect(comparisonEvent![0].payload).toHaveProperty('agreement');
  });

  it('should continue with main signal if normalizer throws error', async () => {
    const normalizerSpy = jest.spyOn((agent as any).signalNormalizer, 'generateComposite');
    normalizerSpy.mockImplementation(() => {
      throw new Error('Normalizer test error');
    });

    const mockOHLCV: OHLCVWithIndex[] = Array.from({ length: 50 }, (_, i) => ({
      timestamp: Date.now() - (50 - i) * 60000,
      open: 2000,
      high: 2005,
      low: 1995,
      close: 2000,
      volume: 1000000,
      index: i
    }));

    const context: AgentContext = {
      symbol: 'ETHUSDTM',
      correlationId: 'test-correlation-id-error',
      timeframe: '15m',
      balance: 10000,
      positions: [],
      openOrders: [],
      isLiveMode: false,
      marketData: {
        ohlcv: mockOHLCV,
        orderBook: null,
        tradeFlow: null,
        microstructure: {
          buySellRatio: { ratio: 0.5, buyVolume: 50000, sellVolume: 50000 },
          domImbalance: { value: 0 }
        }
      }
    };

    const signalContext = {
      prevScore: 0,
      isChoppy: false,
      atrPercent: 1.0,
      candleIndex: 50,
      mtfAligned: true,
      conflictingSignals: 0
    };

    const signal = await (agent as any).generateSignal(
      context,
      mockOHLCV,
      signalContext
    );

    expect(signal).toBeDefined();
    expect(signal).toHaveProperty('compositeScore');
    expect(signal.normalizedResult).toBeUndefined();

    const auditCalls = auditLoggerSpy.mock.calls;
    const errorEvent = auditCalls.find(
      call => call[0].eventType === 'normalizer_error'
    );

    expect(errorEvent).toBeDefined();
    expect(errorEvent![0].payload).toHaveProperty('error');
  });

  it('should skip normalizer when ENABLE_SIGNAL_NORMALIZER=false', async () => {
    process.env.ENABLE_SIGNAL_NORMALIZER = 'false';

    const mockOHLCV: OHLCVWithIndex[] = Array.from({ length: 75 }, (_, i) => ({
      timestamp: Date.now() - (75 - i) * 60000,
      open: 2000 + i * 0.5,
      high: 2005 + i * 0.5,
      low: 1995 + i * 0.5,
      close: 2000 + i * 0.5,
      volume: 1000000,
      index: i
    }));

    const context: AgentContext = {
      symbol: 'ETHUSDTM',
      correlationId: 'test-correlation-id-disabled',
      timeframe: '15m',
      balance: 10000,
      positions: [],
      openOrders: [],
      isLiveMode: false,
      marketData: {
        ohlcv: mockOHLCV,
        orderBook: null,
        tradeFlow: null,
        microstructure: {
          buySellRatio: { ratio: 0.8, buyVolume: 80000, sellVolume: 20000 },
          domImbalance: { value: 0.3 }
        }
      }
    };

    const signalContext = {
      prevScore: 0,
      isChoppy: false,
      atrPercent: 2.0,
      candleIndex: 75,
      mtfAligned: true,
      conflictingSignals: 0
    };

    const signal = await (agent as any).generateSignal(
      context,
      mockOHLCV,
      signalContext
    );

    expect(signal.normalizedResult).toBeUndefined();

    const auditCalls = auditLoggerSpy.mock.calls;
    const comparisonEvent = auditCalls.find(
      call => call[0].eventType === 'parallel_score_comparison'
    );

    expect(comparisonEvent).toBeUndefined();
  });
});
