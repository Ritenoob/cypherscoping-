#!/usr/bin/env node
/**
 * Local Backtest Runner
 *
 * Runs backtests using locally stored OHLCV data from data/ohlcv/
 * No API calls required - uses pre-fetched Binance Futures data.
 *
 * Usage:
 *   npm run local-backtest                    # Run all coins/timeframes
 *   npm run local-backtest -- --symbol BTCUSDT --interval 15m
 *   npm run local-backtest -- --compare       # Compare all results in table
 *
 * Created: 2026-01-16
 */

const fs = require('fs');
const path = require('path');

const BacktestEngine = require('../src/backtest/BacktestEngine');
const {
  RSIIndicator,
  MACDIndicator,
  BollingerBands,
  EMATrend,
  WilliamsRIndicator,
  AwesomeOscillator,
  StochasticIndicator,
  StochasticRSI,
  KDJIndicator,
  OBVIndicator,
  ADXIndicator
} = require('../src/indicators');

// Data directory
const DATA_DIR = path.join(__dirname, '..', 'data', 'ohlcv');
const RESULTS_DIR = path.join(__dirname, '..', 'logs', 'backtest-results');

// Available data files
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
const INTERVALS = ['15m', '1h', '4h'];

/**
 * Load OHLCV data from local file
 */
function loadOHLCVData(symbol, interval) {
  const filename = `${symbol}_${interval}_30d.json`;
  const filepath = path.join(DATA_DIR, filename);

  if (!fs.existsSync(filepath)) {
    console.error(`Data file not found: ${filepath}`);
    return null;
  }

  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  return data;
}

/**
 * Calculate all indicators for candles
 * Uses optimized parameters from signal-weights.js
 */
