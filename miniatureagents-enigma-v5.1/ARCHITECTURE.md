# Miniature Enigma - AI Agent Orchestration Architecture

## System Overview

A self-orchestrating multi-agent trading system where specialized AI workers handle discrete domains. The Master Orchestrator coordinates agents, manages state, and ensures system coherence.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MASTER ORCHESTRATOR                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  State Machine │ Task Queue │ Agent Registry │ Health Monitor       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│  SIGNAL AGENT │         │  RISK AGENT   │         │ EXECUTION     │
│  ─────────────│         │  ─────────────│         │ AGENT         │
│  Indicators   │         │  Position Sz  │         │  ─────────────│
│  Divergence   │         │  Leverage     │         │  Order Book   │
│  Scoring      │         │  Drawdown     │         │  Slippage     │
│  Alignment    │         │  Trailing SL  │         │  Fill Quality │
└───────┬───────┘         └───────┬───────┘         └───────┬───────┘
        │                         │                         │
        └─────────────────────────┼─────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│  DATA AGENT   │         │  OPTIMIZER    │         │  AUDIT AGENT  │
│  ─────────────│         │  AGENT        │         │  ─────────────│
│  Candle Fetch │         │  ─────────────│         │  Invariants   │
│  WS Streams   │         │  Backtest     │         │  Logging      │
│  API Calls    │         │  Walk-Forward │         │  Compliance   │
│  Rate Limit   │         │  Param Tuning │         │  Metrics      │
└───────────────┘         └───────────────┘         └───────────────┘
```

---

## Agent Definitions

### 1. MASTER ORCHESTRATOR (`agents/orchestrator.js`)

**Role**: Central coordinator. Maintains global state, routes tasks, handles inter-agent communication.

**Responsibilities**:
- Task queue management (priority-based FIFO)
- Agent lifecycle (spawn, health-check, restart)
- State persistence (Redis/file-based)
- Deadlock detection and resolution
- Emergency shutdown protocol

**State Machine States**:
```
INITIALIZING → READY → TRADING → PAUSED → EMERGENCY_STOP → SHUTDOWN
                ↑         │          │
                └─────────┴──────────┘
```

**Invariants**:
- Never execute trade without Risk Agent approval
- Never exceed MAX_CONCURRENT_TASKS (default: 10)
- Health check all agents every 30 seconds

---

### 2. SIGNAL AGENT (`agents/signal-agent.js`)

**Role**: Technical analysis engine. Computes all indicators, detects patterns, generates trade signals.

**Sub-Workers**:
| Worker | Domain | Hot Path |
|--------|--------|----------|
| `IndicatorWorker` | RSI, MACD, Williams%R, AO, Stoch, BB, EMA, KDJ, OBV | Yes |
| `DivergenceWorker` | Regular/Hidden divergence detection | Yes |
| `PatternWorker` | Chart patterns (head/shoulders, wedges) | No |
| `AlignmentWorker` | Multi-timeframe confluence | Yes |

**Output Schema**:
```typescript
interface SignalOutput {
  symbol: string;
  direction: 'long' | 'short' | 'neutral';
  score: number;           // -130 to +130
  confidence: number;      // 0-100%
  indicators: IndicatorBreakdown[];
  signals: DetectedSignal[];
  alignment: 'full' | 'partial' | 'divergent';
  timestamp: number;
}
```

**Performance Target**: < 50ms per symbol per timeframe

---

### 3. RISK AGENT (`agents/risk-agent.js`)

**Role**: Gatekeeper. Every trade must pass through Risk Agent before execution.

**Validation Checklist**:
```
□ Position size ≤ MAX_POSITION_PERCENT
□ Leverage ≤ volatility-adjusted max
□ Daily drawdown < MAX_DAILY_DRAWDOWN
□ Consecutive losses < MAX_CONSECUTIVE_LOSSES
□ Correlation check (no overexposure to correlated assets)
□ Fee-adjusted break-even is achievable
□ Liquidation price buffer ≥ 5%
```

**Formulas** (all use Decimal.js):

**Break-Even ROI** (fee-adjusted):
```
BE_ROI = (TAKER_FEE × 2) × leverage × 100 + BUFFER
       = (0.0006 × 2) × 50 × 100 + 0.05
       = 6.05%  // At 50x, you need 6.05% ROI to break even
```

**Inverse Leverage Scaling**:
```
adjustedRisk = baseRisk × (100 / leverage)
// At 100x: risk = 0.5% × (100/100) = 0.5%
// At 50x:  risk = 0.5% × (100/50)  = 1.0%
// At 25x:  risk = 0.5% × (100/25)  = 2.0%
```

**Stop Loss Price (Long)**:
```
SL_price = entry × (1 - (SL_ROI / leverage / 100))
// Entry: $100, SL_ROI: 0.5%, Leverage: 50x
// SL_price = 100 × (1 - (0.5 / 50 / 100)) = $99.99
```

**Trailing Stop (Staircase Logic)**:
```
IF current_ROI ≥ TRAIL_ACTIVATION:
  trail_level = floor(current_ROI / STEP_SIZE) × STEP_SIZE
  new_stop = MAX(current_stop, entry × (1 + (trail_level - TRAIL_DISTANCE) / leverage / 100))
  // NEVER untrail: new_stop must be ≥ current_stop
