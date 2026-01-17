# 🔑 KEY FILES REFERENCE - KuCoin Futures Trading Bot
## Newest & Most Optimized Logic, Strategy, and Configuration Files

**Last Updated:** 2026-01-17  
**Bot Version:** MIRKO V5.2  
**Optimization Date:** 2026-01-14/15  
**Target Win Rate:** 78%+  
**Target Profit Factor:** 2.8+

---

## 📊 1. SIGNAL ENGINE & SCORING CONFIGURATION

### **Primary Signal Configuration**
📍 **File:** `signal-weights.js`  
🔧 **Last Optimized:** 2026-01-15  
⭐ **Purpose:** Master configuration for all indicator weights, signal multipliers, and entry requirements

**Key Features:**
- Indicator weights optimized based on backtesting (RSI: 35, OBV: 35, Bollinger: 30)
- Signal type multipliers (Divergence: 1.8x, Golden/Death Cross: 1.4x)
- Strength multipliers (very_strong: 1.4x, weak: 0.3x)
- Entry requirements (minScore: 85, minConfidence: 75%, minIndicators: 4)
- Regime strategy (ADX-based trend vs range detection)
- Combination bonuses (divergenceWithTrend: +20, emaCrossWithRSI: +15)

**Score Caps:**
- Indicator cap: 120 (increased from 110)
- Microstructure cap: 35 (increased from 30)
- Total score range: -150 to +150

**Top 5 Optimized Indicators:**
1. **OBV** (maxWeight: 35) - 72.5% WR, 4.34% ROI
2. **RSI** (maxWeight: 35) - 71.1% WR, best performer
3. **Bollinger** (maxWeight: 30) - 86.1% WR, highest accuracy
4. **Williams %R** (maxWeight: 28) - 62.9% WR
5. **KDJ** (maxWeight: 25) - 63.9% WR

---

### **Signal Generator Engine**
📍 **File:** `src/lib/SignalGeneratorV2.js`  
🔧 **Last Optimized:** 2026-01-14  
⭐ **Purpose:** Core signal generation with multi-indicator aggregation and confidence scoring

**Key Features:**
- Aggregates signals from 10+ indicators
- Applies signal type multipliers (divergence prioritized)
- Calculates confidence based on indicator agreement
- Validates entry requirements before flagging trades
- Regime-aware signal filtering (ADX-based)
- Microstructure integration for live trading

**Entry Decision Flow:**
```
Score >= 85? → Confidence >= 75%? → 4+ Indicators Agree? 
→ Timeframes Aligned? → EMA Trend Confirms? → No AVOID_ENTRY warnings?
→ ✅ ENTER TRADE
```

---

### **Screener Configuration**
📍 **File:** `screenerConfig.js`  
🔧 **Last Optimized:** 2026-01-15  
⭐ **Purpose:** Screener engine parameters, timeframes, and indicator settings

**Key Settings:**
- Primary timeframe: 5min (entry timing)
- Secondary timeframe: 30min (trend confirmation)
- Signal thresholds: minScore 85, minConfidence 75%, requireDivergence: true
- MTF alignment: 70/30 weighting (primary/secondary)
- Indicator parameters for all 10+ indicators
- Microstructure analyzer parameters

**Timeframe Strategy:**
- Lower TF (5min) = Entry timing precision
- Higher TF (30min) = Trend confirmation
- Reversed MTF approach (78% win rate config)

---

### **Screener Engine**
📍 **File:** `screenerEngine.js`  
🔧 **Version:** Current  
⭐ **Purpose:** Real-time screening engine that coordinates signal generation across multiple symbols

**Key Features:**
- Multi-symbol parallel scanning
- WebSocket integration for real-time data
- Signal emission with full metadata
- Cooldown management (180s between signals per symbol)
- Health monitoring and diagnostics

---

## 📈 2. INDICATOR & STRATEGY LOGIC

### **Optimized Chart Indicators**
📍 **File:** `ChartOptimizedIndicators.js`  
🔧 **Version:** Current (33KB - comprehensive)  
⭐ **Purpose:** All technical indicator calculations with optimized parameters

