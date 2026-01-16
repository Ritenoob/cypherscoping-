# Strategy Profiles Guide

This guide provides detailed information about the trading bot's strategy profiles, including their configuration, usage, and behavior under different market conditions.

## Overview

The trading bot includes three primary strategy profiles, each designed for different risk tolerances and trading objectives. All profiles have been updated with stricter confidence requirements to ensure higher-quality trade signals.

## Profile Specifications

### Conservative Profile

**Purpose:** Capital preservation with minimal risk exposure

**Configuration:**
- **Minimum Score:** 70 (signal strength threshold)
- **Minimum Confidence:** 80% (signal certainty requirement)
- **Minimum Indicators Agreeing:** 5 (consensus requirement)
- **Maximum Leverage:** 25x
- **Position Size:** Maximum 1% per trade
- **Stop Loss ROI:** 0.3
- **Take Profit ROI:** 1.5

**Characteristics:**
- Requires strong trend alignment
- Requires volume confirmation
- Avoids extreme funding conditions
- Lowest number of trades, highest accuracy focus
- Prioritizes EMA trend indicators (weight: 25)
- Conservative with RSI (weight: 20)

**Use Cases:**
- Bear markets or high volatility periods
- When protecting accumulated profits
- Long-term portfolio growth with minimal drawdown
- New traders learning the system

**Example Scenario:**
```javascript
Signal Input:
- Score: 75
- Confidence: 82%
- Indicators Agreeing: 5

Result: ✅ PASSES - Trade executed with conservative parameters
```

```javascript
Signal Input:
- Score: 75
- Confidence: 78%
- Indicators Agreeing: 5

Result: ❌ FILTERED - Confidence below 80% threshold
```

### Neutral Profile

**Purpose:** Balanced risk-reward approach for typical market conditions

**Configuration:**
- **Minimum Score:** 50 (signal strength threshold)
- **Minimum Confidence:** 85% (signal certainty requirement)
- **Minimum Indicators Agreeing:** 4 (consensus requirement)
- **Maximum Leverage:** 50x
- **Position Size:** Maximum 2% per trade
- **Stop Loss ROI:** 0.5
- **Take Profit ROI:** 2.0

**Characteristics:**
- Balanced indicator weights across all indicators
- Requires trend alignment
- Does not require volume confirmation
- Avoids extreme funding conditions
- Standard risk-reward ratio
- Moderate trade frequency

**Use Cases:**
- Normal market conditions
- Default profile for automated trading
- Balanced growth strategy
- Experienced traders with proven strategy

**Example Scenario:**
```javascript
Signal Input:
- Score: 55
- Confidence: 87%
- Indicators Agreeing: 4

Result: ✅ PASSES - Trade executed with neutral parameters
```

```javascript
Signal Input:
- Score: 55
- Confidence: 87%
- Indicators Agreeing: 3

Result: ❌ FILTERED - Only 3 indicators agreeing (need 4)
```

### Aggressive Profile

**Purpose:** Maximum trading opportunities with higher risk tolerance

**Configuration:**
- **Minimum Score:** 40 (signal strength threshold)
- **Minimum Confidence:** 90% (signal certainty requirement)
- **Minimum Indicators Agreeing:** 3 (consensus requirement)
- **Maximum Leverage:** 100x
- **Position Size:** Maximum 5% per trade
- **Stop Loss ROI:** 1.0
- **Take Profit ROI:** 3.0

**Characteristics:**
- Highest confidence requirement (90%)
- Emphasizes momentum indicators (RSI, MACD, Williams %R)
- Does not require trend alignment
- Does not require volume confirmation
- No funding rate restrictions
- Highest trade frequency
- Larger position sizes and leverage

**Use Cases:**
- Strong trending markets
- High conviction setups
- Short-term profit maximization
- Experienced traders with high risk tolerance
- Markets with clear directional bias

**Example Scenario:**
```javascript
Signal Input:
- Score: 45
- Confidence: 92%
- Indicators Agreeing: 3

Result: ✅ PASSES - Trade executed with aggressive parameters
```

```javascript
Signal Input:
- Score: 45
- Confidence: 88%
- Indicators Agreeing: 3

Result: ❌ FILTERED - Confidence below 90% threshold
```

## Scalping Profile (Unchanged)

**Purpose:** Quick trades with tight stops for frequent small profits

**Note:** This profile remains unchanged from its original configuration. It is optimized for high-frequency trading with shorter timeframes.

**Configuration:**
- Focus on quick momentum shifts
- Tight stop losses (ROI: 0.2)
- Smaller take profits (ROI: 0.8)
- Moderate leverage (15x)
- Medium position sizes (60%)

## Key Updates

### What Changed (January 2026)

All three main profiles (Conservative, Neutral, Aggressive) have been updated with stricter confidence requirements:

1. **Conservative:** Confidence increased from 60% → 80%
2. **Neutral:** Confidence increased from 40% → 85%
3. **Aggressive:** Confidence increased from 30% → 90%

### Rationale

