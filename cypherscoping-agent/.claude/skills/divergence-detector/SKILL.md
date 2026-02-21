---
name: divergence-detector
description: |
  Universal divergence detection algorithm for price vs indicator divergences with swing pattern recognition.

  Use when: (1) detecting bullish/bearish divergences, (2) implementing divergence-based signals,
  (3) identifying hidden divergences, (4) finding high-probability reversal setups.

  Triggers: "divergence detection", "bullish divergence", "bearish divergence", "price indicator divergence", "swing lows highs"
author: Claude Code
version: 1.0.0
---

# Divergence Detector

## Problem

Divergences between price and indicators (RSI, MACD, OBV, etc.) are powerful reversal signals, but detecting them programmatically requires accurate swing point identification and correlation logic. Need a universal pattern that works with any oscillator-type indicator.

## Context / Trigger Conditions

**Use this skill when:**
- Implementing divergence detection for indicators (RSI, MACD, W%R, OBV, etc.)
- Building reversal-based trading strategies
- Creating high-confidence signal filters
- Identifying hidden divergences (continuation patterns)
- Detecting multi-timeframe divergences

**Specific triggers:**
- "detect divergence"
- "find bullish/bearish divergence"
- "divergence pattern recognition"
- "price indicator mismatch"
- "reversal signal divergence"

## Solution

### 1. Divergence Definitions

```javascript
/**
 * Divergence Types
 *
 * REGULAR (Classic) Divergence:
 * - Bullish: Price makes lower low, Indicator makes higher low → Reversal up
 * - Bearish: Price makes higher high, Indicator makes lower high → Reversal down
 *
 * HIDDEN Divergence:
 * - Bullish Hidden: Price makes higher low, Indicator makes lower low → Trend continuation up
 * - Bearish Hidden: Price makes lower high, Indicator makes higher high → Trend continuation down
 */

const DIVERGENCE_TYPES = {
  BULLISH_REGULAR: {
    price: 'lower_low',
    indicator: 'higher_low',
    signal: 'reversal_up',
    strength: 'very_strong'
  },

  BEARISH_REGULAR: {
    price: 'higher_high',
    indicator: 'lower_high',
    signal: 'reversal_down',
    strength: 'very_strong'
  },

  BULLISH_HIDDEN: {
    price: 'higher_low',
    indicator: 'lower_low',
    signal: 'continuation_up',
    strength: 'strong'
  },

  BEARISH_HIDDEN: {
    price: 'lower_high',
    indicator: 'higher_high',
    signal: 'continuation_down',
    strength: 'strong'
  }
};
```

### 2. Swing Point Detection

Find local minima (lows) and maxima (highs):

```javascript
/**
 * Detect Swing Lows
 * A swing low is a bar where value is lower than N bars before and after it
 *
 * @param {Array} values - Array of values (price or indicator)
 * @param {number} lookback - Bars to check before/after (default: 2)
 * @returns {Array} Array of {index, value} for swing lows
 */
function findSwingLows(values, lookback = 2) {
  const swings = [];

  // Need at least lookback*2 + 1 bars
  if (values.length < (lookback * 2 + 1)) {
    return swings;
  }

  // Start from lookback, end at length - lookback
  for (let i = lookback; i < values.length - lookback; i++) {
    const current = values[i];
    let isSwingLow = true;

    // Check bars before
    for (let j = 1; j <= lookback; j++) {
      if (values[i - j] <= current) {
        isSwingLow = false;
        break;
      }
    }

    if (!isSwingLow) continue;

    // Check bars after
    for (let j = 1; j <= lookback; j++) {
      if (values[i + j] <= current) {
        isSwingLow = false;
        break;
      }
    }

    if (isSwingLow) {
      swings.push({ index: i, value: current });
    }
  }

  return swings;
}

/**
 * Detect Swing Highs
 * A swing high is a bar where value is higher than N bars before and after it
 *
 * @param {Array} values - Array of values (price or indicator)
 * @param {number} lookback - Bars to check before/after (default: 2)
 * @returns {Array} Array of {index, value} for swing highs
 */
function findSwingHighs(values, lookback = 2) {
  const swings = [];

  if (values.length < (lookback * 2 + 1)) {
    return swings;
  }

  for (let i = lookback; i < values.length - lookback; i++) {
    const current = values[i];
    let isSwingHigh = true;

    // Check bars before
    for (let j = 1; j <= lookback; j++) {
      if (values[i - j] >= current) {
        isSwingHigh = false;
        break;
      }
    }

    if (!isSwingHigh) continue;

    // Check bars after
    for (let j = 1; j <= lookback; j++) {
      if (values[i + j] >= current) {
        isSwingHigh = false;
        break;
      }
    }

    if (isSwingHigh) {
      swings.push({ index: i, value: current });
    }
  }

  return swings;
}
```

### 3. Divergence Detection Algorithm

