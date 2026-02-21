import { SignalAnalysisAgent } from '../src/agents/signal-analysis-agent';
import { AgentContext, OHLCV } from '../src/types';

function makeCandles(count: number, volume: number): OHLCV[] {
  let price = 100;
  return Array.from({ length: count }, (_, i) => {
    price += i % 2 === 0 ? 1 : -0.2;
    return {
      timestamp: Date.now() - (count - i) * 60_000,
      open: price - 0.4,
      high: price + 0.8,
      low: price - 0.8,
      close: price,
      volume
    };
  });
}

describe('SignalAnalysisAgent quality filters', () => {
  test('blocks low-liquidity signals', async () => {
    const agent = new SignalAnalysisAgent();
    await agent.initialize();
    const context: AgentContext = {
      symbol: 'ETHUSDTM',
      timeframe: '30min',
      balance: 10000,
      positions: [],
      openOrders: [],
      isLiveMode: false,
      marketData: {
        ohlcv: makeCandles(80, 10),
        orderBook: null,
        tradeFlow: null
      }
    };

    const result = await agent.execute(context);
    expect(result.success).toBe(true);
    expect(result.signal?.authorized).toBe(false);
    expect(result.signal?.blockReasons).toContain('low_liquidity');
    await agent.shutdown();
  });
});
