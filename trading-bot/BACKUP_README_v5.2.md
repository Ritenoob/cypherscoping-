# KuCoin Futures Trading Bot V5.2 - Backup README

## Top Performing Indicators (Backtest Results)

| Indicator | Best Timeframe | Win Rate | Profit Factor | Weight |
|-----------|----------------|----------|---------------|--------|
| Stochastic | 1hour | 66.7% | 3.72 | 35 |
| RSI | 15min | 60.9% | 2.81 | 40 |
| KDJ | 5min | 57.1% | 2.79 | 35 |
| WilliamsR | 30min | 64.7% | 2.76 | 28 |
| Bollinger | 5min | 54.3% | 1.71 | 30 |

## Key Findings

1. **Stochastic** is TOP performer (PF 3.72)
2. **KDJ j_oversold** has 80% win rate
3. **RSI Period=21** better than Period=14
4. **MACD** and **OBV** underperformed - weights reduced

## New Features

### ATRIndicator.js
- Normalized ATR (% of price)
- Volatility expansion/contraction
- Low volatility squeeze signals
- Position sizing helper

### EMATrend Enhancements
- 100-period EMA added
- Extreme MA divergence detection:
  - >3% from 50 EMA
  - >4% from 100 EMA
  - >5% from 200 EMA

## Weight Summary (V5)

| Indicator | Weight | Notes |
|-----------|--------|-------|
| RSI | 40 | + StochRSI |
| Stochastic | 35 | TOP performer |
| KDJ | 35 | j_oversold gold |
| Bollinger | 30 | Solid |
| WilliamsR | 28 | Period=10 |
| EMA Trend | 25 | + extreme div |
| AO | 25 | Good |
| ADX | 20 | Regime |
| StochRSI | 18 | Separate |
| MACD | 18 | Reduced |
| OBV | 18 | Reduced |
| DOM | 18 | Live only |
| ATR | 15 | NEW |

## Commands

```bash
npm test                                    # Run tests
node scripts/individual-indicator-test.js  # Indicator tests
node scripts/local-backtest.js             # Backtest
```

## Data

51,776 candles from KuCoin Futures:
- XBTUSDTM, ETHUSDTM, SOLUSDTM, XRPUSDTM, DOGEUSDTM, BNBUSDTM
- 5min, 15min, 30min, 1hour
- 30 days

---
*Backup created: 2026-01-17*
