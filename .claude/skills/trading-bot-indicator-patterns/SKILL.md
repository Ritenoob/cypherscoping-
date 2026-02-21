# Trading Bot Indicator Patterns & Signal Generation

**Domain:** Cryptocurrency Trading Bot Development
**Context:** Multi-indicator signal generation, scoring algorithms, and confirmation strategies for automated trading systems
**Extracted From:** Production trading bot documentation and TypeScript/JavaScript codebases (2025-2026)

---

## Problem Space

Building reliable automated trading signals requires:
1. Combining multiple technical indicators with weighted scoring
2. Avoiding false signals through multi-indicator confirmation
3. Adapting to different market regimes (trending, ranging, volatile)
4. Calculating confidence levels that reflect signal quality
5. Implementing anti-overfit measures to prevent curve-fitting

---

## Core Patterns & Implementation Strategies

### 1. Weighted Indicator Scoring System

**Pattern:** Each indicator contributes points to a composite score based on its weight and signal strength.

**Implementation:**
```typescript
// Indicator weight configuration
const V6_OPTIMIZED_WEIGHTS = {
  RSI: {
    weight: 40,           // Maximum contribution points
    period: 21,
    oversold: 30,
    overbought: 70,
    enabled: true
  },
  WilliamsR: {
    weight: 28,
    period: 10,
    oversold: -80,
    overbought: -20,
    enabled: true
  },
  MACD: {
    weight: 18,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    enabled: true
  }
  // ... other indicators
};

// Score calculation with strength multipliers
for (const signal of williamsRSignals) {
  const weight = V6_OPTIMIZED_WEIGHTS.WilliamsR.weight;
  const strengthMultiplier = getStrengthMultiplier(signal.strength);

  if (signal.type.includes('divergence')) {
    indicatorScore += weight * 1.5 * strengthMultiplier;  // Divergence bonus
  } else if (signal.type.includes('crossover')) {
    indicatorScore += weight * 1.3 * strengthMultiplier;  // Crossover bonus
  } else if (signal.type.includes('oversold')) {
    indicatorScore += weight * 1.2 * strengthMultiplier;  // Oversold bonus
  }
}
```

**Key Principles:**
- Total weight budget: 100-220 points (prevents signal saturation)
- Signal type multipliers: Divergence (1.5x), Crossover (1.3x), Oversold/Overbought (1.2x)
- Strength multipliers: Very Strong (1.5x), Strong (1.0x), Moderate (0.6x), Weak (0.3x)
- Score capping: Individual indicator cap (200), total score cap (220)

---

### 2. Multi-Indicator Confirmation (Confluence)

**Pattern:** Require multiple indicators to agree before generating a signal.

**Implementation:**
```typescript
interface IndicatorsAgreeing {
  bullish: number;
  bearish: number;
  neutral: number;
}

// Count agreeing indicators
for (const signal of allSignals) {
  if (signal.direction === 'bullish') indicatorsAgreeing.bullish++;
  else if (signal.direction === 'bearish') indicatorsAgreeing.bearish++;
}

// Confluence gate
const totalActive = bullish + bearish + neutral;
const maxAgreement = Math.max(bullish, bearish);
const confluencePercent = maxAgreement / totalActive;

if (confluencePercent < 0.5) {
  // Reject signal - insufficient confirmation
  blockReasons.push('confluence_too_low');
}

if (maxAgreement < 4) {
  // Reject signal - too few indicators agreeing
  blockReasons.push('min_indicators_not_met');
}
```

**Confluence Thresholds by Strategy Profile:**
- Conservative: 50% confluence + 5 indicators minimum
- Neutral: 50% confluence + 4 indicators minimum
- Aggressive: 40% confluence + 3 indicators minimum

---

### 3. Signal Classification Bands

**Pattern:** Map composite scores to actionable trading signals with distinct strength levels.

