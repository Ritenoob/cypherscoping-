# CypherScope File List

## Root Files

| File | Purpose |
|------|---------|
| `package.json` | NPM configuration and dependencies |
| `tsconfig.json` | TypeScript configuration |
| `README.md` | User documentation |
| `ARCHITECTURE.md` | System architecture documentation |
| `DEVELOPMENT_PLAN.md` | Development roadmap |

## Source Files

### Core Types (`src/types.ts`)

```typescript
export interface OHLCV { ... }
export interface OrderBookSnapshot { ... }
export interface TradeFlow { ... }
export interface IndicatorResult { ... }
export interface CompositeSignal { ... }
export interface Position { ... }
export interface RiskParameters { ... }
export interface AIAnalysis { ... }
export interface AgentContext { ... }
export interface AgentResult { ... }
```

### Agent System (`src/agents/`)

| File | Lines | Purpose |
|------|-------|---------|
| `base-agent.ts` | 150+ | Base agent class, memory system, orchestrator |
| `signal-analysis-agent.ts` | 400+ | Williams %R gated signal generation, indicators |
| `risk-management-agent.ts` | 150+ | Position sizing, stop/take profit, drawdown |
| `trading-executor-agent.ts` | 150+ | Order placement, position management |
| `coin-screener-agent.ts` | 250+ | Market scanning, regime detection |
| `orchestrator.ts` | 150+ | Agent coordination, mode management |
| `index.ts` | 10 | Public exports |

## Key Components

### SignalAnalysisAgent

**Indicators Implemented:**
- RSI (Relative Strength Index)
- StochRSI (Stochastic RSI)
- MACD (Moving Average Convergence Divergence)
- Bollinger Bands
- Williams %R (Primary Trigger)
- Stochastic
- KDJ Oscillator
- EMA (10, 25, 50)
- Awesome Oscillator
- OBV (On Balance Volume)
- CMF (Chaikin Money Flow)

**Scoring System:**
- Range: -220 to +220
- Weights: Per-indicator configurable
- Caps: 200 per indicator, 20 microstructure, 220 total

### RiskManagementAgent

**Risk Parameters:**
- Max Position Size: 2%
- Max Leverage: 10x
- Stop Loss: 6% ROI
- Take Profit: 15% ROI
- Max Drawdown: 3%
- Max Open Positions: 5

### CoinScreenerAgent

**Scanning Features:**
- Multi-symbol scanning
- Signal authorization filtering
- Regime detection (trending/ranging/volatile)
- Opportunity ranking

## Configuration Files

### tsconfig.json

```json
{
  "target": "ES2020",
  "module": "commonjs",
  "strict": true,
  "esModuleInterop": true,
  "declaration": true
}
```

### package.json

```json
{
  "name": "cypherscoping-agent",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js",
    "dev": "ts-node src/main.ts"
  },
  "dependencies": {
    "decimal.js": "^10.4.3",
    "ws": "^8.14.2",
    "axios": "^1.6.2"
  }
}
```

## Total File Count

| Category | Count |
|----------|-------|
| TypeScript Source | 8 files |
| Configuration | 3 files |
| Documentation | 3 files |
| **Total** | **14 files** |

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| decimal.js | ^10.4.3 | Precise financial calculations |
| ws | ^8.14.2 | WebSocket communication |
| axios | ^1.6.2 | HTTP client |
| uuid | ^9.0.1 | Unique ID generation |
| winston | ^3.11.0 | Logging |

## Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.3.3 | TypeScript compiler |
| ts-node | ^10.9.2 | TypeScript execution |
| jest | ^29.7.0 | Testing framework |
