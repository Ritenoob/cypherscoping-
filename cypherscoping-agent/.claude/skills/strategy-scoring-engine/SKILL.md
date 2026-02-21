---
name: strategy-scoring-engine
description: |
  Composite performance scoring for trading strategy evaluation and automatic promotion gating.

  Use when: (1) evaluating strategy variants, (2) ranking optimizer experiments, (3) implementing automatic strategy promotion,
  (4) comparing backtest results, (5) gating live deployment based on confidence thresholds.

  Triggers: "strategy scoring", "composite score", "sharpe roi winrate", "promotion criteria", "confidence gating"
author: Claude Code
version: 1.0.0
---

# Strategy Scoring Engine

## Problem

Trading strategies need objective, multi-dimensional evaluation before promotion to live trading. A single metric (like ROI) is insufficient and can be gamed. Need a composite scoring system that balances profitability, risk-adjusted returns, consistency, and statistical significance.

## Context / Trigger Conditions

**Use this skill when:**
- Implementing live optimizer with parallel strategy variants
- Building automatic strategy promotion systems
- Comparing backtest results across parameter sets
- Gating deployment based on confidence thresholds
- Ranking strategies for portfolio allocation

**Specific triggers:**
- "score strategy performance"
- "evaluate optimizer variants"
- "rank trading strategies"
- "promotion criteria"
- "confidence threshold"
- "composite score calculation"

## Solution

### 1. Composite Score Formula

Balance profitability, risk-adjustment, and consistency:

```javascript
/**
 * Primary Composite Score
 * Emphasizes Sharpe ratio (risk-adjusted returns) while including absolute performance
 */
const compositeScore =
  (sharpeRatio * 50) +        // 50 weight - risk-adjusted return priority
  (roiPercent * 1) +          // 1 weight - absolute return
  (winRatePercent * 0.5);     // 0.5 weight - consistency

// Example:
// Sharpe 1.5, ROI 8%, WinRate 60%
// Score = (1.5 * 50) + (8 * 1) + (60 * 0.5) = 75 + 8 + 30 = 113
```

### 2. Confidence Calculation

Multi-factor confidence score (0-100%):

```javascript
/**
 * Confidence Score Components
 * Weighs sample size, profitability, risk metrics
 */
function calculateConfidence(metrics) {
  const {
    trades,
    roiPercent,
    winRatePercent,
    sharpeRatio,
    maxDrawdownPercent
  } = metrics;

  // Component scores (0-100 each)
  const tradesScore = Math.min((trades / 100) * 100, 100);
  const roiScore = Math.min(Math.max(roiPercent * 10, 0), 100);
  const winRateScore = Math.min(Math.max((winRatePercent - 40) * 2, 0), 100);
  const sharpeScore = Math.min(Math.max(sharpeRatio * 50, 0), 100);
  const drawdownPenalty = Math.max(100 - (maxDrawdownPercent * 5), 0);

  // Weighted confidence
  const confidence =
    (tradesScore * 0.30) +          // 30% weight - sample size
    (roiScore * 0.25) +              // 25% weight - profitability
    (winRateScore * 0.20) +          // 20% weight - consistency
    (sharpeScore * 0.15) +           // 15% weight - risk-adjusted
    (drawdownPenalty * 0.10);        // 10% weight - drawdown control

  return Math.round(confidence);
}

// Example:
// trades: 75, ROI: 6%, WinRate: 58%, Sharpe: 1.2, Drawdown: 8%
// tradesScore = 75
// roiScore = 60
// winRateScore = 36
// sharpeScore = 60
// drawdownPenalty = 60
// confidence = (75*.30) + (60*.25) + (36*.20) + (60*.15) + (60*.10)
//            = 22.5 + 15 + 7.2 + 9 + 6 = 59.7 ≈ 60%
```

### 3. Promotion Criteria

Gating logic for automatic promotion:

```javascript
/**
 * Promotion Thresholds
 * All conditions must be met for automatic promotion
 */
const PROMOTION_CRITERIA = {
  minTrades: 50,          // Statistical significance
  minROI: 5.0,            // 5% minimum return
  minWinRate: 55.0,       // 55% win rate minimum
  minSharpe: 1.0,         // Sharpe ratio ≥ 1.0
  minConfidence: 80.0,    // 80% confidence score
  maxDrawdown: 15.0       // 15% maximum drawdown
};

function checkPromotion(metrics) {
  const confidence = calculateConfidence(metrics);

  const passes = {
    trades: metrics.trades >= PROMOTION_CRITERIA.minTrades,
    roi: metrics.roiPercent >= PROMOTION_CRITERIA.minROI,
    winRate: metrics.winRatePercent >= PROMOTION_CRITERIA.minWinRate,
    sharpe: metrics.sharpeRatio >= PROMOTION_CRITERIA.minSharpe,
    confidence: confidence >= PROMOTION_CRITERIA.minConfidence,
    drawdown: metrics.maxDrawdownPercent <= PROMOTION_CRITERIA.maxDrawdown
  };

  const allPass = Object.values(passes).every(p => p === true);

  return {
    eligible: allPass,
    confidence,
    passes,
    failedCriteria: Object.entries(passes)
      .filter(([_, passed]) => !passed)
      .map(([criterion]) => criterion)
  };
}
```

### 4. Multi-Objective Evaluation

Rank strategies by multiple dimensions:

```javascript
/**
 * Multi-Objective Scoring
 * Returns scores for different optimization objectives
 */
function evaluateMultiObjective(strategies) {
  return strategies.map(strategy => {
    const { metrics } = strategy;

    return {
      id: strategy.id,
      config: strategy.config,

      // Objective 1: Risk-adjusted return (Sharpe)
      sharpeScore: metrics.sharpeRatio,

      // Objective 2: Absolute profitability (ROI)
      roiScore: metrics.roiPercent,

      // Objective 3: Consistency (Win rate)
      consistencyScore: metrics.winRatePercent,

      // Objective 4: Drawdown control (inverse)
      drawdownScore: 100 - metrics.maxDrawdownPercent,

      // Objective 5: Tail risk (Sortino-like)
      tailRiskScore: calculateTailRisk(metrics),

      // Composite
      compositeScore:
        (metrics.sharpeRatio * 50) +
        (metrics.roiPercent * 1) +
        (metrics.winRatePercent * 0.5)
    };
  });
}

function calculateTailRisk(metrics) {
  // Sortino-like: focus on downside volatility
  const avgLoss = metrics.avgLossPercent || 0;
  const maxLoss = metrics.maxLossPercent || 0;

  // Penalize large individual losses
  return 100 - ((avgLoss * 2) + (maxLoss * 0.5));
}
```

### 5. Implementation Pattern

```javascript
class StrategyScoring {
  constructor(criteria = PROMOTION_CRITERIA) {
    this.criteria = criteria;
    this.strategies = [];
  }

  /**
   * Add strategy results for evaluation
   */
  addStrategy(strategyId, config, metrics) {
    this.strategies.push({
      id: strategyId,
      config,
      metrics,
      timestamp: Date.now()
    });
  }

  /**
   * Evaluate all strategies and return ranked list
   */
  evaluate() {
    const scored = this.strategies.map(strategy => {
      const compositeScore = this.calculateComposite(strategy.metrics);
      const confidence = calculateConfidence(strategy.metrics);
      const promotion = checkPromotion(strategy.metrics);

      return {
        ...strategy,
        compositeScore,
        confidence,
        ...promotion
      };
    });

    // Sort by composite score descending
    return scored.sort((a, b) => b.compositeScore - a.compositeScore);
  }

  /**
   * Get best eligible strategy for promotion
   */
  getPromotionCandidate() {
    const ranked = this.evaluate();
    const eligible = ranked.filter(s => s.eligible);

    if (eligible.length === 0) {
      return null;
    }

    // Return highest scoring eligible strategy
    return eligible[0];
  }

  /**
   * Calculate composite score
   */
  calculateComposite(metrics) {
    return (
      (metrics.sharpeRatio * 50) +
      (metrics.roiPercent * 1) +
      (metrics.winRatePercent * 0.5)
    );
  }

  /**
   * Get detailed scoring breakdown
   */
  getScoreBreakdown(strategyId) {
    const strategy = this.strategies.find(s => s.id === strategyId);
    if (!strategy) return null;

    const { metrics } = strategy;

    return {
      composite: this.calculateComposite(metrics),
      components: {
        sharpe: metrics.sharpeRatio * 50,
        roi: metrics.roiPercent * 1,
        winRate: metrics.winRatePercent * 0.5
      },
      confidence: calculateConfidence(metrics),
      promotion: checkPromotion(metrics)
    };
  }
}
```

## Verification

Test the scoring engine:

```javascript
const scorer = new StrategyScoring();

// Add test strategies
scorer.addStrategy('strategy_1', { weights: [30, 25, 20] }, {
  trades: 75,
  roiPercent: 8.5,
  winRatePercent: 62,
  sharpeRatio: 1.4,
  maxDrawdownPercent: 9.5,
  avgLossPercent: 1.2,
  maxLossPercent: 3.5
});

scorer.addStrategy('strategy_2', { weights: [25, 30, 20] }, {
  trades: 45,  // Below min trades
  roiPercent: 12.0,
  winRatePercent: 58,
  sharpeRatio: 1.8,
  maxDrawdownPercent: 12.0,
  avgLossPercent: 1.5,
  maxLossPercent: 4.0
});

// Get rankings
const ranked = scorer.evaluate();
console.log('Rankings:', ranked.map(s => ({
  id: s.id,
  score: s.compositeScore,
  confidence: s.confidence,
  eligible: s.eligible
})));

// Get promotion candidate
const candidate = scorer.getPromotionCandidate();
if (candidate) {
  console.log('Promotion candidate:', candidate.id);
  console.log('Score breakdown:', scorer.getScoreBreakdown(candidate.id));
}

// Verify:
// ✅ strategy_1 should be eligible (meets all criteria)
// ✅ strategy_2 should fail on minTrades (45 < 50)
// ✅ Composite score matches formula
// ✅ Confidence calculation includes all components
```

## Example

### Live Optimizer Integration

```javascript
// Initialize optimizer with scoring engine
class LiveOptimizer {
  constructor() {
    this.scorer = new StrategyScoring({
      minTrades: 50,
      minROI: 5.0,
      minWinRate: 55.0,
      minSharpe: 1.0,
      minConfidence: 80.0,
      maxDrawdown: 15.0
    });

    this.variants = [];
  }

  /**
   * Add variant to testing pool
   */
  addVariant(config) {
    const variantId = `variant_${Date.now()}`;
    this.variants.push({
      id: variantId,
      config,
      trades: [],
      metrics: this.initializeMetrics()
    });
    return variantId;
  }

  /**
   * Record trade result
   */
  recordTrade(variantId, trade) {
    const variant = this.variants.find(v => v.id === variantId);
    if (!variant) return;

    variant.trades.push(trade);
    variant.metrics = this.calculateMetrics(variant.trades);

    // Add to scorer
    this.scorer.addStrategy(variantId, variant.config, variant.metrics);
  }

  /**
   * Check for promotion-ready variant
   */
  checkForPromotion() {
    const candidate = this.scorer.getPromotionCandidate();

    if (candidate) {
      console.log(`🎯 Promotion candidate found: ${candidate.id}`);
      console.log(`   Score: ${candidate.compositeScore.toFixed(2)}`);
      console.log(`   Confidence: ${candidate.confidence}%`);
      console.log(`   Sharpe: ${candidate.metrics.sharpeRatio.toFixed(2)}`);
      console.log(`   ROI: ${candidate.metrics.roiPercent.toFixed(2)}%`);
      console.log(`   Win Rate: ${candidate.metrics.winRatePercent.toFixed(2)}%`);

      return candidate;
    }

    return null;
  }

  /**
   * Get current rankings
   */
  getRankings() {
    return this.scorer.evaluate();
  }

  calculateMetrics(trades) {
    // Calculate all required metrics from trades array
    // ... implementation ...
    return {
      trades: trades.length,
      roiPercent: /* ... */,
      winRatePercent: /* ... */,
      sharpeRatio: /* ... */,
      maxDrawdownPercent: /* ... */,
      avgLossPercent: /* ... */,
      maxLossPercent: /* ... */
    };
  }

  initializeMetrics() {
    return {
      trades: 0,
      roiPercent: 0,
      winRatePercent: 0,
      sharpeRatio: 0,
      maxDrawdownPercent: 0,
      avgLossPercent: 0,
      maxLossPercent: 0
    };
  }
}
```

## References

- **Source:** Copilot Prompt Set for Live Optimizer System Deployment
- **Composite Score:** `(Sharpe * 50) + (ROI_percent * 1) + (WinRate_percent * 0.5)`
- **Confidence:** `trades*30% + ROI*100*25% + winRate*100*20% + sharpe*100*15% + drawdown_penalty*10%`
- **Promotion Criteria:** minTrades=50, ROI≥5%, WinRate≥55%, Sharpe≥1.0, Confidence≥80%
- **Multi-Objective:** Net return, profit factor, expectancy, max drawdown, tail loss, stability
- **Gating:** All criteria must pass for automatic promotion
- **Sharpe Priority:** 50x weight reflects institutional focus on risk-adjusted returns