function calculateIndicators(candles, interval) {
  // Optimized parameters per timeframe (from signal-weights.js comments)
  const params = {
    '15m': {
      rsi: { period: 14, oversold: 35, overbought: 65 },
      macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      bb: { period: 15, stdDev: 2 },  // TOP 5: 86.1% WR
      ema: { shortPeriod: 9, mediumPeriod: 21, longPeriod: 50 },
      williamsR: { period: 14, oversold: -85, overbought: -15 },
      ao: { fastPeriod: 3, slowPeriod: 34 },  // TOP 5: 70% WR
      stochastic: { kPeriod: 14, dPeriod: 3, smooth: 3 },
      stochRSI: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3 },
      kdj: { kPeriod: 21, dPeriod: 3, smooth: 3 },
      obv: { slopeWindow: 14, smoothingEma: 5 },
      adx: { period: 14 }
    },
    '30m': {
      rsi: { period: 14, oversold: 35, overbought: 65 },
      macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      bb: { period: 20, stdDev: 2 },
      ema: { shortPeriod: 9, mediumPeriod: 21, longPeriod: 50 },
      williamsR: { period: 10, oversold: -90, overbought: -10 },  // TOP 5: 62.9% WR
      ao: { fastPeriod: 5, slowPeriod: 34 },
      stochastic: { kPeriod: 14, dPeriod: 3, smooth: 3 },
      stochRSI: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3 },
      kdj: { kPeriod: 21, dPeriod: 3, smooth: 3 },
      obv: { slopeWindow: 14, smoothingEma: 5 },
      adx: { period: 14 }
    },
    '1h': {
      rsi: { period: 14, oversold: 35, overbought: 65 },
      macd: { fastPeriod: 5, slowPeriod: 17, signalPeriod: 5 },  // TOP 5: 3.25% ROI
      bb: { period: 20, stdDev: 2.5 },
      ema: { shortPeriod: 9, mediumPeriod: 21, longPeriod: 50 },
      williamsR: { period: 14, oversold: -85, overbought: -15 },
      ao: { fastPeriod: 5, slowPeriod: 34 },
      stochastic: { kPeriod: 14, dPeriod: 3, smooth: 3 },
      stochRSI: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3 },
      kdj: { kPeriod: 21, dPeriod: 3, smooth: 3 },
      obv: { slopeWindow: 7, smoothingEma: 3 },  // TOP 5: 72.5% WR, 4.34% ROI
      adx: { period: 14 }
    },
    '4h': {
      rsi: { period: 14, oversold: 30, overbought: 70 },
      macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      bb: { period: 20, stdDev: 2 },
      ema: { shortPeriod: 9, mediumPeriod: 21, longPeriod: 50 },
      williamsR: { period: 14, oversold: -80, overbought: -20 },
      ao: { fastPeriod: 5, slowPeriod: 34 },
      stochastic: { kPeriod: 14, dPeriod: 3, smooth: 3 },
      stochRSI: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3 },
      kdj: { kPeriod: 21, dPeriod: 3, smooth: 3 },
      obv: { slopeWindow: 14, smoothingEma: 5 },
      adx: { period: 14 }
    }
  };

  const p = params[interval] || params['15m'];

  // Initialize all 11 indicators
  const rsi = new RSIIndicator(p.rsi);
  const macd = new MACDIndicator(p.macd);
  const bb = new BollingerBands(p.bb);
  const ema = new EMATrend(p.ema);
  const williamsR = new WilliamsRIndicator(p.williamsR);
  const ao = new AwesomeOscillator(p.ao);
  const stochastic = new StochasticIndicator(p.stochastic);
  const stochRSI = new StochasticRSI(p.stochRSI);
  const kdj = new KDJIndicator(p.kdj);
  const obv = new OBVIndicator(p.obv);
  const adx = new ADXIndicator(p.adx);

  const indicators = {
    rsi: [],
    macd: [],
    bollinger: [],
    emaTrend: [],
    williamsR: [],
    ao: [],
    stochastic: [],
    stochRSI: [],
    kdj: [],
    obv: [],
    adx: []
  };

  for (const candle of candles) {
    const candleData = {
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    };

    indicators.rsi.push(rsi.update(candleData));
    indicators.macd.push(macd.update(candleData));
    indicators.bollinger.push(bb.update(candleData));
    indicators.emaTrend.push(ema.update(candleData));
    indicators.williamsR.push(williamsR.update(candleData));
    indicators.ao.push(ao.update(candleData));
    indicators.stochastic.push(stochastic.update(candleData));
    indicators.stochRSI.push(stochRSI.update(candleData));
    indicators.kdj.push(kdj.update(candleData));
    indicators.obv.push(obv.update(candleData));
    indicators.adx.push(adx.update(candleData));
  }

  return indicators;
}

/**
 * Run backtest for a single symbol/interval
 */
async function runSingleBacktest(symbol, interval, config = {}) {
  const data = loadOHLCVData(symbol, interval);
  if (!data) return null;

  const candles = data.candles;
  console.log(`\nRunning backtest: ${symbol} ${interval} (${candles.length} candles)`);

  // Calculate indicators
  const indicators = calculateIndicators(candles, interval);

  // Configure backtest engine
  const engineConfig = {
    initialBalance: config.initialBalance || 10000,
    leverage: config.leverage || 15,
    riskPerTrade: config.riskPerTrade || 1,
    commission: config.commission || 0.0006,
    slippage: config.slippage || 0.0005,
    // Trailing Stop - optimized settings
    trailingStopEnabled: config.trailingStopEnabled ?? true,
    trailingStopActivation: config.trailingStopActivation || 25,
    trailingStopTrail: config.trailingStopTrail || 10,
    // Break-Even - disabled (was cutting winners too early)
    breakEvenEnabled: config.breakEvenEnabled ?? false,
    breakEvenActivation: config.breakEvenActivation || 50,
    breakEvenBuffer: config.breakEvenBuffer || 5
  };

  const engine = new BacktestEngine(engineConfig);

  // Run backtest
  const results = await engine.runBacktest(candles, indicators, {
    warmupPeriod: config.warmupPeriod || 100,
    stopLossROI: config.stopLossROI || 15,
    takeProfitROI: config.takeProfitROI || 150,
    minSignalScore: config.minSignalScore || 85,
    invertSignals: config.invertSignals || false
  });

  return {
    symbol,
    interval,
    candleCount: candles.length,
    dateRange: {
      start: data.startTime,
      end: data.endTime
    },
    priceRange: data.priceRange,
    config: { ...engineConfig, ...config },
    results
  };
}

