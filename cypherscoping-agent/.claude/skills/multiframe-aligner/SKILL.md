---
name: multiframe-aligner
description: |
  Cross-timeframe signal confirmation using indicator alignment across multiple timeframes.

  Use when: (1) confirming signals across fast and slow timeframes, (2) filtering false signals with MTF confirmation,
  (3) detecting divergences between timeframes, (4) implementing dual-timeframe entry strategies.

  Triggers: "multi-timeframe", "dual timeframe", "cross timeframe confirmation", "MTF alignment", "timeframe divergence"
author: Claude Code
version: 1.0.0
---

# Multi-Timeframe Aligner

## Problem

Single-timeframe analysis produces many false signals. Confirming signals across multiple timeframes significantly improves signal quality by filtering out noise that only appears on fast timeframes. Need systematic way to align indicator readings across 2-4 timeframes.

## Context / Trigger Conditions

**Use this skill when:**
- Implementing dual-timeframe trading strategies
- Filtering false breakouts with higher TF confirmation
- Detecting MTF divergences (e.g., M5 bullish but H1 bearish)
- Building screeners that scan multiple timeframes
- Creating signal strength scoring based on MTF agreement

**Specific triggers:**
- "align signals across timeframes"
- "multi-timeframe confirmation"
- "dual timeframe analysis"
- "MTF divergence detection"
- "cross-timeframe validation"

## Solution

### 1. Alignment Logic

Require minimum number of indicators to align across both timeframes:

```javascript
/**
 * Multi-Timeframe Alignment Configuration
 *
 * minAligned: Minimum indicators that must agree (e.g., 2 out of 4)
 * timeframes: Array of timeframe pairs to check
 * indicators: List of indicators to evaluate
 */
const MTF_CONFIG = {
  primaryTimeframe: '5m',      // Fast timeframe (entry signals)
  secondaryTimeframe: '15m',   // Slow timeframe (trend filter)
  minAligned: 2,               // Require 2/4 indicators to align
  indicators: ['RSI', 'MACD', 'WilliamsR', 'AO']
};

/**
 * Indicator-Specific Thresholds
 * Define what constitutes bullish/bearish for each indicator
 */
const INDICATOR_THRESHOLDS = {
  RSI: {
    bullish: (value) => value < 30,    // Oversold
    bearish: (value) => value > 70     // Overbought
  },

  MACD: {
    bullish: (histogram) => histogram > 0,    // Above signal line
    bearish: (histogram) => histogram < 0     // Below signal line
  },

  WilliamsR: {
    bullish: (value) => value < -80,   // Oversold
    bearish: (value) => value > -20    // Overbought
  },

  AO: {
    bullish: (value) => value > 0,     // Positive momentum
    bearish: (value) => value < 0      // Negative momentum
  }
};
```

### 2. Alignment Detection Algorithm

```javascript
/**
 * Check alignment across two timeframes
 *
 * @param {Object} tf1Indicators - Indicator values for timeframe 1
 * @param {Object} tf2Indicators - Indicator values for timeframe 2
 * @param {Object} config - Alignment configuration
 * @returns {Object} Alignment result
 */
function checkAlignment(tf1Indicators, tf2Indicators, config = MTF_CONFIG) {
  const alignedBullish = [];
  const alignedBearish = [];

  for (const indicator of config.indicators) {
    const tf1Value = tf1Indicators[indicator];
    const tf2Value = tf2Indicators[indicator];
    const thresholds = INDICATOR_THRESHOLDS[indicator];

    // Check if both timeframes show same direction
    const tf1Bullish = thresholds.bullish(tf1Value);
    const tf2Bullish = thresholds.bullish(tf2Value);
    const tf1Bearish = thresholds.bearish(tf1Value);
    const tf2Bearish = thresholds.bearish(tf2Value);

    // Aligned bullish: both timeframes bullish
    if (tf1Bullish && tf2Bullish) {
      alignedBullish.push(indicator);
    }

    // Aligned bearish: both timeframes bearish
    if (tf1Bearish && tf2Bearish) {
      alignedBearish.push(indicator);
    }
  }

  // Determine if alignment criteria are met
  const bullishMet = alignedBullish.length >= config.minAligned;
  const bearishMet = alignedBearish.length >= config.minAligned;

  if (bullishMet) {
    return {
      direction: 'bullish',
      indicators: alignedBullish,
      strength: alignedBullish.length / config.indicators.length,
      message: `Bullish alignment: ${alignedBullish.join(', ')}`
    };
  }

  if (bearishMet) {
    return {
      direction: 'bearish',
      indicators: alignedBearish,
      strength: alignedBearish.length / config.indicators.length,
      message: `Bearish alignment: ${alignedBearish.join(', ')}`
    };
  }

  return {
    direction: 'neutral',
    indicators: [],
    strength: 0,
    message: 'No alignment detected'
  };
}
```