```

---

### 4. EXECUTION AGENT (`agents/execution-agent.js`)

**Role**: Order management. Handles order placement, modification, cancellation, fill tracking.

**Order Flow**:
```
Signal → Risk Approval → Price Discovery → Order Placement → Fill Tracking → Position Update
```

**9th Level Entry Logic**:
```javascript
// Use 9th bid/ask level for better fills
const entryPrice = direction === 'long' 
  ? orderBook.bids[8].price  // 9th level bid
  : orderBook.asks[8].price; // 9th level ask

// Abort if slippage exceeds threshold
if (Math.abs(entryPrice - midPrice) / midPrice > MAX_SLIPPAGE) {
  return { ok: false, error: 'SLIPPAGE_EXCEEDED' };
}
```

**Order Types Supported**:
- `LIMIT` (default for entries)
- `MARKET` (emergency exits only)
- `STOP_MARKET` (stop losses)
- `TAKE_PROFIT_MARKET` (take profits)

---

### 5. DATA AGENT (`agents/data-agent.js`)

**Role**: All external data acquisition. WebSocket streams, REST API calls, rate limiting.

**Streams Managed**:
| Stream | Topic | Priority |
|--------|-------|----------|
| Candles | `/contractMarket/candle:{symbol}_{tf}` | Critical |
| Ticker | `/contractMarket/ticker:{symbol}` | High |
| Order Book | `/contractMarket/level2:{symbol}` | High |
| Trades | `/contractMarket/execution:{symbol}` | Medium |
| Funding | Internal polling | Low |

**Rate Limiter** (Token Bucket):
```
Public API:  30 req / 3 sec = 10 req/sec
Private API: 75 req / 3 sec = 25 req/sec

// Burst capacity: 10 tokens
// Refill rate: 10 tokens/second
```

**Circuit Breaker**:
```
States: CLOSED → OPEN → HALF_OPEN → CLOSED
Threshold: 5 consecutive failures
Reset time: 60 seconds
```

---

### 6. OPTIMIZER AGENT (`agents/optimizer-agent.js`)

**Role**: Continuous improvement. Backtesting, walk-forward validation, parameter optimization.

**Optimization Cycle**:
```
1. MEASURE: Collect last N trades performance
2. HYPOTHESIZE: Identify underperforming parameters
3. GENERATE: Create parameter variations (grid/genetic)
4. BACKTEST: Test variations on historical data
5. VALIDATE: Walk-forward on out-of-sample data
6. COMPARE: Statistical significance test (p < 0.05)
7. DEPLOY: If improved, update live config
8. MONITOR: Track live performance vs backtest
```

**Walk-Forward Windows**:
```
Total Data: 90 days
Training: 70% (63 days)
Testing: 30% (27 days)
Windows: 5 (rolling)
Min trades per window: 50
```

**Parameter Ranges**:
```javascript
const PARAM_GRID = {
  RSI_PERIOD: [7, 14, 21],
  RSI_OVERSOLD: [20, 25, 30],
  RSI_OVERBOUGHT: [70, 75, 80],
  SIGNAL_MIN_SCORE: [40, 50, 60, 70],
  STOP_LOSS_ROI: [0.3, 0.5, 0.75, 1.0],
  TAKE_PROFIT_ROI: [1.0, 1.5, 2.0, 2.5, 3.0],
  LEVERAGE_DEFAULT: [25, 50, 75, 100]
};
```

---

### 7. AUDIT AGENT (`agents/audit-agent.js`)

**Role**: Compliance, logging, invariant checking, metrics collection.

**Invariant Checks** (run every tick):
```javascript
const INVARIANTS = [
  // Position invariants
  () => openPositions.size <= MAX_OPEN_POSITIONS,
  () => dailyDrawdown < MAX_DAILY_DRAWDOWN,
  () => consecutiveLosses < MAX_CONSECUTIVE_LOSSES,
  
  // Financial invariants
  () => availableBalance > 0,
  () => totalExposure < MAX_EXPOSURE,
  
  // System invariants
  () => wsConnected === true,
  () => Date.now() - lastHeartbeat < HEARTBEAT_TIMEOUT,
  
  // Safety invariants
  () => mode === 'paper' || hasValidCredentials,
  () => !apiKey.includes('withdrawal')  // Never allow withdrawal perms
];
```

**Metrics Collected**:
```
- win_rate_7d, win_rate_30d
- profit_factor
- sharpe_ratio
- max_drawdown
- avg_trade_duration
- signal_accuracy_by_indicator
- fill_quality (slippage vs expected)
- latency_p50, latency_p95, latency_p99
```

---

## Inter-Agent Communication

**Message Format**:
```typescript
interface AgentMessage {
  id: string;          // UUID
  from: AgentId;
  to: AgentId;
  type: 'REQUEST' | 'RESPONSE' | 'EVENT' | 'COMMAND';
  action: string;
  payload: unknown;
  timestamp: number;
  correlationId?: string;  // For request-response pairing
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
}
```

**Event Bus Topics**:
```
signal.generated     → Risk, Audit
risk.approved        → Execution
risk.rejected        → Audit
order.placed         → Audit
order.filled         → Risk, Audit
position.opened      → All
position.closed      → Optimizer, Audit
health.degraded      → Orchestrator
emergency.stop       → All
```

---

## Knowledge Bank Structure (25GB Allocation)

```
/knowledge-bank/
├── historical-data/           # 15GB - OHLCV data
│   ├── candles/               # By symbol/timeframe
│   ├── orderbook-snapshots/   # L2 snapshots
│   └── trades/                # Tick data
├── backtest-results/          # 3GB
│   ├── runs/                  # Individual backtest outputs
│   ├── comparisons/           # A/B test results
│   └── walk-forward/          # WF validation results
├── model-weights/             # 2GB
│   ├── indicator-weights/     # Optimized weights
│   ├── regime-classifiers/    # Market regime models
│   └── signal-models/         # ML signal models
├── metrics-history/           # 2GB
│   ├── daily/                 # Daily performance
│   ├── trades/                # Individual trade logs
│   └── system/                # System health logs
├── truth-docs/                # 1GB
│   ├── invariants.json        # System invariants
│   ├── formulas.md            # Mathematical formulas
│   ├── api-specs/             # KuCoin API documentation
│   └── failure-modes.md       # Known failure modes
└── cache/                     # 2GB
    ├── indicators/            # Computed indicator cache
    ├── signals/               # Recent signal cache
    └── orderbook/             # Order book cache