**Implementation:**
```typescript
const SIGNAL_CLASSIFICATIONS = {
  EXTREME_BUY: { min: 130, max: 220, action: 'STRONG_LONG' },
  STRONG_BUY: { min: 95, max: 129, action: 'LONG' },
  BUY: { min: 65, max: 94, action: 'MODERATE_LONG' },
  BUY_WEAK: { min: 40, max: 64, action: 'WEAK_LONG' },
  NEUTRAL: { min: -39, max: 39, action: 'NO_ACTION' },
  SELL_WEAK: { min: -64, max: -40, action: 'WEAK_SHORT' },
  SELL: { min: -94, max: -65, action: 'MODERATE_SHORT' },
  STRONG_SELL: { min: -129, max: -95, action: 'SHORT' },
  EXTREME_SELL: { min: -220, max: -130, action: 'STRONG_SHORT' }
};

// Dynamic leverage based on score and confidence
function getRecommendedLeverage(score: number, confidence: number): number {
  const absScore = Math.abs(score);
  const confMultiplier = confidence / 100;

  if (absScore < 40) return 0;
  if (absScore >= 130) return Math.round(50 * confMultiplier);
  if (absScore >= 95) return Math.round(30 * confMultiplier);
  if (absScore >= 65) return Math.round(15 * confMultiplier);
  return Math.round(10 * confMultiplier);
}
```

**Dead Zone:** Scores between -39 and +39 generate no action (prevents overtrading in neutral conditions).

---

### 4. Confidence Calculation with Market Regime Adjustments

**Pattern:** Calculate base confidence from indicator agreement, then adjust for market conditions.

**Implementation:**
```typescript
// Step 1: Base confidence from indicator agreement
function calculateBaseConfidence(
  indicatorScore: number,
  signalCount: number,
  indicatorsAgreeing: { bullish: number; bearish: number }
): number {
  let confidence = 50;  // Baseline

  // Agreement ratio bonus (up to +30)
  const totalAgreement = Math.max(bullish, bearish);
  const agreementRatio = totalAgreement / (bullish + bearish + 1);
  confidence += agreementRatio * 30;

  // Score strength bonus (up to +20)
  const absScore = Math.abs(indicatorScore);
  if (absScore >= 120) confidence += 20;
  else if (absScore >= 95) confidence += 15;
  else if (absScore >= 80) confidence += 10;
  else if (absScore >= 65) confidence += 5;

  // Signal density bonus (up to +20)
  const signalDensity = Math.min(1, signalCount / 10);
  confidence += signalDensity * 20;

  return confidence;
}

// Step 2: Adjust for market regime
function adjustConfidence(
  baseConfidence: number,
  context: { isChoppy: boolean; atrPercent: number; conflictingSignals: number }
): number {
  let confidence = baseConfidence;

  // Choppy market penalty (-5)
  if (context.isChoppy) {
    confidence -= 5;
  }

  // Volatility regime penalties
  if (context.atrPercent >= 6) {
    confidence -= 6;  // High volatility penalty
  } else if (context.atrPercent >= 4) {
    confidence -= 3;  // Medium volatility penalty
  }

  // Conflicting signals penalty (-2 per conflict)
  if (context.conflictingSignals > 0) {
    confidence -= context.conflictingSignals * 2;
  }

  return Math.max(0, Math.min(100, confidence));
}
```

**Volatility Regimes:**
- LOW (ATR% < 2): Trending conditions, favorable for directional trades
- MEDIUM (ATR% 2-4): Normal conditions, standard confidence
- HIGH (ATR% > 4): Choppy conditions, reduced confidence

---

### 5. Entry Gates (Multi-Layer Validation)

**Pattern:** Apply strict validation gates before authorizing trade execution.

