#!/usr/bin/env node
/**
 * Indicator Optimizer - Tests individual indicators on 5min and 30min charts
 * Optimizes parameters for each indicator one at a time
 */

const axios = require('axios');
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
  VolumeRatioIndicator,
  PumpAlertIndicator
} = require('../src/indicators');

const KUCOIN_FUTURES_REST = 'https://api-futures.kucoin.com';

// Test symbols
const TEST_SYMBOLS = ['XBTUSDTM', 'ETHUSDTM', 'SOLUSDTM'];

// Timeframes to test
const TIMEFRAMES = [5, 15, 30, 60]; // 5min, 15min, 30min, and 1hour

// Parse command line args
const args = process.argv.slice(2);
let indicatorName = args[0] || 'rsi';

async function fetchCandles(symbol, granularity, count = 500) {
  try {
    const now = Date.now();
    const start = now - count * granularity * 60 * 1000;

    const response = await axios.get(`${KUCOIN_FUTURES_REST}/api/v1/kline/query`, {
      params: { symbol, granularity, from: start, to: now }
    });

    if (response.data.code !== '200000' || !response.data.data) {
      return [];
    }

    return response.data.data.map(c => ({
      ts: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5])
    }));
  } catch (error) {
    console.error('Error fetching candles:', error.message);
    return [];
  }
}

// Simple backtest: trade on signals, measure results
function backtestIndicator(candles, indicator, getSignalDirection) {
  if (candles.length < 100) return null;

  const trades = [];
  let position = null;
  const entryFee = 0.0006;
  const exitFee = 0.0006;

  // Skip first 50 candles for warmup
  for (let i = 50; i < candles.length; i++) {
    const candle = candles[i];
    const result = indicator.update({
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    });

    const direction = getSignalDirection(result);

    // Check exit first
    if (position) {
      const holdingBars = i - position.entryIndex;
      const roi = position.side === 'long'
        ? ((candle.close - position.entryPrice) / position.entryPrice) * 100
        : ((position.entryPrice - candle.close) / position.entryPrice) * 100;

      // Exit conditions: TP at 2%, SL at -1%, max hold 20 bars, or opposite signal
      const oppositeSignal = (position.side === 'long' && direction === 'short') ||
                            (position.side === 'short' && direction === 'long');

      if (roi >= 2 || roi <= -1 || holdingBars >= 20 || oppositeSignal) {
        const netRoi = roi - (entryFee + exitFee) * 100;
        trades.push({
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice: candle.close,
          roi: netRoi,
          holdingBars,
          exitReason: roi >= 2 ? 'TP' : roi <= -1 ? 'SL' : holdingBars >= 20 ? 'TIME' : 'SIGNAL'
        });
        position = null;
      }
    }

    // Check entry
    if (!position && direction) {
      position = {
        side: direction,
        entryPrice: candle.close,
        entryIndex: i
      };
    }
  }

  // Close any open position
  if (position) {
    const lastCandle = candles[candles.length - 1];
    const roi = position.side === 'long'
      ? ((lastCandle.close - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - lastCandle.close) / position.entryPrice) * 100;
    trades.push({
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice: lastCandle.close,
      roi: roi - (entryFee + exitFee) * 100,
      holdingBars: candles.length - position.entryIndex,
      exitReason: 'EOD'
    });
  }

  if (trades.length === 0) return null;

  const wins = trades.filter(t => t.roi > 0);
  const losses = trades.filter(t => t.roi <= 0);
  const totalRoi = trades.reduce((sum, t) => sum + t.roi, 0);
  const grossProfit = wins.reduce((sum, t) => sum + t.roi, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.roi, 0));

  return {
    totalTrades: trades.length,
    winRate: (wins.length / trades.length * 100).toFixed(1),
    totalRoi: totalRoi.toFixed(2),
    avgRoi: (totalRoi / trades.length).toFixed(2),
    profitFactor: grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 'INF' : '0.00',
    avgWin: wins.length > 0 ? (grossProfit / wins.length).toFixed(2) : '0.00',
    avgLoss: losses.length > 0 ? (grossLoss / losses.length).toFixed(2) : '0.00',
    trades
  };
}

// RSI optimization
async function optimizeRSI() {
  console.log('\n' + '='.repeat(70));
  console.log('OPTIMIZING RSI INDICATOR');
  console.log('='.repeat(70));

  const paramSets = [
    // Period 7 (fast)
    { period: 7, oversold: 20, overbought: 80 },
    { period: 7, oversold: 25, overbought: 75 },
    { period: 7, oversold: 30, overbought: 70 },
    // Period 10
    { period: 10, oversold: 25, overbought: 75 },
    { period: 10, oversold: 30, overbought: 70 },
    { period: 10, oversold: 35, overbought: 65 },
    // Period 14 (standard)
    { period: 14, oversold: 20, overbought: 80 },
    { period: 14, oversold: 25, overbought: 75 },
    { period: 14, oversold: 30, overbought: 70 },
    { period: 14, oversold: 35, overbought: 65 },
    // Period 21 (slower)
    { period: 21, oversold: 25, overbought: 75 },
    { period: 21, oversold: 30, overbought: 70 },
    { period: 21, oversold: 35, overbought: 65 },
    // Period 28 (slowest)
    { period: 28, oversold: 30, overbought: 70 },
    { period: 28, oversold: 35, overbought: 65 }
  ];

  const results = [];

  for (const tf of TIMEFRAMES) {
    console.log(`\n--- Testing ${tf}min Timeframe ---\n`);

    for (const params of paramSets) {
      let totalWinRate = 0;
      let totalRoi = 0;
      let totalTrades = 0;
      let symbolCount = 0;

      for (const symbol of TEST_SYMBOLS) {
        const candles = await fetchCandles(symbol, tf, 500);
        if (candles.length < 100) continue;

        const indicator = new RSIIndicator(params);

        const getDirection = (result) => {
          if (!result.signals || result.signals.length === 0) return null;

          // Prioritize divergence and crossover signals
          const divSignal = result.signals.find(s => s.type.includes('divergence'));
          const crossSignal = result.signals.find(s => s.type.includes('crossover'));

          const signal = divSignal || crossSignal;
          if (!signal) return null;

          return signal.direction === 'bullish' ? 'long' : 'short';
        };

        const backtest = backtestIndicator(candles, indicator, getDirection);
        if (backtest) {
          totalWinRate += parseFloat(backtest.winRate);
          totalRoi += parseFloat(backtest.totalRoi);
          totalTrades += backtest.totalTrades;
          symbolCount++;
        }

        await new Promise(r => setTimeout(r, 100));
      }

      if (symbolCount > 0) {
        const avgWinRate = (totalWinRate / symbolCount).toFixed(1);
        const avgRoi = (totalRoi / symbolCount).toFixed(2);

        results.push({
          timeframe: tf,
          params,
          avgWinRate,
          avgRoi,
          totalTrades
        });

        console.log(`RSI(${params.period}, ${params.oversold}/${params.overbought}): ` +
                   `WinRate=${avgWinRate}%, ROI=${avgRoi}%, Trades=${totalTrades}`);
      }
    }
  }

  // Find best params for all timeframes
  const best5min = results.filter(r => r.timeframe === 5).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best15min = results.filter(r => r.timeframe === 15).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best30min = results.filter(r => r.timeframe === 30).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best1hour = results.filter(r => r.timeframe === 60).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];

  console.log('\n--- OPTIMAL RSI SETTINGS ---');
  if (best5min) {
    console.log(`5min:  Period=${best5min.params.period}, OS=${best5min.params.oversold}, OB=${best5min.params.overbought}`);
    console.log(`       WinRate=${best5min.avgWinRate}%, ROI=${best5min.avgRoi}%`);
  }
  if (best15min) {
    console.log(`15min: Period=${best15min.params.period}, OS=${best15min.params.oversold}, OB=${best15min.params.overbought}`);
    console.log(`       WinRate=${best15min.avgWinRate}%, ROI=${best15min.avgRoi}%`);
  }
  if (best30min) {
    console.log(`30min: Period=${best30min.params.period}, OS=${best30min.params.oversold}, OB=${best30min.params.overbought}`);
    console.log(`       WinRate=${best30min.avgWinRate}%, ROI=${best30min.avgRoi}%`);
  }
  if (best1hour) {
    console.log(`1hour: Period=${best1hour.params.period}, OS=${best1hour.params.oversold}, OB=${best1hour.params.overbought}`);
    console.log(`       WinRate=${best1hour.avgWinRate}%, ROI=${best1hour.avgRoi}%`);
  }

  return { best5min, best15min, best30min, best1hour };
}