**Includes:**
- RSI with divergence detection
- MACD (Fast=5, Slow=17, Signal=5 for 1hour TF)
- Williams %R (Period=10, OS=-90, OB=-10)
- Awesome Oscillator (Fast=3, Slow=34)
- EMA Trend (9/21/50/200 periods)
- Stochastic RSI
- Bollinger Bands (Period=15, StdDev=2)
- KDJ (K=9, D=3, Smooth=3)
- OBV with slope detection (SlopeWindow=7, Smoothing=3)
- ADX (regime detection)

**Divergence Detection:**
- Bull/Bear divergence patterns
- Hidden divergences
- Multi-timeframe divergence validation

---

### **Williams %R Indicator**
📍 **File:** `WilliamsRIndicator.js`  
🔧 **Version:** Current (17KB)  
⭐ **Purpose:** Specialized Williams %R implementation with advanced features

**Features:**
- Failure swing pattern detection
- Multi-level overbought/oversold zones
- Divergence detection
- Momentum analysis

---

### **Strategy Router**
📍 **File:** `strategy/strategyRouter.js`  
🔧 **Version:** Current  
⭐ **Purpose:** Dynamic strategy profile switching

**Available Profiles:**
- Conservative (low leverage, tight SL)
- Aggressive (high leverage, wider TP)
- Balanced (medium settings)
- Scalping (quick entries/exits)

**Profile Files:**
- `switches/signalProfiles/conservative.js`
- `switches/signalProfiles/aggressive.js`
- `switches/signalProfiles/balanced.js`
- `switches/signalProfiles/scalping.js`

---

## 🪙 3. COIN SELECTION FOR KUCOIN PERPETUALS

### **Coin List Manager**
📍 **File:** `coinList.js`  
🔧 **Version:** 2.1.0 (28KB - comprehensive)  
⭐ **Purpose:** Dynamic KuCoin perpetual futures scanner and coin selection

**Configuration:**
```javascript
{
  minVolume: 0,              // NO volume filter (scans ALL coins)
  maxSpread: 100,            // NO spread filter
  topN: 999,                 // Scan ALL coins
  refreshInterval: 30000,    // 30-second refresh
  blacklist: ['LUNAUSDTM', 'USTUSDTM']
}
```

**Coin Tier System:**
- **Tier 1:** Top 10 by volume (XBTUSDTM, ETHUSDTM)
- **Tier 2:** Next 20 mid-caps
- **Tier 3:** Next 30 small-caps
- **Tier 4:** All remaining coins

**Features:**
- Scans 100+ USDT perpetual contracts
- Real-time liquidity scoring
- Funding rate analysis
- Volatility-based ranking
- Circuit breaker pattern for API resilience
- Token bucket rate limiting
- Health monitoring (data staleness detection)

**API Endpoint:** `https://api-futures.kucoin.com`

---

### **Pairs Configuration**
📍 **File:** `config/pairs.json`  
🔧 **Version:** Current  
⭐ **Purpose:** Static coin tier definitions and preferences

**Configured Pairs:**
```json
{
  "enabled": ["BTCUSDTM", "ETHUSDTM", "SOLUSDTM", "XRPUSDTM", ...],
  "tier1": ["BTCUSDTM", "ETHUSDTM"],
  "tier2": ["SOLUSDTM", "XRPUSDTM", "BNBUSDTM"],
  "tier3": ["DOTUSDTM", "AVAXUSDTM", ...],
  "blacklist": ["LUNAUSDTM", "USTUSDTM"]
}
```

---

### **KuCoin Perpetual Symbols**
📍 **File:** `data/kucoin_perp_symbols.json`  
🔧 **Version:** Current  
⭐ **Purpose:** Complete mapping of all KuCoin perpetual symbols

---

## 🧪 4. BACKTEST RESULTS & OPTIMIZATION HISTORY

### **Latest Optimization Summary**
📍 **File:** `optimization-workspace/OPTIMIZATION_2026-01-14.md`  
🔧 **Date:** 2026-01-14  
⭐ **Purpose:** Complete documentation of latest optimization changes and rationale

