#!/usr/bin/env node
/**
 * Signal Debug - Check what signals are being generated
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
  OBVIndicator
} = require('../src/indicators');
const SignalGeneratorV2 = require('../src/lib/SignalGeneratorV2');

const KUCOIN_FUTURES_REST = 'https://api-futures.kucoin.com';

async function fetchCandles(symbol, granularity = 15, count = 300) {
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

async function analyzeSymbol(symbol) {
  console.log('\n=== Analyzing ' + symbol + ' ===\n');

  const candles = await fetchCandles(symbol, 15, 300);
  console.log('Fetched ' + candles.length + ' candles');

  if (candles.length < 50) {
    console.log('Not enough candles');
    return;
  }

  // Initialize indicators
  const rsi = new RSIIndicator({ period: 14 });
  const macd = new MACDIndicator({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
  const bb = new BollingerBands({ period: 20, stdDev: 2 });
  const ema = new EMATrend({ shortPeriod: 9, mediumPeriod: 21, longPeriod: 50, trendPeriod: 200 });
  const williamsR = new WilliamsRIndicator({ period: 14 });
  const ao = new AwesomeOscillator({ fastPeriod: 5, slowPeriod: 34 });
  const stoch = new StochasticIndicator({ kPeriod: 14, dPeriod: 3, smooth: 3 });
  const kdj = new KDJIndicator({ kPeriod: 9, dPeriod: 3, smooth: 3 });
  const obv = new OBVIndicator({ slopeWindow: 14, smoothingEma: 5 });

  const signalGen = new SignalGeneratorV2({ enhancedMode: true, includeMicrostructure: false });

  let lastIndicators = {};

  // Process candles
  for (const candle of candles) {
    const data = { high: candle.high, low: candle.low, close: candle.close, volume: candle.volume };

    lastIndicators = {
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
  }

  // Generate signal
  const signal = signalGen.generate(lastIndicators, {});

  console.log('\nIndicator Values:');
  console.log('  RSI:', lastIndicators.rsi?.value?.toFixed(2) || 'N/A');
  console.log('  MACD:', JSON.stringify(lastIndicators.macd?.value) || 'N/A');
  console.log('  Williams %R:', lastIndicators.williamsR?.value?.toFixed(2) || 'N/A');
  console.log('  Stochastic K:', lastIndicators.stochastic?.value?.k?.toFixed(2) || 'N/A');
  console.log('  KDJ J:', lastIndicators.kdj?.value?.j?.toFixed(2) || 'N/A');

  console.log('\nSignal Breakdown:');
  for (const [name, data] of Object.entries(signal.breakdown.indicators)) {
    console.log('  ' + name + ': contribution=' + data.contribution.toFixed(2) + ', signals=' + (data.signals?.length || 0));
  }

  console.log('\nFinal Signal:');
  console.log('  Score:', signal.indicatorScore);
  console.log('  Type:', signal.type);
  console.log('  Confidence:', signal.confidence);
  console.log('  Active Signals:', signal.signals.length);

  if (signal.signals.length > 0) {
    console.log('\nActive Signals:');
    for (const s of signal.signals) {
      console.log('  - ' + s.source + ': ' + s.type + ' (' + s.direction + ', ' + s.strength + ')');
    }
  }
}

async function main() {
  // Test with top symbols
  const symbols = ['XBTUSDTM', 'ETHUSDTM', 'SOLUSDTM'];

  for (const symbol of symbols) {
    await analyzeSymbol(symbol);
  }
}

main().catch(console.error);