// MACD optimization
async function optimizeMACD() {
  console.log('\n' + '='.repeat(70));
  console.log('OPTIMIZING MACD INDICATOR');
  console.log('='.repeat(70));

  const paramSets = [
    // Fast period 5
    { fastPeriod: 5, slowPeriod: 17, signalPeriod: 5 },
    { fastPeriod: 5, slowPeriod: 21, signalPeriod: 7 },
    { fastPeriod: 5, slowPeriod: 34, signalPeriod: 5 },
    // Fast period 8
    { fastPeriod: 8, slowPeriod: 17, signalPeriod: 9 },
    { fastPeriod: 8, slowPeriod: 21, signalPeriod: 5 },
    { fastPeriod: 8, slowPeriod: 21, signalPeriod: 9 },
    { fastPeriod: 8, slowPeriod: 26, signalPeriod: 9 },
    // Fast period 12 (standard)
    { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    { fastPeriod: 12, slowPeriod: 26, signalPeriod: 7 },
    { fastPeriod: 12, slowPeriod: 26, signalPeriod: 12 },
    { fastPeriod: 12, slowPeriod: 34, signalPeriod: 9 },
    // Fast period 16
    { fastPeriod: 16, slowPeriod: 26, signalPeriod: 9 },
    { fastPeriod: 16, slowPeriod: 34, signalPeriod: 12 }
  ];

  const results = [];

  for (const tf of TIMEFRAMES) {
    console.log(`\n--- Testing ${tf}min Timeframe ---\n`);

    for (const params of paramSets) {
      let totalWinRate = 0;
      let totalRoi = 0;
      let totalTrades = 0;
      let symbolCount = 0;

      for (const symbol of TEST_SYMBOLS) {
        const candles = await fetchCandles(symbol, tf, 500);
        if (candles.length < 100) continue;

        const indicator = new MACDIndicator(params);

        const getDirection = (result) => {
          if (!result.signals || result.signals.length === 0) return null;

          const divSignal = result.signals.find(s => s.type.includes('divergence'));
          const crossSignal = result.signals.find(s => s.type.includes('signal_cross'));

          const signal = divSignal || crossSignal;
          if (!signal) return null;

          return signal.direction === 'bullish' ? 'long' : 'short';
        };

        const backtest = backtestIndicator(candles, indicator, getDirection);
        if (backtest) {
          totalWinRate += parseFloat(backtest.winRate);
          totalRoi += parseFloat(backtest.totalRoi);
          totalTrades += backtest.totalTrades;
          symbolCount++;
        }

        await new Promise(r => setTimeout(r, 100));
      }

      if (symbolCount > 0) {
        const avgWinRate = (totalWinRate / symbolCount).toFixed(1);
        const avgRoi = (totalRoi / symbolCount).toFixed(2);

        results.push({
          timeframe: tf,
          params,
          avgWinRate,
          avgRoi,
          totalTrades
        });

        console.log(`MACD(${params.fastPeriod}/${params.slowPeriod}/${params.signalPeriod}): ` +
                   `WinRate=${avgWinRate}%, ROI=${avgRoi}%, Trades=${totalTrades}`);
      }
    }
  }

  const best5min = results.filter(r => r.timeframe === 5).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best15min = results.filter(r => r.timeframe === 15).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best30min = results.filter(r => r.timeframe === 30).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best1hour = results.filter(r => r.timeframe === 60).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];

  console.log('\n--- OPTIMAL MACD SETTINGS ---');
  if (best5min) {
    console.log(`5min:  Fast=${best5min.params.fastPeriod}, Slow=${best5min.params.slowPeriod}, Signal=${best5min.params.signalPeriod}`);
    console.log(`       WinRate=${best5min.avgWinRate}%, ROI=${best5min.avgRoi}%`);
  }
  if (best15min) {
    console.log(`15min: Fast=${best15min.params.fastPeriod}, Slow=${best15min.params.slowPeriod}, Signal=${best15min.params.signalPeriod}`);
    console.log(`       WinRate=${best15min.avgWinRate}%, ROI=${best15min.avgRoi}%`);
  }
  if (best30min) {
    console.log(`30min: Fast=${best30min.params.fastPeriod}, Slow=${best30min.params.slowPeriod}, Signal=${best30min.params.signalPeriod}`);
    console.log(`       WinRate=${best30min.avgWinRate}%, ROI=${best30min.avgRoi}%`);
  }
  if (best1hour) {
    console.log(`1hour: Fast=${best1hour.params.fastPeriod}, Slow=${best1hour.params.slowPeriod}, Signal=${best1hour.params.signalPeriod}`);
    console.log(`       WinRate=${best1hour.avgWinRate}%, ROI=${best1hour.avgRoi}%`);
  }

  return { best5min, best15min, best30min, best1hour };
}

