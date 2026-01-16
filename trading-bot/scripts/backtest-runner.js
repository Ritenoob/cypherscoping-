#!/usr/bin/env node
/**
 * Backtest Runner Script
 * 
 * Runs backtests with configurable parameters and outputs results.
 * Usage: node scripts/backtest-runner.js --symbol BTCUSDTM --timeframe 15min --days 30
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BacktestEngine = require('../src/backtest/BacktestEngine');
const {
  RSIIndicator,
  MACDIndicator,
  BollingerBands,
  EMATrend,
  WilliamsRIndicator,
  AwesomeOscillator,
  StochasticIndicator,
  KDJIndicator,
  OBVIndicator
} = require('../src/indicators');

const KUCOIN_FUTURES_REST = 'https://api-futures.kucoin.com';

async function fetchHistoricalCandles(symbol, timeframe, startTime, endTime) {
  const granularity = timeframeToMinutes(timeframe);
  const candles = [];
  let currentStart = startTime;
  
  while (currentStart < endTime) {
    try {
      const response = await axios.get(`${KUCOIN_FUTURES_REST}/api/v1/kline/query`, {
        params: {
          symbol,
          granularity,
          from: currentStart,
          to: Math.min(currentStart + 200 * granularity * 60 * 1000, endTime)
        }
      });
      
      if (response.data.code === '200000' && response.data.data) {
        for (const candle of response.data.data) {
          candles.push({
            ts: candle[0],
            open: parseFloat(candle[1]),
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
            volume: parseFloat(candle[5])
          });
        }
        
        currentStart = candles[candles.length - 1].ts + granularity * 60 * 1000;
      } else {
        break;
      }
      
      await new Promise(r => setTimeout(r, 200));
    } catch (error) {
      console.error('Error fetching candles:', error.message);
      break;
    }
  }
  
  return candles.sort((a, b) => a.ts - b.ts);
}

function timeframeToMinutes(tf) {
  const map = {
    '1min': 1,
    '5min': 5,
    '15min': 15,
    '30min': 30,
    '1hour': 60,
    '4hour': 240,
    '1day': 1440
  };
  return map[tf] || 15;
}

function calculateIndicators(candles) {
  // Initialize all 9 historical indicators (DOM excluded - requires live data)
  // OPTIMIZED 2026-01-14: Tighter thresholds for higher conviction signals
  const rsi = new RSIIndicator({ period: 14, oversold: 35, overbought: 65 });  // Tighter
  const macd = new MACDIndicator({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
  const bb = new BollingerBands({ period: 20, stdDev: 2.5 });  // Wider bands
  const ema = new EMATrend({ shortPeriod: 9, mediumPeriod: 21, longPeriod: 50 });
  const williamsR = new WilliamsRIndicator({ period: 14, oversold: -85, overbought: -15 });  // Tighter
  const ao = new AwesomeOscillator({ fastPeriod: 5, slowPeriod: 34 });
  const stochastic = new StochasticIndicator({ kPeriod: 14, dPeriod: 3, smooth: 3 });
  const kdj = new KDJIndicator({ kPeriod: 21, dPeriod: 3, smooth: 3 });  // Longer K period
  const obv = new OBVIndicator({ slopeWindow: 14, smoothingEma: 5 });

  const indicators = {
    rsi: [],
    macd: [],
    bollinger: [],
    emaTrend: [],
    williamsR: [],
    ao: [],
    stochastic: [],
    kdj: [],
    obv: []
  };

  for (const candle of candles) {
    // All indicators need high/low/close/volume for proper calculation
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
    indicators.kdj.push(kdj.update(candleData));
    indicators.obv.push(obv.update(candleData));
  }

  return indicators;
}

async function runBacktest(config) {
  console.log('\n' + '='.repeat(60));
  console.log('BACKTEST RUNNER v5.0');
  console.log('='.repeat(60));
  console.log(`Symbol: ${config.symbol}`);
  console.log(`Timeframe: ${config.timeframe}`);
  console.log(`Period: ${config.days} days`);
  console.log(`Initial Balance: $${config.initialBalance}`);
  console.log(`Leverage: ${config.leverage}x`);
  console.log('='.repeat(60) + '\n');
  
  console.log('Fetching historical data...');
  const endTime = Date.now();
  const startTime = endTime - config.days * 24 * 60 * 60 * 1000;
  
  const candles = await fetchHistoricalCandles(config.symbol, config.timeframe, startTime, endTime);
  console.log(`Fetched ${candles.length} candles`);
  
  if (candles.length < 100) {
    console.error('Insufficient data for backtest');
    return;
  }
  
  console.log('Calculating indicators...');
  const indicators = calculateIndicators(candles);
  
  console.log('Running backtest...');
  const engine = new BacktestEngine({
    initialBalance: config.initialBalance,
    leverage: config.leverage,
    riskPerTrade: config.riskPerTrade,
    commission: config.commission,
    // Trailing Stop settings
    trailingStopEnabled: config.trailingStopEnabled,
    trailingStopActivation: config.trailingStopActivation,
    trailingStopTrail: config.trailingStopTrail,
    // Break-Even settings
    breakEvenEnabled: config.breakEvenEnabled,
    breakEvenActivation: config.breakEvenActivation,
    breakEvenBuffer: config.breakEvenBuffer
  });
  
  const results = await engine.runBacktest(candles, indicators, {
    warmupPeriod: 250,  // EMA200 needs 200+ candles to initialize
    stopLossROI: config.stopLossROI,
    takeProfitROI: config.takeProfitROI,
    minSignalScore: config.minScore || 50,  // Higher threshold for better signals
    invertSignals: config.invertSignals || false  // Invert buy/sell signals
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('BACKTEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Initial Balance:    $${results.initialBalance.toFixed(2)}`);
  console.log(`Final Balance:      $${results.finalBalance.toFixed(2)}`);
  console.log(`Total Return:       ${results.totalReturn}%`);
  console.log(`Total Trades:       ${results.totalTrades}`);
  console.log(`Winning Trades:     ${results.winningTrades}`);
  console.log(`Losing Trades:      ${results.losingTrades}`);
  console.log(`Win Rate:           ${results.winRate}%`);
  console.log(`Profit Factor:      ${results.profitFactor}`);
  console.log(`Sharpe Ratio:       ${results.sharpeRatio}`);
  console.log(`Max Drawdown:       ${results.maxDrawdown}%`);
  console.log(`Average Win:        $${results.avgWin}`);
  console.log(`Average Loss:       $${results.avgLoss}`);
  console.log('='.repeat(60) + '\n');
  
  const outputDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputFile = path.join(outputDir, `backtest_${config.symbol}_${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`Results saved to: ${outputFile}`);
  
  return results;
}

function parseArgs() {
  const args = process.argv.slice(2);
  // WINNING CONFIG 2026-01-15: 78% win rate, 28.83 profit factor
  const config = {
    symbol: 'XBTUSDTM',  // KuCoin uses XBTUSDTM for Bitcoin
    timeframe: '5min',   // Lower TF for precise entry (reversed MTF)
    days: 30,
    initialBalance: 10000,
    leverage: 15,        // 15x leverage
    riskPerTrade: 1,     // Conservative
    commission: 0.0006,
    // OPTIMIZED 2026-01-15: Let winners run, cut losers fast
    stopLossROI: 15,     // Tightened from 30 to 15% ROI (1% price at 15x) - cut losers faster
    takeProfitROI: 150,  // Higher TP to let winners run
    // Break-Even DISABLED - was cutting winners too early
    breakEvenEnabled: false,
    breakEvenActivation: 50,   // Raised to 50% ROI if re-enabled
    breakEvenBuffer: 5.0,      // 5% buffer
    // Trailing at 25% activation with 10% trail - let winners run longer
    trailingStopEnabled: true,
    trailingStopActivation: 25,  // Raised from 12% - don't trail until solid profit
    trailingStopTrail: 10,       // Widened from 4% - give room to breathe
    // Signal quality - 85+ for higher conviction entries (optimized 2026-01-15)
    minScore: 85,
    // Signal inversion - if strategy loses with normal signals, invert them
    invertSignals: false
  };
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    
    switch (key) {
      case 'symbol':
        config.symbol = value;
        break;
      case 'timeframe':
        config.timeframe = value;
        break;
      case 'days':
        config.days = parseInt(value);
        break;
      case 'balance':
        config.initialBalance = parseFloat(value);
        break;
      case 'leverage':
        config.leverage = parseInt(value);
        break;
      case 'risk':
        config.riskPerTrade = parseFloat(value);
        break;
      case 'sl':
        config.stopLossROI = parseFloat(value);
        break;
      case 'tp':
        config.takeProfitROI = parseFloat(value);
        break;
      case 'score':
        config.minScore = parseInt(value);
        break;
      case 'invert':
        config.invertSignals = value === 'true';
        break;
    }
  }
  
  return config;
}

if (require.main === module) {
  const config = parseArgs();
  runBacktest(config).catch(console.error);
}

module.exports = { runBacktest, fetchHistoricalCandles };
