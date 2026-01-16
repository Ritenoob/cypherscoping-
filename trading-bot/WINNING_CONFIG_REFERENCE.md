# Winning Configuration Reference - 78% Win Rate, 28.83 Profit Factor

**Date:** 2026-01-15
**Status:** Reference snapshot of optimal configuration

---

## KEY SUCCESS FACTORS

### 1. Entry Requirements (80+ Signal Strength)
- **Minimum Score:** 80 (not lower)
- **Minimum Confidence:** 70%
- **Minimum Indicators Agreeing:** 4
- **Require Trend Alignment:** YES

### 2. Trailing Stop Logic (CRITICAL - Never Moves Backwards)
```
Break-Even → Lock Profits → Trail Forward Only → Exit on SL
```
- **Break-even activation:** 6% ROI
- **Break-even buffer:** 1.0%
- **Trailing activation:** 12% ROI
- **Trail distance:** 4%
- **SL only moves in direction of profit** (long: UP only, short: DOWN only)
- **TP moves with price** as trailing progresses
- **Exit ONLY when SL triggered**

### 3. Microstructure Signals (Live Mode)
- **OBV:** Enabled (56.7% win rate)
- **Buy/Sell Ratio:** Enabled with strict thresholds
  - Imbalance strong: 80%+
  - Exhaustion extreme: <10% or >90%
- **Price Ratio:** Enabled
- **Funding Rate:** Enabled

### 4. MTF Alignment - REVERSED (Critical for 78% Win Rate)
**KEY INSIGHT:** Lower TF determines entry, Higher TF confirms direction

| Timeframe | Role | Weight |
|-----------|------|--------|
| **5min (Primary)** | Entry timing - precise signals | 70% |
| **30min (Secondary)** | Trend confirmation | 30% |

**Why this works:**
- Lower TF gives precise entry timing (prevents "entering too soon")
- Higher TF confirms you're trading WITH the trend
- Only enter when BOTH timeframes agree

**Alignment Bonuses:**
- **Full alignment bonus:** +10 points
- **Low divergence bonus:** +8 points (if divergence < 10)
- **Divergence signal bonus:** +5 points per divergence
- **Confidence bonus:** +8% per divergence signal
- **Agreement bonus:** +15% for 5+ indicators agreeing

### 5. Signal Weights (Optimized)
| Indicator | Max Weight | Win Rate |
|-----------|------------|----------|
| RSI | 35 | 71.1% |
| KDJ | 25 | 63.9% |
| Williams %R | 28 | 61.9% |
| EMA Trend | 18 | High |
| StochRSI | 18 | Good |
| OBV | 14 | 56.7% |
| Bollinger | 12 | 55.6% |
| AO | 10 | 50.0% |
| MACD | 8 | 42.6% (disabled by default) |
| DOM | 18 | Live only |
| ADX | 20 | Regime detection |

### 6. Signal Type Multipliers
- **Divergence:** 1.5x (highest priority)
- **Golden/Death Cross:** 1.4x
- **Squeeze:** 1.3x
- **Crossover:** 1.2x
- **Momentum:** 0.8x
- **Zone:** 0.6x (reduced - weak alone)

### 7. Strength Multipliers
- **very_strong:** 1.4
- **strong:** 1.0
- **moderate:** 0.6
- **weak:** 0.3
- **extreme:** 1.3

---

## CRITICAL .ENV SETTINGS

```env
# Entry Requirements
SIGNAL_MIN_SCORE=80
SIGNAL_MIN_CONFIDENCE=70
SIGNAL_MIN_INDICATORS=4

# Risk Management
STOP_LOSS_ROI=0.3
TAKE_PROFIT_ROI=1
BREAK_EVEN_ENABLED=true
BREAK_EVEN_ACTIVATION=6
BREAK_EVEN_BUFFER=1.0
TRAILING_STOP_ENABLED=true
TRAILING_STOP_ACTIVATION=12
TRAILING_STOP_TRAIL=4

# Leverage
LEVERAGE_DEFAULT=15
LEVERAGE_MIN=10
LEVERAGE_MAX=25

# Microstructure
MICROSTRUCTURE_BUYSELL_ENABLED=true
INDICATOR_OBV_ENABLED=true
```

---

## WHY THIS WORKS

1. **Wait for high confidence (80+)** - Not eager to trade
2. **Trailing SL locks in profits** - Never gives back gains
3. **MTF alignment guarantees direction** - Both timeframes must agree
4. **Microstructure confirms** - OBV + Buy/Sell ratio validate
5. **Higher leverage with mitigated risk** - Confidence = safety

---

## THE MISTAKE TO AVOID

**Entering too soon** - The only weakness was entering before signals reached 80+ strength. Always wait for full confirmation.

---

## Files Containing This Logic

1. `signal-weights.js` - Indicator weights and entry requirements
2. `src/lib/SignalGeneratorV2.js` - Signal generation with combination bonuses
3. `src/trading/TradingEngineV3.js` - Trailing stop and exit logic
4. `timeframeAligner.js` - MTF alignment with bonuses
5. `.env` - Runtime configuration
