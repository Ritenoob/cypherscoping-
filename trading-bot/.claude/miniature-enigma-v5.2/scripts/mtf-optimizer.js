/**
 * Multi-Timeframe & Indicator Parameter Optimizer
 *
 * Tests all timeframe combinations and indicator parameter variations
 * to find optimal settings for signal generation.
 */

const axios = require('axios');

// KuCoin API base
const API_BASE = 'https://api-futures.kucoin.com';

// All available timeframes
const TIMEFRAMES = ['5min', '15min', '30min', '1hour', '2hour', '4hour'];

// Timeframe to granularity mapping
const TF_GRANULARITY = {
  '1min': 1, '5min': 5, '15min': 15, '30min': 30,
  '1hour': 60, '2hour': 120, '4hour': 240, '8hour': 480, '12hour': 720, '1day': 1440
};

// Test symbols (high volume for reliable data)
const TEST_SYMBOLS = ['XBTUSDTM', 'ETHUSDTM', 'SOLUSDTM', 'XRPUSDTM', 'DOGEUSDTM'];

// ============================================================================
// INDICATOR PARAMETER RANGES TO TEST
// ============================================================================

const PARAM_RANGES = {
  stochRsi: {
    rsiPeriod: [7, 14, 21, 50],
    stochPeriod: [9, 14, 21],
    kSmooth: [3, 4, 5],
    dSmooth: [3, 4, 5]
  },
  williamsR: {
    period: [7, 9, 14, 21, 28]
  },
  stochastic: {
    period: [5, 9, 14, 21],
    kSmooth: [3, 5],
    dSmooth: [3, 5]
  },
  ema: {
    fast: [5, 8, 9, 12],
    mid: [13, 21, 26],
    slow: [34, 50, 55, 100]
  },
  bollinger: {
    period: [10, 14, 20, 25],
    stdDev: [1.5, 2.0, 2.5, 3.0]
  },
  kdj: {
    period: [5, 9, 14, 21],
    kSmooth: [3, 5],
    dSmooth: [3, 5]
  },
  ao: {
    fastPeriod: [3, 5, 7],
    slowPeriod: [21, 34, 55]
  },
  obv: {
    smaPeriod: [5, 10, 14, 20]
  },
  cmf: {
    period: [10, 14, 20, 21]
  }
};

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchCandles(symbol, timeframe, limit = 500) {
  const granularity = TF_GRANULARITY[timeframe];
  const endpoint = `${API_BASE}/api/v1/kline/query?symbol=${symbol}&granularity=${granularity}&from=${Date.now() - limit * granularity * 60 * 1000}&to=${Date.now()}`;

  try {
    const response = await axios.get(endpoint);
    if (response.data.code === '200000' && response.data.data) {
      return response.data.data.map(c => ({
        ts: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5])
      }));
    }
  } catch (e) {
    console.error(`Failed to fetch ${symbol} ${timeframe}:`, e.message);
  }
  return [];
}

// ============================================================================
// INDICATOR CALCULATIONS
// ============================================================================

