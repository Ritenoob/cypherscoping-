# Claude Code Persistent Memory

## STARTUP INSTRUCTIONS
**On every new session, READ THIS FILE FIRST, then read SESSION_STATE.json**

---

## Current Status: OPTIMIZATION IN PROGRESS - PF 2.10 ACHIEVED

### Session Summary (2026-01-16)
- Switched to **KuCoin Futures live data** (per user request)
- Ran backtests on 4 symbols: XBTUSDTM, ETHUSDTM, SOLUSDTM, XRPUSDTM
- **SOLUSDTM 15min achieved Profit Factor 2.10** (target met!)
- Updated `scripts/backtest-runner.js` with optimized config

### Optimal Configuration
```
Symbol: SOLUSDTM
Timeframe: 15min
Leverage: 15x
SL: 10% ROI | TP: 100% ROI
MinScore: 85
Trailing: 25% activation, 10% trail
```

### Results Summary
| Symbol | WR | PF | Return |
|--------|-----|-----|--------|
| SOLUSDTM | 50% | **2.10** | +0.71% |
| ETHUSDTM | 43% | 1.42 | +0.24% |
| XBTUSDTM | 27% | 0.89 | -0.25% |

---

## Next Steps
1. [x] Baseline backtest - DONE
2. [x] SL/TP optimization - DONE (PF 2.10)
3. [ ] Indicator parameter tuning
4. [ ] Improve BTC/XRP performance
5. [ ] Walk-forward validation (60+ days)

---

## Key Commands
```bash
# Fetch fresh OHLCV data
npm run fetch-ohlcv

# Fetch specific coin/interval
npm run fetch-ohlcv -- --symbol BTCUSDT --interval 15m --days 60

# Run tests
npm test

# Run backtest
npm run backtest

# Run optimization
npm run optimize

# Run walk-forward validation
npm run walk-forward
```

---

## Performance Targets
| Metric | Minimum | Target | Stretch |
|--------|---------|--------|---------|
| Win Rate | 55% | 65% | 75% |
| Profit Factor | 1.5 | 2.0 | 3.0 |
| Max Drawdown | <20% | <10% | <5% |

---

## Files Created This Session
- `.claude/SESSION_STATE.json` - Machine-readable state
- `.claude/MEMORY.md` - Human-readable memory (this file)
- `scripts/fetch-ohlcv.js` - Binance Futures data fetcher
- `data/ohlcv/*.json` - 12 OHLCV data files

---

## Important File Locations
- State JSON: `.claude/SESSION_STATE.json`
- Main Config: `screenerConfig.js`
- Weights: `signal-weights.js`
- Runtime: `config/runtimeConfig.js`
- Profiles: `switches/signalProfiles/`
- OHLCV Data: `data/ohlcv/`

## Repository
- **GitHub:** git@github.com:Ritenoob/cypherscoping-.git

---

*Last Updated: 2026-01-16T20:45:00Z*

---

## RESUME PROMPT
When restarting, tell Claude: **"read memory and continue"**
