# Mirko KuCoin Futures Trading System v3.5

Production-grade algorithmic trading platform for KuCoin Futures perpetuals with integrated optimization, dual-timeframe screening, and institutional-quality risk management.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Components](#components)
  - [Indicators](#indicators)
  - [Screener System](#screener-system)
  - [Live Optimizer](#live-optimizer)
  - [Research Pipeline](#research-pipeline)
- [CLI Commands](#cli-commands)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Directory Structure](#directory-structure)

---

## Overview

This system provides:

- **Volatility-aware auto-leverage** using ATR% tiering with hysteresis
- **ROI-based risk controls** with inverse leverage scaling
- **Dual-timeframe signal screening** across configurable indicator sets
- **Live parallel strategy optimization** with paper trading
- **Deterministic backtesting** with walk-forward validation
- **Institutional latency monitoring** (p95/p99, jitter, staleness)

### Supported Markets

KuCoin Futures perpetuals only:

```
ETHUSDTM, SOLUSDTM, WIFUSDTM, SHIBUSDTM, LTCUSDTM, XRPUSDTM,
ADAUSDTM, BCHUSDTM, TONUSDTM, AVAXUSDTM, FARTCOINUSDTM, LAUSDTM,
BEATUSDTM, FOLKSUSDTM, RAVEUSDTM, POWERUSDTM, RIVERUSDTM
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Trading Server                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Screener  │  │  Optimizer  │  │    Shadow Runner        │  │
│  │  (Dual-TF)  │  │   (Live)    │  │  (Forward Testing)      │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                     │                │
│         └────────────────┼─────────────────────┘                │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Signal Generator                        │  │
│  │  (signal-weights.js + SignalGenerator-configurable.js)    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                      │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐    │
│  │    Risk    │  │   Auto     │  │   Stop Tightening      │    │
│  │ Calculator │  │  Leverage  │  │  (Staircase/Trailing)  │    │
│  └────────────┘  └────────────┘  └────────────────────────┘    │
│                          │                                      │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              KuCoin Futures API (WS + REST)               │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

| Principle | Implementation |
|-----------|----------------|
| **Safety First** | No withdrawal perms, IP allowlist, least privilege |
| **Determinism** | `Decimal.js` for all financial math, seeded RNG |
| **Robustness** | Result pattern (no throws in hot path), retry queues |
| **Latency-First** | Server-provided WS ping, adaptive REST sampling |
| **Anti-Overfit** | Walk-forward splits, min trades per fold, regime tagging |

---

## Installation

```bash
# Clone repository
git clone <repo-url>
cd mirko-kucoin-futures

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Type check
npm run typecheck
```

### Requirements

- Node.js ≥ 18.0.0
- TypeScript 5.3+
- KuCoin Futures API credentials (for live trading)

---

## Configuration

### Environment Variables

```bash
# API Credentials (live trading only)
KUCOIN_API_KEY=your_api_key
KUCOIN_API_SECRET=your_api_secret
KUCOIN_PASSPHRASE=your_passphrase

# Screener Configuration
SCREENER_SYMBOLS=ETHUSDTM,SOLUSDTM,XRPUSDTM
SCREENER_PRIMARY_TF=5min
SCREENER_SECONDARY_TF=15min
SCREENER_MIN_ALIGNED=2

# Optimizer Configuration
OPTIMIZER_MAX_STRATEGIES=10
OPTIMIZER_PAPER_MODE=true
```

### Signal Weights (Truth Source)

The canonical configuration surface is `src/config/signal-weights.js`:

```javascript
module.exports = {
  profiles: {
    default: {
      rsi: 15, williamsR: 10, macd: 20, ao: 15,
      ema: 15, bollinger: 10, stochastic: 10, kdj: 5
    },
    momentum: { /* ... */ },
    trend: { /* ... */ },
  },
  thresholds: {
    buy: 50, strongBuy: 70,
    sell: -50, strongSell: -70
  }
};
```

---

## Components

### Indicators

All indicators use `Decimal.js` for precision and support O(1) incremental updates.

| Indicator | File | Features |
|-----------|------|----------|
| **Awesome Oscillator** | `src/indicators/AwesomeOscillator.ts` | Slope tracking, histogram color, saucer/twin peaks patterns, slope-based exit manager |
| **KDJ** | `src/indicators/KDJIndicator.ts` | Stochastic with J-line extension, configurable smoothing |
| **OBV** | `src/indicators/OBVIndicator.ts` | On-Balance Volume with EMA smoothing, slope detection, price divergence |
| **ADX** | `src/indicators/ADXIndicator.ts` | Average Directional Index with +DI/-DI, trend strength classification |

#### Usage Example

```typescript
import { AwesomeOscillator, KDJIndicator, OBVIndicator, ADXIndicator } from './indicators';

const ao = new AwesomeOscillator({ fastPeriod: 5, slowPeriod: 34 });
const kdj = new KDJIndicator({ kPeriod: 9, dPeriod: 3, jMultiplier: 3 });
const obv = new OBVIndicator({ emaPeriod: 20 });
const adx = new ADXIndicator({ period: 14 });

// Update with each candle
const aoValue = ao.update(candle);  // { ao, slope, histogram, color, ready }
const kdjValue = kdj.update(candle); // { k, d, j, signal, ready }
const obvValue = obv.update(candle); // { obv, emaObv, slope, divergence, ready }
const adxValue = adx.update(candle); // { adx, plusDI, minusDI, trend, ready }
```

---

### Screener System

Multi-symbol, dual-timeframe signal screener with configurable indicator alignment.

#### Components

| File | Purpose |
|------|---------|
| `ScreenerConfig.ts` | Centralized configuration with validation |
| `TimeframeAligner.ts` | Evaluates indicator alignment between timeframes |
| `KuCoinDataFeed.ts` | WebSocket client with auto-reconnect |
| `SignalEmitter.ts` | Multi-channel output (file, console, events) |
| `ScreenerEngine.ts` | Main orchestrator |

#### Usage

```typescript
import { startScreener } from './screener';

const system = await startScreener({
  symbols: ['ETHUSDTM', 'SOLUSDTM', 'XRPUSDTM'],
  primaryTimeframe: '5min',
  secondaryTimeframe: '15min',
  alignmentCriteria: {
    minAligned: 2,
    requireAll: false,
    strongSignalWhenAllAlign: true,
  },
});

system.signalEmitter.on('signal', (signal) => {
  console.log(`${signal.symbol} ${signal.direction} (${signal.strength})`);
  console.log(`Score: ${signal.compositeScore}, Aligned: ${signal.alignedIndicators}`);
});
```

#### Signal Output Format

```json
{
  "timestamp": 1704067200000,
  "symbol": "ETHUSDTM",
  "direction": "bullish",
  "strength": "strong",
  "primaryTimeframe": "5min",
  "secondaryTimeframe": "15min",
  "alignedIndicators": ["rsi", "macd", "ao", "ema"],
  "conflictingIndicators": ["bollinger"],
  "compositeScore": 72.5
}
```

---

### Live Optimizer

Parallel strategy optimization on live market data with paper trading.

#### Components

| File | Purpose |
|------|---------|
| `LiveOptimizerController.ts` | Orchestrates parallel strategy variants |
| `OptimizerConfigManager.ts` | Parameter constraints, weight generation |
| `Telemetry.ts` | Pub/sub event streaming for dashboards |

#### Usage

```typescript
import { startLiveOptimizer, OptimizerConfigManager } from './live-optimizer';

const system = await startLiveOptimizer({
  enabled: true,
  maxStrategies: 10,
  paperTradeMode: true,
  evaluationIntervalMs: 5 * 60 * 1000,  // 5 minutes
});

// Generate and add strategy variants
const configManager = new OptimizerConfigManager();

for (let i = 0; i < 5; i++) {
  const weights = configManager.generateRandomWeights('default');
  const thresholds = configManager.generateRandomThresholds();
  
  system.controller.addStrategy(`Variant_${i}`, {
    indicators: { weights, enabled: Object.keys(weights) },
    thresholds,
    risk: { stopLossPercent: 1.5, takeProfitPercent: 3.0 },
  });
}

// Listen for promotions
system.telemetry.subscribe('optimizer:strategy:promoted', (event) => {
  console.log(`Strategy promoted: ${event.data.strategyName}`);
});
```

#### Promotion Criteria

A strategy is promoted when it meets ALL of:

| Metric | Threshold |
|--------|-----------|
| Minimum trades | 10 |
| ROI | ≥ 5% |
| Win rate | ≥ 55% |
| Sharpe ratio | ≥ 1.0 |
| Profit factor | ≥ 1.5 |
| Max drawdown | ≤ 15% |

---

### Research Pipeline

Historical data acquisition and live recording for backtesting.

#### OHLCV Fetcher

```typescript
import { OHLCVFetcher } from './research';

const fetcher = new OHLCVFetcher({ debug: true });

// Fetch 30 days of 5-minute candles
const result = await fetcher.fetch(
  'ETHUSDTM',
  '5min',
  Date.now() - 30 * 24 * 60 * 60 * 1000
);

console.log(`Fetched ${result.candles.length} candles, ${result.gaps.length} gaps`);

// Save to file
await fetcher.save(result, 'json');  // or 'csv'
```

#### Live Recorder

```typescript
import { LiveRecorder } from './research';

const recorder = new LiveRecorder({
  recordCandles: true,
  recordDOM: true,
  recordLatency: true,
});

const session = recorder.startSession(['ETHUSDTM', 'SOLUSDTM']);

// Record incoming data
dataFeed.on('candle', (candle) => recorder.recordCandle(candle.symbol, candle));
dataFeed.on('orderbook', (ob) => recorder.recordDOM(ob.symbol, ob.bids, ob.asks));

// Get latency stats
const stats = recorder.getLatencyStats();
console.log(`P95 latency: ${stats.p95}ms, P99: ${stats.p99}ms`);

// Stop and get session info
const finalSession = recorder.stopSession();
console.log(`Recorded ${finalSession.tickCount} ticks to ${finalSession.filePath}`);
```

---

## CLI Commands

### Research Scripts

```bash
# Fetch historical OHLCV data
npm run research:fetch-ohlcv -- --symbols ETH,SOL --timeframe 5min --days 30

# Run forward shadow testing
npm run research:forward-shadow -- --symbols ETH,SOL --duration 4h

# Start dual-timeframe screener
npm run screener -- --symbols ETH,SOL --primary 5min --secondary 15min

# Run live optimizer
npm run optimizer:live -- --strategies 5 --duration 4h --profile default
```

### Development

```bash
# Build
npm run build

# Type check
npm run typecheck

# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:property

# Run with coverage
npm run test:coverage

# Lint
npm run lint

# Run backtest
npm run backtest

# Run shadow testing
npm run shadow
```

---

## API Reference

### Signal Generator (Truth Source)

Located in `src/config/SignalGenerator-configurable.js`. Do not modify scoring logic directly—configure via `signal-weights.js`.

```javascript
const { generateSignal } = require('./SignalGenerator-configurable');

const result = generateSignal(indicators, weights, thresholds);
// Returns: { score, direction, breakdown, confidence }
```

### Risk Calculator

```typescript
import { RiskCalculator } from './services/risk';

const calc = new RiskCalculator({
  defaultStopLossPercent: 1.5,
  defaultTakeProfitPercent: 3.0,
  feePercent: 0.06,
});

const levels = calc.calculateLevels({
  entryPrice: new Decimal(2000),
  leverage: 10,
  side: 'LONG',
});
// Returns: { stopLoss, takeProfit, breakEvenPrice, riskRewardRatio }
```

### Auto Leverage

```typescript
import { AutoLeverageService } from './services/auto-leverage';

const autoLev = new AutoLeverageService({
  tiers: [
    { maxAtrPercent: 1.0, leverage: 20 },
    { maxAtrPercent: 2.0, leverage: 10 },
    { maxAtrPercent: 3.0, leverage: 5 },
    { maxAtrPercent: Infinity, leverage: 3 },
  ],
  hysteresis: 0.1,  // 10% buffer to prevent flip-flopping
});

const leverage = autoLev.selectLeverage(atrPercent);
```

---

## Testing

```bash
# Run all tests (364/367 passing)
npm test

# Property-based tests (fast-check)
npm run test:property

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

### Test Structure

```
tests/
├── unit/
│   ├── auto-leverage.test.ts
│   ├── risk-calculator.test.ts
│   ├── signal-generator-configurable.test.ts
│   ├── stop-tightening.test.ts
│   ├── backtester.test.ts
│   └── optimizer.test.ts
├── integration/
│   └── leverage-sltp-integration.test.ts
└── property/
    └── leverage-properties.test.ts
```

---

## Directory Structure

```
mirko-kucoin-futures/
├── src/
│   ├── backtest/           # Deterministic backtesting engine
│   ├── config/             # Signal weights, trading config (TRUTH SOURCES)
│   ├── core/               # TradingServer, main orchestration
│   ├── dashboard/          # Web dashboard (HTML/JS/CSS)
│   ├── indicators/         # Technical indicators (AO, KDJ, OBV, ADX)
│   ├── live-optimizer/     # Live parallel strategy optimization
│   ├── optimization/       # Backtest optimization framework
│   ├── optimizer/          # Strategy optimizer controller
│   ├── research/           # Data pipeline (OHLCV fetcher, live recorder)
│   ├── runtime/            # Strategy config loader, signal adapter
│   ├── screener/           # Dual-timeframe screener system
│   ├── services/           # Risk, auto-leverage, rate limiting
│   ├── shadow/             # Forward testing infrastructure
│   ├── signal/             # Extended signal generator
│   ├── strategy/           # Signal profiles
│   ├── types/              # TypeScript types, Result pattern
│   ├── utils/              # Decimal utilities
│   └── index.ts            # Main exports
├── scripts/
│   └── research/           # CLI scripts for research workflows
├── tests/                  # Unit, integration, property tests
├── research/               # Research data output directory
│   ├── data/
│   │   ├── ohlcv/          # Historical candle data
│   │   ├── live/           # Live recording sessions
│   │   └── shadow/         # Shadow test results
│   └── configs/            # Versioned strategy configs
├── logs/                   # Runtime logs
├── package.json
├── tsconfig.json
└── README.md
```

---

## Execution/Risk Rules

These invariants MUST be preserved:

1. **ROI-based SL/TP** uses inverse leverage scaling
2. **Auto leverage** via ATR% tiering with hysteresis
3. **Stop must tighten quickly** (small loss > larger loss)
4. **Break-even and profit-lock trigger early**
5. **No time-based forced exits** (only SL/TP/trailing)
6. **reduceOnly on all exits**
7. **Stop updates coordinated** (cancel/replace risk mitigated)
8. **Retry queue logic** for failed orders

---

## Data Realism

Backtests MUST include:

- **Fees and slippage** in all simulations
- **Toggleable fill model**: `FILL_MODEL=taker` or `FILL_MODEL=probabilistic_limit`
- **DOM logic validated live only** (no historical DOM data)

---

## Anti-Overfit Measures

1. **Walk-forward evaluation** with purged splits
2. **Multi-objective scoring**: net return, profit factor, expectancy, max drawdown, tail loss, stability
3. **Minimum trades per fold** enforced internally
4. **Regime tagging** via ADX/ATR classification

---

## License

UNLICENSED - Private repository

---

## Author

Mirko

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.5.0 | 2025-01 | Live optimizer, dual-TF screener, AO/KDJ/OBV/ADX indicators |
| 3.4.0 | 2024-12 | Walk-forward backtest, regime tagging |
| 3.3.0 | 2024-11 | Shadow testing infrastructure |
| 3.2.0 | 2024-10 | Volatility-aware auto-leverage |
| 3.1.0 | 2024-09 | Staircase trailing stops |
| 3.0.0 | 2024-08 | Initial production release |
