# Claude Code Persistent Memory

## STARTUP INSTRUCTIONS
**On every new session, READ THIS FILE FIRST, then read SESSION_STATE.json**

---

## Current Status: DATA COLLECTION COMPLETE - READY FOR OPTIMIZATION

### Last Session Summary (2026-01-16)
- Ran `npm test` - ALL 69 TESTS PASSED
- Created data fetcher script: `scripts/fetch-ohlcv.js`
- Fetched 30 days of OHLCV data for 4 coins
- Total: **15,120 candles** stored locally

### Data Fetched
| Symbol | Price Range | 15m | 1h | 4h |
|--------|-------------|-----|----|----|
| BTCUSDT | $84,408 - $97,932 | 2880 | 720 | 180 |
| ETHUSDT | $2,772 - $3,403 | 2880 | 720 | 180 |
| SOLUSDT | $116 - $148 | 2880 | 720 | 180 |
| XRPUSDT | $1.77 - $2.41 | 2880 | 720 | 180 |

**Data Location:** `data/ohlcv/`

---

## Next Steps (In Order)
1. [x] Run npm test - PASSED
2. [x] Create data fetcher script - DONE
3. [x] Fetch OHLCV data - DONE (15,120 candles)
4. [ ] Create backtest runner using local data
5. [ ] Run optimization cycle
6. [ ] Run walk-forward validation
7. [ ] Compare results to baseline

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

---

*Last Updated: 2026-01-16T20:45:00Z*

---

## RESUME PROMPT
When restarting, tell Claude: **"read memory and continue"**