/**
 * Run backtests for all symbols and intervals
 */
async function runAllBacktests(config = {}) {
  const allResults = [];

  for (const symbol of SYMBOLS) {
    for (const interval of INTERVALS) {
      const result = await runSingleBacktest(symbol, interval, config);
      if (result) {
        allResults.push(result);
      }
    }
  }

  return allResults;
}

/**
 * Print comparison table
 */
function printComparisonTable(results) {
  console.log('\n' + '='.repeat(100));
  console.log('BACKTEST RESULTS COMPARISON');
  console.log('='.repeat(100));

  // Sort by profit factor descending
  const sorted = [...results].sort((a, b) =>
    parseFloat(b.results.profitFactor) - parseFloat(a.results.profitFactor)
  );

  // Header
  console.log(
    'Symbol'.padEnd(10) +
    'TF'.padEnd(6) +
    'Trades'.padEnd(8) +
    'Win%'.padEnd(8) +
    'PF'.padEnd(8) +
    'Return%'.padEnd(10) +
    'MaxDD%'.padEnd(10) +
    'AvgWin'.padEnd(10) +
    'AvgLoss'.padEnd(10) +
    'Sharpe'.padEnd(8)
  );
  console.log('-'.repeat(100));

  for (const r of sorted) {
    const res = r.results;
    const winRate = parseFloat(res.winRate);
    const pf = parseFloat(res.profitFactor);

    // Color coding (terminal)
    let prefix = '';
    if (winRate >= 65 && pf >= 2.0) prefix = '★ ';
    else if (winRate >= 55 && pf >= 1.5) prefix = '  ';
    else prefix = '  ';

    console.log(
      prefix +
      r.symbol.padEnd(8) +
      r.interval.padEnd(6) +
      String(res.totalTrades).padEnd(8) +
      `${res.winRate}%`.padEnd(8) +
      res.profitFactor.padEnd(8) +
      `${res.totalReturn}%`.padEnd(10) +
      `${res.maxDrawdown}%`.padEnd(10) +
      `$${res.avgWin}`.padEnd(10) +
      `$${res.avgLoss}`.padEnd(10) +
      res.sharpeRatio.padEnd(8)
    );
  }

  console.log('='.repeat(100));
  console.log('★ = Meets target (WR >= 65%, PF >= 2.0)');

  // Summary statistics
  const avgWinRate = results.reduce((s, r) => s + parseFloat(r.results.winRate), 0) / results.length;
  const avgPF = results.reduce((s, r) => s + parseFloat(r.results.profitFactor), 0) / results.length;
  const avgReturn = results.reduce((s, r) => s + parseFloat(r.results.totalReturn), 0) / results.length;

  console.log(`\nAverages: Win Rate: ${avgWinRate.toFixed(2)}% | Profit Factor: ${avgPF.toFixed(2)} | Return: ${avgReturn.toFixed(2)}%`);
}

/**
 * Save results to file
 */