function sma(values, period) {
  if (values.length < period) return values[values.length - 1] || 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values, period) {
  if (values.length < period) return values[values.length - 1] || 0;
  const k = 2 / (period + 1);
  let ema = sma(values.slice(0, period), period);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function rsi(closes, period) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function stochRsi(closes, rsiPeriod, stochPeriod, kSmooth, dSmooth) {
  if (closes.length < rsiPeriod + stochPeriod + kSmooth) return { k: 50, d: 50 };

  const rsiHistory = [];
  for (let i = rsiPeriod; i <= closes.length; i++) {
    const slice = closes.slice(0, i);
    rsiHistory.push(rsi(slice, rsiPeriod));
  }

  if (rsiHistory.length < stochPeriod) return { k: 50, d: 50 };

  const stochRsiValues = [];
  for (let i = stochPeriod - 1; i < rsiHistory.length; i++) {
    const rsiSlice = rsiHistory.slice(i - stochPeriod + 1, i + 1);
    const highRsi = Math.max(...rsiSlice);
    const lowRsi = Math.min(...rsiSlice);
    const denom = highRsi - lowRsi;
    stochRsiValues.push(denom === 0 ? 50 : ((rsiHistory[i] - lowRsi) / denom) * 100);
  }

  if (stochRsiValues.length < kSmooth) return { k: 50, d: 50 };

  const kValues = [];
  for (let i = kSmooth - 1; i < stochRsiValues.length; i++) {
    kValues.push(sma(stochRsiValues.slice(i - kSmooth + 1, i + 1), kSmooth));
  }

  const currentK = kValues[kValues.length - 1];
  const currentD = kValues.length >= dSmooth ? sma(kValues.slice(-dSmooth), dSmooth) : currentK;

  return { k: currentK, d: currentD };
}

function williamsR(highs, lows, closes, period) {
  const len = closes.length;
  if (len < period) return -50;
  const highSlice = highs.slice(-period);
  const lowSlice = lows.slice(-period);
  const hh = Math.max(...highSlice);
  const ll = Math.min(...lowSlice);
  const close = closes[len - 1];
  if (hh === ll) return -50;
  return ((hh - close) / (hh - ll)) * -100;
}

function stochastic(highs, lows, closes, period, kSmooth = 3) {
  const len = closes.length;
  if (len < period) return { k: 50, d: 50 };
  const highSlice = highs.slice(-period);
  const lowSlice = lows.slice(-period);
  const hh = Math.max(...highSlice);
  const ll = Math.min(...lowSlice);
  const close = closes[len - 1];
  if (hh === ll) return { k: 50, d: 50 };
  const k = ((close - ll) / (hh - ll)) * 100;
  return { k, d: k };
}

function bollinger(closes, period, stdDev) {
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0, percentB: 50 };
  const slice = closes.slice(-period);
  const middle = sma(slice, period);
  const squaredDiffs = slice.map(v => Math.pow(v - middle, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(variance);
  const upper = middle + (stdDev * std);
  const lower = middle - (stdDev * std);
  const price = closes[closes.length - 1];
  const percentB = upper === lower ? 50 : ((price - lower) / (upper - lower)) * 100;
  return { upper, middle, lower, percentB };
}

function kdj(highs, lows, closes, period, kSmooth, dSmooth) {
  if (closes.length < period + kSmooth + dSmooth) return { k: 50, d: 50, j: 50 };
  const len = closes.length;
  const rsvValues = [];

  for (let i = period - 1; i < len; i++) {
    const highSlice = highs.slice(i - period + 1, i + 1);
    const lowSlice = lows.slice(i - period + 1, i + 1);
    const hh = Math.max(...highSlice);
    const ll = Math.min(...lowSlice);
    const close = closes[i];
    const rsv = hh === ll ? 50 : ((close - ll) / (hh - ll)) * 100;
    rsvValues.push(rsv);
  }

  const kValues = [];
  for (let i = kSmooth - 1; i < rsvValues.length; i++) {
    kValues.push(sma(rsvValues.slice(i - kSmooth + 1, i + 1), kSmooth));
  }

  const dValues = [];
  for (let i = dSmooth - 1; i < kValues.length; i++) {
    dValues.push(sma(kValues.slice(i - dSmooth + 1, i + 1), dSmooth));
  }

  const k = kValues[kValues.length - 1] || 50;
  const d = dValues[dValues.length - 1] || 50;
  const j = 3 * k - 2 * d;
  return { k, d, j };
}

function ao(highs, lows, fastPeriod, slowPeriod) {
  if (highs.length < slowPeriod) return { value: 0, signal: 'neutral' };
  const medianPrices = [];
  for (let i = 0; i < highs.length; i++) {
    medianPrices.push((highs[i] + lows[i]) / 2);
  }
  const fastSma = sma(medianPrices.slice(-fastPeriod), fastPeriod);
  const slowSma = sma(medianPrices.slice(-slowPeriod), slowPeriod);
  const aoVal = fastSma - slowSma;
  const prevMedian = medianPrices.slice(-slowPeriod - 1, -1);
  const prevFastSma = sma(prevMedian.slice(-fastPeriod), fastPeriod);
  const prevSlowSma = sma(prevMedian, slowPeriod);
  const prevAo = prevFastSma - prevSlowSma;

  let signal = 'neutral';
  if (aoVal > 0 && aoVal > prevAo) signal = 'bullish';
  else if (aoVal < 0 && aoVal < prevAo) signal = 'bearish';
  else if (aoVal > 0 && aoVal < prevAo) signal = 'weakening_bull';
  else if (aoVal < 0 && aoVal > prevAo) signal = 'weakening_bear';

  return { value: aoVal, signal };
}

function obv(closes, volumes, smaPeriod) {
  if (closes.length < 20) return { value: 0, trend: 'neutral' };
  let obvVal = 0;
  const obvHistory = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obvVal += volumes[i];
    else if (closes[i] < closes[i - 1]) obvVal -= volumes[i];
    obvHistory.push(obvVal);
  }
  const recentObv = obvHistory.slice(-smaPeriod);
  const obvSma = sma(recentObv, smaPeriod);
  let trend = 'neutral';
  if (obvVal > obvSma * 1.05) trend = 'bullish';
  else if (obvVal < obvSma * 0.95) trend = 'bearish';
  return { value: obvVal, sma: obvSma, trend };
}

function cmf(highs, lows, closes, volumes, period) {
  if (closes.length < period) return 0;
  let sumMFV = 0, sumVolume = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const high = highs[i], low = lows[i], close = closes[i], volume = volumes[i];
    const range = high - low;
    const mfm = range === 0 ? 0 : ((close - low) - (high - close)) / range;
    sumMFV += mfm * volume;
    sumVolume += volume;
  }
  return sumVolume === 0 ? 0 : sumMFV / sumVolume;
}