The confidence threshold increases ensure:
- Higher quality signals with better win rates
- Reduced false positives during choppy markets
- Better alignment with the bot's sophisticated multi-indicator system
- Paradoxically, the Aggressive profile now has the HIGHEST confidence requirement, making it aggressive in position sizing but conservative in signal selection

### Backward Compatibility

These changes are applied automatically when the strategy profiles are loaded. No configuration changes are required. The profiles maintain their distinct characteristics while all benefit from improved signal quality gates.

## Usage Examples

### Selecting a Profile Programmatically

```javascript
const StrategyRouter = require('./switches/strategyRouter');

const router = new StrategyRouter();

// Set active strategy
router.setActiveStrategy('conservative');

// Route a signal through the active strategy
const signal = {
  score: 75,
  confidence: 82,
  indicatorsAgreeing: 5,
  direction: 'long'
};

const indicators = {
  // ... indicator data
};

const routedSignal = router.routeSignal(signal, indicators);

if (routedSignal) {
  console.log('Trade signal passed filters:', routedSignal);
} else {
  console.log('Trade signal was filtered out');
}
```

### Profile Selection Strategy

**Market Conditions → Profile Mapping:**

| Market Condition | Recommended Profile | Reason |
|-----------------|-------------------|---------|
| High volatility, uncertain direction | Conservative | Capital preservation |
| Stable trending market | Neutral | Balanced approach |
| Strong trend with clear direction | Aggressive | Maximize opportunities |
| Choppy, sideways market | Conservative or Scalping | Avoid false breakouts |
| Pre-major news events | Conservative | Reduce exposure |
| Post-major news with clear trend | Aggressive | Capitalize on momentum |

## Testing Your Profile Configuration

Run the strategy profile test suite:

```bash
npm run test:strategy-profiles
```

Or directly:

```bash
node tests/strategyProfiles.test.js
```

The test suite validates:
- ✓ Correct threshold values
- ✓ Profile filtering logic
- ✓ Signal activation scenarios
- ✓ Signal rejection scenarios
- ✓ Edge case handling
- ✓ Profile comparison logic

## Advanced Configuration

### Custom Profile Creation

You can create custom profiles by adding new files to `/switches/signalProfiles/`:

```javascript
/**
 * Custom Profile Example
 */
module.exports = {
  name: 'custom',
  description: 'Custom profile description',
  
  weights: {
    rsi: 20,
    macd: 20,
    // ... other indicator weights
  },
  
  thresholds: {
    minScoreForEntry: 60,
    strongSignalThreshold: 75,
    minConfidence: 85,
    minIndicatorsAgreeing: 4
  },
  
  riskManagement: {
    stopLossROI: 0.4,
    takeProfitROI: 2.5,
    maxPositionPercent: 1.5,
    maxOpenPositions: 4,
    maxDailyDrawdown: 4.0
  },
  
  leverage: {
    maxLeverage: 40,
    defaultLeverage: 30,
    volatilityReduction: 0.4
  },
  
  filters: {
    requireTrendAlignment: true,
    requireVolumeConfirmation: false,
    avoidFundingExtreme: true,
    minATRPercent: 0.25,
    maxATRPercent: 2.5
  }
};
```

### Register Custom Profile

```javascript
router.registerStrategy('custom', require('./signalProfiles/custom'));
router.setActiveStrategy('custom');
```

## Monitoring Profile Performance

Track which profile is active and monitor performance:

```javascript
router.on('strategyChanged', ({ strategy }) => {
  console.log(`Strategy changed to: ${strategy}`);
});

router.on('signalRouted', (signal) => {
  console.log(`Signal routed via ${signal.strategy} profile`);
});
```

## Best Practices

1. **Start Conservative:** New users should begin with the Conservative profile to understand the system
2. **Monitor Performance:** Track win rates and profit factors for each profile
3. **Market Adaptation:** Switch profiles based on market conditions
4. **Risk Management:** Never exceed your personal risk tolerance regardless of profile
5. **Backtesting:** Always backtest profile changes before live trading
6. **Position Sizing:** Respect the profile's recommended position sizes
7. **Stop Losses:** Never disable or widen stop losses beyond profile recommendations

## Troubleshooting

### No Trades Being Executed

**Possible Causes:**
- Signal confidence below profile threshold
- Not enough indicators agreeing
- Filters blocking trades (trend alignment, volume confirmation)
- Score below minimum entry threshold

**Solution:** Review recent signals and check which filter is rejecting them. Consider switching to a less restrictive profile if market conditions warrant it.

### Too Many Trades

**Possible Causes:**
- Using Aggressive profile in choppy markets
- Profile thresholds too low for current volatility

**Solution:** Switch to Conservative or Neutral profile, or create custom profile with stricter thresholds.

## Conclusion

The updated strategy profiles provide a robust framework for trading across different market conditions and risk tolerances. The enhanced confidence requirements ensure higher quality signals while maintaining distinct profile characteristics. Choose the profile that aligns with your risk tolerance and current market conditions, and adjust as needed based on performance monitoring.

For questions or custom profile assistance, consult the main README.md or review the test suite for usage examples.
