# 🎯 Optimized Files Summary - KuCoin Futures Trading Bot

**Last Updated:** 2026-01-17  
**Repository:** Ritenoob/cypherscoping-  
**Bot Version:** MIRKO V5.2  
**Optimization Date:** 2026-01-14/15  

---

## 📋 Quick Reference

For the **complete detailed documentation**, see: **[trading-bot/KEY_FILES_REFERENCE.md](trading-bot/KEY_FILES_REFERENCE.md)**

This summary provides a quick index to the most important optimized files.

---

## 🔥 MOST IMPORTANT FILES (Start Here)

### 1. **Signal Weights Configuration** ⭐⭐⭐
**File:** `trading-bot/signal-weights.js` (11KB)  
**Optimized:** 2026-01-15  
- Master configuration for all indicator weights
- Signal type multipliers (Divergence: 1.8x priority)
- Entry requirements (minScore: 85, minConfidence: 75%)
- Regime strategy (ADX-based trend vs range)
- Top 5 indicators: OBV (35), RSI (35), Bollinger (30), Williams %R (28), KDJ (25)

### 2. **Coin Selection Logic** ⭐⭐⭐
**File:** `trading-bot/coinList.js` (28KB)  
- Scans ALL 100+ KuCoin USDT perpetual futures
- 30-second refresh cycle
- Real-time liquidity scoring & funding rate analysis
- Circuit breaker pattern for API resilience
- Tier-based coin classification

### 3. **Signal Generator Engine** ⭐⭐⭐
**File:** `trading-bot/src/lib/SignalGeneratorV2.js` (21KB)  
**Optimized:** 2026-01-14  
- Core signal generation with multi-indicator aggregation
- Confidence scoring based on indicator agreement
- Regime-aware signal filtering (ADX)
- Entry validation (score, confidence, alignment)

### 4. **Latest Optimization Results** ⭐⭐⭐
**File:** `trading-bot/optimization-workspace/OPTIMIZATION_2026-01-14.md` (5.5KB)  
- Target: 78% win rate, 2.8+ profit factor
- Complete documentation of changes
- Baseline vs optimized comparison
- 69/69 tests passing

### 5. **Screener Configuration** ⭐⭐
**File:** `trading-bot/screenerConfig.js` (7.7KB)  
**Optimized:** 2026-01-15  
- Primary TF: 5min (entry timing)
- Secondary TF: 30min (trend confirmation)
- All indicator parameters
- MTF alignment settings (70/30 weighting)

### 6. **Trading Engine** ⭐⭐
**File:** `trading-bot/src/trading/TradingEngineV3.js` (28KB)  
**Optimized:** 2026-01-14  
- Leverage: 5x default (reduced from 15x)
- Stop Loss: 10% ROI (2% price move @ 5x)
- Take Profit: 30% ROI (6% price move @ 5x)
- Break-even & trailing stop logic
- Safety limits & kill switches

---

## 📁 FILE CATEGORIES

### Signal & Strategy Logic
```
trading-bot/signal-weights.js                      ← Master config (11KB) ⭐
trading-bot/src/lib/SignalGeneratorV2.js          ← Signal engine (21KB) ⭐
trading-bot/ChartOptimizedIndicators.js           ← All indicators (33KB)
trading-bot/WilliamsRIndicator.js                 ← Williams %R (17KB)
trading-bot/screenerEngine.js                     ← Screener (18KB)
trading-bot/screenerConfig.js                     ← Config (7.7KB) ⭐
trading-bot/strategy/strategyRouter.js            ← Profile router
```

### Coin Selection (KuCoin Perps)
```
trading-bot/coinList.js                           ← Main scanner (28KB) ⭐
trading-bot/config/pairs.json                     ← Pair tiers (616B)
trading-bot/data/kucoin_perp_symbols.json         ← Symbol mapping
trading-bot/data/kucoin-ohlcv/                    ← Historical data
```

### Backtest & Optimization
```
trading-bot/optimization-workspace/
  ├── OPTIMIZATION_2026-01-14.md                  ← Latest (5.5KB) ⭐
  ├── OPTIMIZATION_PLAN.md
  ├── PHASE1_COMPLETE.md
  ├── PHASE2_COMPLETE.md
  └── PROJECT_STATUS.md

trading-bot/WINNING_CONFIG_REFERENCE.md           ← Best config (3.8KB)
trading-bot/SIGNAL_LOGIC.md                       ← Logic docs (5.8KB)
trading-bot/strategy/optimizer/results/           ← Results dir
trading-bot/scripts/backtest-runner.js            ← Backtest tool
```

### Trading Execution
```
trading-bot/src/trading/TradingEngineV3.js        ← Main engine (28KB) ⭐
trading-bot/core/DemoTradingEngine.js             ← Paper trading
trading-bot/config/leverage-calculator.js         ← Leverage calc
trading-bot/src/utils/PositionCalculator.js       ← Position sizing
```