// ============================================================================
// SIGNAL SCORING WITH PARAMETERS
// ============================================================================

function calculateScore(candles, params) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  let score = 0;

  // StochRSI
  const sr = stochRsi(closes, params.stochRsi.rsiPeriod, params.stochRsi.stochPeriod,
                       params.stochRsi.kSmooth, params.stochRsi.dSmooth);
  if (sr.k <= 20) score += 35 * ((20 - sr.k) / 20);
  else if (sr.k >= 80) score -= 35 * ((sr.k - 80) / 20);
  if (sr.k > sr.d && sr.k <= 30) score += 10;
  else if (sr.k < sr.d && sr.k >= 70) score -= 10;

  // Williams %R
  const wr = williamsR(highs, lows, closes, params.williamsR.period);
  if (wr <= -80) score += 25 * ((-80 - wr) / 20);
  else if (wr >= -20) score -= 25 * ((wr + 20) / 20);

  // Stochastic
  const stoch = stochastic(highs, lows, closes, params.stochastic.period);
  if (stoch.k <= 20) score += 10 * ((20 - stoch.k) / 20);
  else if (stoch.k >= 80) score -= 10 * ((stoch.k - 80) / 20);

  // EMA alignment
  const ema1 = ema(closes, params.ema.fast);
  const ema2 = ema(closes, params.ema.mid);
  const ema3 = ema(closes, params.ema.slow);
  const price = closes[closes.length - 1];
  if (price > ema1 && ema1 > ema2 && ema2 > ema3) score += 20;
  else if (price < ema1 && ema1 < ema2 && ema2 < ema3) score -= 20;

  // Bollinger
  const bb = bollinger(closes, params.bollinger.period, params.bollinger.stdDev);
  if (bb.percentB <= 10) score += 15 * ((10 - bb.percentB) / 10);
  else if (bb.percentB >= 90) score -= 15 * ((bb.percentB - 90) / 10);

  // KDJ
  const kdjVal = kdj(highs, lows, closes, params.kdj.period, params.kdj.kSmooth, params.kdj.dSmooth);
  if (kdjVal.j <= 0) score += 15 * Math.min(1, Math.abs(kdjVal.j) / 20);
  else if (kdjVal.j >= 100) score -= 15 * Math.min(1, (kdjVal.j - 100) / 20);
  if (kdjVal.k > kdjVal.d && kdjVal.j < 30) score += 5;
  else if (kdjVal.k < kdjVal.d && kdjVal.j > 70) score -= 5;

  // AO
  const aoVal = ao(highs, lows, params.ao.fastPeriod, params.ao.slowPeriod);
  if (aoVal.signal === 'bullish') score += 10;
  else if (aoVal.signal === 'bearish') score -= 10;
  else if (aoVal.signal === 'weakening_bear') score += 5;
  else if (aoVal.signal === 'weakening_bull') score -= 5;

  // OBV
  const obvVal = obv(closes, volumes, params.obv.smaPeriod);
  if (obvVal.trend === 'bullish') score += 10;
  else if (obvVal.trend === 'bearish') score -= 10;

  // CMF
  const cmfVal = cmf(highs, lows, closes, volumes, params.cmf.period);
  if (cmfVal > 0.1) score += 15 * Math.min(1, cmfVal / 0.3);
  else if (cmfVal < -0.1) score -= 15 * Math.min(1, Math.abs(cmfVal) / 0.3);

  // Volume multiplier
  const avgVol = sma(volumes.slice(-20), 20);
  if (volumes[volumes.length - 1] > avgVol * 1.5) {
    score *= 1.25;
  }

  return Math.round(score);
}