// Williams %R optimization
async function optimizeWilliamsR() {
  console.log('\n' + '='.repeat(70));
  console.log('OPTIMIZING WILLIAMS %R INDICATOR');
  console.log('='.repeat(70));

  const paramSets = [
    // Period 10
    { period: 10, oversold: -90, overbought: -10 },
    { period: 10, oversold: -85, overbought: -15 },
    { period: 10, oversold: -80, overbought: -20 },
    // Period 14 (standard)
    { period: 14, oversold: -90, overbought: -10 },
    { period: 14, oversold: -85, overbought: -15 },
    { period: 14, oversold: -80, overbought: -20 },
    { period: 14, oversold: -75, overbought: -25 },
    // Period 21
    { period: 21, oversold: -85, overbought: -15 },
    { period: 21, oversold: -80, overbought: -20 },
    { period: 21, oversold: -75, overbought: -25 },
    // Period 28
    { period: 28, oversold: -80, overbought: -20 },
    { period: 28, oversold: -75, overbought: -25 }
  ];

  const results = [];

  for (const tf of TIMEFRAMES) {
    console.log(`\n--- Testing ${tf}min Timeframe ---\n`);

    for (const params of paramSets) {
      let totalWinRate = 0;
      let totalRoi = 0;
      let totalTrades = 0;
      let symbolCount = 0;

      for (const symbol of TEST_SYMBOLS) {
        const candles = await fetchCandles(symbol, tf, 500);
        if (candles.length < 100) continue;

        const indicator = new WilliamsRIndicator(params);

        const getDirection = (result) => {
          if (!result.signals || result.signals.length === 0) return null;

          const divSignal = result.signals.find(s => s.type.includes('divergence'));
          const crossSignal = result.signals.find(s => s.type.includes('crossover'));

          const signal = divSignal || crossSignal;
          if (!signal) return null;

          return signal.direction === 'bullish' ? 'long' : 'short';
        };

        const backtest = backtestIndicator(candles, indicator, getDirection);
        if (backtest) {
          totalWinRate += parseFloat(backtest.winRate);
          totalRoi += parseFloat(backtest.totalRoi);
          totalTrades += backtest.totalTrades;
          symbolCount++;
        }

        await new Promise(r => setTimeout(r, 100));
      }

      if (symbolCount > 0) {
        const avgWinRate = (totalWinRate / symbolCount).toFixed(1);
        const avgRoi = (totalRoi / symbolCount).toFixed(2);

        results.push({
          timeframe: tf,
          params,
          avgWinRate,
          avgRoi,
          totalTrades
        });

        console.log(`Williams(${params.period}, ${params.oversold}/${params.overbought}): ` +
                   `WinRate=${avgWinRate}%, ROI=${avgRoi}%, Trades=${totalTrades}`);
      }
    }
  }

  const best5min = results.filter(r => r.timeframe === 5).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best15min = results.filter(r => r.timeframe === 15).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best30min = results.filter(r => r.timeframe === 30).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best1hour = results.filter(r => r.timeframe === 60).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];

  console.log('\n--- OPTIMAL WILLIAMS %R SETTINGS ---');
  if (best5min) {
    console.log(`5min:  Period=${best5min.params.period}, OS=${best5min.params.oversold}, OB=${best5min.params.overbought}`);
    console.log(`       WinRate=${best5min.avgWinRate}%, ROI=${best5min.avgRoi}%`);
  }
  if (best15min) {
    console.log(`15min: Period=${best15min.params.period}, OS=${best15min.params.oversold}, OB=${best15min.params.overbought}`);
    console.log(`       WinRate=${best15min.avgWinRate}%, ROI=${best15min.avgRoi}%`);
  }
  if (best30min) {
    console.log(`30min: Period=${best30min.params.period}, OS=${best30min.params.oversold}, OB=${best30min.params.overbought}`);
    console.log(`       WinRate=${best30min.avgWinRate}%, ROI=${best30min.avgRoi}%`);
  }
  if (best1hour) {
    console.log(`1hour: Period=${best1hour.params.period}, OS=${best1hour.params.oversold}, OB=${best1hour.params.overbought}`);
    console.log(`       WinRate=${best1hour.avgWinRate}%, ROI=${best1hour.avgRoi}%`);
  }

  return { best5min, best15min, best30min, best1hour };
}

// Stochastic optimization
async function optimizeStochastic() {
  console.log('\n' + '='.repeat(70));
  console.log('OPTIMIZING STOCHASTIC INDICATOR');
  console.log('='.repeat(70));

  const paramSets = [
    // K Period 5 (fast)
    { kPeriod: 5, dPeriod: 3, smooth: 2 },
    { kPeriod: 5, dPeriod: 3, smooth: 3 },
    // K Period 9
    { kPeriod: 9, dPeriod: 3, smooth: 3 },
    { kPeriod: 9, dPeriod: 5, smooth: 3 },
    // K Period 14 (standard)
    { kPeriod: 14, dPeriod: 3, smooth: 3 },
    { kPeriod: 14, dPeriod: 5, smooth: 3 },
    { kPeriod: 14, dPeriod: 5, smooth: 5 },
    { kPeriod: 14, dPeriod: 7, smooth: 5 },
    // K Period 21
    { kPeriod: 21, dPeriod: 3, smooth: 3 },
    { kPeriod: 21, dPeriod: 5, smooth: 5 },
    { kPeriod: 21, dPeriod: 7, smooth: 5 }
  ];

  const results = [];

  for (const tf of TIMEFRAMES) {
    console.log(`\n--- Testing ${tf}min Timeframe ---\n`);

    for (const params of paramSets) {
      let totalWinRate = 0;
      let totalRoi = 0;
      let totalTrades = 0;
      let symbolCount = 0;

      for (const symbol of TEST_SYMBOLS) {
        const candles = await fetchCandles(symbol, tf, 500);
        if (candles.length < 100) continue;

        const indicator = new StochasticIndicator(params);

        const getDirection = (result) => {
          if (!result.signals || result.signals.length === 0) return null;

          const divSignal = result.signals.find(s => s.type.includes('divergence'));
          const crossSignal = result.signals.find(s => s.type.includes('crossover'));

          const signal = divSignal || crossSignal;
          if (!signal) return null;

          return signal.direction === 'bullish' ? 'long' : 'short';
        };

        const backtest = backtestIndicator(candles, indicator, getDirection);
        if (backtest) {
          totalWinRate += parseFloat(backtest.winRate);
          totalRoi += parseFloat(backtest.totalRoi);
          totalTrades += backtest.totalTrades;
          symbolCount++;
        }

        await new Promise(r => setTimeout(r, 100));
      }

      if (symbolCount > 0) {
        const avgWinRate = (totalWinRate / symbolCount).toFixed(1);
        const avgRoi = (totalRoi / symbolCount).toFixed(2);

        results.push({
          timeframe: tf,
          params,
          avgWinRate,
          avgRoi,
          totalTrades
        });

        console.log(`Stoch(${params.kPeriod}/${params.dPeriod}/${params.smooth}): ` +
                   `WinRate=${avgWinRate}%, ROI=${avgRoi}%, Trades=${totalTrades}`);
      }
    }
  }

  const best5min = results.filter(r => r.timeframe === 5).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best15min = results.filter(r => r.timeframe === 15).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best30min = results.filter(r => r.timeframe === 30).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best1hour = results.filter(r => r.timeframe === 60).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];

  console.log('\n--- OPTIMAL STOCHASTIC SETTINGS ---');
  if (best5min) {
    console.log(`5min:  K=${best5min.params.kPeriod}, D=${best5min.params.dPeriod}, Smooth=${best5min.params.smooth}`);
    console.log(`       WinRate=${best5min.avgWinRate}%, ROI=${best5min.avgRoi}%`);
  }
  if (best15min) {
    console.log(`15min: K=${best15min.params.kPeriod}, D=${best15min.params.dPeriod}, Smooth=${best15min.params.smooth}`);
    console.log(`       WinRate=${best15min.avgWinRate}%, ROI=${best15min.avgRoi}%`);
  }
  if (best30min) {
    console.log(`30min: K=${best30min.params.kPeriod}, D=${best30min.params.dPeriod}, Smooth=${best30min.params.smooth}`);
    console.log(`       WinRate=${best30min.avgWinRate}%, ROI=${best30min.avgRoi}%`);
  }
  if (best1hour) {
    console.log(`1hour: K=${best1hour.params.kPeriod}, D=${best1hour.params.dPeriod}, Smooth=${best1hour.params.smooth}`);
    console.log(`       WinRate=${best1hour.avgWinRate}%, ROI=${best1hour.avgRoi}%`);
  }

  return { best5min, best15min, best30min, best1hour };
}

