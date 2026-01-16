# Comprehensive Optimization Summary - 2026-01-14

## Baseline Performance (Before Optimization)
- **Win Rate:** 12.50% (1 win out of 8 trades)
- **Profit Factor:** 1.67
- **Sharpe Ratio:** -0.05
- **Total Return:** -0.67%
- **Problem:** 7/8 trades hit stop loss immediately

## Root Cause Analysis
1. **Stop Loss Too Tight:** 5% ROI with 10-15x leverage = 0.33-0.5% price move
2. **Signal Quality Low:** Zone-only signals have poor predictive value
3. **No Divergence Priority:** Divergence signals (highest accuracy) treated same as zones
4. **MTF Alignment Weak:** 60/40 split allowed divergent signals
5. **Entry Requirements Loose:** Low confidence signals were traded

---

## Optimizations Made

### 1. Signal Weights (`signal-weights.js`)

#### Indicator Weight Changes
| Indicator | Before | After | Rationale |
|-----------|--------|-------|-----------|
| RSI | 30 | **35** | Best performer (71.1% win rate) |
| KDJ | 18 | **25** | 2nd best (63.9% win rate) |
| Williams %R | 25 | **28** | Strong (61.9% win rate) |
| EMA Trend | 15 | **18** | High accuracy on trend signals |
| StochRSI | 15 | **18** | Good complementary signals |
| OBV | 12 | **14** | Volume confirmation valuable |
| Bollinger | 10 | **12** | Squeeze signals valuable |
| AO | 10 | 10 | Moderate performer (50%) |
| MACD | 12 | **8** | Worst standalone (42.6%) - disabled by default |

#### Signal Type Multipliers (NEW)
```javascript
signalTypeMultipliers: {
  'divergence': 1.5,      // Highest predictive accuracy
  'crossover': 1.2,       // Reliable entry signals
  'squeeze': 1.3,         // BB squeeze is valuable
  'golden_death_cross': 1.4,  // Major trend changes
  'zone': 0.6,            // REDUCED - zones alone are weak
  'momentum': 0.8         // Secondary importance
}
```

#### Strength Multipliers
| Strength | Before | After |
|----------|--------|-------|
| very_strong | 1.2 | **1.4** |
| strong | 1.0 | 1.0 |
| moderate | 0.7 | **0.6** |
| weak | 0.5 | **0.3** |
| extreme | 1.1 | **1.3** |

#### Score Caps Increased
- Indicator cap: 110 → **120**
- Microstructure cap: 30 → **35**
- Total cap: 140 → **150**

#### Entry Requirements (NEW)
```javascript
entryRequirements: {
  minScore: 85,           // Was ~50-80
  minConfidence: 70,      // Was 40-65
  minIndicatorsAgreeing: 4,  // Was 3
  requireTrendAlignment: true  // NEW
}
```

---

### 2. Signal Generator (`SignalGeneratorV2.js`)

#### New Features
- **Signal Type Multipliers:** Divergence signals get 1.5x weight
- **Entry Requirements Check:** Validates all requirements before flagging trade-worthy
- **Divergence Count Tracking:** Counts divergence signals for confidence boost
- **Trend Alignment Check:** Ensures signals align with EMA trend

#### Confidence Calculation Improved
```javascript
confidence = (agreement * 60) +
             (indicatorAgreementBonus) +   // Up to 20%
             (divergenceBonus);            // 10% per divergence
```

---

### 3. MTF Alignment (`timeframeAligner.js`)

#### Weight Distribution
- Primary: 60% → **70%**
- Secondary: 40% → **30%**

#### Stricter Requirements
- Max divergence: 30 → **25**
- Require full alignment: **true** (no divergent directions allowed)
- Min aligned confidence: **65%**
- Min primary score: **50**

#### New Methods
- `meetsEntryRequirements()` - Validates all conditions
- `_calculateAlignmentBonus()` - Bonus for strong alignment

---

### 4. Risk Management (`.env`)

#### Leverage Settings
| Setting | Before | After | Impact |
|---------|--------|-------|--------|
| Default | 15 | **5** | 2% price move = 10% ROI |
| Min | 15 | **3** | Safety floor |
| Max | 100 | **15** | Avoid over-leverage |

#### Stop Loss / Take Profit (ROI-Based)
| Setting | Before | After | Rationale |
|---------|--------|-------|-----------|
| Stop Loss | 5% | **10%** | Survive volatility |
| Take Profit | 100% | **30%** | Achievable target |

At 5x leverage:
- 10% ROI loss = 2% price move (reasonable for BTC)
- 30% ROI gain = 6% price move (achievable)

#### Trailing Stop
| Setting | Before | After |
|---------|--------|-------|
| Break-even activation | 3% | **8%** |
| Break-even buffer | 0.5% | **1%** |
| Trailing activation | 4% | **12%** |
| Trail distance | 2% | **4%** |

#### Signal Thresholds
| Setting | Before | After |
|---------|--------|-------|
| Min score | 80 | **85** |
| Strong score | 90 | **100** |
| Extreme score | 100 | **120** |
| Min confidence | 65% | **70%** |
| Min indicators | 3 | **4** |
| Cooldown | 60s | **180s** |

---

## Expected Impact

### Fewer Trades, Higher Quality
- Before: ~8 trades in backtest period
- After: Expected ~3-5 trades per week
- All trades require 4+ indicators agreeing + divergence priority

### Wider Stops = Survive Volatility
- Before: 0.5% price move = stopped out
- After: 2% price move required for stop

### Better Risk/Reward
- Before: 5% risk for 100% reward (rarely hit)
- After: 10% risk for 30% reward (3:1 achievable)

### Divergence Priority
- Divergence signals now get 1.5x multiplier
- Zone-only signals reduced to 0.6x
- Focus on highest accuracy signal types

---

## Files Modified
1. `signal-weights.js` - Complete rewrite with optimized weights
2. `src/lib/SignalGeneratorV2.js` - Added type multipliers, entry requirements
3. `timeframeAligner.js` - Stricter alignment requirements
4. `.env` - Risk management parameters
5. `tests/signalGenerator.test.js` - Updated test data for new scoring

## Tests
All **69/69 tests passing** (100%)

---

## Next Steps
1. Run backtest with new parameters
2. Compare win rate and profit factor
3. Fine-tune based on results
4. Paper trade for validation
