import { RiskManagementAgent } from '../src/agents/risk-management-agent';
import { AgentContext, Position } from '../src/types';

function makePosition(symbol: string, idx: number): Position {
  return {
    symbol: `${symbol}-${idx}`,
    side: 'long',
    entryPrice: 100,
    size: 1,
    leverage: 5,
    stopLoss: null,
    takeProfit: null,
    timestamp: Date.now(),
    pnl: 0,
    pnlPercent: 0
  };
}

function contextFor(positions: Position[]): AgentContext {
  return {
    symbol: 'ETHUSDTM',
    timeframe: '30min',
    balance: 10000,
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

describe('RiskManagementAgent recommendations', () => {
  test('emits max-positions recommendation at configured paper limit', async () => {
    const agent = new RiskManagementAgent({ maxPositionsPaper: 3 });
    await agent.initialize();
    const positions = [makePosition('ETHUSDTM', 1), makePosition('ETHUSDTM', 2), makePosition('ETHUSDTM', 3)];
    const result = await agent.execute(contextFor(positions));
    expect(result.success).toBe(true);
    const hasMaxPositionsRecommendation = result.action.recommendations.some(
      (r: { type: string }) => r.type === 'max-positions'
    );
    expect(hasMaxPositionsRecommendation).toBe(true);
  });
});