### 3. MTF Divergence Detection

Detect when fast and slow timeframes disagree:

```javascript
/**
 * Detect Multi-Timeframe Divergence
 * Warning signal when fast TF shows strength but slow TF doesn't confirm
 *
 * @param {Object} fastTF - Fast timeframe signals
 * @param {Object} slowTF - Slow timeframe signals
 * @returns {Object|null} Divergence signal or null
 */
function detectMTFDivergence(fastTF, slowTF) {
  // Count bullish/bearish indicators per timeframe
  const fastBullish = countBullishIndicators(fastTF);
  const fastBearish = countBearishIndicators(fastTF);
  const slowBullish = countBullishIndicators(slowTF);
  const slowBearish = countBearishIndicators(slowTF);

  // Classic pump pattern: fast TF pumping, slow TF neutral/weak
  if (fastBullish >= 3 && slowBullish < 2) {
    return {
      type: 'bullish_divergence',
      warning: 'Fast TF showing strength not confirmed by slow TF',
      riskLevel: 'medium',
      recommendation: 'Wait for slow TF confirmation or reduce position size'
    };
  }

  // Classic dump pattern: fast TF dumping, slow TF neutral/weak
  if (fastBearish >= 3 && slowBearish < 2) {
    return {
      type: 'bearish_divergence',
      warning: 'Fast TF showing weakness not confirmed by slow TF',
      riskLevel: 'medium',
      recommendation: 'Wait for slow TF confirmation or reduce position size'
    };
  }

  // Strong confirmation: both TFs align
  if (fastBullish >= 2 && slowBullish >= 2) {
    return {
      type: 'strong_confirmation',
      direction: 'bullish',
      riskLevel: 'low',
      recommendation: 'Strong multi-timeframe confirmation'
    };
  }

  if (fastBearish >= 2 && slowBearish >= 2) {
    return {
      type: 'strong_confirmation',
      direction: 'bearish',
      riskLevel: 'low',
      recommendation: 'Strong multi-timeframe confirmation'
    };
  }

  return null;
}

function countBullishIndicators(indicators) {
  let count = 0;
  const thresholds = INDICATOR_THRESHOLDS;

  if (thresholds.RSI.bullish(indicators.RSI)) count++;
  if (thresholds.MACD.bullish(indicators.MACD_histogram)) count++;
  if (thresholds.WilliamsR.bullish(indicators.WilliamsR)) count++;
  if (thresholds.AO.bullish(indicators.AO)) count++;

  return count;
}

function countBearishIndicators(indicators) {
  let count = 0;
  const thresholds = INDICATOR_THRESHOLDS;

  if (thresholds.RSI.bearish(indicators.RSI)) count++;
  if (thresholds.MACD.bearish(indicators.MACD_histogram)) count++;
  if (thresholds.WilliamsR.bearish(indicators.WilliamsR)) count++;
  if (thresholds.AO.bearish(indicators.AO)) count++;

  return count;
}
```

### 4. Implementation Pattern

```javascript
class MultiTimeframeAligner {
  constructor(config = {}) {
    this.primaryTF = config.primaryTF || '5m';
    this.secondaryTF = config.secondaryTF || '15m';
    this.minAligned = config.minAligned || 2;
    this.indicators = config.indicators || ['RSI', 'MACD', 'WilliamsR', 'AO'];

    this.history = {
      [this.primaryTF]: [],
      [this.secondaryTF]: []
    };
  }

  /**
   * Update indicator values for a timeframe
   */
  update(timeframe, indicators) {
    this.history[timeframe].push({
      timestamp: Date.now(),
      ...indicators
    });

    // Keep last 100 readings
    if (this.history[timeframe].length > 100) {
      this.history[timeframe].shift();
    }
  }

  /**
   * Get current alignment status
   */
  getAlignment() {
    const primaryLatest = this.getLatest(this.primaryTF);
    const secondaryLatest = this.getLatest(this.secondaryTF);

    if (!primaryLatest || !secondaryLatest) {
      return null; // Not enough data
    }

    return checkAlignment(primaryLatest, secondaryLatest, {
      minAligned: this.minAligned,
      indicators: this.indicators
    });
  }

  /**
   * Detect MTF divergence
   */
  checkDivergence() {
    const primaryLatest = this.getLatest(this.primaryTF);
    const secondaryLatest = this.getLatest(this.secondaryTF);

    if (!primaryLatest || !secondaryLatest) {
      return null;
    }

    return detectMTFDivergence(primaryLatest, secondaryLatest);
  }

  /**
   * Get signal strength based on alignment percentage
   */
  getSignalStrength() {
    const alignment = this.getAlignment();
    if (!alignment) return 0;

    // Strength = aligned indicators / total indicators
    return alignment.strength;
  }

  /**
   * Get latest indicators for timeframe
   */
  getLatest(timeframe) {
    const history = this.history[timeframe];
    if (history.length === 0) return null;

    return history[history.length - 1];
  }
}
```