// KDJ optimization
async function optimizeKDJ() {
  console.log('\n' + '='.repeat(70));
  console.log('OPTIMIZING KDJ INDICATOR');
  console.log('='.repeat(70));

  const paramSets = [
    // K Period 5
    { kPeriod: 5, dPeriod: 3, smooth: 3 },
    { kPeriod: 5, dPeriod: 5, smooth: 3 },
    // K Period 9 (standard)
    { kPeriod: 9, dPeriod: 3, smooth: 3 },
    { kPeriod: 9, dPeriod: 5, smooth: 3 },
    { kPeriod: 9, dPeriod: 5, smooth: 5 },
    // K Period 14
    { kPeriod: 14, dPeriod: 3, smooth: 3 },
    { kPeriod: 14, dPeriod: 5, smooth: 3 },
    { kPeriod: 14, dPeriod: 7, smooth: 5 },
    // K Period 21
    { kPeriod: 21, dPeriod: 3, smooth: 3 },
    { kPeriod: 21, dPeriod: 5, smooth: 5 },
    { kPeriod: 21, dPeriod: 7, smooth: 5 }
  ];

  const results = [];

  for (const tf of TIMEFRAMES) {
    console.log(`\n--- Testing ${tf}min Timeframe ---\n`);

    for (const params of paramSets) {
      let totalWinRate = 0;
      let totalRoi = 0;
      let totalTrades = 0;
      let symbolCount = 0;

      for (const symbol of TEST_SYMBOLS) {
        const candles = await fetchCandles(symbol, tf, 500);
        if (candles.length < 100) continue;

        const indicator = new KDJIndicator(params);

        const getDirection = (result) => {
          if (!result.signals || result.signals.length === 0) return null;

          const divSignal = result.signals.find(s => s.type.includes('divergence'));
          const jSignal = result.signals.find(s => s.type.includes('j_line'));

          const signal = divSignal || jSignal;
          if (!signal) return null;

          return signal.direction === 'bullish' ? 'long' : 'short';
        };

        const backtest = backtestIndicator(candles, indicator, getDirection);
        if (backtest) {
          totalWinRate += parseFloat(backtest.winRate);
          totalRoi += parseFloat(backtest.totalRoi);
          totalTrades += backtest.totalTrades;
          symbolCount++;
        }

        await new Promise(r => setTimeout(r, 100));
      }

      if (symbolCount > 0) {
        const avgWinRate = (totalWinRate / symbolCount).toFixed(1);
        const avgRoi = (totalRoi / symbolCount).toFixed(2);

        results.push({
          timeframe: tf,
          params,
          avgWinRate,
          avgRoi,
          totalTrades
        });

        console.log(`KDJ(${params.kPeriod}/${params.dPeriod}/${params.smooth}): ` +
                   `WinRate=${avgWinRate}%, ROI=${avgRoi}%, Trades=${totalTrades}`);
      }
    }
  }

  const best5min = results.filter(r => r.timeframe === 5).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best15min = results.filter(r => r.timeframe === 15).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best30min = results.filter(r => r.timeframe === 30).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best1hour = results.filter(r => r.timeframe === 60).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];

  console.log('\n--- OPTIMAL KDJ SETTINGS ---');
  if (best5min) {
    console.log(`5min:  K=${best5min.params.kPeriod}, D=${best5min.params.dPeriod}, Smooth=${best5min.params.smooth}`);
    console.log(`       WinRate=${best5min.avgWinRate}%, ROI=${best5min.avgRoi}%`);
  }
  if (best15min) {
    console.log(`15min: K=${best15min.params.kPeriod}, D=${best15min.params.dPeriod}, Smooth=${best15min.params.smooth}`);
    console.log(`       WinRate=${best15min.avgWinRate}%, ROI=${best15min.avgRoi}%`);
  }
  if (best30min) {
    console.log(`30min: K=${best30min.params.kPeriod}, D=${best30min.params.dPeriod}, Smooth=${best30min.params.smooth}`);
    console.log(`       WinRate=${best30min.avgWinRate}%, ROI=${best30min.avgRoi}%`);
  }
  if (best1hour) {
    console.log(`1hour: K=${best1hour.params.kPeriod}, D=${best1hour.params.dPeriod}, Smooth=${best1hour.params.smooth}`);
    console.log(`       WinRate=${best1hour.avgWinRate}%, ROI=${best1hour.avgRoi}%`);
  }

  return { best5min, best15min, best30min, best1hour };
}