**Implementation:**
```typescript
interface GateContext {
  score: number;
  prevScore: number;
  confidence: number;
  indicatorsAgreeing: number;
  totalIndicators: number;
  trendAligned: boolean;
  drawdownPct: number;
  atrPercent: number;
  conflictingSignals: number;
}

function evaluateEntryGates(context: GateContext): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Gate 1: Dead zone suppression
  if (Math.abs(context.score) < 20) {
    reasons.push('score_in_dead_zone');
  }

  // Gate 2: Threshold cross requirement
  if (config.thresholdCrossRequired) {
    if ((context.prevScore < 80 && context.score >= 80) ||
        (context.prevScore > -80 && context.score <= -80)) {
      // Valid cross
    } else {
      reasons.push('threshold_cross_required');
    }
  }

  // Gate 3: Minimum score
  if (Math.abs(context.score) < config.thresholdScore) {
    reasons.push('score_below_threshold');
  }

  // Gate 4: Minimum confidence
  if (context.confidence < config.minConfidence) {
    reasons.push('confidence_too_low');
  }

  // Gate 5: Minimum indicators agreeing
  if (context.indicatorsAgreeing < config.minIndicatorsAgreeing) {
    reasons.push('insufficient_indicator_agreement');
  }

  // Gate 6: Confluence percentage
  const confluencePercent = context.indicatorsAgreeing / context.totalIndicators;
  if (confluencePercent < config.confluencePercentMin) {
    reasons.push('confluence_below_threshold');
  }

  // Gate 7: Trend alignment
  if (config.requireTrendAlignment && !context.trendAligned) {
    reasons.push('trend_not_aligned');
  }

  // Gate 8: Drawdown limit
  if (context.drawdownPct > config.maxDrawdownPct) {
    reasons.push('max_drawdown_exceeded');
  }

  return { pass: reasons.length === 0, reasons };
}
```

**Gate Configuration by Profile:**
```typescript
const CONSERVATIVE_GATES = {
  deadZoneMin: 20,
  thresholdScore: 80,
  thresholdCrossRequired: true,
  minConfidence: 80,
  minIndicatorsAgreeing: 5,
  confluencePercentMin: 0.50,
  requireTrendAlignment: true,
  maxDrawdownPct: 3.0
};

const AGGRESSIVE_GATES = {
  deadZoneMin: 20,
  thresholdScore: 70,
  thresholdCrossRequired: false,
  minConfidence: 90,  // Higher confidence compensates for lower score
  minIndicatorsAgreeing: 3,
  confluencePercentMin: 0.40,
  requireTrendAlignment: false,
  maxDrawdownPct: 5.0
};
```

---

### 6. Multi-Timeframe Analysis Pattern

**Pattern:** Use higher timeframes for trend confirmation, lower timeframes for entry timing.

**Implementation:**
```typescript
// Strategy: 1m entry + 5m trend filter
const mtfSignal = {
  // Entry timeframe (1m)
  entry: {
    timeframe: '1m',
    signals: williamsRSignals,  // Fast oscillators for entry
    score: entryScore
  },

  // Confirmation timeframe (5m)
  confirmation: {
    timeframe: '5m',
    trend: emaTrend,  // Slower EMAs for trend direction
    aligned: checkTrendAlignment(entryScore, emaTrend)
  }
};

// Only trade if both align
if (mtfSignal.entry.score > 80 && mtfSignal.confirmation.aligned) {
  // Execute trade
}
```

**Timeframe Combinations:**
- Scalping: 1m entry + 5m confirmation
- Day trading: 5m entry + 15m confirmation
- Swing: 15m entry + 1h confirmation

---

### 7. Indicator-Specific Signal Extraction

**Example: Williams %R Advanced Signals**

