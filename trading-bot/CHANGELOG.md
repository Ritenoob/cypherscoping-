# Changelog

All notable changes to the trading bot are documented here.

---

## [2026-01-16] Optimization Session

### Changed: `scripts/backtest-runner.js`
**Reason:** Updated default config based on KuCoin Futures backtest optimization results

| Parameter | Old Value | New Value | Rationale |
|-----------|-----------|-----------|-----------|
| symbol | XBTUSDTM | SOLUSDTM | SOL has highest profit factor (2.10) |
| timeframe | 5min | 15min | 5min too noisy, 15min optimal |
| stopLossROI | 15 | 10 | Tighter SL = higher PF (2.10 vs 1.83) |
| takeProfitROI | 150 | 100 | TP rarely hit, trailing stops exit trades |

**Results:** PF improved from 1.83 to 2.10 on SOLUSDTM 15min

### Changed: `.claude/MEMORY.md`
**Reason:** Updated session state with optimization results
**Details:** Documented PF 2.10 achievement, optimal config, results summary, next steps

### Finding: Symbol-Specific Optimal Timeframes
**Reason:** Tested multiple timeframes per symbol to find optimal config
**Details:** Each symbol performs best on different timeframes:

| Symbol | Best TF | WR | PF | Return |
|--------|---------|-----|-----|--------|
| SOLUSDTM | 15min | 50% | 2.10 | +0.71% |
| XBTUSDTM | 30min | 44% | 1.40 | +0.13% |
| ETHUSDTM | 15min | 43% | 1.42 | +0.24% |

**Insight:** SOL is most profitable on 15min, BTC needs 30min (15min = 0.89 PF)

### Added: `scripts/fetch-kucoin-history.js`
**Reason:** User requested KuCoin Futures historical data fetcher
**Details:**
- Fetches OHLCV data from KuCoin Futures API
- Supports all timeframes (1min to 1day)
- Rate-limit aware (30 req/3s)
- Stores in `data/kucoin-ohlcv/`

### Added: npm script `fetch-kucoin`
**File:** `package.json`
**Usage:** `npm run fetch-kucoin -- --symbol XBTUSDTM --days 60`

### Data Fetched
**Location:** `data/kucoin-ohlcv/`
**Total:** 30,240 candles

| Symbol | 15min | 30min | 1hour | Price Range |
|--------|-------|-------|-------|-------------|
| XBTUSDTM | 2880 | 1440 | 720 | $84,436 - $97,919 |
| ETHUSDTM | 2880 | 1440 | 720 | $2,774 - $3,404 |
| SOLUSDTM | 2880 | 1440 | 720 | $116 - $148 |
| XRPUSDTM | 2880 | 1440 | 720 | $1.77 - $2.42 |
| DOGEUSDTM | 2880 | 1440 | 720 | $0.12 - $0.16 |
| BNBUSDTM | 2880 | 1440 | 720 | $818 - $954 |

---

## Format Guide
```
## [YYYY-MM-DD] Session Description

### Changed/Added/Removed: `file/path.js`
**Reason:** Why the change was made
**Details:** What specifically changed
**Results:** Measured impact (if applicable)
```