// Bollinger Bands optimization
async function optimizeBollinger() {
  console.log('\n' + '='.repeat(70));
  console.log('OPTIMIZING BOLLINGER BANDS INDICATOR');
  console.log('='.repeat(70));

  const paramSets = [
    // Period 15
    { period: 15, stdDev: 1.5 },
    { period: 15, stdDev: 2.0 },
    { period: 15, stdDev: 2.5 },
    // Period 20 (standard)
    { period: 20, stdDev: 1.5 },
    { period: 20, stdDev: 2.0 },
    { period: 20, stdDev: 2.5 },
    { period: 20, stdDev: 3.0 },
    // Period 25
    { period: 25, stdDev: 1.5 },
    { period: 25, stdDev: 2.0 },
    { period: 25, stdDev: 2.5 },
    // Period 30
    { period: 30, stdDev: 2.0 },
    { period: 30, stdDev: 2.5 },
    { period: 30, stdDev: 3.0 }
  ];

  const results = [];

  for (const tf of TIMEFRAMES) {
    console.log(`\n--- Testing ${tf}min Timeframe ---\n`);

    for (const params of paramSets) {
      let totalWinRate = 0;
      let totalRoi = 0;
      let totalTrades = 0;
      let symbolCount = 0;

      for (const symbol of TEST_SYMBOLS) {
        const candles = await fetchCandles(symbol, tf, 500);
        if (candles.length < 100) continue;

        const indicator = new BollingerBands(params);

        const getDirection = (result) => {
          if (!result.signals || result.signals.length === 0) return null;

          const breakout = result.signals.find(s => s.type.includes('breakout'));
          const squeeze = result.signals.find(s => s.type.includes('squeeze'));

          const signal = breakout || squeeze;
          if (!signal) return null;

          return signal.direction === 'bullish' ? 'long' : 'short';
        };

        const backtest = backtestIndicator(candles, indicator, getDirection);
        if (backtest) {
          totalWinRate += parseFloat(backtest.winRate);
          totalRoi += parseFloat(backtest.totalRoi);
          totalTrades += backtest.totalTrades;
          symbolCount++;
        }

        await new Promise(r => setTimeout(r, 100));
      }

      if (symbolCount > 0) {
        const avgWinRate = (totalWinRate / symbolCount).toFixed(1);
        const avgRoi = (totalRoi / symbolCount).toFixed(2);

        results.push({
          timeframe: tf,
          params,
          avgWinRate,
          avgRoi,
          totalTrades
        });

        console.log(`BB(${params.period}, ${params.stdDev}): ` +
                   `WinRate=${avgWinRate}%, ROI=${avgRoi}%, Trades=${totalTrades}`);
      }
    }
  }

  const best5min = results.filter(r => r.timeframe === 5).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best15min = results.filter(r => r.timeframe === 15).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best30min = results.filter(r => r.timeframe === 30).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best1hour = results.filter(r => r.timeframe === 60).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];

  console.log('\n--- OPTIMAL BOLLINGER SETTINGS ---');
  if (best5min) {
    console.log(`5min:  Period=${best5min.params.period}, StdDev=${best5min.params.stdDev}`);
    console.log(`       WinRate=${best5min.avgWinRate}%, ROI=${best5min.avgRoi}%`);
  }
  if (best15min) {
    console.log(`15min: Period=${best15min.params.period}, StdDev=${best15min.params.stdDev}`);
    console.log(`       WinRate=${best15min.avgWinRate}%, ROI=${best15min.avgRoi}%`);
  }
  if (best30min) {
    console.log(`30min: Period=${best30min.params.period}, StdDev=${best30min.params.stdDev}`);
    console.log(`       WinRate=${best30min.avgWinRate}%, ROI=${best30min.avgRoi}%`);
  }
  if (best1hour) {
    console.log(`1hour: Period=${best1hour.params.period}, StdDev=${best1hour.params.stdDev}`);
    console.log(`       WinRate=${best1hour.avgWinRate}%, ROI=${best1hour.avgRoi}%`);
  }

  return { best5min, best15min, best30min, best1hour };
}

// EMA Trend optimization
async function optimizeEMATrend() {
  console.log('\n' + '='.repeat(70));
  console.log('OPTIMIZING EMA TREND INDICATOR');
  console.log('='.repeat(70));

  const paramSets = [
    // Fast EMAs (5-8 short)
    { shortPeriod: 5, mediumPeriod: 13, longPeriod: 34, trendPeriod: 100 },
    { shortPeriod: 5, mediumPeriod: 13, longPeriod: 34, trendPeriod: 200 },
    { shortPeriod: 8, mediumPeriod: 21, longPeriod: 50, trendPeriod: 200 },
    { shortPeriod: 8, mediumPeriod: 21, longPeriod: 55, trendPeriod: 200 },
    // Standard EMAs (9-12 short)
    { shortPeriod: 9, mediumPeriod: 21, longPeriod: 50, trendPeriod: 100 },
    { shortPeriod: 9, mediumPeriod: 21, longPeriod: 50, trendPeriod: 200 },
    { shortPeriod: 9, mediumPeriod: 26, longPeriod: 55, trendPeriod: 200 },
    { shortPeriod: 12, mediumPeriod: 26, longPeriod: 50, trendPeriod: 200 },
    { shortPeriod: 12, mediumPeriod: 26, longPeriod: 55, trendPeriod: 200 },
    // Fibonacci EMAs
    { shortPeriod: 8, mediumPeriod: 13, longPeriod: 21, trendPeriod: 100 },
    { shortPeriod: 13, mediumPeriod: 21, longPeriod: 55, trendPeriod: 200 }
  ];

  const results = [];

  for (const tf of TIMEFRAMES) {
    console.log(`\n--- Testing ${tf}min Timeframe ---\n`);

    for (const params of paramSets) {
      let totalWinRate = 0;
      let totalRoi = 0;
      let totalTrades = 0;
      let symbolCount = 0;

      for (const symbol of TEST_SYMBOLS) {
        const candles = await fetchCandles(symbol, tf, 500);
        if (candles.length < 100) continue;

        const indicator = new EMATrend(params);

        const getDirection = (result) => {
          if (!result.signals || result.signals.length === 0) return null;

          const cross = result.signals.find(s => s.type.includes('cross'));

          if (!cross) return null;

          return cross.direction === 'bullish' ? 'long' : 'short';
        };

        const backtest = backtestIndicator(candles, indicator, getDirection);
        if (backtest) {
          totalWinRate += parseFloat(backtest.winRate);
          totalRoi += parseFloat(backtest.totalRoi);
          totalTrades += backtest.totalTrades;
          symbolCount++;
        }

        await new Promise(r => setTimeout(r, 100));
      }

      if (symbolCount > 0) {
        const avgWinRate = (totalWinRate / symbolCount).toFixed(1);
        const avgRoi = (totalRoi / symbolCount).toFixed(2);

        results.push({
          timeframe: tf,
          params,
          avgWinRate,
          avgRoi,
          totalTrades
        });

        console.log(`EMA(${params.shortPeriod}/${params.mediumPeriod}/${params.longPeriod}): ` +
                   `WinRate=${avgWinRate}%, ROI=${avgRoi}%, Trades=${totalTrades}`);
      }
    }
  }

  const best5min = results.filter(r => r.timeframe === 5).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best15min = results.filter(r => r.timeframe === 15).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best30min = results.filter(r => r.timeframe === 30).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best1hour = results.filter(r => r.timeframe === 60).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];

  console.log('\n--- OPTIMAL EMA TREND SETTINGS ---');
  if (best5min) {
    console.log(`5min:  Short=${best5min.params.shortPeriod}, Med=${best5min.params.mediumPeriod}, Long=${best5min.params.longPeriod}, Trend=${best5min.params.trendPeriod}`);
    console.log(`       WinRate=${best5min.avgWinRate}%, ROI=${best5min.avgRoi}%`);
  }
  if (best15min) {
    console.log(`15min: Short=${best15min.params.shortPeriod}, Med=${best15min.params.mediumPeriod}, Long=${best15min.params.longPeriod}, Trend=${best15min.params.trendPeriod}`);
    console.log(`       WinRate=${best15min.avgWinRate}%, ROI=${best15min.avgRoi}%`);
  }
  if (best30min) {
    console.log(`30min: Short=${best30min.params.shortPeriod}, Med=${best30min.params.mediumPeriod}, Long=${best30min.params.longPeriod}, Trend=${best30min.params.trendPeriod}`);
    console.log(`       WinRate=${best30min.avgWinRate}%, ROI=${best30min.avgRoi}%`);
  }
  if (best1hour) {
    console.log(`1hour: Short=${best1hour.params.shortPeriod}, Med=${best1hour.params.mediumPeriod}, Long=${best1hour.params.longPeriod}, Trend=${best1hour.params.trendPeriod}`);
    console.log(`       WinRate=${best1hour.avgWinRate}%, ROI=${best1hour.avgRoi}%`);
  }

  return { best5min, best15min, best30min, best1hour };
}