```typescript
interface WilliamsRResult {
  value: number;
  fast: number | null;
  signals: SignalResult[];
}

function calculateWilliamsR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 10
): WilliamsRResult {
  // Calculate %R
  const highestHigh = Math.max(...highs.slice(-period));
  const lowestLow = Math.min(...lows.slice(-period));
  const close = closes[closes.length - 1];

  const wr = ((highestHigh - close) / (highestHigh - lowestLow)) * -100;

  // Detect signals
  const signals: SignalResult[] = [];

  // 1. Oversold/Overbought zones
  if (wr <= -80) {
    signals.push({
      type: 'oversold_extreme',
      direction: 'bullish',
      strength: 'very_strong',
      message: 'Williams %R in extreme oversold zone'
    });
  } else if (wr >= -20) {
    signals.push({
      type: 'overbought_extreme',
      direction: 'bearish',
      strength: 'very_strong',
      message: 'Williams %R in extreme overbought zone'
    });
  }

  // 2. Bullish divergence
  if (detectBullishDivergence(wr, close, history)) {
    signals.push({
      type: 'bullish_divergence',
      direction: 'bullish',
      strength: 'extreme',
      message: 'Price making lower lows while %R makes higher lows'
    });
  }

  // 3. Crossovers
  const prevWR = history[history.length - 2];
  if (prevWR <= -80 && wr > -80) {
    signals.push({
      type: 'bullish_crossover',
      direction: 'bullish',
      strength: 'strong',
      message: '%R crossed above oversold threshold'
    });
  }

  return { value: wr, fast: null, signals };
}
```

---

### 8. Order Flow / DOM Integration

**Pattern:** Use order book imbalance to confirm price-based signals.

**Implementation:**
```typescript
interface DOMData {
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
}

function calculateDOMImbalance(dom: DOMData, depth: number = 10): number {
  // Sum bid and ask volumes at specified depth
  const bidVolume = dom.bids.slice(0, depth).reduce((sum, level) => sum + level.size, 0);
  const askVolume = dom.asks.slice(0, depth).reduce((sum, level) => sum + level.size, 0);

  // Calculate imbalance ratio
  const totalVolume = bidVolume + askVolume;
  const imbalance = (bidVolume - askVolume) / totalVolume;

  return imbalance;  // Range: -1 (all asks) to +1 (all bids)
}

// Use as confirmation gate
const domImbalance = calculateDOMImbalance(orderBook, 10);

if (signal.direction === 'long' && domImbalance < 0.3) {
  // Reject long signal - insufficient bid support
  blockReasons.push('dom_imbalance_unfavorable');
}

if (signal.direction === 'short' && domImbalance > -0.3) {
  // Reject short signal - insufficient ask pressure
  blockReasons.push('dom_imbalance_unfavorable');
}
```

**DOM Thresholds:**
- Strong bullish: imbalance > 0.6
- Moderate bullish: imbalance 0.3-0.6
- Neutral: imbalance -0.3 to 0.3
- Moderate bearish: imbalance -0.6 to -0.3
- Strong bearish: imbalance < -0.6

---

### 9. Strategy Profile System

**Pattern:** Switchable configuration profiles for different market conditions and risk tolerances.

**Implementation:**
```typescript
const STRATEGY_PROFILES = {
  conservative: {
    name: 'conservative',
    weights: {
      rsi: { max: 25, oversold: 25, overbought: 75 },
      williamsR: { max: 20, oversold: -85, overbought: -15 },
      macd: { max: 30 },  // Higher trend weight
      emaTrend: { max: 30 }  // Higher trend weight
    },
    thresholds: {
      minScoreForEntry: 70,
      minConfidence: 80,
      minIndicatorsAgreeing: 5
    },
    filters: {
      requireTrendAlignment: true,
      requireVolumeConfirmation: true,
      avoidFundingExtreme: true
    },
    riskManagement: {
      maxLeverage: 25,
      stopLossROI: 0.3,
      takeProfitROI: 1.5,
      maxPositionPercent: 1.0
    }
  },

  aggressive: {
    name: 'aggressive',
    weights: {
      rsi: { max: 35, oversold: 30, overbought: 70 },
      williamsR: { max: 30, oversold: -80, overbought: -20 },
      macd: { max: 18 },  // Lower trend weight
      emaTrend: { max: 15 }  // Lower trend weight
    },
    thresholds: {
      minScoreForEntry: 40,
      minConfidence: 90,  // Higher confidence compensates
      minIndicatorsAgreeing: 3
    },
    filters: {
      requireTrendAlignment: false,
      requireVolumeConfirmation: false,
      avoidFundingExtreme: false
    },
    riskManagement: {
      maxLeverage: 100,
      stopLossROI: 1.0,
      takeProfitROI: 3.0,
      maxPositionPercent: 5.0
    }
  }
};

// Runtime profile switching
function setActiveProfile(profileName: string): void {
  const profile = STRATEGY_PROFILES[profileName];
  if (!profile) throw new Error(`Invalid profile: ${profileName}`);

  // Apply weights
  Object.assign(V6_OPTIMIZED_WEIGHTS, profile.weights);

  // Apply gates
  Object.assign(entryGatesConfig, profile.thresholds, profile.filters);

  console.log(`Switched to ${profileName} profile`);
}
```