```

---

## Startup Sequence

```
1. [Orchestrator] Load config, validate environment
2. [Orchestrator] Initialize knowledge bank connection
3. [Audit Agent] Spawn → run invariant pre-checks
4. [Data Agent] Spawn → establish WebSocket connections
5. [Data Agent] Fetch initial candle history (warm-up)
6. [Signal Agent] Spawn → initialize indicators with history
7. [Risk Agent] Spawn → load position state, calculate exposure
8. [Execution Agent] Spawn → verify API credentials (if live)
9. [Optimizer Agent] Spawn → load baseline metrics
10. [Orchestrator] Transition to READY state
11. [Orchestrator] Begin trading loop
```

---

## Emergency Procedures

**EMERGENCY_STOP Triggers**:
- Daily drawdown exceeds MAX_DAILY_DRAWDOWN
- Consecutive losses exceed MAX_CONSECUTIVE_LOSSES
- API credentials invalid/revoked
- WebSocket disconnected > 60 seconds
- Invariant violation detected
- Manual trigger via dashboard

**EMERGENCY_STOP Actions**:
```
1. Halt all new signal processing
2. Cancel all pending orders
3. Close all open positions (market orders)
4. Persist state to disk
5. Send notifications (webhook/telegram)
6. Log all state for post-mortem
7. Wait for manual intervention
```

---

## Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| Signal Generation Latency | < 50ms | < 200ms |
| Order Placement Latency | < 100ms | < 500ms |
| WebSocket Reconnect | < 5s | < 30s |
| Invariant Check Cycle | < 10ms | < 50ms |
| Memory Usage | < 512MB | < 1GB |
| CPU Usage (idle) | < 5% | < 20% |
| Win Rate | > 65% | > 55% |
| Profit Factor | > 2.0 | > 1.5 |
| Max Drawdown | < 8% | < 15% |

---

## File Manifest

```
agents/
├── orchestrator.js        # Master coordinator
├── signal-agent.js        # Technical analysis
├── risk-agent.js          # Risk management
├── execution-agent.js     # Order management
├── data-agent.js          # Data acquisition
├── optimizer-agent.js     # Continuous improvement
├── audit-agent.js         # Compliance & logging
└── agent-base.js          # Base class for all agents

skills/
├── indicator-calc.js      # Indicator computation skill
├── divergence-detect.js   # Divergence detection skill
├── position-sizing.js     # Position sizing skill
├── backtest-run.js        # Backtesting skill
├── walk-forward.js        # Walk-forward validation
└── metrics-calc.js        # Metrics calculation skill

scripts/
├── build-repo.sh          # Full repo build
├── run-backtest.sh        # Backtest execution
├── optimize-params.sh     # Parameter optimization
├── deploy-live.sh         # Live deployment
└── emergency-stop.sh      # Emergency shutdown
```