// Awesome Oscillator optimization
async function optimizeAO() {
  console.log('\n' + '='.repeat(70));
  console.log('OPTIMIZING AWESOME OSCILLATOR');
  console.log('='.repeat(70));

  const paramSets = [
    // Fast period 3
    { fastPeriod: 3, slowPeriod: 21 },
    { fastPeriod: 3, slowPeriod: 34 },
    { fastPeriod: 3, slowPeriod: 55 },
    // Fast period 5 (standard)
    { fastPeriod: 5, slowPeriod: 21 },
    { fastPeriod: 5, slowPeriod: 34 },
    { fastPeriod: 5, slowPeriod: 55 },
    // Fast period 7
    { fastPeriod: 7, slowPeriod: 21 },
    { fastPeriod: 7, slowPeriod: 34 },
    { fastPeriod: 7, slowPeriod: 55 }
  ];

  const results = [];

  for (const tf of TIMEFRAMES) {
    console.log(`\n--- Testing ${tf}min Timeframe ---\n`);

    for (const params of paramSets) {
      let totalWinRate = 0;
      let totalRoi = 0;
      let totalTrades = 0;
      let symbolCount = 0;

      for (const symbol of TEST_SYMBOLS) {
        const candles = await fetchCandles(symbol, tf, 500);
        if (candles.length < 100) continue;

        const indicator = new AwesomeOscillator(params);

        const getDirection = (result) => {
          if (!result.signals || result.signals.length === 0) return null;

          const divSignal = result.signals.find(s => s.type.includes('divergence'));
          const crossSignal = result.signals.find(s => s.type.includes('zero_cross'));

          const signal = divSignal || crossSignal;
          if (!signal) return null;

          return signal.direction === 'bullish' ? 'long' : 'short';
        };

        const backtest = backtestIndicator(candles, indicator, getDirection);
        if (backtest) {
          totalWinRate += parseFloat(backtest.winRate);
          totalRoi += parseFloat(backtest.totalRoi);
          totalTrades += backtest.totalTrades;
          symbolCount++;
        }

        await new Promise(r => setTimeout(r, 100));
      }

      if (symbolCount > 0) {
        const avgWinRate = (totalWinRate / symbolCount).toFixed(1);
        const avgRoi = (totalRoi / symbolCount).toFixed(2);

        results.push({
          timeframe: tf,
          params,
          avgWinRate,
          avgRoi,
          totalTrades
        });

        console.log(`AO(${params.fastPeriod}/${params.slowPeriod}): ` +
                   `WinRate=${avgWinRate}%, ROI=${avgRoi}%, Trades=${totalTrades}`);
      }
    }
  }

  const best5min = results.filter(r => r.timeframe === 5).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best15min = results.filter(r => r.timeframe === 15).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best30min = results.filter(r => r.timeframe === 30).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best1hour = results.filter(r => r.timeframe === 60).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];

  console.log('\n--- OPTIMAL AO SETTINGS ---');
  if (best5min) {
    console.log(`5min:  Fast=${best5min.params.fastPeriod}, Slow=${best5min.params.slowPeriod}`);
    console.log(`       WinRate=${best5min.avgWinRate}%, ROI=${best5min.avgRoi}%`);
  }
  if (best15min) {
    console.log(`15min: Fast=${best15min.params.fastPeriod}, Slow=${best15min.params.slowPeriod}`);
    console.log(`       WinRate=${best15min.avgWinRate}%, ROI=${best15min.avgRoi}%`);
  }
  if (best30min) {
    console.log(`30min: Fast=${best30min.params.fastPeriod}, Slow=${best30min.params.slowPeriod}`);
    console.log(`       WinRate=${best30min.avgWinRate}%, ROI=${best30min.avgRoi}%`);
  }
  if (best1hour) {
    console.log(`1hour: Fast=${best1hour.params.fastPeriod}, Slow=${best1hour.params.slowPeriod}`);
    console.log(`       WinRate=${best1hour.avgWinRate}%, ROI=${best1hour.avgRoi}%`);
  }

  return { best5min, best15min, best30min, best1hour };
}

// OBV optimization
async function optimizeOBV() {
  console.log('\n' + '='.repeat(70));
  console.log('OPTIMIZING OBV INDICATOR');
  console.log('='.repeat(70));

  const paramSets = [
    // Slope Window 7
    { slopeWindow: 7, smoothingEma: 3 },
    { slopeWindow: 7, smoothingEma: 5 },
    // Slope Window 10
    { slopeWindow: 10, smoothingEma: 3 },
    { slopeWindow: 10, smoothingEma: 5 },
    { slopeWindow: 10, smoothingEma: 9 },
    // Slope Window 14 (standard)
    { slopeWindow: 14, smoothingEma: 3 },
    { slopeWindow: 14, smoothingEma: 5 },
    { slopeWindow: 14, smoothingEma: 9 },
    // Slope Window 21
    { slopeWindow: 21, smoothingEma: 5 },
    { slopeWindow: 21, smoothingEma: 9 }
  ];

  const results = [];

  for (const tf of TIMEFRAMES) {
    console.log(`\n--- Testing ${tf}min Timeframe ---\n`);

    for (const params of paramSets) {
      let totalWinRate = 0;
      let totalRoi = 0;
      let totalTrades = 0;
      let symbolCount = 0;

      for (const symbol of TEST_SYMBOLS) {
        const candles = await fetchCandles(symbol, tf, 500);
        if (candles.length < 100) continue;

        const indicator = new OBVIndicator(params);

        const getDirection = (result) => {
          if (!result.signals || result.signals.length === 0) return null;

          const divSignal = result.signals.find(s => s.type.includes('divergence'));
          const breakoutSignal = result.signals.find(s => s.type.includes('breakout'));

          const signal = divSignal || breakoutSignal;
          if (!signal) return null;

          return signal.direction === 'bullish' ? 'long' : 'short';
        };

        const backtest = backtestIndicator(candles, indicator, getDirection);
        if (backtest) {
          totalWinRate += parseFloat(backtest.winRate);
          totalRoi += parseFloat(backtest.totalRoi);
          totalTrades += backtest.totalTrades;
          symbolCount++;
        }

        await new Promise(r => setTimeout(r, 100));
      }

      if (symbolCount > 0) {
        const avgWinRate = (totalWinRate / symbolCount).toFixed(1);
        const avgRoi = (totalRoi / symbolCount).toFixed(2);

        results.push({
          timeframe: tf,
          params,
          avgWinRate,
          avgRoi,
          totalTrades
        });

        console.log(`OBV(${params.slopeWindow}/${params.smoothingEma}): ` +
                   `WinRate=${avgWinRate}%, ROI=${avgRoi}%, Trades=${totalTrades}`);
      }
    }
  }

  const best5min = results.filter(r => r.timeframe === 5).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best15min = results.filter(r => r.timeframe === 15).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best30min = results.filter(r => r.timeframe === 30).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best1hour = results.filter(r => r.timeframe === 60).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];

  console.log('\n--- OPTIMAL OBV SETTINGS ---');
  if (best5min) {
    console.log(`5min:  SlopeWindow=${best5min.params.slopeWindow}, Smoothing=${best5min.params.smoothingEma}`);
    console.log(`       WinRate=${best5min.avgWinRate}%, ROI=${best5min.avgRoi}%`);
  }
  if (best15min) {
    console.log(`15min: SlopeWindow=${best15min.params.slopeWindow}, Smoothing=${best15min.params.smoothingEma}`);
    console.log(`       WinRate=${best15min.avgWinRate}%, ROI=${best15min.avgRoi}%`);
  }
  if (best30min) {
    console.log(`30min: SlopeWindow=${best30min.params.slopeWindow}, Smoothing=${best30min.params.smoothingEma}`);
    console.log(`       WinRate=${best30min.avgWinRate}%, ROI=${best30min.avgRoi}%`);
  }
  if (best1hour) {
    console.log(`1hour: SlopeWindow=${best1hour.params.slopeWindow}, Smoothing=${best1hour.params.smoothingEma}`);
    console.log(`       WinRate=${best1hour.avgWinRate}%, ROI=${best1hour.avgRoi}%`);
  }

  return { best5min, best15min, best30min, best1hour };
}