### 5. Alignment Scoring

Weight alignment in overall signal score:

```javascript
/**
 * Calculate MTF Alignment Score (0-100)
 * Used in overall signal scoring
 */
function calculateMTFAlignmentScore(alignment) {
  if (!alignment || alignment.direction === 'neutral') {
    return 50; // Neutral
  }

  // Base score from alignment strength (0-100)
  const baseScore = alignment.strength * 100;

  // Bonus for perfect alignment (all indicators agree)
  const perfectBonus = alignment.strength === 1.0 ? 10 : 0;

  // Direction multiplier
  const directionMultiplier = alignment.direction === 'bullish' ? 1 : -1;

  // Final score: 0-100 for bearish, 50 neutral, 50-100 for bullish
  return 50 + ((baseScore + perfectBonus) / 2) * directionMultiplier;
}

// Example usage in composite scoring:
const mtfScore = calculateMTFAlignmentScore(alignment);
const volumeScore = 70;  // From volume pressure analyzer
const momentumScore = 65; // From momentum indicators

const compositeScore =
  (volumeScore * 0.40) +
  (mtfScore * 0.30) +
  (momentumScore * 0.30);
```

## Verification

Test multi-timeframe alignment:

```javascript
const aligner = new MultiTimeframeAligner({
  primaryTF: '5m',
  secondaryTF: '15m',
  minAligned: 2
});

// Simulate bullish alignment scenario
aligner.update('5m', {
  RSI: 25,              // Bullish (oversold)
  MACD_histogram: 0.5,  // Bullish (above signal)
  WilliamsR: -85,       // Bullish (oversold)
  AO: 0.3               // Bullish (positive)
});

aligner.update('15m', {
  RSI: 28,              // Bullish (oversold)
  MACD_histogram: 0.3,  // Bullish (above signal)
  WilliamsR: -50,       // Neutral
  AO: 0.1               // Bullish (positive)
});

const alignment = aligner.getAlignment();
console.log('Alignment:', alignment);

// Expected result:
// {
//   direction: 'bullish',
//   indicators: ['RSI', 'MACD', 'AO'],  // 3/4 aligned
//   strength: 0.75,  // 75% alignment
//   message: 'Bullish alignment: RSI, MACD, AO'
// }

// Verify:
// ✅ Should detect bullish alignment (minAligned: 2, got 3)
// ✅ Strength should be 0.75 (3/4 indicators)
// ✅ Williams R not included (only one TF bullish)
```

## Example

### Dual-Timeframe Entry Strategy

```javascript
class DualTimeframeStrategy {
  constructor() {
    this.aligner = new MultiTimeframeAligner({
      primaryTF: '5m',
      secondaryTF: '15m',
      minAligned: 2
    });
  }

  evaluateEntry(symbol, indicators5m, indicators15m) {
    // Update both timeframes
    this.aligner.update('5m', indicators5m);
    this.aligner.update('15m', indicators15m);

    // Get alignment
    const alignment = this.aligner.getAlignment();
    const divergence = this.aligner.checkDivergence();

    // Entry decision logic
    if (!alignment) {
      return { entry: false, reason: 'Insufficient data' };
    }

    // Strong bullish alignment
    if (alignment.direction === 'bullish' && alignment.strength >= 0.75) {
      return {
        entry: true,
        direction: 'long',
        confidence: alignment.strength,
        reason: alignment.message
      };
    }

    // Strong bearish alignment
    if (alignment.direction === 'bearish' && alignment.strength >= 0.75) {
      return {
        entry: true,
        direction: 'short',
        confidence: alignment.strength,
        reason: alignment.message
      };
    }

    // MTF divergence warning
    if (divergence && divergence.type.includes('divergence')) {
      return {
        entry: false,
        reason: divergence.warning,
        riskLevel: divergence.riskLevel
      };
    }

    // No clear signal
    return {
      entry: false,
      reason: 'No alignment detected'
    };
  }
}
```

## References

- **Source:** Dual Timeframe Screener Module Prompt Suite
- **Alignment Logic:** minAligned threshold (e.g., 2/4 indicators must agree)
- **Indicator Thresholds:**
  - RSI: <30 bullish (oversold), >70 bearish (overbought)
  - MACD: histogram >0 bullish, <0 bearish
  - Williams %R: <-80 bullish, >-20 bearish
  - AO (Awesome Oscillator): >0 bullish, <0 bearish
- **MTF Divergence:** Fast TF signal without slow TF confirmation = warning
- **Timeframe Pairs:** Common pairings: M5/M15, M15/H1, H1/H4
- **Strength Calculation:** aligned_indicators / total_indicators
- **Application:** Entry confirmation, false signal filtering, pump/dump detection