// ============================================================================
// BACKTESTING LOGIC
// ============================================================================

function simulateTrades(candles, scores, threshold = 50) {
  const trades = [];
  let position = null;

  for (let i = 50; i < candles.length - 10; i++) {
    const score = scores[i];
    const candle = candles[i];

    if (!position) {
      // Entry
      if (Math.abs(score) >= threshold) {
        position = {
          entry: candle.close,
          direction: score > 0 ? 'long' : 'short',
          entryIndex: i,
          score: score
        };
      }
    } else {
      // Check exit (simple: 10 candles hold or reversal)
      const holdTime = i - position.entryIndex;
      const pnl = position.direction === 'long'
        ? (candle.close - position.entry) / position.entry * 100
        : (position.entry - candle.close) / position.entry * 100;

      // Exit conditions
      if (holdTime >= 10 || pnl >= 2 || pnl <= -1 ||
          (position.direction === 'long' && score < -30) ||
          (position.direction === 'short' && score > 30)) {
        trades.push({
          direction: position.direction,
          pnl: pnl,
          holdTime: holdTime
        });
        position = null;
      }
    }
  }

  return trades;
}

function evaluatePerformance(trades) {
  if (trades.length === 0) return { winRate: 0, profitFactor: 0, totalPnl: 0, trades: 0 };

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const totalWin = wins.reduce((a, t) => a + t.pnl, 0);
  const totalLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));

  return {
    winRate: (wins.length / trades.length) * 100,
    profitFactor: totalLoss === 0 ? totalWin : totalWin / totalLoss,
    totalPnl: trades.reduce((a, t) => a + t.pnl, 0),
    trades: trades.length,
    avgWin: wins.length > 0 ? totalWin / wins.length : 0,
    avgLoss: losses.length > 0 ? totalLoss / losses.length : 0
  };
}

// ============================================================================
// OPTIMIZATION FUNCTIONS
// ============================================================================

async function testTimeframePair(primary, secondary, params) {
  console.log(`  Testing ${primary} + ${secondary}...`);

  let totalPerf = { winRate: 0, profitFactor: 0, totalPnl: 0, trades: 0 };
  let symbolCount = 0;

  for (const symbol of TEST_SYMBOLS) {
    const primaryCandles = await fetchCandles(symbol, primary, 500);
    const secondaryCandles = await fetchCandles(symbol, secondary, 200);

    if (primaryCandles.length < 100 || secondaryCandles.length < 50) continue;

    // Calculate scores for primary timeframe
    const scores = [];
    for (let i = 50; i < primaryCandles.length; i++) {
      const slice = primaryCandles.slice(0, i + 1);
      scores.push(calculateScore(slice, params));
    }

    // Get secondary direction for convergence
    const secScore = calculateScore(secondaryCandles, params);
    const secDirection = secScore > 0 ? 'long' : secScore < 0 ? 'short' : 'neutral';

    // Apply convergence bonus/penalty
    const adjustedScores = scores.map(s => {
      const dir = s > 0 ? 'long' : s < 0 ? 'short' : 'neutral';
      if (dir === secDirection && dir !== 'neutral') {
        return Math.round(s * 1.3); // Convergence bonus
      } else if (dir !== secDirection && dir !== 'neutral' && secDirection !== 'neutral') {
        return Math.round(s * 0.7); // Conflict penalty
      }
      return s;
    });

    const trades = simulateTrades(primaryCandles.slice(50), adjustedScores, 50);
    const perf = evaluatePerformance(trades);

    totalPerf.winRate += perf.winRate;
    totalPerf.profitFactor += perf.profitFactor;
    totalPerf.totalPnl += perf.totalPnl;
    totalPerf.trades += perf.trades;
    symbolCount++;

    await sleep(100); // Rate limit
  }

  if (symbolCount === 0) return null;

  return {
    primary,
    secondary,
    winRate: totalPerf.winRate / symbolCount,
    profitFactor: totalPerf.profitFactor / symbolCount,
    totalPnl: totalPerf.totalPnl,
    trades: totalPerf.trades
  };
}

