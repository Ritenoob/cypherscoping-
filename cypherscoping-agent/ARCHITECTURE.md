# CypherScope Architecture

## System Overview

CypherScope is an AI-powered cryptocurrency trading agent designed for KuCoin Futures. It uses a multi-agent architecture with specialized agents for signal analysis, risk management, trading execution, and market screening.

## Core Components

### 1. CypherScopeOrchestrator

The main orchestrator that coordinates all agents and manages the trading workflow.

**Responsibilities:**
- Initialize and shutdown all agents
- Route tasks to appropriate agents
- Manage trading mode (manual/algo)
- Handle event propagation

**Key Methods:**
```typescript
initialize(): Promise<void>
analyzeSymbol(symbol: string, ohlcv: OHLCV[]): Promise<AnalysisResult>
scanMarket(): Promise<ScanResult>
executeTrade(symbol: string, action: string): Promise<TradeResult>
setMode(mode: 'manual' | 'algo'): void
```

### 2. SignalAnalysisAgent

Generates trading signals using Williams %R as the primary trigger with multi-indicator confirmation.

**Williams %R Gated Entry:**
- **Long Trigger**: WR crosses UP through -80 (oversold release)
- **Short Trigger**: WR crosses DOWN through -20 (overbought release)
- **Confirmation Window**: ±1 candle from trigger

**Indicators Analyzed:**
- Williams %R (primary trigger)
- RSI, StochRSI (momentum)
- MACD (trend)
- Bollinger Bands (volatility)
- Stochastic, KDJ (momentum)
- OBV, CMF (volume/money flow)
- EMA (trend structure)

**Output:**
```typescript
interface CompositeSignal {
  compositeScore: number;      // -220 to +220
  authorized: boolean;         // Entry gate passed
  side: 'long' | 'short';      // Trade direction
  confidence: number;          // 0-100
  triggerCandle: number | null;
  windowExpires: number | null;
  blockReasons: string[];      // Why signal was blocked
  confirmations: number;       // Indicator confirmations
}
```

### 3. RiskManagementAgent

Calculates position sizes, sets stop/take profit levels, and monitors risk exposure.

**Risk Parameters:**
```typescript
{
  maxPositionSize: 0.02,    // 2% of balance
  maxLeverage: 10,
  stopLossPercent: 0.06,    // 6% ROI
  takeProfitPercent: 0.15,  // 15% ROI
  maxDrawdown: 0.03,        // 3% daily
  maxOpenPositions: 5
}
```

**Calculations:**
- Position Size = Balance × Risk% × ConfidenceMultiplier
- Stop Loss (Long) = Entry × (1 - SL_ROI / Leverage / 100)
- Take Profit (Long) = Entry × (1 + TP_ROI / Leverage / 100)

### 4. TradingExecutorAgent

Executes orders via KuCoin API and manages position lifecycle.

**Order Types:**
- Market orders for entry
- Take profit orders for exit targets
- Stop loss orders for risk control

**Position Management:**
- Trail stop activation at 2% ROI
- Break-even move after 1% ROI
- Partial exits at 4%, 8%, 12% ROI

### 5. CoinScreenerAgent

Scans markets for trading opportunities and categorizes by market regime.

**Screening Criteria:**
- Signal authorization
- Composite score threshold
- Volume ratio
- Liquidity

**Regime Detection:**
- **Trending**: ADX > 25, clear price direction
- **Ranging**: Low ADX, sideways movement
- **Volatile**: High ATR%, choppy price action

## Data Flow

```
1. Market Data (OHLCV) → Signal Analysis Agent
2. Signal → Risk Management Agent (position sizing)
3. Risk → Trading Executor Agent (order placement)
4. All Agents → Orchestrator (coordination)
5. Orchestrator → KuCoin API (execution)
```

## Trading Modes

### Algo Mode
- Fully automated signal generation and execution
- No human intervention required
- Uses all agents in pipeline

### Manual Mode
- Signals generated but not executed
- User approves trades
- Risk analysis always active

## File Structure

```
cypherscoping-agent/
├── src/
│   ├── main.ts                    # Entry point
│   ├── types.ts                   # Type definitions
│   └── agents/
│       ├── base-agent.ts          # Agent base class
│       ├── signal-analysis-agent.ts
│       ├── risk-management-agent.ts
│       ├── trading-executor-agent.ts
│       ├── coin-screener-agent.ts
│       ├── orchestrator.ts
│       └── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Integration Points

### KuCoin API
- WebSocket for real-time data
- REST API for order execution
- Authentication via API keys

### TradingView
- Indicator parameters from screenshots
- Confirmation rules from screenshots
- Alert integration ready

## Performance Targets

- **Latency**: < 100ms per signal
- **Throughput**: 100+ symbols scanned/minute
- **Memory**: < 50MB per agent
- **Uptime**: 99.9%

## Security

- API keys encrypted at rest
- No sensitive data in logs
- Sandboxed execution environment
- Rate limiting on all APIs
