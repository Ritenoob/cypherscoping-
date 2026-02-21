---
name: walk-forward-validator
description: |
  Anti-overfit walk-forward validation with purged splits and multi-objective scoring for strategy testing.

  Use when: (1) validating trading strategies, (2) preventing overfitting, (3) testing across regimes,
  (4) evaluating strategy robustness, (5) production readiness testing.

  Triggers: "walk-forward validation", "prevent overfitting", "cross-validation", "strategy testing", "regime analysis"
author: Claude Code
version: 1.0.0
---

# Walk-Forward Validator

## Problem

Backtesting without walk-forward validation leads to overfitted strategies that fail in live trading. Standard k-fold cross-validation leaks future data. Need a robust validation methodology that prevents data leakage, tests across market regimes, and enforces minimum statistical significance.

## Context / Trigger Conditions

**Use this skill when:**
- Validating new trading strategies before deployment
- Testing optimizer variants for production readiness
- Evaluating strategy robustness across market conditions
- Building anti-overfit safeguards
- Creating institutional-grade validation pipelines

**Specific triggers:**
- "validate strategy"
- "walk-forward testing"
- "prevent overfitting"
- "cross-validation across regimes"
- "statistical significance testing"

## Solution

### 1. Walk-Forward Methodology

**Core Principle:** Train on historical window, test on subsequent out-of-sample period, roll forward.

```javascript
/**
 * Walk-Forward Split Configuration
 *
 * Training Window: 60% of data (in-sample optimization)
 * Test Window: 20% of data (out-of-sample validation)
 * Purge Window: Gap between train/test to prevent lookahead bias
 * Roll Forward: Advance by test window size
 */
const WF_CONFIG = {
  trainRatio: 0.60,        // 60% for training
  testRatio: 0.20,         // 20% for testing
  purgeWindow: 24,         // 24 hours gap between train/test
  minTradesPerFold: 30,    // Minimum trades for statistical significance
  numFolds: 5              // 5 anchored walk-forward windows
};

/**
 * Purged Walk-Forward Splits
 * Prevents data leakage from overlapping positions
 */
function createWalkForwardSplits(data, config = WF_CONFIG) {
  const splits = [];
  const totalBars = data.length;

  const trainSize = Math.floor(totalBars * config.trainRatio);
  const testSize = Math.floor(totalBars * config.testRatio);
  const stepSize = testSize;  // Anchored walk-forward

  for (let i = 0; i < config.numFolds; i++) {
    const trainStart = 0;  // Anchored - always start from beginning
    const trainEnd = trainStart + trainSize + (i * stepSize);

    // Purge window - gap to prevent lookahead bias
    const purgeEnd = trainEnd + config.purgeWindow;

    const testStart = purgeEnd;
    const testEnd = testStart + testSize;

    // Check if we have enough data
    if (testEnd > totalBars) break;

    splits.push({
      fold: i + 1,
      train: {
        start: trainStart,
        end: trainEnd,
        data: data.slice(trainStart, trainEnd)
      },
      purge: {
        start: trainEnd,
        end: purgeEnd,
        bars: config.purgeWindow
      },
      test: {
        start: testStart,
        end: testEnd,
        data: data.slice(testStart, testEnd)
      }
    });
  }

  return splits;
}
```

### 2. Multi-Objective Scoring

Evaluate strategies across 6 dimensions:

```javascript
/**
 * Multi-Objective Performance Metrics
 * All dimensions must meet minimum thresholds
 */
const PERFORMANCE_DIMENSIONS = {
  // 1. Net Return (absolute profitability)
  netReturn: {
    calculate: (trades) => {
      const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
      return totalPnL;
    },
    threshold: 0.05  // 5% minimum return
  },

  // 2. Profit Factor (wins/losses ratio)
  profitFactor: {
    calculate: (trades) => {
      const grossProfit = trades.filter(t => t.pnl > 0)
        .reduce((sum, t) => sum + t.pnl, 0);
      const grossLoss = Math.abs(trades.filter(t => t.pnl < 0)
        .reduce((sum, t) => sum + t.pnl, 0));
      return grossLoss === 0 ? Infinity : grossProfit / grossLoss;
    },
    threshold: 1.5  // 1.5:1 minimum
  },

  // 3. Expectancy (average win per trade)
  expectancy: {
    calculate: (trades) => {
      const avgPnL = trades.reduce((sum, t) => sum + t.pnl, 0) / trades.length;
      return avgPnL;
    },
    threshold: 0.002  // 0.2% per trade minimum
  },

  // 4. Max Drawdown (peak-to-trough decline)
  maxDrawdown: {
    calculate: (trades) => {
      let peak = 0;
      let maxDD = 0;
      let cumPnL = 0;

      for (const trade of trades) {
        cumPnL += trade.pnl;
        peak = Math.max(peak, cumPnL);
        const drawdown = (peak - cumPnL) / Math.max(peak, 1);
        maxDD = Math.max(maxDD, drawdown);
      }

      return maxDD;
    },
    threshold: 0.15  // 15% maximum drawdown
  },

  // 5. Tail Loss (worst single loss)
  tailLoss: {
    calculate: (trades) => {
      const losses = trades.filter(t => t.pnl < 0).map(t => t.pnl);
      return losses.length > 0 ? Math.min(...losses) : 0;
    },
    threshold: -0.05  // -5% maximum single loss
  },

  // 6. Stability (consistency across regimes)
  stability: {
    calculate: (foldResults) => {
      // Standard deviation of returns across folds
      const returns = foldResults.map(f => f.netReturn);
      const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);

      // Coefficient of variation (lower is more stable)
      return stdDev / Math.abs(mean);
    },
    threshold: 0.50  // CV < 0.5 (returns vary by <50% of mean)
  }
};

/**
 * Evaluate Strategy Across All Dimensions
 */
function evaluateMultiObjective(foldResults) {
  const allTrades = foldResults.flatMap(f => f.trades);

  const scores = {
    netReturn: PERFORMANCE_DIMENSIONS.netReturn.calculate(allTrades),
    profitFactor: PERFORMANCE_DIMENSIONS.profitFactor.calculate(allTrades),
    expectancy: PERFORMANCE_DIMENSIONS.expectancy.calculate(allTrades),
    maxDrawdown: PERFORMANCE_DIMENSIONS.maxDrawdown.calculate(allTrades),
    tailLoss: PERFORMANCE_DIMENSIONS.tailLoss.calculate(allTrades),
    stability: PERFORMANCE_DIMENSIONS.stability.calculate(foldResults)
  };

  // Check thresholds
  const passes = {
    netReturn: scores.netReturn >= PERFORMANCE_DIMENSIONS.netReturn.threshold,
    profitFactor: scores.profitFactor >= PERFORMANCE_DIMENSIONS.profitFactor.threshold,
    expectancy: scores.expectancy >= PERFORMANCE_DIMENSIONS.expectancy.threshold,
    maxDrawdown: scores.maxDrawdown <= PERFORMANCE_DIMENSIONS.maxDrawdown.threshold,
    tailLoss: scores.tailLoss >= PERFORMANCE_DIMENSIONS.tailLoss.threshold,
    stability: scores.stability <= PERFORMANCE_DIMENSIONS.stability.threshold
  };

  const allPass = Object.values(passes).every(p => p === true);

  return {
    scores,
    passes,
    validated: allPass,
    failedDimensions: Object.entries(passes)
      .filter(([_, passed]) => !passed)
      .map(([dimension]) => dimension)
  };
}
```

### 3. Minimum Trades Per Fold

Enforce statistical significance:

```javascript
/**
 * Statistical Significance Check
 * Ensure each fold has enough trades for valid conclusions
 */
function validateFoldSignificance(fold, minTrades = 30) {
  const tradeCount = fold.test.trades.length;

  if (tradeCount < minTrades) {
    return {
      valid: false,
      tradeCount,
      minRequired: minTrades,
      message: `Insufficient trades: ${tradeCount} < ${minTrades}`
    };
  }

  return {
    valid: true,
    tradeCount,
    minRequired: minTrades
  };
}

/**
 * Filter Valid Folds
 * Only include folds with sufficient sample size
 */
function filterValidFolds(foldResults, minTrades = 30) {
  return foldResults.filter(fold => {
    const validation = validateFoldSignificance(fold, minTrades);
    return validation.valid;
  });
}
```

### 4. Regime Analysis

Test across different market conditions:

```javascript
/**
 * Market Regime Classification
 * Categorize market conditions for robust testing
 */
const REGIME_CLASSIFIERS = {
  // Volatility regime
  volatility: (atr, avgATR) => {
    const ratio = atr / avgATR;
    if (ratio > 1.5) return 'high_volatility';
    if (ratio < 0.5) return 'low_volatility';
    return 'normal_volatility';
  },

  // Trend regime
  trend: (sma50, sma200) => {
    const diff = (sma50 - sma200) / sma200;
    if (diff > 0.05) return 'uptrend';
    if (diff < -0.05) return 'downtrend';
    return 'sideways';
  },

  // Volume regime
  volume: (currentVol, avgVol) => {
    const ratio = currentVol / avgVol;
    if (ratio > 2.0) return 'high_volume';
    if (ratio < 0.5) return 'low_volume';
    return 'normal_volume';
  }
};

/**
 * Classify Fold by Regime
 */
function classifyFoldRegime(foldData) {
  // Calculate regime indicators
  const atr = calculateATR(foldData);
  const avgATR = calculateAvgATR(foldData, 50);
  const sma50 = calculateSMA(foldData, 50);
  const sma200 = calculateSMA(foldData, 200);
  const avgVol = calculateAvgVolume(foldData, 50);
  const currentVol = foldData[foldData.length - 1].volume;

  return {
    volatility: REGIME_CLASSIFIERS.volatility(atr, avgATR),
    trend: REGIME_CLASSIFIERS.trend(sma50, sma200),
    volume: REGIME_CLASSIFIERS.volume(currentVol, avgVol)
  };
}

/**
 * Cross-Validation Across Regimes
 * Ensure strategy works in all market conditions
 */
function validateAcrossRegimes(foldResults) {
  const regimePerformance = {};

  for (const fold of foldResults) {
    const regime = classifyFoldRegime(fold.test.data);
    const key = `${regime.volatility}_${regime.trend}_${regime.volume}`;

    if (!regimePerformance[key]) {
      regimePerformance[key] = {
        regime,
        folds: [],
        avgReturn: 0,
        winRate: 0
      };
    }

    regimePerformance[key].folds.push(fold);
  }

  // Calculate performance per regime
  for (const [key, data] of Object.entries(regimePerformance)) {
    const allTrades = data.folds.flatMap(f => f.trades);
    const wins = allTrades.filter(t => t.pnl > 0).length;

    data.avgReturn = allTrades.reduce((sum, t) => sum + t.pnl, 0) / allTrades.length;
    data.winRate = wins / allTrades.length;
    data.tradeCount = allTrades.length;
  }

  return regimePerformance;
}
```

### 5. Implementation Pattern

```javascript
class WalkForwardValidator {
  constructor(config = {}) {
    this.config = {
      trainRatio: config.trainRatio || 0.60,
      testRatio: config.testRatio || 0.20,
      purgeWindow: config.purgeWindow || 24,
      minTradesPerFold: config.minTradesPerFold || 30,
      numFolds: config.numFolds || 5
    };
  }

  /**
   * Run full walk-forward validation
   */
  async validate(data, strategy) {
    // Create purged splits
    const splits = createWalkForwardSplits(data, this.config);

    const foldResults = [];

    for (const split of splits) {
      console.log(`\n=== Fold ${split.fold}/${splits.length} ===`);

      // 1. Train on in-sample data
      const trainedParams = await strategy.optimize(split.train.data);

      // 2. Test on out-of-sample data
      const testTrades = await strategy.backtest(split.test.data, trainedParams);

      // 3. Validate significance
      const significance = validateFoldSignificance(
        { test: { trades: testTrades } },
        this.config.minTradesPerFold
      );

      if (!significance.valid) {
        console.warn(`⚠️ Fold ${split.fold} skipped: ${significance.message}`);
        continue;
      }

      // 4. Classify regime
      const regime = classifyFoldRegime(split.test.data);

      foldResults.push({
        fold: split.fold,
        trades: testTrades,
        params: trainedParams,
        regime,
        netReturn: testTrades.reduce((sum, t) => sum + t.pnl, 0),
        tradeCount: testTrades.length
      });
    }

    // 5. Multi-objective evaluation
    const evaluation = evaluateMultiObjective(foldResults);

    // 6. Regime analysis
    const regimeAnalysis = validateAcrossRegimes(foldResults);

    return {
      foldResults,
      evaluation,
      regimeAnalysis,
      validated: evaluation.validated && foldResults.length >= 3
    };
  }

  /**
   * Generate validation report
   */
  generateReport(validationResult) {
    const { evaluation, regimeAnalysis, foldResults } = validationResult;

    console.log('\n=== Walk-Forward Validation Report ===\n');

    // Overall verdict
    console.log(`Status: ${validationResult.validated ? '✅ VALIDATED' : '❌ FAILED'}\n`);

    // Multi-objective scores
    console.log('Performance Dimensions:');
    for (const [dimension, score] of Object.entries(evaluation.scores)) {
      const passed = evaluation.passes[dimension] ? '✅' : '❌';
      console.log(`  ${passed} ${dimension}: ${score.toFixed(4)}`);
    }

    // Regime breakdown
    console.log('\nRegime Performance:');
    for (const [key, data] of Object.entries(regimeAnalysis)) {
      console.log(`  ${key}:`);
      console.log(`    Avg Return: ${(data.avgReturn * 100).toFixed(2)}%`);
      console.log(`    Win Rate: ${(data.winRate * 100).toFixed(2)}%`);
      console.log(`    Trades: ${data.tradeCount}`);
    }

    // Fold summary
    console.log('\nFold Summary:');
    for (const fold of foldResults) {
      console.log(`  Fold ${fold.fold}: ${fold.tradeCount} trades, ${(fold.netReturn * 100).toFixed(2)}% return`);
    }

    return validationResult;
  }
}
```

