#!/usr/bin/env node
/**
 * Individual Indicator Test Script
 *
 * Tests each indicator in isolation across multiple timeframes and parameter combinations.
 * Outputs detailed performance metrics to identify optimal settings.
 *
 * Usage:
 *   node scripts/individual-indicator-test.js --indicator rsi --timeframe 15min
 *   node scripts/individual-indicator-test.js --all --symbol SOLUSDTM
 */

const fs = require('fs');
const path = require('path');
const Decimal = require('decimal.js');

// Import all indicators
const {
  RSIIndicator,
  MACDIndicator,
  BollingerBands,
  EMATrend,
  WilliamsRIndicator,
  AwesomeOscillator,
  StochasticIndicator,
  KDJIndicator,
  OBVIndicator,
  ADXIndicator
} = require('../src/indicators');

const DATA_DIR = path.join(__dirname, '..', 'data', 'kucoin-ohlcv');
const OUTPUT_DIR = path.join(__dirname, '..', 'logs', 'indicator-tests');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Timeframes to test
const TIMEFRAMES = ['5min', '15min', '30min', '1hour'];

// Default symbols
const DEFAULT_SYMBOLS = ['SOLUSDTM', 'XBTUSDTM', 'ETHUSDTM'];

// Parameter grids for optimization
const PARAMETER_GRIDS = {
  rsi: [
    { period: 7, oversold: 30, overbought: 70, stochPeriod: 14 },
    { period: 14, oversold: 30, overbought: 70, stochPeriod: 14 },
    { period: 14, oversold: 25, overbought: 75, stochPeriod: 14 },
    { period: 14, oversold: 20, overbought: 80, stochPeriod: 14 },
    { period: 21, oversold: 30, overbought: 70, stochPeriod: 14 },
    { period: 9, oversold: 35, overbought: 65, stochPeriod: 9 },
  ],
  macd: [
    { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    { fastPeriod: 8, slowPeriod: 17, signalPeriod: 9 },
    { fastPeriod: 5, slowPeriod: 17, signalPeriod: 5 },
    { fastPeriod: 5, slowPeriod: 35, signalPeriod: 5 },
    { fastPeriod: 3, slowPeriod: 10, signalPeriod: 16 },
  ],
  bollinger: [
    { period: 20, stdDev: 2.0, atrPeriod: 10 },
    { period: 20, stdDev: 2.5, atrPeriod: 10 },
    { period: 15, stdDev: 2.0, atrPeriod: 10 },
    { period: 10, stdDev: 1.5, atrPeriod: 10 },
    { period: 25, stdDev: 2.0, atrPeriod: 14 },
  ],
  williamsR: [
    { period: 14, oversold: -80, overbought: -20, fastPeriod: 6 },
    { period: 10, oversold: -90, overbought: -10, fastPeriod: 5 },
    { period: 14, oversold: -85, overbought: -15, fastPeriod: 7 },
    { period: 21, oversold: -80, overbought: -20, fastPeriod: 9 },
    { period: 7, oversold: -75, overbought: -25, fastPeriod: 3 },
  ],
  ao: [
    { fastPeriod: 5, slowPeriod: 34 },
    { fastPeriod: 3, slowPeriod: 34 },
    { fastPeriod: 5, slowPeriod: 21 },
    { fastPeriod: 7, slowPeriod: 34 },
    { fastPeriod: 5, slowPeriod: 55 },
  ],
  obv: [
    { slopeWindow: 14, smoothingEma: 5 },
    { slopeWindow: 7, smoothingEma: 3 },
    { slopeWindow: 21, smoothingEma: 7 },
    { slopeWindow: 10, smoothingEma: 5 },
    { slopeWindow: 5, smoothingEma: 3 },
  ],
  kdj: [
    { kPeriod: 9, dPeriod: 3, smooth: 3 },
    { kPeriod: 14, dPeriod: 3, smooth: 3 },
    { kPeriod: 21, dPeriod: 3, smooth: 3 },
    { kPeriod: 9, dPeriod: 5, smooth: 5 },
    { kPeriod: 5, dPeriod: 3, smooth: 3 },
  ],
  adx: [
    { period: 14 },
    { period: 10 },
    { period: 20 },
    { period: 7 },
    { period: 25 },
  ],
  stochastic: [
    { kPeriod: 14, dPeriod: 3, smooth: 3 },
    { kPeriod: 9, dPeriod: 3, smooth: 3 },
    { kPeriod: 21, dPeriod: 5, smooth: 5 },
    { kPeriod: 5, dPeriod: 3, smooth: 3 },
  ],
  emaTrend: [
    { shortPeriod: 9, mediumPeriod: 21, longPeriod: 50 },
    { shortPeriod: 5, mediumPeriod: 13, longPeriod: 34 },
    { shortPeriod: 12, mediumPeriod: 26, longPeriod: 50 },
    { shortPeriod: 8, mediumPeriod: 21, longPeriod: 55 },
  ]
};

/**
 * Load historical candle data
 */
function loadCandles(symbol, timeframe) {
  const filename = `${symbol}_${timeframe}_30d.json`;
  const filepath = path.join(DATA_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return null;
  }

  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  return data.candles;
}

/**
 * Create indicator instance with given parameters
 */
function createIndicator(name, params) {
  switch (name) {
    case 'rsi':
      return new RSIIndicator(params);
    case 'macd':
      return new MACDIndicator(params);
    case 'bollinger':
      return new BollingerBands(params);
    case 'williamsR':
      return new WilliamsRIndicator(params);
    case 'ao':
      return new AwesomeOscillator(params);
    case 'obv':
      return new OBVIndicator(params);
    case 'kdj':
      return new KDJIndicator(params);
    case 'adx':
      return new ADXIndicator(params);
    case 'stochastic':
      return new StochasticIndicator(params);
    case 'emaTrend':
      return new EMATrend(params);
    default:
      return null;
  }
}

/**
 * Run individual indicator backtest
 */
function runIndicatorBacktest(candles, indicatorName, params, config = {}) {
  const indicator = createIndicator(indicatorName, params);
  if (!indicator) return null;

  const warmupPeriod = config.warmupPeriod || 100;
  const leverage = config.leverage || 10;
  const stopLossROI = config.stopLossROI || 10; // 10% ROI stop loss
  const takeProfitROI = config.takeProfitROI || 30; // 30% ROI take profit

  // Calculate indicator values for all candles
  const indicatorHistory = [];
  for (const candle of candles) {
    indicatorHistory.push(indicator.update({
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    }));
  }

  // Simulate trades based on indicator signals
  const trades = [];
  let position = null;
  let balance = 10000;

  for (let i = warmupPeriod; i < candles.length; i++) {
    const candle = candles[i];
    const indData = indicatorHistory[i];

    if (!indData || !indData.signals) continue;

    // Check exits first
    if (position) {
      const currentROI = calculateROI(position, candle.close, leverage);

      // Update trailing stop
      if (currentROI > position.highestROI) {
        position.highestROI = currentROI;
        if (currentROI >= 20) {
          const trailStop = position.highestROI - 10;
          if (trailStop > position.trailStopROI) {
            position.trailStopROI = trailStop;
          }
        }
      }

      let shouldClose = false;
      let reason = '';

      // Check stop loss
      if (currentROI <= -stopLossROI) {
        shouldClose = true;
        reason = 'stop_loss';
      }
      // Check trailing stop
      else if (position.trailStopROI && currentROI <= position.trailStopROI) {
        shouldClose = true;
        reason = 'trailing_stop';
      }
      // Check take profit
      else if (currentROI >= takeProfitROI) {
        shouldClose = true;
        reason = 'take_profit';
      }

      if (shouldClose) {
        const pnl = (balance * 0.1) * (currentROI / 100); // 10% position size
        balance += pnl;
        trades.push({
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice: candle.close,
          roi: currentROI,
          pnl,
          reason,
          signalType: position.signalType,
          duration: i - position.entryIndex
        });
        position = null;
      }
    }

    // Check for new entry signals
    if (!position) {
      for (const signal of indData.signals) {
        if (signal.strength === 'weak') continue;

        if (signal.direction === 'bullish') {
          position = {
            side: 'long',
            entryPrice: candle.close,
            entryIndex: i,
            highestROI: 0,
            trailStopROI: null,
            signalType: signal.type
          };
          break;
        } else if (signal.direction === 'bearish') {
          position = {
            side: 'short',
            entryPrice: candle.close,
            entryIndex: i,
            highestROI: 0,
            trailStopROI: null,
            signalType: signal.type
          };
          break;
        }
      }
    }
  }

  // Close any open position at end
  if (position) {
    const lastCandle = candles[candles.length - 1];
    const currentROI = calculateROI(position, lastCandle.close, leverage);
    const pnl = (balance * 0.1) * (currentROI / 100);
    balance += pnl;
    trades.push({
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice: lastCandle.close,
      roi: currentROI,
      pnl,
      reason: 'end_of_data',
      signalType: position.signalType,
      duration: candles.length - position.entryIndex
    });
  }

  return calculateMetrics(trades, balance, 10000);
}

/**
 * Calculate ROI for position
 */
function calculateROI(position, currentPrice, leverage) {
  const priceChange = position.side === 'long'
    ? (currentPrice - position.entryPrice) / position.entryPrice
    : (position.entryPrice - currentPrice) / position.entryPrice;
  return priceChange * leverage * 100;
}

/**
 * Calculate performance metrics
 */
function calculateMetrics(trades, finalBalance, initialBalance) {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      profitFactor: 0,
      totalReturn: 0,
      avgWin: 0,
      avgLoss: 0,
      avgROI: 0,
      maxConsecutiveLosses: 0,
      signalBreakdown: {}
    };
  }

  const winners = trades.filter(t => t.pnl > 0);
  const losers = trades.filter(t => t.pnl < 0);

  const grossProfit = winners.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));

  // Calculate max consecutive losses
  let maxConsecLosses = 0;
  let currentConsecLosses = 0;
  for (const trade of trades) {
    if (trade.pnl < 0) {
      currentConsecLosses++;
      maxConsecLosses = Math.max(maxConsecLosses, currentConsecLosses);
    } else {
      currentConsecLosses = 0;
    }
  }

  // Signal type breakdown
  const signalBreakdown = {};
  for (const trade of trades) {
    const type = trade.signalType || 'unknown';
    if (!signalBreakdown[type]) {
      signalBreakdown[type] = { count: 0, wins: 0, totalPnL: 0 };
    }
    signalBreakdown[type].count++;
    if (trade.pnl > 0) signalBreakdown[type].wins++;
    signalBreakdown[type].totalPnL += trade.pnl;
  }

  // Calculate win rate per signal type
  for (const type in signalBreakdown) {
    signalBreakdown[type].winRate = ((signalBreakdown[type].wins / signalBreakdown[type].count) * 100).toFixed(1);
  }

  return {
    totalTrades: trades.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate: ((winners.length / trades.length) * 100).toFixed(1),
    profitFactor: grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? 'Inf' : '0.00'),
    totalReturn: (((finalBalance - initialBalance) / initialBalance) * 100).toFixed(2),
    avgWin: winners.length > 0 ? (grossProfit / winners.length).toFixed(2) : '0.00',
    avgLoss: losers.length > 0 ? (grossLoss / losers.length).toFixed(2) : '0.00',
    avgROI: (trades.reduce((s, t) => s + t.roi, 0) / trades.length).toFixed(2),
    maxConsecutiveLosses: maxConsecLosses,
    signalBreakdown,
    trades
  };
}

