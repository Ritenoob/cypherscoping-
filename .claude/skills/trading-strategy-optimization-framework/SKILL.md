# Trading Strategy Optimization Framework

## Metadata
- **Skill ID**: trading-strategy-optimization-framework
- **Version**: 1.0.0
- **Category**: Trading Systems, Quantitative Analysis, Strategy Development
- **Complexity**: Advanced
- **Prerequisites**: Understanding of technical analysis, backtesting, and trading systems

## Purpose

Systematic framework for optimizing trading strategies through institutional-grade experimentation, parameter tuning, and validation methodologies. Prevents overfitting while discovering robust parameter combinations across multiple market regimes.

## When to Use

- Optimizing indicator parameters (RSI periods, MACD settings, threshold values)
- Testing strategy combinations (mean reversion vs trend following vs hybrid)
- Validating strategy robustness across market conditions
- Tuning risk parameters (stop-loss, take-profit, leverage)
- Comparing multiple strategy variants in parallel
- Migrating from manual to systematic strategy selection

## Core Principles

### 1. Reproducibility First
- **Fixed random seeds** for all experiments
- **Versioned configurations** as JSON/YAML
- **Deterministic execution** (same inputs = same outputs)
- **Complete audit trail** (configs, results, trade logs)

### 2. Overfitting Prevention
- **Walk-forward validation** with purged time splits
- **Minimum trade requirements** per fold (e.g., 50+ trades)
- **Out-of-sample testing** on unseen data
- **Statistical significance testing** (p-values, confidence intervals)
- **Regime-based validation** (trend vs range vs high/low volatility)

### 3. Multi-Objective Optimization
- **Return maximization** (primary goal)
- **Risk minimization** (drawdown, volatility)
- **Consistency** (stability across folds)
- **Pareto frontier** preservation (no single metric dominance)

## Optimization Workflow

### Stage 1: Data Collection & Validation

```bash
# Fetch historical OHLCV data
npm run fetch -- --symbol ETHUSDTM --days 180 --timeframe 5m

# Validate data quality
- Check for gaps (missing candles)
- Verify timestamp continuity
- Ensure sufficient sample size
- Align timeframes if using MTF
```

**Data Requirements:**
- Minimum 90 days for backtesting
- Gap-free OHLCV data
- Volume data for volume-based indicators
- Optional: Order book snapshots (DOM) for live testing only

### Stage 2: Search Space Definition

Define parameter ranges with bounds and step sizes:

```javascript
parameters: {
  indicators: {
    rsi: {
      period: { min: 7, max: 21, step: 1 },
      oversold: { min: 20, max: 35, step: 5 },
      overbought: { min: 65, max: 80, step: 5 }
    },
    macd: {
      fast: { min: 8, max: 16, step: 2 },
      slow: { min: 20, max: 30, step: 2 },
      signal: { min: 7, max: 11, step: 1 }
    },
    williamsR: {
      period: { min: 10, max: 20, step: 2 },
      oversold: { min: -85, max: -75, step: 5 },
      overbought: { min: -25, max: -15, step: 5 }
    }
  },
  risk: {
    stopLossROI: { min: 0.3, max: 2.0, step: 0.1 },
    takeProfitROI: { min: 1.0, max: 5.0, step: 0.5 },
    leverage: { values: [5, 10, 15, 20] }
  },
  weights: {
    rsi: { min: 0, max: 40, step: 5 },
    macd: { min: 0, max: 35, step: 5 },
    williamsR: { min: 0, max: 30, step: 5 },
    // ... other indicators
  }
}
```