// Volume Ratio optimization
async function optimizeVolumeRatio() {
  console.log('\n' + '='.repeat(70));
  console.log('OPTIMIZING VOLUME RATIO INDICATOR');
  console.log('='.repeat(70));

  const paramSets = [
    // Lookback 15
    { lookback: 15, buyThreshold: 1.3, sellThreshold: 0.77 },
    { lookback: 15, buyThreshold: 1.5, sellThreshold: 0.67 },
    { lookback: 15, buyThreshold: 1.8, sellThreshold: 0.56 },
    // Lookback 20
    { lookback: 20, buyThreshold: 1.3, sellThreshold: 0.77 },
    { lookback: 20, buyThreshold: 1.5, sellThreshold: 0.67 },
    { lookback: 20, buyThreshold: 1.8, sellThreshold: 0.56 },
    // Lookback 30 (standard)
    { lookback: 30, buyThreshold: 1.3, sellThreshold: 0.77 },
    { lookback: 30, buyThreshold: 1.5, sellThreshold: 0.67 },
    { lookback: 30, buyThreshold: 1.8, sellThreshold: 0.56 },
    { lookback: 30, buyThreshold: 2.0, sellThreshold: 0.50 },
    // Lookback 50
    { lookback: 50, buyThreshold: 1.5, sellThreshold: 0.67 },
    { lookback: 50, buyThreshold: 1.8, sellThreshold: 0.56 },
    { lookback: 50, buyThreshold: 2.0, sellThreshold: 0.50 }
  ];

  const results = [];

  for (const tf of TIMEFRAMES) {
    console.log(`\n--- Testing ${tf}min Timeframe ---\n`);

    for (const params of paramSets) {
      let totalWinRate = 0;
      let totalRoi = 0;
      let totalTrades = 0;
      let symbolCount = 0;

      for (const symbol of TEST_SYMBOLS) {
        const candles = await fetchCandles(symbol, tf, 500);
        if (candles.length < 100) continue;

        const indicator = new VolumeRatioIndicator(params);

        const getDirection = (result) => {
          if (!result.signals || result.signals.length === 0) return null;

          const pressureSignal = result.signals.find(s => s.type.includes('pressure'));
          const divSignal = result.signals.find(s => s.type.includes('divergence'));

          const signal = divSignal || pressureSignal;
          if (!signal) return null;

          return signal.direction === 'bullish' ? 'long' : 'short';
        };

        const backtest = backtestIndicator(candles, indicator, getDirection);
        if (backtest) {
          totalWinRate += parseFloat(backtest.winRate);
          totalRoi += parseFloat(backtest.totalRoi);
          totalTrades += backtest.totalTrades;
          symbolCount++;
        }

        await new Promise(r => setTimeout(r, 100));
      }

      if (symbolCount > 0) {
        const avgWinRate = (totalWinRate / symbolCount).toFixed(1);
        const avgRoi = (totalRoi / symbolCount).toFixed(2);

        results.push({
          timeframe: tf,
          params,
          avgWinRate,
          avgRoi,
          totalTrades
        });

        console.log(`VolumeRatio(${params.lookback}, ${params.buyThreshold}/${params.sellThreshold}): ` +
                   `WinRate=${avgWinRate}%, ROI=${avgRoi}%, Trades=${totalTrades}`);
      }
    }
  }

  const best5min = results.filter(r => r.timeframe === 5).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best15min = results.filter(r => r.timeframe === 15).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best30min = results.filter(r => r.timeframe === 30).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best1hour = results.filter(r => r.timeframe === 60).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];

  console.log('\n--- OPTIMAL VOLUME RATIO SETTINGS ---');
  if (best5min) {
    console.log(`5min:  Lookback=${best5min.params.lookback}, Buy=${best5min.params.buyThreshold}, Sell=${best5min.params.sellThreshold}`);
    console.log(`       WinRate=${best5min.avgWinRate}%, ROI=${best5min.avgRoi}%`);
  }
  if (best15min) {
    console.log(`15min: Lookback=${best15min.params.lookback}, Buy=${best15min.params.buyThreshold}, Sell=${best15min.params.sellThreshold}`);
    console.log(`       WinRate=${best15min.avgWinRate}%, ROI=${best15min.avgRoi}%`);
  }
  if (best30min) {
    console.log(`30min: Lookback=${best30min.params.lookback}, Buy=${best30min.params.buyThreshold}, Sell=${best30min.params.sellThreshold}`);
    console.log(`       WinRate=${best30min.avgWinRate}%, ROI=${best30min.avgRoi}%`);
  }
  if (best1hour) {
    console.log(`1hour: Lookback=${best1hour.params.lookback}, Buy=${best1hour.params.buyThreshold}, Sell=${best1hour.params.sellThreshold}`);
    console.log(`       WinRate=${best1hour.avgWinRate}%, ROI=${best1hour.avgRoi}%`);
  }

  return { best5min, best15min, best30min, best1hour };
}