/**
 * Test single indicator across all timeframes and parameters
 */
async function testIndicator(indicatorName, symbols = DEFAULT_SYMBOLS) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TESTING: ${indicatorName.toUpperCase()}`);
  console.log('='.repeat(70));

  const results = [];
  const paramGrid = PARAMETER_GRIDS[indicatorName] || [{}];

  for (const symbol of symbols) {
    console.log(`\n  [${symbol}]`);

    for (const timeframe of TIMEFRAMES) {
      const candles = loadCandles(symbol, timeframe);
      if (!candles || candles.length < 200) {
        console.log(`    ${timeframe}: Insufficient data`);
        continue;
      }

      for (const params of paramGrid) {
        const metrics = runIndicatorBacktest(candles, indicatorName, params);
        if (!metrics || metrics.totalTrades < 5) continue;

        results.push({
          symbol,
          timeframe,
          indicator: indicatorName,
          params,
          ...metrics
        });
      }
    }
  }

  // Sort by profit factor
  results.sort((a, b) => parseFloat(b.profitFactor) - parseFloat(a.profitFactor));

  // Print top 10 results
  console.log(`\n  TOP CONFIGURATIONS:`);
  console.log('  ' + '-'.repeat(66));
  console.log('  Symbol    | TF     | Params                         | WR%   | PF    | Trades | ROI%');
  console.log('  ' + '-'.repeat(66));

  for (let i = 0; i < Math.min(10, results.length); i++) {
    const r = results[i];
    const paramStr = Object.entries(r.params).map(([k, v]) => `${k.substring(0, 3)}=${v}`).join(',').substring(0, 30).padEnd(30);
    console.log(`  ${r.symbol.padEnd(10)} | ${r.timeframe.padEnd(6)} | ${paramStr} | ${r.winRate.padStart(5)} | ${r.profitFactor.toString().padStart(5)} | ${r.totalTrades.toString().padStart(6)} | ${r.totalReturn.padStart(6)}`);
  }

  // Print signal type analysis for best config
  if (results.length > 0) {
    const best = results[0];
    console.log(`\n  SIGNAL TYPE BREAKDOWN (Best Config):`);
    console.log('  ' + '-'.repeat(50));
    for (const [type, data] of Object.entries(best.signalBreakdown)) {
      console.log(`    ${type.padEnd(25)} | WR: ${data.winRate}% | Trades: ${data.count} | PnL: $${data.totalPnL.toFixed(2)}`);
    }
  }

  return results;
}

/**
 * Test all indicators
 */
async function testAllIndicators(symbols = DEFAULT_SYMBOLS) {
  const allResults = {};
  const indicatorNames = Object.keys(PARAMETER_GRIDS);

  for (const name of indicatorNames) {
    allResults[name] = await testIndicator(name, symbols);
  }

  // Summary comparison
  console.log(`\n${'='.repeat(70)}`);
  console.log('INDICATOR COMPARISON SUMMARY');
  console.log('='.repeat(70));
  console.log('\nBest configuration per indicator:\n');
  console.log('Indicator    | Symbol    | TF     | WR%   | PF    | Trades | Total ROI%');
  console.log('-'.repeat(70));

  const summary = [];
  for (const [name, results] of Object.entries(allResults)) {
    if (results.length > 0) {
      const best = results[0];
      summary.push({
        name,
        symbol: best.symbol,
        timeframe: best.timeframe,
        winRate: best.winRate,
        profitFactor: best.profitFactor,
        trades: best.totalTrades,
        roi: best.totalReturn,
        params: best.params
      });
      console.log(`${name.padEnd(12)} | ${best.symbol.padEnd(9)} | ${best.timeframe.padEnd(6)} | ${best.winRate.padStart(5)} | ${best.profitFactor.toString().padStart(5)} | ${best.totalTrades.toString().padStart(6)} | ${best.totalReturn.padStart(10)}`);
    }
  }

  // Save results
  const outputFile = path.join(OUTPUT_DIR, `indicator_test_${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    symbols,
    summary,
    detailed: allResults
  }, null, 2));

  console.log(`\nResults saved to: ${outputFile}`);

  return { summary, detailed: allResults };
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    indicator: null,
    all: false,
    symbols: DEFAULT_SYMBOLS,
    timeframe: null
  };

  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];

    switch (key) {
      case 'indicator':
        config.indicator = value;
        i++;
        break;
      case 'all':
        config.all = true;
        break;
      case 'symbol':
        config.symbols = [value];
        i++;
        break;
      case 'timeframe':
        config.timeframe = value;
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
  console.log('\n' + '='.repeat(70));
  console.log('INDIVIDUAL INDICATOR TEST SUITE');
  console.log('='.repeat(70));

  const config = parseArgs();

  if (config.all || !config.indicator) {
    await testAllIndicators(config.symbols);
  } else {
    await testIndicator(config.indicator, config.symbols);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testIndicator, testAllIndicators, runIndicatorBacktest };
