---
name: signal-normalizer
description: |
  Standardized signal object schema with strength multipliers and composite scoring for unified indicator outputs.

  Use when: (1) building signal generators, (2) integrating multiple indicators, (3) implementing weighted scoring systems,
  (4) normalizing indicator outputs to common scale, (5) combining signals from different sources.

  Triggers: "signal normalization", "standardize signals", "signal schema", "strength multipliers", "composite score"
author: Claude Code
version: 1.0.0
---

# Signal Normalizer

## Problem

Different indicators produce signals in different formats - some return oscillator values (0-100), others return boolean crossovers, others return divergence patterns. Need a standardized signal schema that allows consistent scoring, aggregation, and weighting across all indicator types.

## Context / Trigger Conditions

**Use this skill when:**
- Implementing multi-indicator signal generation
- Building compositeSignal scorers that combine diverse indicators
- Creating weighted indicator systems
- Normalizing outputs from custom indicators
- Integrating third-party indicators

**Specific triggers:**
- "normalize signals"
- "standardize indicator outputs"
- "unified signal scoring"
- "signal strength classification"
- "composite signal generation"

## Solution

### 1. Standard Signal Object Structure

Every indicator returns signals in this format:

```javascript
/**
 * Standardized Signal Object
 * All indicators must conform to this schema
 */
const SIGNAL_SCHEMA = {
  value: number,           // Current indicator value (for reference)
  signals: [               // Array of detected signals
    {
      type: string,        // Signal type: 'bullish_crossover', 'bearish_divergence', etc.
      direction: string,   // 'bullish' | 'bearish' | 'neutral'
      strength: string,    // 'very_strong' | 'strong' | 'moderate' | 'weak' | 'extreme'
      message: string,     // Human-readable description
      metadata: object     // Additional signal-specific data
    }
  ]
};

// Example:
{
  value: 25.5,  // RSI value
  signals: [
    {
      type: 'bullish_divergence',
      direction: 'bullish',
      strength: 'very_strong',
      message: 'Bullish divergence (price lower low, RSI higher low)',
      metadata: {
        priceLow: 3000,
        rsiLow: 25.5,
        divergenceStrength: 5.3
      }
    }
  ]
}
```

### 2. Strength Multipliers

Map strength levels to numeric multipliers:

```javascript
/**
 * Strength to Multiplier Mapping
 * Used for weighted signal scoring
 */
const STRENGTH_MULTIPLIERS = {
  'very_strong': 1.2,    // Divergence, major crossovers, pattern completions
  'strong': 1.0,         // Standard crossovers, zone breaks, patterns
  'moderate': 0.7,       // Zone signals, momentum shifts
  'weak': 0.5,           // Level signals, early warnings
  'extreme': 1.1         // Extreme overbought/oversold (can reverse quickly)
};

/**
 * Apply strength multiplier to base score
 */
function applyStrengthMultiplier(baseScore, strength) {
  const multiplier = STRENGTH_MULTIPLIERS[strength] || 1.0;
  return baseScore * multiplier;
}
```

### 3. Signal Priority Hierarchy

Prioritize signal types when multiple signals detected:

```javascript
/**
 * Signal Type Priority (Highest → Lowest)
 * When multiple signals exist, use highest priority for scoring
 */
const SIGNAL_PRIORITY = {
  // Tier 1: Very Strong (×1.2 multiplier)
  'bullish_divergence': 1,
  'bearish_divergence': 1,

  // Tier 2: Strong (×1.0 multiplier)
  'bullish_crossover': 2,
  'bearish_crossover': 2,
  'bullish_pattern': 2,
  'bearish_pattern': 2,
  'bullish_breakout': 2,
  'bearish_breakout': 2,

  // Tier 3: Moderate (×0.7 multiplier)
  'bullish_zone': 3,
  'bearish_zone': 3,
  'bullish_momentum': 3,
  'bearish_momentum': 3,

  // Tier 4: Weak (×0.5 multiplier)
  'bullish_level': 4,
  'bearish_level': 4
};

/**
 * Get highest priority signal from array
 */
function getHighestPrioritySignal(signals) {
  if (signals.length === 0) return null;

  return signals.reduce((highest, signal) => {
    const signalPriority = SIGNAL_PRIORITY[signal.type] || 999;
    const highestPriority = SIGNAL_PRIORITY[highest.type] || 999;

    return signalPriority < highestPriority ? signal : highest;
  });
}
```

### 4. Score Range Classification

Map composite scores to signal tiers:

```javascript
/**
 * Score Range Definitions
 * Used to classify composite scores into actionable tiers
 */
const SCORE_RANGES = {
  // With microstructure signals (live trading only)
  WITH_MICROSTRUCTURE: {
    min: -130,
    max: 130,
    tiers: {
      EXTREME_BUY: { min: 90, max: 130 },
      STRONG_BUY: { min: 70, max: 89 },
      BUY: { min: 50, max: 69 },
      WEAK_BUY: { min: 20, max: 49 },
      NEUTRAL: { min: -19, max: 19 },
      WEAK_SELL: { min: -49, max: -20 },
      SELL: { min: -69, max: -50 },
      STRONG_SELL: { min: -89, max: -70 },
      EXTREME_SELL: { min: -130, max: -90 }
    }
  },

  // Backtest only (no microstructure)
  BACKTEST_ONLY: {
    min: -110,
    max: 110,
    tiers: {
      EXTREME_BUY: { min: 80, max: 110 },
      STRONG_BUY: { min: 60, max: 79 },
      BUY: { min: 40, max: 59 },
      WEAK_BUY: { min: 15, max: 39 },
      NEUTRAL: { min: -14, max: 14 },
      WEAK_SELL: { min: -39, max: -15 },
      SELL: { min: -59, max: -40 },
      STRONG_SELL: { min: -79, max: -60 },
      EXTREME_SELL: { min: -110, max: -80 }
    }
  }
};

/**
 * Classify score into tier
 */
function classifyScore(score, useMicrostructure = false) {
  const ranges = useMicrostructure
    ? SCORE_RANGES.WITH_MICROSTRUCTURE
    : SCORE_RANGES.BACKTEST_ONLY;

  for (const [tier, range] of Object.entries(ranges.tiers)) {
    if (score >= range.min && score <= range.max) {
      return tier;
    }
  }

  return 'NEUTRAL';
}
```

### 5. Composite Score Calculation

Aggregate weighted signals from multiple indicators:

```javascript
/**
 * Calculate Composite Score
 * Combines signals from all indicators with weights
 *
 * @param {Array} indicatorSignals - Array of { indicator, weight, signals }
 * @param {Object} options - Scoring options
 * @returns {Object} Composite score and breakdown
 */
function calculateCompositeScore(indicatorSignals, options = {}) {
  const { useMicrostructure = false } = options;

  let totalScore = 0;
  const breakdown = [];

  for (const { indicator, weight, signals } of indicatorSignals) {
    // Get highest priority signal for this indicator
    const primarySignal = getHighestPrioritySignal(signals);

    if (!primarySignal) {
      breakdown.push({ indicator, weight, score: 0, signal: null });
      continue;
    }

    // Calculate base score from weight
    const baseScore = weight;

    // Apply direction (-1 for bearish, +1 for bullish, 0 for neutral)
    const directionMultiplier = primarySignal.direction === 'bullish' ? 1 :
                                 primarySignal.direction === 'bearish' ? -1 : 0;

    // Apply strength multiplier
    const strengthMultiplier = STRENGTH_MULTIPLIERS[primarySignal.strength] || 1.0;

    // Final contribution
    const indicatorScore = baseScore * directionMultiplier * strengthMultiplier;

    totalScore += indicatorScore;

    breakdown.push({
      indicator,
      weight,
      signal: primarySignal,
      baseScore,
      strengthMultiplier,
      directionMultiplier,
      score: indicatorScore
    });
  }

  // Clamp to range
  const ranges = useMicrostructure
    ? SCORE_RANGES.WITH_MICROSTRUCTURE
    : SCORE_RANGES.BACKTEST_ONLY;

  const clampedScore = Math.max(ranges.min, Math.min(ranges.max, totalScore));

  return {
    compositeScore: clampedScore,
    tier: classifyScore(clampedScore, useMicrostructure),
    breakdown,
    rawScore: totalScore
  };
}
```

### 6. Implementation Pattern

```javascript
class SignalNormalizer {
  constructor(config = {}) {
    this.useMicrostructure = config.useMicrostructure || false;
    this.scoreRanges = this.useMicrostructure
      ? SCORE_RANGES.WITH_MICROSTRUCTURE
      : SCORE_RANGES.BACKTEST_ONLY;
  }

  /**
   * Normalize raw indicator output to standard signal object
   */
  normalize(indicatorName, rawOutput) {
    // Ensure raw output conforms to schema
    if (!rawOutput.signals || !Array.isArray(rawOutput.signals)) {
      throw new Error(`Invalid signal format from ${indicatorName}`);
    }

    // Validate each signal
    for (const signal of rawOutput.signals) {
      this.validateSignal(signal, indicatorName);
    }

    return {
      indicator: indicatorName,
      value: rawOutput.value,
      signals: rawOutput.signals,
      timestamp: Date.now()
    };
  }

  /**
   * Validate signal object structure
   */
  validateSignal(signal, indicatorName) {
    const required = ['type', 'direction', 'strength', 'message'];

    for (const field of required) {
      if (!(field in signal)) {
        throw new Error(`Missing field '${field}' in signal from ${indicatorName}`);
      }
    }

    // Validate direction
    if (!['bullish', 'bearish', 'neutral'].includes(signal.direction)) {
      throw new Error(`Invalid direction '${signal.direction}' from ${indicatorName}`);
    }

    // Validate strength
    if (!(signal.strength in STRENGTH_MULTIPLIERS)) {
      throw new Error(`Invalid strength '${signal.strength}' from ${indicatorName}`);
    }
  }

  /**
   * Calculate composite score from multiple normalized signals
   */
  calculateComposite(normalizedSignals, weights) {
    const indicatorSignals = normalizedSignals.map(normalized => ({
      indicator: normalized.indicator,
      weight: weights[normalized.indicator] || 0,
      signals: normalized.signals
    }));

    return calculateCompositeScore(indicatorSignals, {
      useMicrostructure: this.useMicrostructure
    });
  }

  /**
   * Get signal tier from score
   */
  getTier(score) {
    return classifyScore(score, this.useMicrostructure);
  }
}
```

