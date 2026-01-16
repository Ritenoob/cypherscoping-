# Miniature Enigma - Development & Production Plan

## Executive Summary

Multi-phase build of an AI agent-orchestrated trading system for KuCoin Futures. Target metrics: >65% win rate, >2.0 profit factor, <8% max drawdown.

---

## Phase 1: Foundation (Days 1-3)

### 1.1 Core Infrastructure
- [x] Agent base class with lifecycle, health, messaging
- [x] Orchestrator for agent coordination
- [x] Signal Agent with 10 indicators
- [x] Risk Agent with position sizing, leverage, trailing stops
- [ ] Data Agent for WebSocket streams
- [ ] Execution Agent for order management
- [ ] Audit Agent for logging/compliance

### 1.2 Truth Documents
- [x] Mathematical formulas (Decimal.js)
- [x] System invariants
- [x] Failure modes catalog
- [ ] API specification docs

### 1.3 Build System
- [x] Full repo scaffold script
- [x] Test runner
- [x] Health check

**Deliverables**: Working agent orchestration, signal generation, risk validation

---

## Phase 2: Data Layer (Days 4-6)

### 2.1 Data Agent Implementation
```
Tasks:
- WebSocket connection manager (token refresh)
- Rate limiter (token bucket)
- Circuit breaker for API resilience
- Candle buffer management
- Order book L2 streaming
- Trade flow aggregation
```

### 2.2 Historical Data Pipeline
```
Tasks:
- Fetch 90+ days candles per symbol
- Store in knowledge-bank/historical-data/
- Implement data validation
- Build incremental update system
```

### 2.3 Caching Layer
```
Tasks:
- Indicator cache (Redis-like in-memory)
- Order book snapshot cache
- Signal cache for deduplication
```

**Deliverables**: Robust data infrastructure, 90-day historical data

---

## Phase 3: Execution & Position Management (Days 7-10)

### 3.1 Execution Agent
```
Tasks:
- 9th level order book entry pricing
- Slippage estimation & control
- Order placement (limit/market/stop)
- Fill tracking & reconciliation
- Position lifecycle management
```

### 3.2 Position Manager
```
State Machine:
  SIGNAL → PENDING → OPEN → TRAILING → CLOSED
  
Invariants:
- Every position has SL order
- Trailing stop never untrails
- Max 5 concurrent positions
```

### 3.3 Order Types
```javascript
const ORDER_TYPES = {
  ENTRY_LIMIT: { side: 'buy|sell', price: '9th_level' },
  STOP_LOSS: { type: 'stop_market', trigger: 'last_price' },
  TAKE_PROFIT: { type: 'take_profit_market' },
  TRAILING_STOP: { type: 'trailing_stop', callback: 'staircase' }
};
```

**Deliverables**: Production-ready order execution, position tracking

---

## Phase 4: Optimization Engine (Days 11-15)

### 4.1 Backtest Engine
```
Features:
- Multi-symbol concurrent backtesting
- Realistic fee simulation (taker+taker)
- Slippage modeling
- Funding rate accounting
- Equity curve generation
```

### 4.2 Walk-Forward Validation
```
Configuration:
  Total data: 90 days
  Training window: 70% (63 days)
  Testing window: 30% (27 days)
  Rolling windows: 5
  Min trades per window: 50
```

### 4.3 Parameter Optimizer
```
Methods:
- Grid search for initial sweep
- Genetic algorithm for fine-tuning
- Bayesian optimization for exploration

Parameters to optimize:
- Signal thresholds (40-80)
- Stop loss ROI (0.3-1.5)
- Take profit ROI (1.0-4.0)
- Indicator weights (relative)
```

**Deliverables**: Robust backtest engine, walk-forward validation system

---

## Phase 5: ML Integration (Days 16-20)

### 5.1 Regime Classifier
```
Market regimes:
- TRENDING_UP: EMA alignment bullish, low volatility
- TRENDING_DOWN: EMA alignment bearish, low volatility
- RANGING: No clear trend, bounded price action
- VOLATILE: ATR% > 3%, increased risk

Adaptation:
- Adjust leverage per regime
- Modify signal thresholds
- Change indicator weights
```

### 5.2 Signal Confidence Scoring
```
Ensemble model combining:
- Technical indicator agreement
- Volume confirmation
- Order flow analysis
- Historical pattern matching
```

### 5.3 Model Storage
```
/knowledge-bank/model-weights/
├── regime-classifier-v1.json
├── signal-confidence-v1.json
└── indicator-weights-v1.json
```

**Deliverables**: Regime classification, adaptive signal scoring

---

## Phase 6: Production Hardening (Days 21-25)

### 6.1 Resilience
```
Patterns:
- Circuit breaker (5 failures → open)
- Exponential backoff (1s base, 30s max)
- Graceful degradation
- Auto-restart on health failure
```

### 6.2 Monitoring
```
Metrics:
- Latency p50/p95/p99
- Win rate (7d/30d rolling)
- Profit factor
- Drawdown tracking
- Agent health status
```