**Baseline Performance (Before):**
- Win Rate: 12.5% (1/8 trades)
- Profit Factor: 1.67
- Problem: 7/8 trades hit stop loss immediately

**Post-Optimization Targets:**
- Win Rate: 70-78%
- Profit Factor: 2.0+
- Sharpe Ratio: >0.5
- Fewer trades, higher quality (3-5 per week)

**Key Changes Made:**
1. Increased weights for top performers (OBV +23, RSI +5, KDJ +7)
2. Prioritized divergence signals (1.8x multiplier)
3. Raised entry requirements (minScore: 80→85, minConfidence: 70%→75%)
4. Wider stop losses (5%→10% ROI)
5. MTF alignment stricter (60/40→70/30)
6. Added regime-based entry logic (ADX)

**Test Results:**
- 69/69 tests PASSING (100%)
  - 29 indicator tests ✅
  - 22 microstructure tests ✅
  - 18 signal generator tests ✅

---

### **Optimization Workspace Files**
📍 **Directory:** `optimization-workspace/`

Key documents:
- `OPTIMIZATION_2026-01-14.md` - Latest optimization summary
- `OPTIMIZATION_PLAN.md` - Optimization strategy
- `PHASE1_COMPLETE.md` - Phase 1 completion report
- `PHASE2_COMPLETE.md` - Phase 2 completion report
- `PROJECT_STATUS.md` - Current project status
- `audit-report.md` - System audit findings

**Scripts:**
- `analyze-strategy.sh` - Strategy analysis tool
- `post-optimization-verify.sh` - Verification script
- `restart-bot.sh` - Bot restart script

---

### **Winning Configuration Reference**
📍 **File:** `WINNING_CONFIG_REFERENCE.md`  
🔧 **Version:** Current  
⭐ **Purpose:** Snapshot of best performing configuration

**Contains:**
- Historical winning parameters
- Performance benchmarks
- Configuration evolution timeline

---

### **Signal Logic Documentation**
📍 **File:** `SIGNAL_LOGIC.md`  
🔧 **Version:** Current  
⭐ **Purpose:** Signal validation rules and logic documentation

---

### **Implementation Summary**
📍 **File:** `IMPLEMENTATION_SUMMARY.md`  
🔧 **Version:** V3.5  
⭐ **Purpose:** Complete system overview and architecture

---

### **Backtest Runner**
📍 **File:** `scripts/backtest-runner.js`  
🔧 **Version:** Current  
⭐ **Purpose:** Automated backtesting framework

---

### **Backtest Results**
📍 **Directory:** `strategy/optimizer/results/`  
⭐ **Purpose:** Historical backtest results storage

---

### **Historical OHLCV Data**
📍 **Directory:** `data/kucoin-ohlcv/`

**Available Data:**
- XBTUSDTM (15min, 30min, 1hour, 30 days)
- ETHUSDTM (15min, 30min, 1hour, 30 days)
- SOLUSDTM (15min, 30min, 1hour, 30 days)
- XRPUSDTM (15min, 30min, 1hour, 30 days)
- DOGEUSDTM (15min, 30min, 1hour, 30 days)
- BNBUSDTM (15min, 30min, 1hour, 30 days)
- `_summary.json` - Data fetch summary

---

## ⚙️ 5. TRADING ENGINE & RISK MANAGEMENT

### **Trading Engine V3**
📍 **File:** `src/trading/TradingEngineV3.js`  
🔧 **Version:** V3 (Most Optimized)  
⭐ **Purpose:** Main trading execution engine with advanced risk management

**Risk Management Settings:**
```javascript
// Leverage (OPTIMIZED 2026-01-14)
leverageDefault: 5,        // Reduced from 15
leverageMin: 3,
leverageMax: 15,

// Stop Loss / Take Profit (ROI-based)
stopLossROI: 10,           // 10% loss = 2% price move @ 5x
takeProfitROI: 30,         // 30% gain = 6% price move @ 5x

// Break-Even Protection
breakEvenActivation: 8%,   // 8% ROI triggers break-even
breakEvenBuffer: 1.0%,     // 1% buffer above entry

// Trailing Stop
trailingActivation: 12%,   // 12% ROI triggers trailing
trailingDistance: 4%       // Trail 4% behind peak
```

