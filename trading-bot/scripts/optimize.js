#!/usr/bin/env node
/**
 * Autonomous Optimization Engine
 * 
 * This script runs continuous optimization cycles to maximize
 * trading bot profitability. Designed for use with Claude Code.
 * 
 * Usage: node scripts/optimize.js [--cycles N] [--symbol SYMBOL] [--aggressive]
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Configuration
const CONFIG = {
  // Optimization targets
  targets: {
    minWinRate: 0.55,
    targetWinRate: 0.65,
    minProfitFactor: 1.5,
    targetProfitFactor: 2.0,
    maxDrawdown: 0.15,
    minSharpe: 1.0
  },
  
  // Symbols to optimize (Note: KuCoin uses XBTUSDTM for Bitcoin)
  symbols: ['XBTUSDTM', 'ETHUSDTM', 'SOLUSDTM', 'XRPUSDTM', 'DOGEUSDTM'],
  
  // Timeframes to test
  timeframes: ['5min', '15min', '1hour'],
  
  // Parameter ranges for grid search
  parameterRanges: {
    // RSI
    RSI_PERIOD: [7, 10, 14, 21],
    RSI_OVERSOLD: [20, 25, 30, 35],
    RSI_OVERBOUGHT: [65, 70, 75, 80],
    
    // MACD
    MACD_FAST: [8, 12, 16],
    MACD_SLOW: [21, 26, 34],
    MACD_SIGNAL: [7, 9, 12],
    
    // Bollinger
    BOLLINGER_PERIOD: [15, 20, 25],
    BOLLINGER_STDDEV: [1.5, 2.0, 2.5],
    
    // Stochastic
    STOCH_K_PERIOD: [9, 14, 21],
    STOCH_OVERSOLD: [15, 20, 25],
    STOCH_OVERBOUGHT: [75, 80, 85],
    
    // Signal thresholds
    SIGNAL_MIN_SCORE: [40, 50, 60, 70],
    SIGNAL_MIN_CONFIDENCE: [30, 40, 50],
    SIGNAL_MIN_INDICATORS: [2, 3, 4, 5],
    
    // Risk management
    STOP_LOSS_ROI: [0.3, 0.5, 0.75, 1.0],
    TAKE_PROFIT_ROI: [1.0, 1.5, 2.0, 2.5, 3.0],
    
    // Leverage
    LEVERAGE_DEFAULT: [25, 50, 75, 100]
  },
  
  // Weight ranges for indicator optimization
  weightRanges: {
    rsi: [15, 20, 25, 30],
    macd: [15, 20, 25],
    williamsR: [15, 20, 25],
    ao: [10, 15, 20],
    emaTrend: [15, 20, 25],
    stochastic: [5, 10, 15],
    bollinger: [5, 10, 15],
    kdj: [10, 15, 20],
    obv: [5, 10, 15],
    dom: [10, 15, 20]
  },
  
  // Backtest settings
  backtest: {
    days: 30,
    initialBalance: 10000,
    defaultLeverage: 50,
    riskPercent: 2
  },
  
  // Output paths
  paths: {
    results: './logs/optimization_results.json',
    bestParams: './logs/best_parameters.json',
    history: './logs/optimization_history.json',
    baseline: './logs/baseline_metrics.json'
  }
};

// Utility functions
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

function loadJSON(filepath) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
  } catch (e) {
    log(`Error loading ${filepath}: ${e.message}`, 'WARN');
  }
  return null;
}

function saveJSON(filepath, data) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function runCommand(cmd, silent = false) {
  try {
    const result = execSync(cmd, { 
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit'
    });
    return { success: true, output: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Backtest runner
async function runBacktest(symbol, timeframe, params = {}) {
  log(`Running backtest: ${symbol} ${timeframe}`);
  
  // Set environment variables for this backtest
  const envVars = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  
  const cmd = `${envVars} node scripts/backtest-runner.js --symbol ${symbol} --timeframe ${timeframe} --days ${CONFIG.backtest.days} --balance ${CONFIG.backtest.initialBalance}`;
  
  try {
    const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
    
    // Parse results from output
    const lines = result.split('\n');
    const metrics = {};
    
    for (const line of lines) {
      if (line.includes('Win Rate:')) {
        metrics.winRate = parseFloat(line.match(/[\d.]+/)?.[0]) / 100 || 0;
      }
      if (line.includes('Profit Factor:')) {
        metrics.profitFactor = parseFloat(line.match(/[\d.]+/)?.[0]) || 0;
      }
      if (line.includes('Sharpe Ratio:')) {
        metrics.sharpeRatio = parseFloat(line.match(/-?[\d.]+/)?.[0]) || 0;
      }
      if (line.includes('Max Drawdown:')) {
        metrics.maxDrawdown = parseFloat(line.match(/[\d.]+/)?.[0]) / 100 || 0;
      }
      if (line.includes('Total Return:')) {
        metrics.totalReturn = parseFloat(line.match(/-?[\d.]+/)?.[0]) / 100 || 0;
      }
      if (line.includes('Total Trades:')) {
        metrics.totalTrades = parseInt(line.match(/\d+/)?.[0]) || 0;
      }
    }
    
    return { success: true, metrics, params };
  } catch (e) {
    log(`Backtest failed: ${e.message}`, 'ERROR');
    return { success: false, error: e.message };
  }
}

// Calculate composite score for a set of metrics
function calculateScore(metrics) {
  if (!metrics || metrics.totalTrades < 10) return -Infinity;
  
  const {
    winRate = 0,
    profitFactor = 0,
    sharpeRatio = 0,
    maxDrawdown = 1,
    totalReturn = 0
  } = metrics;
  
  // Weighted scoring
  let score = 0;
  
  // Win rate contribution (30%)
  score += (winRate - 0.5) * 100 * 0.3;
  
  // Profit factor contribution (30%)
  score += Math.min(profitFactor, 5) * 6 * 0.3;
  
  // Sharpe ratio contribution (20%)
  score += Math.min(sharpeRatio, 3) * 10 * 0.2;
  
  // Drawdown penalty (10%)
  score -= maxDrawdown * 100 * 0.1;
  
  // Total return bonus (10%)
  score += Math.min(totalReturn, 1) * 30 * 0.1;
  
  return score;
}

// Grid search optimization
async function gridSearchOptimize(symbol, timeframe, paramSubset) {
  log(`Starting grid search for ${symbol} ${timeframe}`);
  
  const results = [];
  const paramNames = Object.keys(paramSubset);
  const paramValues = Object.values(paramSubset);
  
  // Generate all combinations
  function* cartesian(arrays, prefix = []) {
    if (arrays.length === 0) {
      yield prefix;
    } else {
      for (const value of arrays[0]) {
        yield* cartesian(arrays.slice(1), [...prefix, value]);
      }
    }
  }
  
  const combinations = [...cartesian(paramValues)];
  log(`Testing ${combinations.length} parameter combinations`);
  
  let tested = 0;
  for (const values of combinations) {
    const params = {};
    paramNames.forEach((name, i) => params[name] = values[i]);
    
    const result = await runBacktest(symbol, timeframe, params);
    if (result.success) {
      result.score = calculateScore(result.metrics);
      results.push(result);
    }
    
    tested++;
    if (tested % 10 === 0) {
      log(`Progress: ${tested}/${combinations.length} (${(tested/combinations.length*100).toFixed(1)}%)`);
    }
  }
  
  // Sort by score
  results.sort((a, b) => b.score - a.score);
  
  return results;
}

// Genetic algorithm optimization
async function geneticOptimize(symbol, timeframe, generations = 20, populationSize = 30) {
  log(`Starting genetic optimization for ${symbol} ${timeframe}`);
  
  const paramNames = Object.keys(CONFIG.parameterRanges);
  
  // Generate random individual
  function randomIndividual() {
    const individual = {};
    for (const [param, range] of Object.entries(CONFIG.parameterRanges)) {
      individual[param] = range[Math.floor(Math.random() * range.length)];
    }
    return individual;
  }
  
  // Crossover two individuals
  function crossover(a, b) {
    const child = {};
    for (const param of paramNames) {
      child[param] = Math.random() < 0.5 ? a[param] : b[param];
    }
    return child;
  }
  
  // Mutate an individual
  function mutate(individual, rate = 0.1) {
    const mutated = { ...individual };
    for (const [param, range] of Object.entries(CONFIG.parameterRanges)) {
      if (Math.random() < rate) {
        mutated[param] = range[Math.floor(Math.random() * range.length)];
      }
    }
    return mutated;
  }
  
  // Initialize population
  let population = Array(populationSize).fill(null).map(() => randomIndividual());
  let bestEver = null;
  let bestScore = -Infinity;
  
  for (let gen = 0; gen < generations; gen++) {
    log(`Generation ${gen + 1}/${generations}`);
    
    // Evaluate population
    const evaluated = [];
    for (const individual of population) {
      const result = await runBacktest(symbol, timeframe, individual);
      if (result.success) {
        const score = calculateScore(result.metrics);
        evaluated.push({ individual, metrics: result.metrics, score });
        
        if (score > bestScore) {
          bestScore = score;
          bestEver = { individual, metrics: result.metrics, score };
          log(`New best score: ${score.toFixed(2)} (WR: ${(result.metrics.winRate*100).toFixed(1)}%, PF: ${result.metrics.profitFactor.toFixed(2)})`);
        }
      }
    }
    
    // Sort by fitness
    evaluated.sort((a, b) => b.score - a.score);
    
    // Selection (top 50%)
    const survivors = evaluated.slice(0, Math.floor(populationSize / 2));
    
    // Create next generation
    population = survivors.map(s => s.individual);
    
    // Add offspring through crossover
    while (population.length < populationSize) {
      const parentA = survivors[Math.floor(Math.random() * survivors.length)].individual;
      const parentB = survivors[Math.floor(Math.random() * survivors.length)].individual;
      const child = mutate(crossover(parentA, parentB), 0.15);
      population.push(child);
    }
  }
  
  return bestEver;
}

// Weight optimization
async function optimizeWeights(symbol, timeframe, baseParams = {}) {
  log(`Optimizing indicator weights for ${symbol} ${timeframe}`);
  
  const currentWeights = loadJSON('./signal-weights.js') || {};
  const results = [];
  
  // Test different weight distributions
  const weightTests = [
    // Trend-focused
    { rsi: 20, macd: 25, williamsR: 15, ao: 15, emaTrend: 30, stochastic: 8, bollinger: 8, kdj: 10, obv: 10, dom: 15 },
    // Mean-reversion focused
    { rsi: 30, macd: 15, williamsR: 25, ao: 15, emaTrend: 15, stochastic: 15, bollinger: 15, kdj: 15, obv: 8, dom: 10 },
    // Momentum-focused
    { rsi: 25, macd: 25, williamsR: 20, ao: 20, emaTrend: 20, stochastic: 10, bollinger: 10, kdj: 15, obv: 15, dom: 15 },
    // Volume-focused
    { rsi: 20, macd: 20, williamsR: 15, ao: 15, emaTrend: 20, stochastic: 10, bollinger: 10, kdj: 10, obv: 20, dom: 25 },
    // Balanced
    { rsi: 20, macd: 20, williamsR: 20, ao: 15, emaTrend: 20, stochastic: 12, bollinger: 12, kdj: 12, obv: 12, dom: 15 }
  ];
  
  for (const weights of weightTests) {
    // This would require modifying signal-weights.js temporarily
    // For now, we'll log the intended test
    log(`Testing weight distribution: RSI=${weights.rsi}, MACD=${weights.macd}, EMA=${weights.emaTrend}`);
    
    const result = await runBacktest(symbol, timeframe, baseParams);
    if (result.success) {
      result.weights = weights;
      result.score = calculateScore(result.metrics);
      results.push(result);
    }
  }
  
  results.sort((a, b) => b.score - a.score);
  return results[0];
}

// Apply optimized parameters to config files
function applyOptimizedParams(params, weights = null) {
  log('Applying optimized parameters to configuration files');
  
  // Update .env file
  const envPath = './.env';
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  
  for (const [key, value] of Object.entries(params)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (envContent.match(regex)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }
  
  fs.writeFileSync(envPath, envContent);
  log('Updated .env file with optimized parameters');
  
  // Update signal-weights.js if weights provided
  if (weights) {
    const weightsPath = './signal-weights.js';
    // This would require more sophisticated file manipulation
    // For safety, we'll just log the recommended weights
    log(`Recommended weights: ${JSON.stringify(weights)}`);
  }
}

// Main optimization cycle
async function runOptimizationCycle(options = {}) {
  const { cycles = 1, symbol = null, aggressive = false } = options;
  
  log('=' .repeat(60));
  log('STARTING AUTONOMOUS OPTIMIZATION ENGINE');
  log('=' .repeat(60));
  
  const symbols = symbol ? [symbol] : CONFIG.symbols;
  const allResults = [];
  
  // Load baseline metrics if available
  const baseline = loadJSON(CONFIG.paths.baseline);
  if (baseline) {
    log(`Baseline metrics loaded: WR=${(baseline.winRate*100).toFixed(1)}%, PF=${baseline.profitFactor.toFixed(2)}`);
  }
  
  for (let cycle = 1; cycle <= cycles; cycle++) {
    log(`\n${'='.repeat(60)}`);
    log(`OPTIMIZATION CYCLE ${cycle}/${cycles}`);
    log('='.repeat(60));
    
    for (const sym of symbols) {
      for (const tf of CONFIG.timeframes) {
        log(`\nOptimizing ${sym} on ${tf} timeframe`);
        
        // Phase 1: Quick grid search on key parameters
        const quickParams = {
          SIGNAL_MIN_SCORE: CONFIG.parameterRanges.SIGNAL_MIN_SCORE,
          STOP_LOSS_ROI: CONFIG.parameterRanges.STOP_LOSS_ROI,
          TAKE_PROFIT_ROI: CONFIG.parameterRanges.TAKE_PROFIT_ROI
        };
        
        const gridResults = await gridSearchOptimize(sym, tf, quickParams);
        if (gridResults.length > 0) {
          log(`Grid search best: Score=${gridResults[0].score.toFixed(2)}`);
          allResults.push({ symbol: sym, timeframe: tf, type: 'grid', ...gridResults[0] });
        }
        
        // Phase 2: Genetic optimization if aggressive mode
        if (aggressive) {
          const geneticResult = await geneticOptimize(sym, tf, 10, 20);
          if (geneticResult) {
            log(`Genetic optimization best: Score=${geneticResult.score.toFixed(2)}`);
            allResults.push({ symbol: sym, timeframe: tf, type: 'genetic', ...geneticResult });
          }
        }
      }
    }
    
    // Find overall best
    allResults.sort((a, b) => b.score - a.score);
    const best = allResults[0];
    
    if (best) {
      log('\n' + '='.repeat(60));
      log('BEST RESULT FOUND');
      log('='.repeat(60));
      log(`Symbol: ${best.symbol}`);
      log(`Timeframe: ${best.timeframe}`);
      log(`Score: ${best.score.toFixed(2)}`);
      log(`Win Rate: ${(best.metrics.winRate * 100).toFixed(1)}%`);
      log(`Profit Factor: ${best.metrics.profitFactor.toFixed(2)}`);
      log(`Sharpe Ratio: ${best.metrics.sharpeRatio.toFixed(2)}`);
      log(`Max Drawdown: ${(best.metrics.maxDrawdown * 100).toFixed(1)}%`);
      log(`Parameters: ${JSON.stringify(best.params || best.individual)}`);
      
      // Check if better than baseline
      if (baseline) {
        const baselineScore = calculateScore(baseline);
        if (best.score > baselineScore) {
          log('\n✓ IMPROVEMENT OVER BASELINE DETECTED');
          log(`Baseline score: ${baselineScore.toFixed(2)} → New score: ${best.score.toFixed(2)}`);
          
          // Apply optimized parameters
          applyOptimizedParams(best.params || best.individual);
          
          // Update baseline
          saveJSON(CONFIG.paths.baseline, best.metrics);
        } else {
          log('\n✗ No improvement over baseline');
        }
      } else {
        // First run - save as baseline
        saveJSON(CONFIG.paths.baseline, best.metrics);
        applyOptimizedParams(best.params || best.individual);
      }
      
      // Save results
      saveJSON(CONFIG.paths.bestParams, {
        timestamp: new Date().toISOString(),
        symbol: best.symbol,
        timeframe: best.timeframe,
        score: best.score,
        metrics: best.metrics,
        params: best.params || best.individual
      });
    }
    
    // Save history
    const history = loadJSON(CONFIG.paths.history) || [];
    history.push({
      cycle,
      timestamp: new Date().toISOString(),
      results: allResults.slice(0, 10) // Top 10
    });
    saveJSON(CONFIG.paths.history, history);
  }
  
  log('\n' + '='.repeat(60));
  log('OPTIMIZATION COMPLETE');
  log('='.repeat(60));
  
  return allResults;
}

// Performance analyzer
function analyzePerformance() {
  log('Analyzing historical performance');
  
  const history = loadJSON(CONFIG.paths.history) || [];
  const bestParams = loadJSON(CONFIG.paths.bestParams);
  
  if (history.length === 0) {
    log('No optimization history found');
    return null;
  }
  
  // Calculate improvement over time
  const scores = history.map(h => h.results[0]?.score || 0);
  const improvement = scores.length > 1 ? 
    ((scores[scores.length - 1] - scores[0]) / Math.abs(scores[0]) * 100).toFixed(1) : 0;
  
  const analysis = {
    totalCycles: history.length,
    bestScore: Math.max(...scores),
    averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
    improvement: `${improvement}%`,
    currentBest: bestParams
  };
  
  log(`Total optimization cycles: ${analysis.totalCycles}`);
  log(`Best score achieved: ${analysis.bestScore.toFixed(2)}`);
  log(`Average score: ${analysis.averageScore.toFixed(2)}`);
  log(`Total improvement: ${analysis.improvement}`);
  
  return analysis;
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    cycles: 1,
    symbol: null,
    aggressive: false,
    analyze: false
  };
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cycles' && args[i + 1]) {
      options.cycles = parseInt(args[i + 1]);
      i++;
    }
    if (args[i] === '--symbol' && args[i + 1]) {
      options.symbol = args[i + 1];
      i++;
    }
    if (args[i] === '--aggressive') {
      options.aggressive = true;
    }
    if (args[i] === '--analyze') {
      options.analyze = true;
    }
    if (args[i] === '--help') {
      console.log(`
Autonomous Optimization Engine

Usage: node scripts/optimize.js [options]

Options:
  --cycles N      Number of optimization cycles (default: 1)
  --symbol SYM    Optimize specific symbol only
  --aggressive    Use genetic algorithm (slower but more thorough)
  --analyze       Analyze historical optimization performance
  --help          Show this help message

Examples:
  node scripts/optimize.js --cycles 5 --aggressive
  node scripts/optimize.js --symbol BTCUSDTM --cycles 3
  node scripts/optimize.js --analyze
      `);
      process.exit(0);
    }
  }
  
  // Run tests first
  log('Running test suite to verify system integrity');
  const testResult = runCommand('npm test', true);
  if (!testResult.success) {
    log('Tests failed! Fix issues before optimizing.', 'ERROR');
    process.exit(1);
  }
  log('All tests passed ✓');
  
  if (options.analyze) {
    analyzePerformance();
  } else {
    await runOptimizationCycle(options);
  }
}

// Export for use as module
module.exports = {
  runOptimizationCycle,
  runBacktest,
  gridSearchOptimize,
  geneticOptimize,
  analyzePerformance,
  CONFIG
};

// Run if called directly
if (require.main === module) {
  main().catch(e => {
    log(`Fatal error: ${e.message}`, 'ERROR');
    process.exit(1);
  });
}