## Verification

Test walk-forward validation:

```javascript
// Create validator
const validator = new WalkForwardValidator({
  trainRatio: 0.60,
  testRatio: 0.20,
  purgeWindow: 24,
  minTradesPerFold: 30,
  numFolds: 5
});

// Load historical data
const data = loadHistoricalData('ETHUSDTM', '1h', 1000);

// Define strategy
const strategy = {
  optimize: async (trainData) => {
    // Optimization logic (grid search, genetic algorithm, etc.)
    return { rsiPeriod: 14, stopLoss: 0.02 };
  },

  backtest: async (testData, params) => {
    // Backtest with params
    return trades;
  }
};

// Run validation
const result = await validator.validate(data, strategy);

// Generate report
validator.generateReport(result);

// Expected output:
// === Walk-Forward Validation Report ===
//
// Status: ✅ VALIDATED
//
// Performance Dimensions:
//   ✅ netReturn: 0.0850
//   ✅ profitFactor: 2.3000
//   ✅ expectancy: 0.0034
//   ✅ maxDrawdown: 0.1200
//   ✅ tailLoss: -0.0380
//   ✅ stability: 0.3500
//
// Regime Performance:
//   high_volatility_uptrend_normal_volume:
//     Avg Return: 1.20%
//     Win Rate: 65.00%
//     Trades: 45
//   normal_volatility_sideways_low_volume:
//     Avg Return: 0.80%
//     Win Rate: 58.00%
//     Trades: 38
//
// Fold Summary:
//   Fold 1: 32 trades, 2.10% return
//   Fold 2: 35 trades, 1.80% return
//   Fold 3: 38 trades, 2.50% return
//   Fold 4: 31 trades, 1.60% return
//   Fold 5: 34 trades: 2.20% return
```

## Example

### Production Validation Pipeline

```javascript
// Full validation before production deployment
async function validateForProduction(strategyConfig) {
  console.log('Starting production validation pipeline...\n');

  // 1. Load historical data (1 year)
  const data = await fetchHistoricalData('ETHUSDTM', '1h', 8760);

  // 2. Create validator
  const validator = new WalkForwardValidator({
    trainRatio: 0.60,
    testRatio: 0.20,
    purgeWindow: 24,
    minTradesPerFold: 50,  // Higher threshold for production
    numFolds: 5
  });

  // 3. Define strategy
  const strategy = createStrategy(strategyConfig);

  // 4. Run validation
  const result = await validator.validate(data, strategy);

  // 5. Generate report
  validator.generateReport(result);

  // 6. Production readiness check
  if (!result.validated) {
    console.error('\n❌ Strategy FAILED validation. Not ready for production.');
    console.error('Failed dimensions:', result.evaluation.failedDimensions);
    return false;
  }

  // 7. Additional checks
  const regimeCount = Object.keys(result.regimeAnalysis).length;
  if (regimeCount < 3) {
    console.warn('\n⚠️ Warning: Strategy tested in < 3 regimes. May not be robust.');
  }

  const avgTradesPerFold = result.foldResults.reduce((sum, f) => sum + f.tradeCount, 0) / result.foldResults.length;
  if (avgTradesPerFold < 40) {
    console.warn('\n⚠️ Warning: Low trade frequency. Consider longer test period.');
  }

  console.log('\n✅ Strategy VALIDATED for production deployment.');
  return true;
}

// Usage
const ready = await validateForProduction({
  indicators: { rsi: 14, macd: [12, 26, 9] },
  signals: { entryThreshold: 50, exitThreshold: -50 },
  risk: { stopLoss: 0.02, takeProfit: 0.04 }
});

if (ready) {
  console.log('Proceeding to live deployment...');
}
```

## References

- **Source:** You are an institutional.txt (Institutional standards)
- **Methodology:** Purged walk-forward splits with anchored training windows
- **Multi-Objective Criteria:**
  - Net Return ≥ 5%
  - Profit Factor ≥ 1.5
  - Expectancy ≥ 0.2% per trade
  - Max Drawdown ≤ 15%
  - Tail Loss ≥ -5%
  - Stability (CV) ≤ 0.5
- **Statistical Significance:** Minimum 30 trades per fold (50 for production)
- **Purge Window:** 24 hours gap between train/test to prevent lookahead bias
- **Regime Classification:** Volatility (high/normal/low), Trend (up/down/sideways), Volume (high/normal/low)
- **Application:** Strategy validation, optimizer testing, production readiness, anti-overfit safeguards
