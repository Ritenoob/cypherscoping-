#!/usr/bin/env node
/**
 * Debug signal distribution
 */
const { RSIIndicator, MACDIndicator, BollingerBands, EMATrend, WilliamsRIndicator, AwesomeOscillator, StochasticIndicator, KDJIndicator, OBVIndicator } = require('../src/indicators');
const SignalGeneratorV2 = require('../src/lib/SignalGeneratorV2');
const axios = require('axios');

async function fetchCandles() {
  const now = Date.now();
  const start = now - 7 * 24 * 60 * 60 * 1000;
  const response = await axios.get('https://api-futures.kucoin.com/api/v1/kline/query', {
    params: { symbol: 'XBTUSDTM', granularity: 15, from: start, to: now }
  });
  return response.data.data.map(c => ({
    ts: c[0], open: parseFloat(c[1]), high: parseFloat(c[2]),
    low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5])
  }));
}

async function analyze() {
  const candles = await fetchCandles();
  console.log('Fetched ' + candles.length + ' candles');

  const rsi = new RSIIndicator({ period: 14 });
  const macd = new MACDIndicator({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
  const bb = new BollingerBands({ period: 20, stdDev: 2 });
  const ema = new EMATrend({ shortPeriod: 9, mediumPeriod: 21, longPeriod: 50 });
  const williamsR = new WilliamsRIndicator({ period: 14 });
  const ao = new AwesomeOscillator({ fastPeriod: 5, slowPeriod: 34 });
  const stoch = new StochasticIndicator({ kPeriod: 14, dPeriod: 3, smooth: 3 });
  const kdj = new KDJIndicator({ kPeriod: 9, dPeriod: 3, smooth: 3 });
  const obv = new OBVIndicator({ slopeWindow: 14, smoothingEma: 5 });

  const signalGen = new SignalGeneratorV2({ enhancedMode: true, includeMicrostructure: false });

  let signals = { long: 0, short: 0, neutral: 0 };
  let lastSignals = [];
  let indicatorBreakdown = {};

  for (let i = 50; i < candles.length; i++) {
    const c = candles[i];
    const data = { high: c.high, low: c.low, close: c.close, volume: c.volume };

    const indicators = {
      rsi: rsi.update(data),
      macd: macd.update(data),
      bollinger: bb.update(data),
      emaTrend: ema.update(data),
      williamsR: williamsR.update(data),
      ao: ao.update(data),
      stochastic: stoch.update(data),
      kdj: kdj.update(data),
      obv: obv.update(data)
    };

    const signal = signalGen.generate(indicators, {});

    // Track indicator contributions
    for (const [name, result] of Object.entries(signal.breakdown.indicators)) {
      if (!indicatorBreakdown[name]) indicatorBreakdown[name] = { bullish: 0, bearish: 0, neutral: 0, total: 0 };
      indicatorBreakdown[name].total += result.contribution;
      if (result.contribution > 0) indicatorBreakdown[name].bullish++;
      else if (result.contribution < 0) indicatorBreakdown[name].bearish++;
      else indicatorBreakdown[name].neutral++;
    }

    if (signal.indicatorScore >= 30) {
      signals.long++;
      lastSignals.push({ i, score: signal.indicatorScore, type: 'LONG', price: c.close, signals: signal.signals.length });
    } else if (signal.indicatorScore <= -30) {
      signals.short++;
      lastSignals.push({ i, score: signal.indicatorScore, type: 'SHORT', price: c.close, signals: signal.signals.length });
    } else {
      signals.neutral++;
    }
  }

  console.log('\n=== Signal Distribution ===');
  console.log('Long signals: ' + signals.long);
  console.log('Short signals: ' + signals.short);
  console.log('Neutral: ' + signals.neutral);

  console.log('\n=== Indicator Breakdown (average contribution) ===');
  const total = candles.length - 50;
  for (const [name, data] of Object.entries(indicatorBreakdown)) {
    const avg = (data.total / total).toFixed(2);
    console.log(name + ': avg=' + avg + ', bullish=' + data.bullish + ', bearish=' + data.bearish);
  }

  console.log('\n=== Last 10 Signals ===');
  lastSignals.slice(-10).forEach(s => {
    console.log('  ' + s.type + ': score=' + s.score.toFixed(1) + ', price=' + s.price.toFixed(2) + ', signals=' + s.signals);
  });
}

analyze().catch(console.error);