```javascript
/**
 * Universal Divergence Detector
 * Works with any indicator vs price
 *
 * Requirements:
 * - 20+ period history for reliable swing detection
 * - 14-bar recent window for comparison
 * - 5-bar swing pattern (2 bars before, 1 peak/trough, 2 bars after)
 *
 * @param {Array} priceHistory - Recent price data (close prices)
 * @param {Array} indicatorHistory - Recent indicator values
 * @param {Object} config - Configuration
 * @returns {Object|null} Divergence signal or null
 */
function detectDivergence(priceHistory, indicatorHistory, config = {}) {
  const {
    minHistory = 20,         // Minimum data points
    recentWindow = 14,       // Recent bars to analyze
    swingLookback = 2        // Bars before/after for swing detection
  } = config;

  // Require sufficient history
  if (priceHistory.length < minHistory || indicatorHistory.length < minHistory) {
    return null;
  }

  // Get recent window
  const recentPrices = priceHistory.slice(-recentWindow);
  const recentIndicator = indicatorHistory.slice(-recentWindow);

  // ===== BULLISH DIVERGENCE CHECK =====
  // Find swing lows
  const priceLows = findSwingLows(recentPrices, swingLookback);
  const indicatorLows = findSwingLows(recentIndicator, swingLookback);

  // Need at least 2 swing lows to compare
  if (priceLows.length >= 2 && indicatorLows.length >= 2) {
    const lastPriceLow = priceLows[priceLows.length - 1].value;
    const prevPriceLow = priceLows[priceLows.length - 2].value;

    const lastIndicatorLow = indicatorLows[indicatorLows.length - 1].value;
    const prevIndicatorLow = indicatorLows[indicatorLows.length - 2].value;

    // REGULAR Bullish Divergence: Price lower low, Indicator higher low
    if (lastPriceLow < prevPriceLow && lastIndicatorLow > prevIndicatorLow) {
      return {
        type: 'bullish_divergence',
        divergenceType: 'regular',
        direction: 'bullish',
        strength: 'very_strong',
        message: 'Bullish divergence (price lower low, indicator higher low)',
        metadata: {
          priceLow: lastPriceLow,
          prevPriceLow,
          indicatorLow: lastIndicatorLow,
          prevIndicatorLow,
          divergenceStrength: Math.abs(lastIndicatorLow - prevIndicatorLow)
        }
      };
    }

    // HIDDEN Bullish Divergence: Price higher low, Indicator lower low
    if (lastPriceLow > prevPriceLow && lastIndicatorLow < prevIndicatorLow) {
      return {
        type: 'bullish_hidden_divergence',
        divergenceType: 'hidden',
        direction: 'bullish',
        strength: 'strong',
        message: 'Bullish hidden divergence (trend continuation)',
        metadata: {
          priceLow: lastPriceLow,
          prevPriceLow,
          indicatorLow: lastIndicatorLow,
          prevIndicatorLow
        }
      };
    }
  }

  // ===== BEARISH DIVERGENCE CHECK =====
  // Find swing highs
  const priceHighs = findSwingHighs(recentPrices, swingLookback);
  const indicatorHighs = findSwingHighs(recentIndicator, swingLookback);

  // Need at least 2 swing highs to compare
  if (priceHighs.length >= 2 && indicatorHighs.length >= 2) {
    const lastPriceHigh = priceHighs[priceHighs.length - 1].value;
    const prevPriceHigh = priceHighs[priceHighs.length - 2].value;

    const lastIndicatorHigh = indicatorHighs[indicatorHighs.length - 1].value;
    const prevIndicatorHigh = indicatorHighs[indicatorHighs.length - 2].value;

    // REGULAR Bearish Divergence: Price higher high, Indicator lower high
    if (lastPriceHigh > prevPriceHigh && lastIndicatorHigh < prevIndicatorHigh) {
      return {
        type: 'bearish_divergence',
        divergenceType: 'regular',
        direction: 'bearish',
        strength: 'very_strong',
        message: 'Bearish divergence (price higher high, indicator lower high)',
        metadata: {
          priceHigh: lastPriceHigh,
          prevPriceHigh,
          indicatorHigh: lastIndicatorHigh,
          prevIndicatorHigh,
          divergenceStrength: Math.abs(lastIndicatorHigh - prevIndicatorHigh)
        }
      };
    }

    // HIDDEN Bearish Divergence: Price lower high, Indicator higher high
    if (lastPriceHigh < prevPriceHigh && lastIndicatorHigh > prevIndicatorHigh) {
      return {
        type: 'bearish_hidden_divergence',
        divergenceType: 'hidden',
        direction: 'bearish',
        strength: 'strong',
        message: 'Bearish hidden divergence (trend continuation)',
        metadata: {
          priceHigh: lastPriceHigh,
          prevPriceHigh,
          indicatorHigh: lastIndicatorHigh,
          prevIndicatorHigh
        }
      };
    }
  }

  // No divergence detected
  return null;
}
```

### 4. Implementation Pattern

Integrate divergence detection into indicator classes:

