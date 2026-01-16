#!/usr/bin/env node
/**
 * Signal Scanner - Single Timeframe Mode
 * Scans all active KuCoin futures contracts using 15min timeframe
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

// Parse command line args
const args = process.argv.slice(2);
let minScore = 80;
let maxSymbols = 200;  // Scan top 200 by volume (limited by API rate)

for (let i = 0; i < args.length; i += 2) {
  const key = args[i]?.replace('--', '');
  const value = args[i + 1];
  if (key === 'score') minScore = parseInt(value);
  if (key === 'max') maxSymbols = parseInt(value);
}

async function getActiveContracts() {
  try {
    const response = await axios.get(`${KUCOIN_FUTURES_REST}/api/v1/contracts/active`);
    if (response.data.code !== '200000') {
      throw new Error(response.data.msg);
    }

    const contracts = response.data.data
      .filter(c => c.symbol.endsWith('USDTM') && c.status === 'Open')
      .sort((a, b) => b.turnoverOf24h - a.turnoverOf24h)
      .slice(0, maxSymbols);

    return contracts.map(c => ({
      symbol: c.symbol,
      price: c.lastTradePrice,
      volume24h: c.turnoverOf24h,
      change24h: (c.priceChgPct * 100).toFixed(2)
    }));
  } catch (error) {
    console.error('Failed to fetch contracts:', error.message);
    return [];
  }
}

async function fetchCandles(symbol, granularity, count = 300) {
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
    return [];
  }
}

function calculateSignal(candles) {
  if (candles.length < 50) return null;

  const rsi = new RSIIndicator({ period: 14, oversold: 30, overbought: 70 });
  const macd = new MACDIndicator({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
  const bb = new BollingerBands({ period: 20, stdDev: 2 });
  const ema = new EMATrend({ shortPeriod: 9, mediumPeriod: 21, longPeriod: 50, trendPeriod: 200 });
  const williamsR = new WilliamsRIndicator({ period: 14, oversold: -80, overbought: -20 });
  const ao = new AwesomeOscillator({ fastPeriod: 5, slowPeriod: 34 });
  const stoch = new StochasticIndicator({ kPeriod: 14, dPeriod: 3, smooth: 3 });
  const kdj = new KDJIndicator({ kPeriod: 9, dPeriod: 3, smooth: 3 });
  const obv = new OBVIndicator({ slopeWindow: 14, smoothingEma: 5 });

  const signalGen = new SignalGeneratorV2({ enhancedMode: true, includeMicrostructure: false });

  let lastIndicators = {};

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

  const signal = signalGen.generate(lastIndicators, {});

  return {
    score: signal.indicatorScore,
    type: signal.type,
    confidence: signal.confidence,
    signalCount: signal.signals.length,
    signals: signal.signals
  };
}

async function scanSymbol(contract) {
  const candles = await fetchCandles(contract.symbol, 15, 300);

  if (candles.length < 50) {
    return null;
  }

  const signal = calculateSignal(candles);
  if (!signal) return null;

  return {
    symbol: contract.symbol,
    price: contract.price,
    change24h: contract.change24h,
    volume24h: (contract.volume24h / 1e6).toFixed(2) + 'M',
    score: signal.score,
    type: signal.type,
    confidence: signal.confidence,
    signalCount: signal.signalCount,
    signals: signal.signals
  };
}

async function main() {
  console.log('='.repeat(70));
  console.log('SIGNAL SCANNER - Single Timeframe (15min)');
  console.log('Threshold: >=' + minScore + ' or <=-' + minScore);
  console.log('='.repeat(70));
  console.log('');

  console.log('Fetching active contracts...');
  const contracts = await getActiveContracts();
  console.log('Found ' + contracts.length + ' active USDT perpetual contracts\n');

  console.log('Scanning...\n');

  const allResults = [];
  const strongResults = [];
  let scanned = 0;

  for (const contract of contracts) {
    const result = await scanSymbol(contract);
    scanned++;

    if (result) {
      allResults.push(result);

      if (result.score >= minScore || result.score <= -minScore) {
        strongResults.push(result);
        console.log('[STRONG] ' + result.symbol + ': Score=' + result.score.toFixed(1) + ', Type=' + result.type);
      }
    }

    if (scanned % 10 === 0) {
      process.stdout.write('Scanned ' + scanned + '/' + contracts.length + ' symbols...\r');
    }

    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n');
  console.log('='.repeat(70));
  console.log('SCAN RESULTS (' + allResults.length + ' symbols analyzed)');
  console.log('='.repeat(70));

  if (strongResults.length === 0) {
    console.log('\nNo signals found with score >= ' + minScore + ' or <= -' + minScore);
    console.log('Market may be in consolidation.\n');

    if (allResults.length > 0) {
      allResults.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

      console.log('TOP 10 STRONGEST SIGNALS:\n');

      const topBullish = allResults.filter(r => r.score > 0).slice(0, 5);
      if (topBullish.length > 0) {
        console.log('--- BULLISH (potential LONG) ---');
        for (const r of topBullish) {
          console.log('  ' + r.symbol.padEnd(18) + ' Score: +' + r.score.toFixed(1).padStart(5) +
                      ' | Type: ' + r.type.padEnd(12) +
                      ' | 24h: ' + r.change24h.padStart(7) + '%' +
                      ' | Vol: ' + r.volume24h.padStart(10));
        }
        console.log('');
      }

      const topBearish = allResults.filter(r => r.score < 0).slice(0, 5);
      if (topBearish.length > 0) {
        console.log('--- BEARISH (potential SHORT) ---');
        for (const r of topBearish) {
          console.log('  ' + r.symbol.padEnd(18) + ' Score: ' + r.score.toFixed(1).padStart(6) +
                      ' | Type: ' + r.type.padEnd(12) +
                      ' | 24h: ' + r.change24h.padStart(7) + '%' +
                      ' | Vol: ' + r.volume24h.padStart(10));
        }
        console.log('');
      }
    }
  } else {
    strongResults.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

    console.log('\n' + strongResults.length + ' strong signals found:\n');

    const bullish = strongResults.filter(r => r.score > 0);
    if (bullish.length > 0) {
      console.log('--- BULLISH SIGNALS (LONG) ---');
      for (const r of bullish) {
        console.log('  ' + r.symbol.padEnd(18) + ' Score: +' + r.score.toFixed(1).padStart(5) +
                    ' | Type: ' + r.type.padEnd(12) +
                    ' | Conf: ' + r.confidence + '%' +
                    ' | 24h: ' + r.change24h.padStart(7) + '%');
        if (r.signals.length > 0) {
          console.log('    Signals: ' + r.signals.map(s => s.type).join(', '));
        }
      }
      console.log('');
    }

    const bearish = strongResults.filter(r => r.score < 0);
    if (bearish.length > 0) {
      console.log('--- BEARISH SIGNALS (SHORT) ---');
      for (const r of bearish) {
        console.log('  ' + r.symbol.padEnd(18) + ' Score: ' + r.score.toFixed(1).padStart(6) +
                    ' | Type: ' + r.type.padEnd(12) +
                    ' | Conf: ' + r.confidence + '%' +
                    ' | 24h: ' + r.change24h.padStart(7) + '%');
        if (r.signals.length > 0) {
          console.log('    Signals: ' + r.signals.map(s => s.type).join(', '));
        }
      }
      console.log('');
    }
  }

  console.log('='.repeat(70));
  console.log('Scan completed at ' + new Date().toISOString());
  console.log('Timeframe: 15min | Dual TF Alignment: DISABLED');
  console.log('='.repeat(70));
}

main().catch(console.error);