**Search Space Best Practices:**
- Use domain knowledge to set realistic bounds
- Avoid excessively fine granularity (causes combinatorial explosion)
- Consider indicator correlations (don't optimize redundant pairs)
- Include "reasonable defaults" as baseline

### Stage 3: Parameter Search Strategy

#### A. Grid Search (Exhaustive, Small Spaces)
```javascript
// All combinations within bounds
// Use when: < 10,000 total combinations
combinations = cartesianProduct(parameterRanges);
```

**Pros**: Complete coverage
**Cons**: Exponential growth, computationally expensive

#### B. Latin Hypercube Sampling (LHS) - Recommended
```javascript
// Stratified random sampling
// Use when: Large parameter spaces (10K-100K+ combinations)
samples = latinHypercubeSample(parameterSpace, nSamples=5000, seed=42);
```

**Pros**: Good coverage with fewer samples, parallelizable
**Cons**: Not exhaustive, requires sufficient sample size

#### C. Bayesian Optimization (Adaptive)
```javascript
// Sequential model-based optimization (TPE, SMAC)
// Use when: Expensive evaluations, < 1000 trials
optimizer = BayesianOptimizer(objectiveFunction, parameterSpace);
nextParams = optimizer.suggest();
```

**Pros**: Sample-efficient, adaptive
**Cons**: Sequential (harder to parallelize), requires surrogate model

#### D. Genetic Algorithms (NSGA-II)
```javascript
// Multi-objective evolutionary optimization
// Use when: Multiple competing objectives
population = initializePopulation(parameterSpace, size=100);
for (generation = 0; generation < maxGenerations; generation++) {
  offspring = crossoverAndMutate(population);
  combined = population.concat(offspring);
  population = nondominatedSort(combined, objectives);
}
paretoFront = population.filter(isNondominated);
```

**Pros**: Multi-objective, explores diverse solutions
**Cons**: Requires tuning (mutation rate, crossover), slower convergence

### Stage 4: Strategy Template Search

**Multi-Template Optimization** (Diversity Preservation):

```javascript
templates = [
  'T1_MEAN_REVERSION',    // RSI + W%R + BB extremes
  'T2_TREND_CONTINUATION', // EMA + MACD + ADX
  'T3_HYBRID_VOTING',      // Weighted composite score
  'T4_DOM_ENHANCED'        // Template + order book signals
];

// Allocate samples across templates
samplesPerTemplate = totalSamples / templates.length;

results = templates.flatMap(template => {
  searchSpace = getTemplateSearchSpace(template);
  samples = latinHypercubeSample(searchSpace, samplesPerTemplate);
  return samples.map(params => backtest(template, params));
});

// Ensure diversity: minimum configs from EACH template in final Pareto set
paretoFront = selectDiverseParetoFront(results, minPerTemplate=3);
```

### Stage 5: Walk-Forward Validation

**Time-Series Cross-Validation** (Prevents Lookahead Bias):

```
|<------- Train (90d) ------->|<- Purge ->|<-- Val (30d) -->|<- Purge ->|<-- Test (30d) -->|
                               |  50 bars  |                 |  50 bars  |

Anchor Date: 2024-01-01
├─ Fold 1: Train[Jan-Mar], Val[Apr], Test[May]
├─ Fold 2: Train[Feb-Apr], Val[May], Test[Jun]
├─ Fold 3: Train[Mar-May], Val[Jun], Test[Jul]
└─ Fold 4: Train[Apr-Jun], Val[Jul], Test[Aug]
```

**Purge Gap**: Prevents contamination from lookahead (e.g., indicator periods spanning folds)

**Implementation:**
```javascript
function walkForward(data, config) {
  const folds = createTimeFolds(data, {
    trainDays: 90,
    valDays: 30,
    testDays: 30,
    purgeBarCount: 50,
    minTradesPerFold: 50
  });

  const results = folds.map(fold => {
    // Train on in-sample data
    const trainMetrics = backtest(fold.train, config);

    // Validate (can use for threshold tuning)
    const valMetrics = backtest(fold.val, config);

    // Test on out-of-sample data
    const testMetrics = backtest(fold.test, config);

    return { trainMetrics, valMetrics, testMetrics };
  });

  // Aggregate across folds
  const stability = calculateStabilityScore(results);
  const avgOOS = average(results.map(r => r.testMetrics.return));
  const worstFold = min(results.map(r => r.testMetrics.return));
  const isOsGap = avgTrain - avgOOS; // Overfitting measure

  return {
    stability,
    avgOutOfSample: avgOOS,
    worstFold,
    inSampleOutOfSampleGap: isOsGap,
    foldResults: results
  };
}
```

### Stage 6: Backtesting with Execution Realism

**Critical Features:**
- **Leverage-aware ROI-based SL/TP** (inverse leverage scaling)
- **Fee modeling** (taker: 0.06%, maker: 0.02%)
- **Slippage modeling** (fixed BPS, spread-based, or volatility-scaled)
- **Fill models**: Taker (immediate) vs probabilistic limit fills
- **Break-even logic** (fee-adjusted thresholds)
- **Trailing stops** (staircase, not continuous)

```javascript
function backtest(candles, config) {
  let equity = 10000; // Starting capital
  const trades = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const signal = generateSignal(candles.slice(0, i+1), config);

    if (signal.action === 'BUY' || signal.action === 'SELL') {
      // Position sizing (Kelly, fixed %, volatility-adjusted)
      const size = calculatePositionSize(equity, signal, config);

      // Entry with slippage
      const slippage = config.slippageModel === 'fixed'
        ? 0.0002
        : calculateDynamicSlippage(candle);
      const entryPrice = candle.close * (1 + slippage);

      // Fees
      const entryFee = size * entryPrice * config.takerFee;

      // Leverage-aware stops
      const leverage = config.leverage;
      const stopLossROI = config.stopLossROI; // e.g., 0.5%
      const takeProfitROI = config.takeProfitROI; // e.g., 2.0%

      // Price move required for ROI target
      const stopPriceMove = (stopLossROI / leverage) / 100;
      const tpPriceMove = (takeProfitROI / leverage) / 100;

      const stopPrice = signal.action === 'BUY'
        ? entryPrice * (1 - stopPriceMove)
        : entryPrice * (1 + stopPriceMove);
      const tpPrice = signal.action === 'BUY'
        ? entryPrice * (1 + tpPriceMove)
        : entryPrice * (1 - tpPriceMove);

      // Simulate position lifecycle
      const trade = simulatePosition({
        entry: { price: entryPrice, size, fee: entryFee },
        stopLoss: stopPrice,
        takeProfit: tpPrice,
        candles: candles.slice(i+1),
        config
      });

      trades.push(trade);
      equity += trade.pnl;

      // Drawdown protection
      if (equity < config.maxDrawdownThreshold * 10000) {
        break; // Circuit breaker
      }
    }
  }

  return calculateMetrics(trades, equity);
}
```

### Stage 7: Performance Metrics & Scoring

**30+ Metrics** (Select Key Indicators):

```javascript
metrics = {
  // Returns
  totalReturn: (finalEquity - initialEquity) / initialEquity * 100,
  annualizedReturn: totalReturn * (365 / tradingDays),

  // Risk
  maxDrawdown: Math.max(...drawdowns),
  sharpeRatio: meanReturn / stdDevReturn,
  sortinoRatio: meanReturn / downsideDeviation,
  calmarRatio: annualizedReturn / maxDrawdown,

  // Trade Statistics
  totalTrades: trades.length,
  winRate: wins / totalTrades * 100,
  profitFactor: grossProfit / grossLoss,
  avgWin: totalWins / winCount,
  avgLoss: totalLosses / lossCount,
  expectancy: (winRate * avgWin) - ((1-winRate) * avgLoss),

  // Consistency
  stability: 100 - (stdDev(foldReturns) / mean(foldReturns) * 100),
  worstFold: Math.min(...foldReturns),
  isOsGap: avgInSample - avgOutOfSample,

  // Regime Performance
  trendReturn: returnInTrendingMarkets,
  rangeReturn: returnInRangingMarkets,
  highVolReturn: returnInHighVolatility,
  lowVolReturn: returnInLowVolatility
};
```

**Composite Score** (Multi-Objective):
```javascript
score = (
  metrics.totalReturn * 0.30 +
  metrics.sharpeRatio * 25 +
  (100 - metrics.maxDrawdown) * 0.25 +
  metrics.stability * 0.20
) * drawdownPenalty;

drawdownPenalty = 1 - Math.min(metrics.maxDrawdown, 20) / 40;
```

### Stage 8: Statistical Significance Testing

**Prevent Selection Bias:**

```javascript
function isStatisticallySignificant(results, baseline) {
  // T-test for return difference
  const tStat = tTest(results.returns, baseline.returns);
  const pValue = tStat.pValue;

  // Minimum trade count
  const sufficientSampleSize = results.trades.length >= 50;

  // Confidence interval for Sharpe ratio
  const sharpeCI = bootstrapConfidenceInterval(
    results.trades,
    metric='sharpe',
    iterations=1000,
    confidence=0.95
  );

  return {
    significant: pValue < 0.05 && sufficientSampleSize,
    pValue,
    sharpeCI,
    conclusion: pValue < 0.05
      ? 'Outperforms baseline with statistical significance'
      : 'No significant difference from baseline'
  };
}
```

### Stage 9: Live Forward Testing (Shadow Mode)

**Validation with Real Market Data** (Paper Trading):

```javascript
async function shadowTest(config, duration='24h') {
  const startTime = Date.now();
  const hypotheticalTrades = [];

  // Subscribe to live market data (WebSocket)
  const feed = await connectToLiveMarketData(config.symbol);

  feed.on('candle', async (candle) => {
    // Generate signal using optimized config
    const signal = generateSignal(candle, config);

    if (signal.action !== 'HOLD') {
      // Simulate fill (do NOT place real order)
      const hypotheticalTrade = {
        timestamp: Date.now(),
        signal,
        entryPrice: candle.close,
        // ... track hypothetical position
      };

      hypotheticalTrades.push(hypotheticalTrade);
      console.log('[SHADOW] Hypothetical trade:', hypotheticalTrade);
    }
  });

  // Wait for duration
  await sleep(parseDuration(duration));

  // Analyze shadow performance
  const liveMetrics = calculateMetrics(hypotheticalTrades);

  return {
    backtestMetrics: config.backtestResults,
    liveMetrics,
    degradation: backtestMetrics.return - liveMetrics.return,
    conclusion: Math.abs(degradation) < 5
      ? 'Backtest results validated in live conditions'
      : 'WARNING: Significant degradation from backtest'
  };
}
```

### Stage 10: A/B Testing (Multi-Config Comparison)

```javascript
async function abTest(configA, configB, duration='48h') {
  const [resultsA, resultsB] = await Promise.all([
    shadowTest(configA, duration),
    shadowTest(configB, duration)
  ]);

  const winner = resultsA.liveMetrics.sharpe > resultsB.liveMetrics.sharpe
    ? 'Config A'
    : 'Config B';

  return {
    configA: resultsA,
    configB: resultsB,
    winner,
    improvement: Math.abs(resultsA.liveMetrics.sharpe - resultsB.liveMetrics.sharpe)
  };
}
```

## Prompt Engineering Templates

### Template 1: Initial Optimization Setup

```
You are an institutional-grade quantitative researcher optimizing a KuCoin Futures trading strategy.

**System Context:**
- Exchange: KuCoin Perpetual Futures
- Universe: [ETHUSDTM, SOLUSDTM, XRPUSDTM, ...]
- Leverage: Auto-scaled (ATR% tiering: <2% → 10x, 2-4% → 5x, >4% → 2x)
- Risk: 1% max per trade, stop-loss mandatory, fee-aware break-even

**Current Strategy:**
- Indicators: RSI(14), Williams %R(14), MACD(12,26,9), AO(5,34), EMA(50,200)
- Scoring: Weighted composite (-100 to +100)
- Entry: Score crosses ±80, 4+ indicators align, confidence ≥90%
- Exit: ROI-based SL/TP (leverage-aware), trailing stops, break-even

**Optimization Objective:**
Discover parameter combinations that maximize risk-adjusted returns while maintaining stability across market regimes.

**Task:**
1. Define search space for indicator parameters (periods, thresholds, weights)
2. Generate 5000 Latin Hypercube samples
3. Run walk-forward backtests (90d train, 30d test, 50-bar purge)
4. Rank by composite score (Return 30%, Sharpe 25%, Max DD 25%, Stability 20%)
5. Select Pareto front with diversity (min 3 configs per strategy template)
6. Export top 10 configurations with full metrics

**Constraints:**
- Reproducible (seed=42)
- No lookahead bias (purged splits)
- Minimum 50 trades per fold
- Statistical significance testing (p < 0.05)
- Preserve production semantics (ROI-based stops, fee-adjusted break-even)

Output: JSON configs ranked by multi-objective score
```

### Template 2: Indicator Parameter Tuning

```
Optimize indicator parameters for [INDICATOR_NAME] in a crypto futures trading system.

**Current Settings:**
- RSI: period=14, oversold=30, overbought=70, weight=25
- Target: Improve mean reversion signal quality

**Search Space:**
period: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
oversold: [20, 25, 30, 35]
overbought: [65, 70, 75, 80]
weight: [0, 5, 10, 15, 20, 25, 30, 35, 40]

**Evaluation Criteria:**
1. Win rate on RSI-triggered entries (target: >55%)
2. Average P&L per RSI signal (target: >$0.50)
3. False signal rate in trending markets (minimize)
4. Correlation with other indicators (diversification bonus)

**Method:**
- Grid search (15×4×4×9 = 2,160 combinations)
- Parallel evaluation across 8 workers
- Walk-forward validation (4 folds)
- Ablation test: Compare performance with/without RSI

**Output:**
- Top 5 parameter sets ranked by signal quality
- Ablation impact score (contribution to overall strategy)
- Regime breakdown (performance in trend vs range)
```

### Template 3: Multi-Strategy Template Comparison

```
Compare 4 strategy templates on historical crypto futures data.

**Templates:**
T1_MEAN_REVERSION: RSI + Williams %R + Bollinger Bands (ADX < 25 filter)
T2_TREND_CONTINUATION: EMA cross + MACD + ADX/DI (ADX > 25 filter)
T3_HYBRID_VOTING: Weighted composite score (all indicators, threshold-based entry)
T4_DOM_ENHANCED: T3 + order book imbalance (live-only validation)

**Experiment Design:**
1. Allocate 10,000 total samples equally (2,500 per template)
2. Optimize template-specific parameters via LHS
3. Backtest on ETHUSDTM 5m data (Jan-Jun 2024)
4. Walk-forward validate (4 folds, 90d train, 30d test)
5. Forward test top config from each template (48h shadow mode)

**Comparison Metrics:**
- Return % (out-of-sample average across folds)
- Sharpe ratio (risk-adjusted performance)
- Max drawdown (worst-case loss)
- Stability (consistency across folds)
- Win rate (percentage of profitable trades)

**Diversity Preservation:**
Select Pareto front with minimum 3 configs from EACH template to ensure strategic diversity.

**Output:**
- Leaderboard (ranked by composite score)
- Template performance comparison table
- Recommended allocation (% capital per template)
```

### Template 4: Risk Parameter Optimization

```
Optimize risk management parameters for a KuCoin futures trading bot.

**Current Risk Settings:**
- Stop-loss: 0.5% ROI
- Take-profit: 2.0% ROI
- Leverage: 10x (fixed)
- Break-even: Fee-adjusted (1.2% ROI @ 10x)
- Max drawdown: 10%

**Optimization Goals:**
1. Maximize profit factor (gross profit / gross loss)
2. Minimize tail risk (worst 5% of trades)
3. Maintain Sharpe ratio >1.5
4. Keep max drawdown <15%

**Search Space:**
stopLossROI: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] (%)
takeProfitROI: [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0] (%)
leverage: [5, 7, 10, 12, 15, 20] (x)
breakEvenTrigger: ['fee-adjusted', 'aggressive-0.25%', 'conservative-1.5%']
trailingStop: ['disabled', 'staircase-0.1%', 'staircase-0.2%']

**Method:**
- Bayesian optimization (500 trials)
- Multi-objective: maximize (return, profit factor), minimize (max DD, tail loss)
- Validate on multiple symbols (ETHUSDTM, SOLUSDTM, XRPUSDTM)
- Cross-regime testing (trend, range, high-vol, low-vol)

**Output:**
- Pareto front of risk configurations
- Recommended settings by risk tolerance (conservative, balanced, aggressive)
- Sensitivity analysis (impact of each parameter on key metrics)
```

## Advanced Techniques

### Ablation Testing (Feature Importance)

Measure each indicator's contribution:

```javascript
async function ablationTest(baseConfig, indicators) {
  const baselineResults = await backtest(baseConfig);
  const ablationResults = {};

  for (const indicator of indicators) {
    // Remove indicator from config
    const ablatedConfig = {
      ...baseConfig,
      weights: { ...baseConfig.weights, [indicator]: 0 }
    };

    const results = await backtest(ablatedConfig);
    const impact = baselineResults.return - results.return;

    ablationResults[indicator] = {
      contribution: impact,
      rank: 0, // Filled after sorting
      verdict: impact > 0 ? 'Positive' : 'Negative'
    };
  }

  // Rank by contribution
  const sorted = Object.entries(ablationResults)
    .sort((a, b) => b[1].contribution - a[1].contribution);

  sorted.forEach(([indicator, data], index) => {
    ablationResults[indicator].rank = index + 1;
  });

  return ablationResults;
}
```

### Regime-Based Optimization

Optimize separately for different market conditions:

```javascript
function categorizeRegime(candles) {
  const adx = calculateADX(candles);
  const atr = calculateATR(candles);
  const atrPct = (atr / candles[candles.length-1].close) * 100;

  const trend = adx > 25 ? 'TRENDING' : 'RANGING';
  const volatility = atrPct > 3 ? 'HIGH_VOL' : 'LOW_VOL';

  return `${trend}_${volatility}`; // e.g., 'TRENDING_HIGH_VOL'
}

function regimeBasedOptimization(data) {
  const regimes = ['TRENDING_HIGH_VOL', 'TRENDING_LOW_VOL',
                   'RANGING_HIGH_VOL', 'RANGING_LOW_VOL'];

  const configs = {};

  for (const regime of regimes) {
    // Filter data by regime
    const regimeData = data.filter(d => categorizeRegime(d.candles) === regime);

    // Optimize for this regime
    const bestConfig = optimize(regimeData, searchSpace);

    configs[regime] = bestConfig;
  }

  // Runtime: dynamically select config based on current regime
  return configs;
}
```

## Overfitting Prevention Checklist

- [ ] Walk-forward validation with purged gaps
- [ ] Minimum 50 trades per out-of-sample fold
- [ ] In-sample vs out-of-sample gap <10%
- [ ] Statistical significance testing (p < 0.05)
- [ ] Cross-symbol validation (test on multiple pairs)
- [ ] Cross-regime validation (trend, range, high-vol, low-vol)
- [ ] Worst-fold performance acceptable (not just average)
- [ ] Stability score >70 (consistency across folds)
- [ ] Live forward test (shadow mode) validates backtest results
- [ ] Ablation test confirms all indicators contribute positively

## Production Deployment Workflow

```bash
# 1. Run full optimization
npm run optimize:full -- --symbol ETHUSDTM --samples 10000 --workers 8

# 2. Review results
cat research/results/latest/summary.json

# 3. Select top config (rank 1 from Pareto front)
npm run export -- --input research/results/latest/top_configs.json --rank 1 --dry-run

# 4. Forward test (shadow mode, 24 hours)
npm run forward -- --mode shadow --config research/results/latest/top_configs.json --duration 24h

# 5. Validate degradation <5% from backtest
# Check: liveMetrics.return vs backtestMetrics.return

# 6. A/B test against current production config
npm run forward -- --mode ab \
  --configA signal-weights.js \
  --configB research/results/latest/top_configs.json \
  --duration 48h

# 7. If A/B test successful, export to production
npm run export -- --input research/results/latest/top_configs.json --rank 1 --backup

# 8. Restart server with new config
npm restart

# 9. Monitor production performance (7 days)
tail -f logs/trading.log | grep -E "(P&L|drawdown|signal)"

# 10. Validate live metrics match forward test expectations
```

## Common Pitfalls & Solutions

### Pitfall 1: Overfitting to Historical Data
**Symptom**: 90% win rate in backtest, 40% in live trading
**Solution**:
- Increase out-of-sample fold size
- Add statistical significance testing
- Validate on multiple symbols and time periods
- Use simpler models (fewer parameters)

### Pitfall 2: Lookahead Bias
**Symptom**: Perfect entries at market reversals
**Solution**:
- Implement purge gaps in walk-forward splits
- Verify indicators don't peek ahead (e.g., using close[i+1])
- Check for data contamination between folds

### Pitfall 3: Survivorship Bias
**Symptom**: Great performance on delisted/inactive pairs
**Solution**:
- Test only on currently tradable pairs
- Include "failed" trades (exchange errors, slippage, rejections)
- Account for market impact on larger position sizes

### Pitfall 4: Insufficient Sample Size
**Symptom**: 5 trades with 100% win rate
**Solution**:
- Require minimum 50 trades per fold
- Extend backtest period to generate more signals
- Lower entry thresholds temporarily to validate with more data

### Pitfall 5: Ignoring Execution Costs
**Symptom**: Profitable in backtest, loses money to fees
**Solution**:
- Model taker fees (0.06%) and maker fees (0.02%)
- Add realistic slippage (0.02-0.05%)
- Implement fee-adjusted break-even calculations
- Consider exchange API rate limits and latency

## Tools & Resources

### Recommended Libraries
- **Backtesting**: `backtrader`, `vectorbt`, custom TypeScript engine
- **Optimization**: `optuna`, `scikit-optimize`, `DEAP` (genetic algorithms)
- **Statistics**: `scipy.stats`, `statsmodels`, `fast-check` (property-based testing)
- **Data**: `ccxt` (exchange APIs), `pandas`, `ta-lib` (indicators)

### Example Code Repositories
- Freqtrade: Open-source crypto trading bot with hyperopt
- QuantConnect: Algorithmic trading platform with backtesting
- Backtrader: Python backtesting framework
- This project: `/research` module with walk-forward optimizer

## Success Criteria

A strategy is **production-ready** when:

1. **Out-of-sample return** >10% annualized
2. **Sharpe ratio** >1.5
3. **Max drawdown** <15%
4. **Win rate** >52%
5. **Stability score** >75 (across folds)
6. **Statistical significance** (p-value <0.05 vs baseline)
7. **Minimum trades** >200 total (across all folds)
8. **IS/OOS gap** <10% (limited overfitting)
9. **Worst fold** still profitable
10. **Live forward test** validates backtest (degradation <5%)

## Version History

- **v1.0.0** (2026-02-21): Initial framework based on CypherScoping optimization system and institutional prompt pack analysis

## Related Skills

- `/backtest` - Strategy backtesting methodology
- `/risk-management` - Position sizing and stop-loss optimization
- `/technical-analysis` - Indicator interpretation and tuning

## Maintenance

**Review & Update Quarterly:**
- Search space bounds (as market conditions evolve)
- Validation requirements (adjust minimum trades, significance thresholds)
- Regime definitions (trend/range/volatility breakpoints)
- Performance benchmarks (as strategy matures)

---

**Note**: This framework synthesizes patterns from the CypherScoping optimization system, institutional prompt engineering templates, and quantitative research best practices. All methodologies emphasize reproducibility, statistical rigor, and overfitting prevention.