### 6.3 Alerting
```
Triggers:
- Daily drawdown > 3%
- Consecutive losses >= 3
- Agent unhealthy
- API errors > threshold
- Position near liquidation
```

**Deliverables**: Production-grade resilience, monitoring, alerting

---

## Phase 7: Dashboard & API (Days 26-28)

### 7.1 HTTP API
```
Endpoints:
GET  /api/status         - System status
GET  /api/agents         - Agent health
GET  /api/signals        - Recent signals
GET  /api/positions      - Open positions
POST /api/trade/start    - Start trading
POST /api/trade/stop     - Stop trading
POST /api/emergency      - Emergency stop
```

### 7.2 WebSocket Streaming
```
Channels:
- signals: Real-time signal updates
- positions: Position changes
- metrics: Performance metrics
- logs: System logs
```

### 7.3 Dashboard UI
```
Components:
- Signal heatmap (symbol × timeframe)
- Position cards with P&L
- Equity curve chart
- Agent status indicators
- Config editor
```

**Deliverables**: Complete dashboard, real-time monitoring

---

## Phase 8: Live Deployment (Days 29-30)

### 8.1 Pre-Launch Checklist
```
□ All tests passing (100%)
□ Backtest Sharpe > 1.5
□ Walk-forward validation passed
□ Paper trade 7+ days profitable
□ Emergency procedures tested
□ API credentials validated (no withdrawal perms!)
□ IP whitelist configured
□ Alerts configured
□ Monitoring active
```

### 8.2 Staged Rollout
```
Stage 1: Paper mode validation (3 days)
Stage 2: Live with 10% position size (3 days)
Stage 3: Live with 50% position size (3 days)
Stage 4: Full deployment with monitoring
```

### 8.3 Runbook
```
Daily:
- Check daily P&L
- Review signal quality
- Verify all agents healthy

Weekly:
- Run walk-forward validation
- Update indicator weights if needed
- Review and archive logs

Monthly:
- Full backtest with recent data
- Re-optimize parameters
- Security review
```

**Deliverables**: Production deployment, operational runbook

---

## Knowledge Requirements

### Required Data Sources
1. **KuCoin Futures API** - Primary data source
2. **Historical Candles** - 90+ days per symbol
3. **Funding Rate History** - For backtest accuracy
4. **Market Calendar** - Funding times, maintenance windows

### Required Documentation
1. [KuCoin Futures API Docs](https://docs.kucoin.com/futures/)
2. Technical indicator formulas (truth doc)
3. Risk management formulas (truth doc)
4. Agent communication protocols

### Performance Benchmarks
| Metric | Paper Target | Live Target |
|--------|-------------|-------------|
| Win Rate | >60% | >65% |
| Profit Factor | >1.8 | >2.0 |
| Sharpe Ratio | >1.3 | >1.5 |
| Max Drawdown | <12% | <8% |
| Latency (signal) | <100ms | <50ms |
| Uptime | >99% | >99.5% |

---

## AI Agent Skill Requirements

### Custom Skills to Build
1. **indicator-calc.js** - High-performance indicator computation
2. **divergence-detect.js** - Pattern-based divergence detection
3. **position-sizing.js** - Dynamic position sizing based on Kelly criterion
4. **regime-detect.js** - Market regime classification
5. **backtest-run.js** - Backtest execution wrapper
6. **walk-forward.js** - Walk-forward validation
7. **param-optimize.js** - Parameter optimization
8. **alert-notify.js** - Alert routing and notification

---

## Risk Controls Summary

### Hard Limits (Non-Negotiable)
- Max 5 concurrent positions
- Max 5% daily drawdown
- Max 5 consecutive losses
- No withdrawal API permissions
- Stop loss on every position
- Never untrail a trailing stop

### Soft Limits (Configurable)
- Position size: 0.1-5% of balance
- Leverage: 1-100x (volatility-adjusted)
- Signal threshold: 40-80
- Minimum confidence: 30-70%

---

## Success Criteria

### Phase Gate Requirements
| Phase | Criteria |
|-------|----------|
| 1 | Agents communicate, signals generate |
| 2 | WebSocket stable 24h, data complete |
| 3 | Orders execute, positions track |
| 4 | Backtest Sharpe >1.5, walk-forward pass |
| 5 | Regime detection >70% accuracy |
| 6 | 99% uptime, <100ms latency |
| 7 | Dashboard functional, API complete |
| 8 | Paper profitable 7d, live deployed |

---

## Estimated Timeline

- **Total Duration**: 30 days
- **Phase 1-3**: Foundation, Data, Execution (10 days)
- **Phase 4-5**: Optimization, ML (10 days)  
- **Phase 6-8**: Production, Dashboard, Deploy (10 days)

---

## Contact Points

- **Emergency Stop**: Dashboard → Emergency button
- **Health Check**: `npm run health`
- **Logs**: `/logs/` directory
- **Config**: `.env` file
