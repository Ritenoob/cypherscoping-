export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookSnapshot {
  bids: [number, number][];
  asks: [number, number][];
  timestamp: number;
}

export interface TradeFlow {
  buyVolume: number;
  sellVolume: number;
  buyCount: number;
  sellCount: number;
  timestamp: number;
}

export interface IndicatorResult {
  name: string;
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
  details?: Record<string, any>;
}

export interface CompositeSignal {
  compositeScore: number;
  authorized: boolean;
  side: 'long' | 'short' | null;
  confidence: number;
  triggerCandle: number | null;
  windowExpires: number | null;
  indicatorScores: Map<string, number>;
  microstructureScore: number;
  blockReasons: string[];
  confirmations: number;
  timestamp: number;
  signalStrength?: 'extreme' | 'strong' | 'moderate' | 'weak' | null;
  signalType?: 'divergence' | 'crossover' | 'squeeze' | 'golden_death_cross' | 'trend' | 'oversold' | 'overbought' | null;
  signalSource?: string;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  size: number;
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  timestamp: number;
  pnl: number;
  pnlPercent: number;
}

export interface RiskParameters {
  maxPositionSize: number;
  maxLeverage: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxDrawdown: number;
  maxOpenPositions: number;
}

export interface AIAnalysis {
  recommendation: 'buy' | 'sell' | 'hold';
  confidence: number;
  reasoning: string[];
  riskAssessment: 'low' | 'medium' | 'high';
  marketRegime: 'trending' | 'ranging' | 'volatile';
  suggestedAction: {
    type: 'entry' | 'exit' | 'adjust' | 'wait';
    side?: 'long' | 'short';
    size?: number;
    leverage?: number;
  };
}

export interface AgentContext {
  symbol: string;
  correlationId?: string;
  timeframe: string;
  balance: number;
  positions: Position[];
  openOrders: any[];
  isLiveMode: boolean;
  executionOptions?: AgentExecutionOptions;
  marketData: {
    ohlcv: OHLCV[];
    orderBook: OrderBookSnapshot | null;
    tradeFlow: TradeFlow | null;
    microstructure?: any;
    signal?: CompositeSignal;
    aiAnalysis?: AIAnalysis;
  };
}

export interface AgentResult {
  success: boolean;
  action?: any;
  signal?: CompositeSignal;
  aiAnalysis?: AIAnalysis;
  errorCode?: string;
  meta?: {
    durationMs?: number;
    toolsScope?: 'restricted' | 'all';
  };
  error?: string;
}

export interface AgentExecutionOptions {
  allToolsAllowed: boolean;
  optimizeExecution: boolean;
  enabledTools: string[];
}

export interface OHLCVWithIndex extends OHLCV {
  index: number;
}

export type TradingMode = 'paper' | 'live';

export interface AlertNotification {
  id: string;
  type: 'entry' | 'exit' | 'warning' | 'info';
  symbol: string;
  message: string;
  timestamp: number;
  data?: Record<string, any>;
}

export interface CooldownState {
  symbol: string;
  timeframe: string;
  lastTradeTime: number;
  cooldownMs: number;
}

export interface OrderRequest {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  size: number;
  price?: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  reduceOnly?: boolean;
  timestamp: number;
}

export interface OrderResponse {
  id: string;
  success: boolean;
  orderId?: string;
  price?: number;
  size?: number;
  filledSize?: number;
  fee?: number;
  timestamp: number;
  error?: string;
}

export interface CoinRankerEntry {
  symbol: string;
  rank: number;
  score: number;
  volume24h: number;
  change24h: number;
  regime: string;
  signal: CompositeSignal | null;
}