### Configuration Files
```
trading-bot/.env                                  ← Environment vars
trading-bot/screenerConfig.js                     ← Screener config
trading-bot/signal-weights.js                     ← Weights config ⭐
trading-bot/config/pairs.json                     ← Coin pairs
trading-bot/package.json                          ← Dependencies
```

---

## 🎯 TARGET PERFORMANCE METRICS

| Metric | Before | Target | Status |
|--------|--------|--------|--------|
| **Win Rate** | 12.5% | **78%+** | Config Complete ✅ |
| **Profit Factor** | 1.67 | **2.8+** | Config Complete ✅ |
| **Trades/Week** | Many | **3-5** | Filters Applied ✅ |
| **Leverage** | 15x | **5x** | Optimized ✅ |
| **Stop Loss** | 5% ROI | **10% ROI** | Optimized ✅ |
| **Min Score** | ~70 | **85** | Increased ✅ |
| **Min Confidence** | ~65% | **75%** | Increased ✅ |

---

## 📊 TOP 5 INDICATORS (By Performance)

| Rank | Indicator | Weight | Win Rate | ROI | Timeframe |
|------|-----------|--------|----------|-----|-----------|
| 1 | **OBV** | 35 | 72.5% | 4.34% | 1hour |
| 2 | **RSI** | 35 | 71.1% | - | Multi |
| 3 | **Bollinger** | 30 | 86.1% | 2.88% | 15min |
| 4 | **Williams %R** | 28 | 62.9% | 2.99% | 30min |
| 5 | **KDJ** | 25 | 63.9% | - | Multi |

**Settings:**
- OBV: SlopeWindow=7, Smoothing=3
- Bollinger: Period=15, StdDev=2
- Williams %R: Period=10, OS=-90, OB=-10

---

## 🚀 QUICK START

### To Understand the Trading Logic:
1. Read `trading-bot/signal-weights.js` - Master configuration
2. Read `trading-bot/optimization-workspace/OPTIMIZATION_2026-01-14.md` - Latest changes
3. Review `trading-bot/KEY_FILES_REFERENCE.md` - Complete guide

### To Modify Configuration:
1. Edit `trading-bot/.env` - Basic settings
2. Edit `trading-bot/signal-weights.js` - Weights & thresholds
3. Edit `trading-bot/screenerConfig.js` - Timeframes & params

### To Run Backtests:
```bash
cd trading-bot
node scripts/backtest-runner.js
```

### To Start Trading:
```bash
# Paper trading (safe)
ENABLE_DEMO_TRADING=true node index.js

# Live trading (after testing)
ENABLE_LIVE_TRADING=true node index.js
```

---

## 🔗 RELATED DOCUMENTATION

- **[KEY_FILES_REFERENCE.md](trading-bot/KEY_FILES_REFERENCE.md)** - Complete 500+ line reference
- **[IMPLEMENTATION_SUMMARY.md](trading-bot/IMPLEMENTATION_SUMMARY.md)** - System architecture
- **[WEIGHT_ADJUSTMENT_GUIDE.md](trading-bot/WEIGHT_ADJUSTMENT_GUIDE.md)** - Weight tuning guide
- **[README.md](trading-bot/README.md)** - Project overview

---

## 📝 KEY OPTIMIZATION CHANGES (2026-01-14/15)

1. **Indicator Weights**: Increased top performers (OBV +23, RSI +5, KDJ +7)
2. **Signal Multipliers**: Divergence 1.8x (highest), Zone 0.5x (lowest)
3. **Entry Requirements**: minScore 80→85, minConfidence 70%→75%
4. **Stop Loss**: 5% ROI → 10% ROI (wider for volatility)
5. **Leverage**: 15x → 5x (safer default)
6. **MTF Weights**: 60/40 → 70/30 (primary timeframe priority)
7. **Regime Detection**: Added ADX-based trend vs range logic
8. **Test Coverage**: 69/69 tests passing (100%)

---

## ⚠️ IMPORTANT NOTES

- **Live Trading OFF by default** (`ENABLE_LIVE_TRADING=false`)
- **KuCoin Symbol Format**: `XBTUSDTM` (not BTCUSDTM)
- **API Endpoint**: `https://api-futures.kucoin.com`
- **Rate Limits**: 30 requests per 3 seconds (public)
- **Blacklist**: LUNAUSDTM, USTUSDTM (depegged tokens)
- **Min Position**: Varies by contract
- **Max Leverage**: Hard-capped at 15x

---

**For detailed information on any file, see [trading-bot/KEY_FILES_REFERENCE.md](trading-bot/KEY_FILES_REFERENCE.md)**

**Last Optimization:** 2026-01-14/15  
**Next Review:** After 7 days of paper trading  
**Status:** Ready for testing ✅