function saveResults(results, filename = null) {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const file = filename || `backtest_${Date.now()}.json`;
  const filepath = path.join(RESULTS_DIR, file);

  // Create summary for file
  const summary = {
    timestamp: new Date().toISOString(),
    totalBacktests: results.length,
    averages: {
      winRate: (results.reduce((s, r) => s + parseFloat(r.results.winRate), 0) / results.length).toFixed(2),
      profitFactor: (results.reduce((s, r) => s + parseFloat(r.results.profitFactor), 0) / results.length).toFixed(2),
      totalReturn: (results.reduce((s, r) => s + parseFloat(r.results.totalReturn), 0) / results.length).toFixed(2),
      maxDrawdown: (results.reduce((s, r) => s + parseFloat(r.results.maxDrawdown), 0) / results.length).toFixed(2)
    },
    bestPerformers: results
      .sort((a, b) => parseFloat(b.results.profitFactor) - parseFloat(a.results.profitFactor))
      .slice(0, 3)
      .map(r => ({
        symbol: r.symbol,
        interval: r.interval,
        winRate: r.results.winRate,
        profitFactor: r.results.profitFactor,
        totalReturn: r.results.totalReturn
      })),
    results: results.map(r => ({
      symbol: r.symbol,
      interval: r.interval,
      candleCount: r.candleCount,
      dateRange: r.dateRange,
      metrics: {
        totalTrades: r.results.totalTrades,
        winRate: r.results.winRate,
        profitFactor: r.results.profitFactor,
        totalReturn: r.results.totalReturn,
        maxDrawdown: r.results.maxDrawdown,
        sharpeRatio: r.results.sharpeRatio,
        avgWin: r.results.avgWin,
        avgLoss: r.results.avgLoss
      },
      config: r.config
    }))
  };

  fs.writeFileSync(filepath, JSON.stringify(summary, null, 2));
  console.log(`\nResults saved to: ${filepath}`);

  return filepath;
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    symbol: null,
    interval: null,
    compare: false,
    // Default backtest config
    initialBalance: 10000,
    leverage: 15,
    riskPerTrade: 1,
    stopLossROI: 15,
    takeProfitROI: 150,
    minSignalScore: 85,
    warmupPeriod: 100
  };

  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];

    switch (key) {
      case 'symbol':
        config.symbol = value;
        i++;
        break;
      case 'interval':
        config.interval = value;
        i++;
        break;
      case 'compare':
        config.compare = true;
        break;
      case 'leverage':
        config.leverage = parseInt(value);
        i++;
        break;
      case 'sl':
        config.stopLossROI = parseFloat(value);
        i++;
        break;
      case 'tp':
        config.takeProfitROI = parseFloat(value);
        i++;
        break;
      case 'score':
        config.minSignalScore = parseInt(value);
        i++;
        break;
      case 'warmup':
        config.warmupPeriod = parseInt(value);
        i++;
        break;
    }
  }

  return config;
}

/**
 * Main entry point
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('LOCAL BACKTEST RUNNER v1.0');
  console.log('Using pre-fetched Binance Futures OHLCV data');
  console.log('='.repeat(60));

  const config = parseArgs();

  console.log(`\nConfig:`);
  console.log(`  Leverage: ${config.leverage}x`);
  console.log(`  Stop Loss: ${config.stopLossROI}% ROI`);
  console.log(`  Take Profit: ${config.takeProfitROI}% ROI`);
  console.log(`  Min Signal Score: ${config.minSignalScore}`);
  console.log(`  Warmup Period: ${config.warmupPeriod} candles`);

  let results;

  if (config.symbol && config.interval) {
    // Single backtest
    const result = await runSingleBacktest(config.symbol, config.interval, config);
    if (result) {
      results = [result];
      console.log('\n' + '='.repeat(60));
      console.log('RESULTS');
      console.log('='.repeat(60));
      console.log(`Initial Balance:    $${result.results.initialBalance.toFixed(2)}`);
      console.log(`Final Balance:      $${result.results.finalBalance.toFixed(2)}`);
      console.log(`Total Return:       ${result.results.totalReturn}%`);
      console.log(`Total Trades:       ${result.results.totalTrades}`);
      console.log(`Win Rate:           ${result.results.winRate}%`);
      console.log(`Profit Factor:      ${result.results.profitFactor}`);
      console.log(`Sharpe Ratio:       ${result.results.sharpeRatio}`);
      console.log(`Max Drawdown:       ${result.results.maxDrawdown}%`);
      console.log('='.repeat(60));
    }
  } else {
    // Run all backtests
    results = await runAllBacktests(config);
    printComparisonTable(results);
  }

  if (results && results.length > 0) {
    saveResults(results);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { runSingleBacktest, runAllBacktests, calculateIndicators };
