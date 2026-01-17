# cypherscoping- - KuCoin Futures Trading Bot

## 📋 Documentation Quick Links

### 🎯 **[OPTIMIZED_FILES_SUMMARY.md](OPTIMIZED_FILES_SUMMARY.md)** ⭐
Quick reference guide to the newest and most optimized files for KuCoin futures trading.

### 📖 **[trading-bot/KEY_FILES_REFERENCE.md](trading-bot/KEY_FILES_REFERENCE.md)** ⭐
Comprehensive 579-line reference documenting all key files, configurations, and optimization details.

---

## 🚀 Quick Start

This repository contains **MIRKO V5.2**, an advanced quantitative trading bot optimized for KuCoin perpetual futures.

**Latest Optimization:** 2026-01-14/15  
**Target Win Rate:** 78%+  
**Target Profit Factor:** 2.8+

### Most Important Files:
1. `trading-bot/signal-weights.js` - Master signal configuration
2. `trading-bot/coinList.js` - KuCoin perps coin scanner
3. `trading-bot/src/lib/SignalGeneratorV2.js` - Signal generation engine
4. `trading-bot/optimization-workspace/OPTIMIZATION_2026-01-14.md` - Latest optimization results
5. `trading-bot/src/trading/TradingEngineV3.js` - Trading execution engine

See [OPTIMIZED_FILES_SUMMARY.md](OPTIMIZED_FILES_SUMMARY.md) for complete file index.

---

## 📂 Repository Structure

```
cypherscoping-/
├── OPTIMIZED_FILES_SUMMARY.md          ← Quick reference guide ⭐
├── trading-bot/
│   ├── KEY_FILES_REFERENCE.md          ← Detailed documentation ⭐
│   ├── signal-weights.js               ← Master config (optimized 2026-01-15)
│   ├── coinList.js                     ← Coin scanner (100+ perps)
│   ├── screenerConfig.js               ← Screener settings
│   ├── screenerEngine.js               ← Screening engine
│   ├── ChartOptimizedIndicators.js     ← All indicators
│   ├── src/
│   │   ├── lib/SignalGeneratorV2.js    ← Signal engine
│   │   └── trading/TradingEngineV3.js  ← Trading engine
│   ├── config/
│   │   └── pairs.json                  ← Coin tiers
│   ├── optimization-workspace/
│   │   └── OPTIMIZATION_2026-01-14.md  ← Latest results
│   └── data/kucoin-ohlcv/              ← Historical data
└── ...
```

---

## 🎯 Key Features

- ✅ **78% Target Win Rate** through optimized signal weighting
- ✅ **Comprehensive Coin Selection** across 100+ USDT perpetuals  
- ✅ **Advanced Risk Management** with break-even and trailing stops
- ✅ **Regime-Aware Trading** using ADX detection
- ✅ **100% Test Coverage** on critical paths (69/69 tests)
- ✅ **Safety-First Design** with kill switches and hard limits

---

## 📊 Top 5 Indicators (By Performance)

| Indicator | Weight | Win Rate | ROI | Timeframe |
|-----------|--------|----------|-----|-----------|
| OBV | 35 | 72.5% | 4.34% | 1hour |
| RSI | 35 | 71.1% | - | Multi |
| Bollinger | 30 | 86.1% | 2.88% | 15min |
| Williams %R | 28 | 62.9% | 2.99% | 30min |
| KDJ | 25 | 63.9% | - | Multi |

---

For complete documentation, see [OPTIMIZED_FILES_SUMMARY.md](OPTIMIZED_FILES_SUMMARY.md)

# cypherscoping-