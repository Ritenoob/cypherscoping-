#!/usr/bin/env node
/**
 * Walk-Forward Optimization System
 * 
 * Implements walk-forward analysis to prevent overfitting and ensure
 * parameters work on out-of-sample data. This is the gold standard
 * for validating trading strategies.
 * 
 * Usage: node scripts/walk-forward.js --symbol BTCUSDTM --windows 5
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Walk-forward configuration
const WF_CONFIG = {
  // Window settings
  trainingDays: 60,      // Days to train on
  testingDays: 15,       // Days to test (out-of-sample)
  windows: 5,            // Number of walk-forward windows
  
  // Parameter ranges to optimize
  params: {
    SIGNAL_MIN_SCORE: [40, 50, 60, 70],
    STOP_LOSS_ROI: [0.3, 0.5, 0.75],
    TAKE_PROFIT_ROI: [1.5, 2.0, 2.5, 3.0],
    RSI_PERIOD: [10, 14, 21],
    RSI_OVERSOLD: [25, 30, 35],
    RSI_OVERBOUGHT: [65, 70, 75]
  },
  
  // Minimum requirements
  minTrades: 15,
  minWinRate: 0.50,
  minProfitFactor: 1.2
};

// KuCoin API base
const API_BASE = 'https://api-futures.kucoin.com';

// Utility functions
function log(msg, level = 'INFO') {
  console.log(`[${new Date().toISOString()}] [${level}] ${msg}`);
}

function saveResults(filepath, data) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// Fetch historical candles
async function fetchCandles(symbol, timeframe, startTime, endTime) {
  const granularity = {
    '1min': 1, '5min': 5, '15min': 15, '30min': 30,
    '1hour': 60, '4hour': 240, '1day': 1440
  }[timeframe] || 15;
  
  const candles = [];
  let currentStart = startTime;
  
  while (currentStart < endTime) {
    try {
      const response = await axios.get(`${API_BASE}/api/v1/kline/query`, {
        params: {
          symbol,
          granularity,
          from: currentStart,
          to: Math.min(currentStart + 200 * granularity * 60 * 1000, endTime)
        }
      });
      
      if (response.data.code === '200000' && response.data.data) {
        for (const c of response.data.data) {
          candles.push({
            timestamp: c[0],
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5])
          });
        }
        currentStart = candles.length > 0 ? 
          candles[candles.length - 1].timestamp + granularity * 60 * 1000 :
          currentStart + 200 * granularity * 60 * 1000;
      } else {
        break;
      }
      
      await new Promise(r => setTimeout(r, 100)); // Rate limit
    } catch (e) {
      log(`Error fetching candles: ${e.message}`, 'ERROR');
      break;
    }
  }
  
  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

// Calculate indicators for candles
function calculateIndicators(candles, params) {
  const results = [];
  
  for (let i = params.RSI_PERIOD; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    
    // RSI calculation
    let gains = 0, losses = 0;
    for (let j = slice.length - params.RSI_PERIOD; j < slice.length; j++) {
      const change = slice[j].close - slice[j - 1].close;
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / params.RSI_PERIOD;
    const avgLoss = losses / params.RSI_PERIOD;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    // Simple signal generation
    let signal = 0;
    if (rsi < params.RSI_OVERSOLD) signal = 1;
    else if (rsi > params.RSI_OVERBOUGHT) signal = -1;
    
    results.push({
      timestamp: candles[i].timestamp,
      close: candles[i].close,
      rsi,
      signal,
      candle: candles[i]
    });
  }
  
  return results;
}

// Simulate trades on data
function simulateTrades(data, params) {
  const trades = [];
  let position = null;
  const balance = 10000;
  let equity = balance;
  
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    
    // Check for exit if in position
    if (position) {
      const pnlPercent = position.direction === 'long' ?
        (curr.close - position.entry) / position.entry * 100 * 50 : // 50x leverage
        (position.entry - curr.close) / position.entry * 100 * 50;
      
      // Check stop loss or take profit
      if (pnlPercent <= -params.STOP_LOSS_ROI || pnlPercent >= params.TAKE_PROFIT_ROI) {
        const exitPrice = curr.close;
        const pnl = position.size * pnlPercent / 100;
        
        trades.push({
          entry: position.entry,
          exit: exitPrice,
          direction: position.direction,
          pnl,
          pnlPercent,
          duration: curr.timestamp - position.timestamp
        });
        
        equity += pnl;
        position = null;
      }
    }
    
    // Check for entry if no position
    if (!position && Math.abs(curr.signal) >= params.SIGNAL_MIN_SCORE / 100) {
      const direction = curr.signal > 0 ? 'long' : 'short';
      position = {
        entry: curr.close,
        direction,
        size: equity * 0.02, // 2% risk
        timestamp: curr.timestamp
      };
    }
  }
  
  // Close any open position
  if (position && data.length > 0) {
    const lastPrice = data[data.length - 1].close;
    const pnlPercent = position.direction === 'long' ?
      (lastPrice - position.entry) / position.entry * 100 * 50 :
      (position.entry - lastPrice) / position.entry * 100 * 50;
    const pnl = position.size * pnlPercent / 100;
    
    trades.push({
      entry: position.entry,
      exit: lastPrice,
      direction: position.direction,
      pnl,
      pnlPercent,
      duration: data[data.length - 1].timestamp - position.timestamp
    });
    
    equity += pnl;
  }
  
  return { trades, finalEquity: equity, initialEquity: balance };
}

// Calculate metrics from trades
function calculateMetrics(result) {
  const { trades, finalEquity, initialEquity } = result;
  
  if (trades.length === 0) {
    return { winRate: 0, profitFactor: 0, totalReturn: 0, trades: 0 };
  }
  
  const winners = trades.filter(t => t.pnl > 0);
  const losers = trades.filter(t => t.pnl <= 0);
  
  const grossProfit = winners.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0));
  
  return {
    trades: trades.length,
    winners: winners.length,
    losers: losers.length,
    winRate: trades.length > 0 ? winners.length / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    totalReturn: (finalEquity - initialEquity) / initialEquity,
    grossProfit,
    grossLoss,
    avgWin: winners.length > 0 ? grossProfit / winners.length : 0,
    avgLoss: losers.length > 0 ? grossLoss / losers.length : 0
  };
}

// Run single backtest
function runBacktest(candles, params) {
  const data = calculateIndicators(candles, params);
  const result = simulateTrades(data, params);
  return calculateMetrics(result);
}

// Grid search for best parameters
function optimizeParams(candles, paramRanges) {
  let bestParams = null;
  let bestScore = -Infinity;
  let bestMetrics = null;
  
  // Generate all combinations
  const keys = Object.keys(paramRanges);
  const combinations = [];
  
  function generate(index, current) {
    if (index === keys.length) {
      combinations.push({ ...current });
      return;
    }
    for (const value of paramRanges[keys[index]]) {
      current[keys[index]] = value;
      generate(index + 1, current);
    }
  }
  generate(0, {});
  
  for (const params of combinations) {
    const metrics = runBacktest(candles, params);
    
    if (metrics.trades < WF_CONFIG.minTrades) continue;
    if (metrics.winRate < WF_CONFIG.minWinRate) continue;
    if (metrics.profitFactor < WF_CONFIG.minProfitFactor) continue;
    
    // Score: weighted combination
    const score = metrics.winRate * 30 + 
                  Math.min(metrics.profitFactor, 5) * 15 + 
                  metrics.totalReturn * 50;
    
    if (score > bestScore) {
      bestScore = score;
      bestParams = params;
      bestMetrics = metrics;
    }
  }
  
  return { params: bestParams, metrics: bestMetrics, score: bestScore };
}

// Main walk-forward analysis
async function walkForwardAnalysis(symbol, timeframe = '15min', numWindows = 5) {
  log(`Starting walk-forward analysis for ${symbol}`);
  log(`Training: ${WF_CONFIG.trainingDays} days, Testing: ${WF_CONFIG.testingDays} days, Windows: ${numWindows}`);
  
  const totalDays = WF_CONFIG.trainingDays + WF_CONFIG.testingDays;
  const windowResults = [];
  
  // Calculate time range
  const endTime = Date.now();
  const startTime = endTime - (totalDays * numWindows * 24 * 60 * 60 * 1000);
  
  log(`Fetching historical data from ${new Date(startTime).toISOString()}`);
  const allCandles = await fetchCandles(symbol, timeframe, startTime, endTime);
  log(`Fetched ${allCandles.length} candles`);
  
  if (allCandles.length < 1000) {
    log('Insufficient data for walk-forward analysis', 'ERROR');
    return null;
  }
  
  // Process each window
  const candlesPerDay = timeframe === '15min' ? 96 : timeframe === '1hour' ? 24 : 288;
  
  for (let w = 0; w < numWindows; w++) {
    log(`\nWindow ${w + 1}/${numWindows}`);
    
    const windowStart = w * WF_CONFIG.testingDays * candlesPerDay;
    const trainEnd = windowStart + WF_CONFIG.trainingDays * candlesPerDay;
    const testEnd = trainEnd + WF_CONFIG.testingDays * candlesPerDay;
    
    if (testEnd > allCandles.length) {
      log('Not enough data for this window', 'WARN');
      break;
    }
    
    const trainCandles = allCandles.slice(windowStart, trainEnd);
    const testCandles = allCandles.slice(trainEnd, testEnd);
    
    log(`Training on ${trainCandles.length} candles, testing on ${testCandles.length} candles`);
    
    // Optimize on training data
    const optimized = optimizeParams(trainCandles, WF_CONFIG.params);
    
    if (!optimized.params) {
      log('No valid parameters found in training', 'WARN');
      continue;
    }
    
    log(`Best training params: Score=${optimized.score.toFixed(2)}, WR=${(optimized.metrics.winRate*100).toFixed(1)}%`);
    
    // Test on out-of-sample data
    const oosMetrics = runBacktest(testCandles, optimized.params);
    
    log(`Out-of-sample: WR=${(oosMetrics.winRate*100).toFixed(1)}%, PF=${oosMetrics.profitFactor.toFixed(2)}, Return=${(oosMetrics.totalReturn*100).toFixed(1)}%`);
    
    windowResults.push({
      window: w + 1,
      trainPeriod: {
        start: new Date(trainCandles[0].timestamp).toISOString(),
        end: new Date(trainCandles[trainCandles.length - 1].timestamp).toISOString()
      },
      testPeriod: {
        start: new Date(testCandles[0].timestamp).toISOString(),
        end: new Date(testCandles[testCandles.length - 1].timestamp).toISOString()
      },
      optimizedParams: optimized.params,
      trainingMetrics: optimized.metrics,
      oosMetrics
    });
  }
  
  // Aggregate results
  if (windowResults.length === 0) {
    log('No valid windows completed', 'ERROR');
    return null;
  }
  
  const avgOOSWinRate = windowResults.reduce((s, w) => s + w.oosMetrics.winRate, 0) / windowResults.length;
  const avgOOSProfitFactor = windowResults.reduce((s, w) => s + (w.oosMetrics.profitFactor || 0), 0) / windowResults.length;
  const avgOOSReturn = windowResults.reduce((s, w) => s + w.oosMetrics.totalReturn, 0) / windowResults.length;
  
  // Find most common optimal parameters
  const paramCounts = {};
  for (const result of windowResults) {
    const key = JSON.stringify(result.optimizedParams);
    paramCounts[key] = (paramCounts[key] || 0) + 1;
  }
  const mostCommonParams = JSON.parse(
    Object.entries(paramCounts).sort((a, b) => b[1] - a[1])[0][0]
  );
  
  const summary = {
    symbol,
    timeframe,
    windows: windowResults.length,
    aggregateOOS: {
      avgWinRate: avgOOSWinRate,
      avgProfitFactor: avgOOSProfitFactor,
      avgReturn: avgOOSReturn
    },
    mostRobustParams: mostCommonParams,
    windowDetails: windowResults,
    timestamp: new Date().toISOString()
  };
  
  log('\n' + '='.repeat(60));
  log('WALK-FORWARD ANALYSIS COMPLETE');
  log('='.repeat(60));
  log(`Average OOS Win Rate: ${(avgOOSWinRate * 100).toFixed(1)}%`);
  log(`Average OOS Profit Factor: ${avgOOSProfitFactor.toFixed(2)}`);
  log(`Average OOS Return: ${(avgOOSReturn * 100).toFixed(1)}%`);
  log(`Most Robust Parameters: ${JSON.stringify(mostRobustParams)}`);
  
  // Save results
  saveResults(`./logs/walk_forward_${symbol}_${Date.now()}.json`, summary);
  
  // Determine if strategy is robust
  const isRobust = avgOOSWinRate >= 0.55 && avgOOSProfitFactor >= 1.3;
  log(`\nStrategy Robustness: ${isRobust ? '✓ ROBUST' : '✗ NOT ROBUST'}`);
  
  return summary;
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  let symbol = 'BTCUSDTM';
  let timeframe = '15min';
  let windows = 5;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--symbol' && args[i + 1]) symbol = args[i + 1];
    if (args[i] === '--timeframe' && args[i + 1]) timeframe = args[i + 1];
    if (args[i] === '--windows' && args[i + 1]) windows = parseInt(args[i + 1]);
    if (args[i] === '--help') {
      console.log(`
Walk-Forward Optimization System

Usage: node scripts/walk-forward.js [options]

Options:
  --symbol SYM      Symbol to analyze (default: BTCUSDTM)
  --timeframe TF    Timeframe (default: 15min)
  --windows N       Number of windows (default: 5)
  --help            Show this help

Example:
  node scripts/walk-forward.js --symbol ETHUSDTM --windows 8
      `);
      process.exit(0);
    }
  }
  
  await walkForwardAnalysis(symbol, timeframe, windows);
}

module.exports = { walkForwardAnalysis, WF_CONFIG };

if (require.main === module) {
  main().catch(e => {
    log(`Fatal error: ${e.message}`, 'ERROR');
    process.exit(1);
  });
}