## Verification

Test signal normalization:

```javascript
const normalizer = new SignalNormalizer({ useMicrostructure: false });

// Raw indicator outputs
const rsiOutput = {
  value: 25,
  signals: [{
    type: 'bullish_divergence',
    direction: 'bullish',
    strength: 'very_strong',
    message: 'Bullish divergence detected',
    metadata: {}
  }]
};

const macdOutput = {
  value: 0.5,
  signals: [{
    type: 'bullish_crossover',
    direction: 'bullish',
    strength: 'strong',
    message: 'MACD crossed above signal',
    metadata: {}
  }]
};

// Normalize
const rsiNormalized = normalizer.normalize('RSI', rsiOutput);
const macdNormalized = normalizer.normalize('MACD', macdOutput);

// Calculate composite
const weights = { RSI: 25, MACD: 20 };
const composite = normalizer.calculateComposite(
  [rsiNormalized, macdNormalized],
  weights
);

console.log('Composite Score:', composite.compositeScore);
console.log('Tier:', composite.tier);
console.log('Breakdown:', composite.breakdown);

// Expected:
// RSI: 25 * 1 (bullish) * 1.2 (very_strong) = 30
// MACD: 20 * 1 (bullish) * 1.0 (strong) = 20
// Total = 50 → BUY tier

// Verify:
// ✅ Score should be 50
// ✅ Tier should be 'BUY'
// ✅ Breakdown should show both contributions
```

## Example

### Multi-Indicator Signal Generator

```javascript
class SignalGenerator {
  constructor(indicators, weights) {
    this.indicators = indicators;  // Map of indicator instances
    this.weights = weights;
    this.normalizer = new SignalNormalizer({ useMicrostructure: false });
  }

  /**
   * Generate composite signal from all indicators
   */
  generate(candle) {
    const normalizedSignals = [];

    // Update all indicators and collect signals
    for (const [name, indicator] of Object.entries(this.indicators)) {
      indicator.update(candle);
      const rawSignals = indicator.getSignals();

      // Normalize
      const normalized = this.normalizer.normalize(name, rawSignals);
      normalizedSignals.push(normalized);
    }

    // Calculate composite
    const composite = this.normalizer.calculateComposite(
      normalizedSignals,
      this.weights
    );

    return {
      ...composite,
      timestamp: Date.now(),
      candle: {
        timestamp: candle.timestamp,
        close: candle.close
      }
    };
  }
}

// Usage:
const generator = new SignalGenerator(
  {
    RSI: new RSIIndicator(14),
    MACD: new MACDIndicator(),
    WilliamsR: new WilliamsRIndicator(14)
  },
  {
    RSI: 25,
    MACD: 20,
    WilliamsR: 20
  }
);

const signal = generator.generate(currentCandle);
if (signal.tier === 'STRONG_BUY' || signal.tier === 'EXTREME_BUY') {
  console.log('Entry signal detected:', signal.compositeScore);
}
```

## References

- **Source:** AGI LEVEL TRADING BOT COMPLETE RECONSTRUCTION PROTOCOL v5.0
- **Signal Schema:** {type, direction, strength, message, metadata}
- **Strength Multipliers:**
  - very_strong: 1.2x (divergence, major patterns)
  - strong: 1.0x (crossovers, breakouts)
  - moderate: 0.7x (zones, momentum)
  - weak: 0.5x (levels)
  - extreme: 1.1x (extreme oversold/overbought)
- **Signal Priority:** Divergence > Crossover > Pattern > Breakout > Zone > Momentum > Level
- **Score Ranges:**
  - With microstructure: -130 to +130
  - Backtest only: -110 to +110
- **Tiers:** EXTREME_BUY (≥90) → STRONG_BUY (≥70) → BUY (≥50) → NEUTRAL → SELL → STRONG_SELL → EXTREME_SELL
- **Composite Calculation:** Sum of (weight × direction × strength_multiplier) for each indicator