---

### 10. Anti-Overfit Measures

**Pattern:** Walk-forward validation and regime-based testing to prevent curve-fitting.

**Implementation:**
```typescript
interface BacktestFold {
  trainStart: Date;
  trainEnd: Date;
  validateStart: Date;
  validateEnd: Date;
  testStart: Date;
  testEnd: Date;
  purgeWindow: number;  // Bars to exclude around splits
}

function generateWalkForwardFolds(
  dataStart: Date,
  dataEnd: Date,
  trainDays: number = 90,
  validateDays: number = 30,
  testDays: number = 30,
  stepDays: number = 30
): BacktestFold[] {
  const folds: BacktestFold[] = [];
  let currentStart = dataStart;

  while (currentStart < dataEnd) {
    const trainEnd = addDays(currentStart, trainDays);
    const validateStart = addDays(trainEnd, 1);  // Purge 1 day
    const validateEnd = addDays(validateStart, validateDays);
    const testStart = addDays(validateEnd, 1);  // Purge 1 day
    const testEnd = addDays(testStart, testDays);

    if (testEnd > dataEnd) break;

    folds.push({
      trainStart: currentStart,
      trainEnd,
      validateStart,
      validateEnd,
      testStart,
      testEnd,
      purgeWindow: 1
    });

    currentStart = addDays(currentStart, stepDays);
  }

  return folds;
}

// Report metrics by fold
function evaluateStrategy(config: StrategyConfig, folds: BacktestFold[]): {
  inSample: Metrics;
  outOfSample: Metrics;
  consistency: number;
  worstFold: Metrics;
} {
  const results = folds.map(fold => {
    const trainMetrics = backtest(config, fold.trainStart, fold.trainEnd);
    const testMetrics = backtest(config, fold.testStart, fold.testEnd);
    return { train: trainMetrics, test: testMetrics };
  });

  // Calculate degradation
  const avgTrainReturn = average(results.map(r => r.train.return));
  const avgTestReturn = average(results.map(r => r.test.return));
  const degradation = (avgTrainReturn - avgTestReturn) / avgTrainReturn;

  // Reject if degradation > 30%
  if (degradation > 0.3) {
    console.warn('Strategy shows overfitting: test performance 30% worse than train');
  }

  return {
    inSample: aggregate(results.map(r => r.train)),
    outOfSample: aggregate(results.map(r => r.test)),
    consistency: 1 - standardDeviation(results.map(r => r.test.return)),
    worstFold: findWorst(results.map(r => r.test))
  };
}
```

---

## When to Apply These Patterns

**Use weighted scoring when:**
- Combining 5+ indicators with different signal characteristics
- Need granular control over indicator influence
- Building adaptive systems that switch between profiles

**Use confluence gates when:**
- False signal rate is high in single-indicator systems
- Market is choppy or ranging (low ADX)
- Need to filter noise in high-frequency strategies

**Use multi-timeframe confirmation when:**
- Trading on lower timeframes (1m-5m) but want trend alignment
- Reducing whipsaw in range-bound markets
- Building swing strategies with precise entry timing