async function optimizeIndicator(indicatorName, paramRange, baseParams, candles) {
  console.log(`\n  Optimizing ${indicatorName}...`);

  const results = [];
  const keys = Object.keys(paramRange);

  // Generate all combinations
  function* combinations(keys, current = {}) {
    if (keys.length === 0) {
      yield current;
      return;
    }
    const [key, ...rest] = keys;
    for (const value of paramRange[key]) {
      yield* combinations(rest, { ...current, [key]: value });
    }
  }

  for (const combo of combinations(keys)) {
    const testParams = { ...baseParams, [indicatorName]: combo };

    const scores = [];
    for (let i = 50; i < candles.length; i++) {
      const slice = candles.slice(0, i + 1);
      scores.push(calculateScore(slice, testParams));
    }

    const trades = simulateTrades(candles.slice(50), scores, 50);
    const perf = evaluatePerformance(trades);

    if (perf.trades >= 5) {
      results.push({
        params: combo,
        ...perf
      });
    }
  }

  // Sort by combined score (winRate * profitFactor)
  results.sort((a, b) => (b.winRate * b.profitFactor) - (a.winRate * a.profitFactor));

  return results[0] || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// MAIN OPTIMIZATION RUNNER
// ============================================================================

async function runOptimization() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  MULTI-TIMEFRAME & INDICATOR PARAMETER OPTIMIZATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Default parameters
  const defaultParams = {
    stochRsi: { rsiPeriod: 50, stochPeriod: 14, kSmooth: 4, dSmooth: 5 },
    williamsR: { period: 14 },
    stochastic: { period: 14, kSmooth: 3, dSmooth: 3 },
    ema: { fast: 9, mid: 21, slow: 50 },
    bollinger: { period: 20, stdDev: 2.0 },
    kdj: { period: 9, kSmooth: 3, dSmooth: 3 },
    ao: { fastPeriod: 5, slowPeriod: 34 },
    obv: { smaPeriod: 10 },
    cmf: { period: 20 }
  };

  // ========================================
  // PHASE 1: Test All Timeframe Pairs
  // ========================================
  console.log('PHASE 1: Testing all timeframe pair combinations...\n');

  const tfResults = [];

  for (let i = 0; i < TIMEFRAMES.length; i++) {
    for (let j = i + 1; j < TIMEFRAMES.length; j++) {
      const primary = TIMEFRAMES[i];
      const secondary = TIMEFRAMES[j];

      const result = await testTimeframePair(primary, secondary, defaultParams);
      if (result) {
        tfResults.push(result);
        console.log(`    ${primary} + ${secondary}: WR=${result.winRate.toFixed(1)}% PF=${result.profitFactor.toFixed(2)} Trades=${result.trades}`);
      }

      await sleep(500); // Rate limit between pairs
    }
  }

  // Sort by combined metric
  tfResults.sort((a, b) => (b.winRate * b.profitFactor) - (a.winRate * a.profitFactor));

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('TOP 3 TIMEFRAME PAIRS:');
  console.log('─────────────────────────────────────────────────────────────');

  const top3TF = tfResults.slice(0, 3);
  top3TF.forEach((tf, i) => {
    console.log(`  ${i + 1}. ${tf.primary} + ${tf.secondary}`);
    console.log(`     Win Rate: ${tf.winRate.toFixed(1)}%`);
    console.log(`     Profit Factor: ${tf.profitFactor.toFixed(2)}`);
    console.log(`     Total Trades: ${tf.trades}`);
    console.log(`     Total PnL: ${tf.totalPnl.toFixed(2)}%\n`);
  });

  // ========================================
  // PHASE 2: Optimize Indicators for Best TF Pair
  // ========================================
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 2: Optimizing indicator parameters for best timeframe pair...');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const bestTF = top3TF[0];
  console.log(`Using ${bestTF.primary} + ${bestTF.secondary} for indicator optimization\n`);

  // Fetch candles for optimization
  const optCandles = await fetchCandles('XBTUSDTM', bestTF.primary, 1000);

  if (optCandles.length < 200) {
    console.log('Not enough candles for optimization');
    return;
  }

  let optimizedParams = { ...defaultParams };

  // Optimize each indicator
  const indicators = ['stochRsi', 'williamsR', 'stochastic', 'ema', 'bollinger', 'kdj', 'ao', 'obv', 'cmf'];

  for (const ind of indicators) {
    const best = await optimizeIndicator(ind, PARAM_RANGES[ind], optimizedParams, optCandles);
    if (best) {
      optimizedParams[ind] = best.params;
      console.log(`    ${ind}: ${JSON.stringify(best.params)}`);
      console.log(`      → WR=${best.winRate.toFixed(1)}% PF=${best.profitFactor.toFixed(2)}\n`);
    }
    await sleep(200);
  }

  // ========================================
  // FINAL RESULTS
  // ========================================
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('OPTIMIZATION COMPLETE - RECOMMENDED SETTINGS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('BEST TIMEFRAME PAIRS:');
  top3TF.forEach((tf, i) => {
    console.log(`  ${i + 1}. PRIMARY: ${tf.primary} | SECONDARY: ${tf.secondary}`);
  });

  console.log('\nOPTIMIZED INDICATOR PARAMETERS:');
  console.log(JSON.stringify(optimizedParams, null, 2));

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('.ENV SETTINGS TO UPDATE:');
  console.log('─────────────────────────────────────────────────────────────\n');

  console.log(`PRIMARY_TIMEFRAME=${bestTF.primary}`);
  console.log(`SECONDARY_TIMEFRAME=${bestTF.secondary}`);
  console.log(`MTF_LTF_TIMEFRAMES=${top3TF[2]?.primary || '5min'},${top3TF[1]?.primary || '15min'}`);
  console.log(`MTF_HTF_TIMEFRAMES=${top3TF[0]?.secondary || '1hour'},${top3TF[1]?.secondary || '4hour'}`);
  console.log('');
  console.log(`# StochRSI: rsiPeriod=${optimizedParams.stochRsi.rsiPeriod}, stochPeriod=${optimizedParams.stochRsi.stochPeriod}, kSmooth=${optimizedParams.stochRsi.kSmooth}, dSmooth=${optimizedParams.stochRsi.dSmooth}`);
  console.log(`# Williams %R: period=${optimizedParams.williamsR.period}`);
  console.log(`# Stochastic: period=${optimizedParams.stochastic.period}`);
  console.log(`# EMA: fast=${optimizedParams.ema.fast}, mid=${optimizedParams.ema.mid}, slow=${optimizedParams.ema.slow}`);
  console.log(`# Bollinger: period=${optimizedParams.bollinger.period}, stdDev=${optimizedParams.bollinger.stdDev}`);
  console.log(`# KDJ: period=${optimizedParams.kdj.period}, kSmooth=${optimizedParams.kdj.kSmooth}, dSmooth=${optimizedParams.kdj.dSmooth}`);
  console.log(`# AO: fast=${optimizedParams.ao.fastPeriod}, slow=${optimizedParams.ao.slowPeriod}`);
  console.log(`# OBV: smaPeriod=${optimizedParams.obv.smaPeriod}`);
  console.log(`# CMF: period=${optimizedParams.cmf.period}`);

  // Save results to file
  const results = {
    timestamp: new Date().toISOString(),
    topTimeframePairs: top3TF,
    optimizedParams: optimizedParams
  };

  require('fs').writeFileSync(
    __dirname + '/../logs/optimization-results.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n✓ Results saved to logs/optimization-results.json');
}

// Run
runOptimization().catch(console.error);