**Safety Features:**
- Decimal.js precision for all calculations
- Anti-untrailing protection
- Fee-adjusted break-even
- Live trading kill switch (ENABLE_LIVE_TRADING=false by default)
- Hard position size limits ($5000 max)
- Hard leverage limits (15x max)

---

### **Position Calculator**
📍 **File:** `src/utils/PositionCalculator.js`  
🔧 **Version:** Current  
⭐ **Purpose:** Position sizing calculations

---

### **Leverage Calculator**
📍 **File:** `config/leverage-calculator.js`  
🔧 **Version:** Current  
⭐ **Purpose:** Volatility-aware dynamic leverage calculation

---

### **Demo Trading Engine**
📍 **File:** `core/DemoTradingEngine.js`  
🔧 **Version:** Current  
⭐ **Purpose:** Paper trading simulation engine

---

## 🔧 6. CONFIGURATION FILES

### **Environment Template**
📍 **File:** `.env.example` (create from template)  
⭐ **Purpose:** Environment variables for API keys and risk parameters

**Key Variables:**
```bash
# KuCoin API
KUCOIN_API_KEY=
KUCOIN_API_SECRET=
KUCOIN_API_PASSPHRASE=

# Trading Mode
ENABLE_LIVE_TRADING=false
ENABLE_DEMO_TRADING=true

# Leverage & Risk
LEVERAGE_DEFAULT=5
LEVERAGE_MIN=3
LEVERAGE_MAX=15
STOP_LOSS_ROI=10
TAKE_PROFIT_ROI=30

# Signal Thresholds
SIGNAL_MIN_SCORE=85
SIGNAL_MIN_CONFIDENCE=75
SIGNAL_MIN_INDICATORS=4

# Timeframes
PRIMARY_TIMEFRAME=5min
SECONDARY_TIMEFRAME=30min
```

---

### **Claude Config**
📍 **File:** `.claudeconfig.json`  
⭐ **Purpose:** Claude AI assistant configuration

---

### **Package Configuration**
📍 **File:** `package.json`  
⭐ **Purpose:** Project dependencies and scripts

**Key Scripts:**
```json
{
  "scripts": {
    "start": "node index.js",
    "test": "jest",
    "backtest": "node scripts/backtest-runner.js",
    "optimize": "node scripts/optimize.js"
  }
}
```

---

## 📚 7. DOCUMENTATION FILES

### **Main Documentation**
- `README.md` - Project overview
- `README_V3.5.md` - V3.5 specific documentation
- `IMPLEMENTATION_SUMMARY.md` - System architecture
- `WINNING_CONFIG_REFERENCE.md` - Best configuration snapshot
- `SIGNAL_LOGIC.md` - Signal validation rules
- `WEIGHT_ADJUSTMENT_GUIDE.md` - Weight tuning guide
- `CHANGELOG.md` - Version history

### **Guides**
- `docs/STRATEGY_PROFILES_GUIDE.md` - Strategy profile specifications
- `docs/SIGNAL_CONFIG.md` - Signal configuration guide
- `knowledge-bank/truth-docs/SIGNAL_MODE_GUIDE.md` - Signal mode documentation

---

## 🧰 8. UTILITY SCRIPTS

### **Optimization & Analysis**
- `scripts/optimize.js` - Parameter optimization
- `scripts/indicator-optimizer.js` - Indicator parameter tuning
- `scripts/mtf-optimizer.js` - Multi-timeframe optimization
- `scripts/walk-forward.js` - Walk-forward analysis
- `scripts/backtest-runner.js` - Backtesting framework

### **Data Fetching**
- `scripts/fetch-ohlcv.js` - Fetch OHLCV data
- `scripts/fetch-kucoin-history.js` - Fetch KuCoin historical data

### **Trading Management**
- `scripts/start-live-trading.js` - Start live trading
- `scripts/start-paper-trading.js` - Start paper trading
- `scripts/monitor.js` - Monitor trading activity
- `scripts/health-check.js` - System health check