**Use entry gates when:**
- Preventing overtrading is critical (limited capital, high fees)
- Need strict risk controls (max drawdown limits)
- Regulatory or policy constraints require documented decision logic

**Use regime-based adjustments when:**
- Market conditions vary significantly (trending vs ranging)
- Volatility impacts strategy performance
- Need to reduce position size or confidence in unfavorable conditions

---

## Common Pitfalls

1. **Over-optimization:** Tuning weights on limited data leads to curve-fitting
   - Solution: Use walk-forward validation with 60/20/20 train/validate/test splits

2. **Ignoring trading costs:** Backtests ignore fees/slippage
   - Solution: Always include taker fees (0.05-0.10%) and slippage (0.02-0.05%) in backtests

3. **Lookahead bias:** Using future data in indicator calculations
   - Solution: Purge windows around data splits, ensure indicators only use historical data

4. **Regime blindness:** Same settings in all market conditions
   - Solution: Implement volatility regimes (ATR-based) and adjust thresholds dynamically

5. **Conflicting indicators:** Adding correlated indicators (RSI + Stoch RSI)
   - Solution: Test indicator correlation, limit to one per category (momentum, trend, volume)

6. **Threshold sensitivity:** Small parameter changes cause dramatic performance swings
   - Solution: Test parameter stability with ±10% variations, prefer robust ranges

---

## Testing Strategies

**Unit Tests:**
```typescript
describe('SignalGenerator', () => {
  it('should calculate correct composite score', () => {
    const indicators = {
      rsi: { value: 25, signal: 'oversold', score: 40 },
      williamsR: { value: -85, signal: 'oversold', score: 28 }
    };
    const signal = generator.generate(indicators, {}, {});
    expect(signal.compositeScore).toBeGreaterThan(60);
  });

  it('should block signal when confidence too low', () => {
    const signal = generator.generate(weakIndicators, {}, { isChoppy: true });
    expect(signal.authorized).toBe(false);
    expect(signal.blockReasons).toContain('confidence_too_low');
  });
});
```

**Integration Tests:**
```typescript
describe('Walk-Forward Validation', () => {
  it('should not degrade more than 30% out-of-sample', () => {
    const folds = generateWalkForwardFolds(startDate, endDate);
    const results = evaluateStrategy(config, folds);

    const degradation = (results.inSample.return - results.outOfSample.return)
                       / results.inSample.return;

    expect(degradation).toBeLessThan(0.30);
  });
});
```

---

## Related Resources

**Technical Indicators:**
- RSI: Wilder's 14-period RSI with 30/70 oversold/overbought thresholds
- Williams %R: 10-period %R with -80/-20 thresholds
- MACD: 12/26/9 fast/slow/signal periods
- Bollinger Bands: 20-period SMA with 2.0 standard deviation bands
- ATR: 14-period for volatility regime detection

**Signal Types Priority:**
1. Divergence (1.5x multiplier) - highest reliability
2. Crossover (1.3x multiplier) - strong directional signals
3. Oversold/Overbought (1.2x multiplier) - reversal setups
4. Zone/Hook (0.85x multiplier) - continuation patterns

**Optimization Frameworks:**
- Bayesian optimization (TPE, Gaussian Process)
- Genetic algorithms (NSGA-II for multi-objective)
- Random/Latin Hypercube for coarse screening
- Walk-forward with purged time splits

---

## Version & Attribution

**Extracted:** 2026-02-21
**Source Projects:**
- CypherScoping TypeScript Agent (cypherscoping-agent/)
- Valuable Crypto Bot Docs (TECHNICAL_INDICATORS_COMPLETE_REFERENCE.md, STRATEGY_PROFILES_GUIDE.md, ATR_INTEGRATION_GUIDE.md)

**Maturity:** Production-ready patterns from 80%+ win rate trading systems with 26/26 tests passing.

**Maintenance:** Update when indicator formulas change or new anti-overfit measures are discovered.
