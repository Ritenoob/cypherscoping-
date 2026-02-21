import { RiskManagementAgent } from '../src/agents/risk-management-agent';
import { AgentContext, Position } from '../src/types';

function baseContext(positions: Position[], balance: number): AgentContext {
  return {
    symbol: 'ETHUSDTM',
    timeframe: '30min',
    balance,
    positions,
    openOrders: [],
    isLiveMode: false,
    marketData: {
      ohlcv: [{ timestamp: Date.now(), open: 100, high: 101, low: 99, close: 100, volume: 1000 }],
      orderBook: null,
      tradeFlow: null
    }
  };
}

describe('RiskManagementAgent drawdown behavior', () => {
  test('activates circuit breaker when drawdown exceeds threshold', async () => {
    const agent = new RiskManagementAgent({ maxDrawdown: 10 });
    await agent.initialize();

    const warmup = await agent.execute(baseContext([], 10000));
    expect(warmup.success).toBe(true);

    const losingPosition: Position = {
      symbol: 'ETHUSDTM',
      side: 'long',
      entryPrice: 100,
      size: 1,
      leverage: 5,
      stopLoss: null,
      takeProfit: null,
      timestamp: Date.now(),
      pnl: -4000,
      pnlPercent: -40
    };

    const stressed = await agent.execute(baseContext([losingPosition], 10000));
    expect(stressed.success).toBe(true);
    expect(stressed.action.analysis.drawdownPercent).toBeGreaterThanOrEqual(10);
    expect(stressed.action.analysis.circuitBreakerTriggered).toBe(true);
    expect(stressed.action.recommendations[0]?.type).toBe('circuit-breaker');
  });
});