### **Debugging**
- `scripts/signal-debug.js` - Signal debugging tool
- `scripts/signal-scanner.js` - Signal scanning utility
- `scripts/debug_signals.js` - Alternative signal debugger
- `scripts/export-signals.js` - Export signal history

---

## 🎯 9. KEY PERFORMANCE METRICS

### **Target Metrics (Post-Optimization)**
| Metric | Target | Status |
|--------|--------|--------|
| Win Rate | >78% | Config Complete ✅ |
| Profit Factor | >2.8 | Config Complete ✅ |
| Sharpe Ratio | >0.5 | Config Complete ✅ |
| Max Drawdown | <10% | Risk Limits Set ✅ |
| Trades/Week | 3-5 | Filters Applied ✅ |
| Avg R:R Ratio | 3:1 | SL/TP Optimized ✅ |

### **Indicator Performance (From Backtests)**
| Indicator | Win Rate | Avg ROI | Timeframe | Parameters |
|-----------|----------|---------|-----------|------------|
| OBV | 72.5% | 4.34% | 1hour | Slope=7, Smooth=3 |
| RSI | 71.1% | - | Multi | Period=14 |
| Bollinger | 86.1% | 2.88% | 15min | Period=15, StdDev=2 |
| Williams %R | 62.9% | 2.99% | 30min | Period=10, OS=-90 |
| AO | 70.0% | 2.91% | 15min | Fast=3, Slow=34 |
| KDJ | 63.9% | - | Multi | K=9, D=3 |
| MACD | 36.5% | 3.25% | 1hour | Fast=5, Slow=17, Sig=5 |

---

## 🚀 10. QUICK START REFERENCE

### **Most Important Files to Review**
1. **`signal-weights.js`** - Master configuration (START HERE)
2. **`coinList.js`** - Coin selection logic
3. **`screenerConfig.js`** - Screener parameters
4. **`optimization-workspace/OPTIMIZATION_2026-01-14.md`** - Latest changes
5. **`src/lib/SignalGeneratorV2.js`** - Signal engine
6. **`src/trading/TradingEngineV3.js`** - Trading execution

### **Configuration Flow**
```
.env → screenerConfig.js → signal-weights.js → SignalGeneratorV2.js → TradingEngineV3.js
```

### **Data Flow**
```
coinList.js (scan coins) → screenerEngine.js (monitor) → SignalGeneratorV2.js (signals)
→ TradingEngineV3.js (execute) → Position Management
```

---

## 📝 NOTES

### **Optimization Philosophy**
- **Quality over Quantity:** Fewer trades with higher win rates
- **Divergence Priority:** Divergence signals have highest predictive value
- **Regime Awareness:** ADX-based trend vs range detection
- **Risk First:** Wide enough stops to survive volatility
- **Multi-Indicator Confirmation:** Require 4+ indicators agreeing

### **KuCoin Specifics**
- Symbol format: `XBTUSDTM` (not BTCUSDTM)
- API: `api-futures.kucoin.com`
- Rate limits: 30 requests per 3 seconds (public endpoints)
- Funding: Every 8 hours
- Minimum position sizes vary by contract

### **Version History**
- **V5.2:** Current version with latest optimizations
- **V3.5:** Major refactor with modular architecture
- **2026-01-14/15:** Latest optimization (78% win rate target)

---

## ⚠️ SAFETY & COMPLIANCE

### **Live Trading Safeguards**
- Kill switch: `ENABLE_LIVE_TRADING=false` by default
- Hard limits: Max $5000 position size, Max 15x leverage
- Break-even protection: Auto-move stops to break-even at 8% ROI
- Trailing stops: Lock in profits above 12% ROI
- Cooldown: 180s between signals per symbol
- Blacklist: Depegged/collapsed tokens excluded

### **Testing Requirements**
- All code changes must pass 69/69 tests
- Manual verification required before live trading
- Paper trading required for 7 days before going live
- Health checks every 60 seconds
- Circuit breakers on API failures

---

**END OF REFERENCE**

*This document identifies the newest and most optimized logic, strategy, indicator settings, signal engine, score weights, configuration files, and coin selection for KuCoin futures perpetuals trading.*

*For questions or updates, refer to the optimization-workspace directory and commit history.*
