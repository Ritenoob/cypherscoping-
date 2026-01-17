# Changelog V5.2 - 2026-01-17

## [5.2.0] - 2026-01-17

### Added
- **ATRIndicator.js** - New dedicated volatility indicator
  - Normalized ATR (% of price) for cross-symbol comparison
  - Volatility expansion/contraction detection
  - Low volatility squeeze signals (breakout imminent)
  - ATR breakout signals
  - Position sizing helper based on volatility

- **Stochastic indicator** in signal-weights.js (separate from StochRSI)
  - Weight: 35 (highest - TOP performer)
  - K/D crossover, oversold/overbought zones, divergence

- **Extreme MA divergence signals** in EMATrend
  - Price >3% from 50 EMA (moderate signal)
  - Price >4% from 100 EMA (strong signal)
  - Price >5% from 200 EMA (very strong signal)
  - 100-period EMA added

- **Individual indicator test script** (`scripts/individual-indicator-test.js`)
- **Local backtest script** (`scripts/local-backtest.js`)
- **KuCoin Futures 5min data** for 6 symbols (30 days each)

### Changed
- **signal-weights.js** v4 → v5
  - Stochastic: NEW, weight 35 (PF 3.72, 66.7% WR)
  - KDJ: weight 25 → 35 (j_oversold has 80% WR!)
  - RSI: weight 40 (Period=21 optimal)
  - EMA Trend: weight 18 → 25 (+ extreme divergence)
  - MACD: weight 25 → 18 (underperformer)
  - OBV: weight 35 → 18 (underperformer)
  - ATR: NEW, weight 15

### Performance (Backtests)
| Indicator | Timeframe | Win Rate | Profit Factor |
|-----------|-----------|----------|---------------|
| Stochastic | 1hour | 66.7% | 3.72 |
| RSI | 15min | 60.9% | 2.81 |
| KDJ | 5min | 57.1% | 2.79 |
| WilliamsR | 30min | 64.7% | 2.76 |
| Bollinger | 5min | 54.3% | 1.71 |

### Git
- Branch: copilot/fix-ci-workflow-configuration
- Commit: d8df0bd