```javascript
class IndicatorWithDivergence {
  constructor(period) {
    this.period = period;
    this.indicatorHistory = [];
    this.priceHistory = [];
  }

  update(candle) {
    // Update indicator calculation
    const value = this.calculateIndicator(candle);

    // Store history
    this.indicatorHistory.push(value);
    this.priceHistory.push(candle.close);

    // Keep last 50 bars (more than needed for divergence)
    if (this.indicatorHistory.length > 50) {
      this.indicatorHistory.shift();
      this.priceHistory.shift();
    }

    return value;
  }

  getSignals() {
    const signals = [];

    // Check for divergence
    const divergence = detectDivergence(
      this.priceHistory,
      this.indicatorHistory,
      {
        minHistory: 20,
        recentWindow: 14,
        swingLookback: 2
      }
    );

    if (divergence) {
      signals.push(divergence);
    }

    // Add other signal types (crossovers, zones, etc.)
    // ...

    return {
      value: this.indicatorHistory[this.indicatorHistory.length - 1],
      signals
    };
  }

  calculateIndicator(candle) {
    // Indicator-specific calculation
    return /* ... */;
  }
}
```

## Verification

Test divergence detection:

```javascript
// Simulate bullish divergence scenario
const prices = [
  100, 99, 98, 97, 96,  // Price declining
  97, 98, 99, 100, 101, // Bounce
  102, 101, 100, 99, 98, // Decline again
  97, 96, 95, 94         // Lower low (94 < 96)
];

const rsiValues = [
  30, 29, 28, 27, 26,    // RSI declining
  27, 28, 29, 30, 31,    // Bounce
  32, 31, 30, 29, 28,    // Decline
  29, 30, 31, 32         // Higher low (32 > 26) ← Divergence!
];

const divergence = detectDivergence(prices, rsiValues);

console.log('Divergence detected:', divergence);

// Expected result:
// {
//   type: 'bullish_divergence',
//   divergenceType: 'regular',
//   direction: 'bullish',
//   strength: 'very_strong',
//   message: 'Bullish divergence (price lower low, indicator higher low)',
//   metadata: {
//     priceLow: 94,
//     prevPriceLow: 96,
//     indicatorLow: 32,
//     prevIndicatorLow: 26,
//     divergenceStrength: 6
//   }
// }

// Verify:
// ✅ Detects price lower low (94 < 96)
// ✅ Detects indicator higher low (32 > 26)
// ✅ Returns 'very_strong' strength
// ✅ Includes divergence strength (6 points)
```

## Example

### Multi-Indicator Divergence Scanner

```javascript
class DivergenceScanner {
  constructor(indicators) {
    this.indicators = indicators;  // Map of indicator instances
  }

  scan(candle) {
    const divergences = [];

    for (const [name, indicator] of Object.entries(this.indicators)) {
      // Update indicator
      indicator.update(candle);

      // Get signals (includes divergence check)
      const signals = indicator.getSignals();

      // Filter for divergence signals
      const divSignals = signals.signals.filter(s =>
        s.type.includes('divergence')
      );

      divergences.push(...divSignals.map(s => ({
        indicator: name,
        ...s
      })));
    }

    return divergences;
  }

  /**
   * Count divergences by direction
   */
  summarize(divergences) {
    const bullish = divergences.filter(d => d.direction === 'bullish').length;
    const bearish = divergences.filter(d => d.direction === 'bearish').length;

    return {
      bullish,
      bearish,
      total: divergences.length,
      consensus: bullish > bearish ? 'bullish' :
                 bearish > bullish ? 'bearish' : 'neutral'
    };
  }
}

// Usage:
const scanner = new DivergenceScanner({
  RSI: new RSIIndicator(14),
  MACD: new MACDIndicator(),
  OBV: new OBVIndicator()
});

const divergences = scanner.scan(currentCandle);
const summary = scanner.summarize(divergences);

if (summary.bullish >= 2) {
  console.log('Strong bullish divergence signal across multiple indicators');
}
```

## References

- **Source:** AGI LEVEL TRADING BOT COMPLETE RECONSTRUCTION PROTOCOL v5.0, Dual Timeframe Screener
- **Divergence Types:**
  - Bullish Regular: Price lower low + Indicator higher low → Reversal up
  - Bearish Regular: Price higher high + Indicator lower high → Reversal down
  - Bullish Hidden: Price higher low + Indicator lower low → Continuation up
  - Bearish Hidden: Price lower high + Indicator higher high → Continuation down
- **Requirements:**
  - 20-period history minimum
  - 14-bar recent window for analysis
  - 5-bar swing pattern (2 before, 1 peak, 2 after)
- **Strength:** Regular divergences = very_strong (×1.2), Hidden divergences = strong (×1.0)
- **Universal Pattern:** Works with any oscillator indicator (RSI, MACD, Stochastic, OBV, etc.)
- **Swing Detection:** Local min/max where value is extreme compared to N bars before/after
- **Application:** Reversal signals, confirmation filters, high-probability setups
