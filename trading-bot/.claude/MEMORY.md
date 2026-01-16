# Claude Code Persistent Memory

## STARTUP INSTRUCTIONS
**On every new session, READ THIS FILE FIRST, then read SESSION_STATE.json**

---

## Current Status: DATA COLLECTION PHASE

### Last Session Summary (2026-01-16)
- Ran `npm test` - ALL 69 TESTS PASSED (29 indicators + 22 microstructure + 18 signal generator)
- Identified Binance Perpetual Futures API as OHLCV data source
- Fetched initial data for 4 target coins

### Target Coins for Optimization
1. **BTCUSDT** - Bitcoin Perpetual
2. **ETHUSDT** - Ethereum Perpetual
3. **SOLUSDT** - Solana Perpetual
4. **XRPUSDT** - XRP Perpetual

### Data Source
```
API: https://fapi.binance.com/fapi/v1/klines
Type: Perpetual Futures
Max Candles: 1500 per request
Intervals: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d
```

---

## Next Steps (In Order)
1. [ ] Create data fetcher script to download historical OHLCV data
2. [ ] Store data locally for backtesting
3. [ ] Run backtest with fetched data
4. [ ] Run optimization cycle
5. [ ] Run walk-forward validation
6. [ ] Compare results to baseline

---

## Performance Targets
| Metric | Minimum | Target | Stretch |
|--------|---------|--------|---------|
| Win Rate | 55% | 65% | 75% |
| Profit Factor | 1.5 | 2.0 | 3.0 |
| Max Drawdown | <20% | <10% | <5% |

---

## Optimization Experiments Log
(Record all parameter changes and results here)

| Date | Experiment | Parameter Changed | Before | After | Result |
|------|------------|------------------|--------|-------|--------|
| - | - | - | - | - | - |

---

## Key Findings
- System integrity verified (69/69 tests pass)
- Binance Futures API provides reliable perpetual OHLCV data

---

## Important File Locations
- State JSON: `.claude/SESSION_STATE.json`
- Main Config: `screenerConfig.js`
- Weights: `signal-weights.js`
- Runtime: `config/runtimeConfig.js`
- Profiles: `switches/signalProfiles/`

---

## Commands Reference
```bash
npm test                    # Verify integrity (ALWAYS RUN FIRST)
npm run backtest            # Run backtests
npm run optimize            # Single optimization cycle
npm run walk-forward        # Validate robustness
npm run analyze             # Review optimization history
```

---

*Last Updated: 2026-01-16*