// Pump Alert optimization
async function optimizePumpAlert() {
  console.log('\n' + '='.repeat(70));
  console.log('OPTIMIZING PUMP ALERT INDICATOR');
  console.log('='.repeat(70));

  const paramSets = [
    // Low sensitivity
    { volumeLookback: 20, volumeSpikeThreshold: 3.0, atrExpansionThreshold: 2.0, momentumThreshold: 2.0, minConditions: 3 },
    { volumeLookback: 20, volumeSpikeThreshold: 2.5, atrExpansionThreshold: 1.8, momentumThreshold: 1.5, minConditions: 2 },
    // Medium sensitivity (standard)
    { volumeLookback: 20, volumeSpikeThreshold: 2.5, atrExpansionThreshold: 1.5, momentumThreshold: 1.5, minConditions: 2 },
    { volumeLookback: 20, volumeSpikeThreshold: 2.0, atrExpansionThreshold: 1.5, momentumThreshold: 1.0, minConditions: 2 },
    { volumeLookback: 15, volumeSpikeThreshold: 2.5, atrExpansionThreshold: 1.5, momentumThreshold: 1.5, minConditions: 2 },
    // High sensitivity
    { volumeLookback: 15, volumeSpikeThreshold: 2.0, atrExpansionThreshold: 1.3, momentumThreshold: 1.0, minConditions: 2 },
    { volumeLookback: 10, volumeSpikeThreshold: 2.0, atrExpansionThreshold: 1.5, momentumThreshold: 1.0, minConditions: 2 },
    // Very high sensitivity
    { volumeLookback: 10, volumeSpikeThreshold: 1.8, atrExpansionThreshold: 1.3, momentumThreshold: 0.8, minConditions: 2 },
    // Longer lookback
    { volumeLookback: 30, volumeSpikeThreshold: 2.5, atrExpansionThreshold: 1.5, momentumThreshold: 1.5, minConditions: 2 },
    { volumeLookback: 30, volumeSpikeThreshold: 3.0, atrExpansionThreshold: 2.0, momentumThreshold: 2.0, minConditions: 2 }
  ];

  const results = [];

  for (const tf of TIMEFRAMES) {
    console.log(`\n--- Testing ${tf}min Timeframe ---\n`);

    for (const params of paramSets) {
      let totalWinRate = 0;
      let totalRoi = 0;
      let totalTrades = 0;
      let symbolCount = 0;

      for (const symbol of TEST_SYMBOLS) {
        const candles = await fetchCandles(symbol, tf, 500);
        if (candles.length < 100) continue;

        const indicator = new PumpAlertIndicator(params);

        const getDirection = (result) => {
          if (!result.signals || result.signals.length === 0) return null;

          // Look for pump/dump signals - these are contrarian signals
          const pumpSignal = result.signals.find(s =>
            s.type.includes('pump') || s.type.includes('dump') ||
            s.type.includes('volume_spike') || s.type.includes('momentum')
          );

          if (!pumpSignal) return null;

          // For pump/dump alerts, we trade contrarian
          // If pump detected, consider shorting (reversal expected)
          // If dump detected, consider longing (reversal expected)
          if (pumpSignal.type.includes('pump')) {
            return 'short'; // Expect reversal after pump
          } else if (pumpSignal.type.includes('dump')) {
            return 'long'; // Expect reversal after dump
          }

          // For momentum signals, trade with the trend
          return pumpSignal.direction === 'bullish' ? 'long' : 'short';
        };

        const backtest = backtestIndicator(candles, indicator, getDirection);
        if (backtest) {
          totalWinRate += parseFloat(backtest.winRate);
          totalRoi += parseFloat(backtest.totalRoi);
          totalTrades += backtest.totalTrades;
          symbolCount++;
        }

        await new Promise(r => setTimeout(r, 100));
      }

      if (symbolCount > 0) {
        const avgWinRate = (totalWinRate / symbolCount).toFixed(1);
        const avgRoi = (totalRoi / symbolCount).toFixed(2);

        results.push({
          timeframe: tf,
          params,
          avgWinRate,
          avgRoi,
          totalTrades
        });

        console.log(`PumpAlert(vol=${params.volumeSpikeThreshold}, atr=${params.atrExpansionThreshold}, mom=${params.momentumThreshold}): ` +
                   `WinRate=${avgWinRate}%, ROI=${avgRoi}%, Trades=${totalTrades}`);
      }
    }
  }

  const best5min = results.filter(r => r.timeframe === 5).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best15min = results.filter(r => r.timeframe === 15).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best30min = results.filter(r => r.timeframe === 30).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];
  const best1hour = results.filter(r => r.timeframe === 60).sort((a, b) => parseFloat(b.avgRoi) - parseFloat(a.avgRoi))[0];

  console.log('\n--- OPTIMAL PUMP ALERT SETTINGS ---');
  if (best5min) {
    console.log(`5min:  VolSpike=${best5min.params.volumeSpikeThreshold}, ATR=${best5min.params.atrExpansionThreshold}, Mom=${best5min.params.momentumThreshold}`);
    console.log(`       WinRate=${best5min.avgWinRate}%, ROI=${best5min.avgRoi}%`);
  }
  if (best15min) {
    console.log(`15min: VolSpike=${best15min.params.volumeSpikeThreshold}, ATR=${best15min.params.atrExpansionThreshold}, Mom=${best15min.params.momentumThreshold}`);
    console.log(`       WinRate=${best15min.avgWinRate}%, ROI=${best15min.avgRoi}%`);
  }
  if (best30min) {
    console.log(`30min: VolSpike=${best30min.params.volumeSpikeThreshold}, ATR=${best30min.params.atrExpansionThreshold}, Mom=${best30min.params.momentumThreshold}`);
    console.log(`       WinRate=${best30min.avgWinRate}%, ROI=${best30min.avgRoi}%`);
  }
  if (best1hour) {
    console.log(`1hour: VolSpike=${best1hour.params.volumeSpikeThreshold}, ATR=${best1hour.params.atrExpansionThreshold}, Mom=${best1hour.params.momentumThreshold}`);
    console.log(`       WinRate=${best1hour.avgWinRate}%, ROI=${best1hour.avgRoi}%`);
  }

  return { best5min, best15min, best30min, best1hour };
}

// Main optimization runner
async function main() {
  console.log('='.repeat(70));
  console.log('INDICATOR OPTIMIZER - Multi-Timeframe Analysis (5m, 15m, 30m, 1h)');
  console.log('Testing: ' + TEST_SYMBOLS.join(', '));
  console.log('='.repeat(70));

  const optimizers = {
    rsi: optimizeRSI,
    macd: optimizeMACD,
    williams: optimizeWilliamsR,
    stochastic: optimizeStochastic,
    kdj: optimizeKDJ,
    bollinger: optimizeBollinger,
    ema: optimizeEMATrend,
    ao: optimizeAO,
    obv: optimizeOBV,
    volumeratio: optimizeVolumeRatio,
    pumpalert: optimizePumpAlert,
    all: async () => {
      const results = {};
      results.rsi = await optimizeRSI();
      results.macd = await optimizeMACD();
      results.williams = await optimizeWilliamsR();
      results.stochastic = await optimizeStochastic();
      results.kdj = await optimizeKDJ();
      results.bollinger = await optimizeBollinger();
      results.ema = await optimizeEMATrend();
      results.ao = await optimizeAO();
      results.obv = await optimizeOBV();
      results.volumeratio = await optimizeVolumeRatio();
      results.pumpalert = await optimizePumpAlert();
      return results;
    }
  };

  if (!optimizers[indicatorName]) {
    console.log('\nAvailable indicators: ' + Object.keys(optimizers).join(', '));
    console.log('Usage: node indicator-optimizer.js <indicator>');
    return;
  }

  const result = await optimizers[indicatorName]();

  console.log('\n' + '='.repeat(70));
  console.log('OPTIMIZATION COMPLETE');
  console.log('='.repeat(70));
}

main().catch(console.error);
