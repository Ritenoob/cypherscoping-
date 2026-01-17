#!/usr/bin/env node
/**
 * KuCoin Futures Historical Data Fetcher
 *
 * Fetches OHLCV candle data from KuCoin Futures API
 * Stores locally in data/kucoin-ohlcv/
 *
 * Usage:
 *   npm run fetch-kucoin                           # Fetch all symbols, all timeframes
 *   npm run fetch-kucoin -- --symbol XBTUSDTM      # Fetch single symbol
 *   npm run fetch-kucoin -- --interval 15min       # Fetch single timeframe
 *   npm run fetch-kucoin -- --days 60              # Fetch 60 days
 *
 * KuCoin Futures API:
 *   Endpoint: https://api-futures.kucoin.com/api/v1/kline/query
 *   Rate Limit: 30 requests per 3 seconds (public)
 *   Max candles per request: 200
 *
 * Created: 2026-01-16
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// KuCoin Futures API
const KUCOIN_FUTURES_API = 'https://api-futures.kucoin.com';

// Default symbols (KuCoin perpetual futures)
const DEFAULT_SYMBOLS = [
  'XBTUSDTM',   // Bitcoin
  'ETHUSDTM',   // Ethereum
  'SOLUSDTM',   // Solana
  'XRPUSDTM',   // Ripple
  'DOGEUSDTM', // Dogecoin
  'BNBUSDTM'    // BNB
];

// Timeframes (KuCoin granularity in minutes)
const TIMEFRAMES = {
  '1min': 1,
  '5min': 5,
  '15min': 15,
  '30min': 30,
  '1hour': 60,
  '2hour': 120,
  '4hour': 240,
  '8hour': 480,
  '12hour': 720,
  '1day': 1440
};

// Output directory
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'kucoin-ohlcv');

/**
 * Fetch candles from KuCoin Futures API
 */
async function fetchCandles(symbol, granularity, startTime, endTime) {
  const candles = [];
  let currentStart = startTime;
  const maxCandlesPerRequest = 200;

  while (currentStart < endTime) {
    try {
      const response = await axios.get(`${KUCOIN_FUTURES_API}/api/v1/kline/query`, {
        params: {
          symbol,
          granularity,
          from: currentStart,
          to: Math.min(currentStart + maxCandlesPerRequest * granularity * 60 * 1000, endTime)
        },
        timeout: 10000
      });

      if (response.data.code === '200000' && response.data.data && response.data.data.length > 0) {
        for (const candle of response.data.data) {
          candles.push({
            ts: candle[0],                    // Timestamp (ms)
            open: parseFloat(candle[1]),      // Open
            high: parseFloat(candle[2]),      // High
            low: parseFloat(candle[3]),       // Low
            close: parseFloat(candle[4]),     // Close
            volume: parseFloat(candle[5])     // Volume
          });
        }

        // Move to next batch
        const lastTs = candles[candles.length - 1].ts;
        currentStart = lastTs + granularity * 60 * 1000;

        // Progress indicator
        const progress = ((currentStart - startTime) / (endTime - startTime) * 100).toFixed(1);
        process.stdout.write(`\r  Fetching: ${progress}% (${candles.length} candles)`);
      } else {
        // No more data or error
        break;
      }

      // Rate limit: 30 req/3s = 100ms between requests
      await sleep(120);

    } catch (error) {
      if (error.response?.status === 429) {
        console.log('\n  Rate limited, waiting 5s...');
        await sleep(5000);
      } else {
        console.error(`\n  Error fetching ${symbol}: ${error.message}`);
        break;
      }
    }
  }

  process.stdout.write('\n');
  return candles.sort((a, b) => a.ts - b.ts);
}

/**
 * Save candles to JSON file
 */
function saveCandles(symbol, interval, days, candles) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const filename = `${symbol}_${interval}_${days}d.json`;
  const filepath = path.join(OUTPUT_DIR, filename);

  const data = {
    symbol,
    interval,
    days,
    source: 'kucoin_futures',
    fetchedAt: new Date().toISOString(),
    candleCount: candles.length,
    startTime: candles.length > 0 ? new Date(candles[0].ts).toISOString() : null,
    endTime: candles.length > 0 ? new Date(candles[candles.length - 1].ts).toISOString() : null,
    priceRange: candles.length > 0 ? {
      low: Math.min(...candles.map(c => c.low)),
      high: Math.max(...candles.map(c => c.high))
    } : null,
    candles
  };

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    symbols: null,
    intervals: ['15min', '30min', '1hour'],
    days: 30
  };

  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];

    switch (key) {
      case 'symbol':
        config.symbols = [value];
        i++;
        break;
      case 'interval':
        config.intervals = [value];
        i++;
        break;
      case 'days':
        config.days = parseInt(value);
        i++;
        break;
      case 'all':
        config.intervals = Object.keys(TIMEFRAMES);
        break;
    }
  }

  if (!config.symbols) {
    config.symbols = DEFAULT_SYMBOLS;
  }

  return config;
}

/**
 * Main entry point
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('KUCOIN FUTURES HISTORICAL DATA FETCHER');
  console.log('='.repeat(60));

  const config = parseArgs();
  const endTime = Date.now();
  const startTime = endTime - config.days * 24 * 60 * 60 * 1000;

  console.log(`\nConfig:`);
  console.log(`  Symbols: ${config.symbols.join(', ')}`);
  console.log(`  Intervals: ${config.intervals.join(', ')}`);
  console.log(`  Days: ${config.days}`);
  console.log(`  Start: ${new Date(startTime).toISOString()}`);
  console.log(`  End: ${new Date(endTime).toISOString()}`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log('');

  const results = [];

  for (const symbol of config.symbols) {
    console.log(`\n[${symbol}]`);

    for (const interval of config.intervals) {
      const granularity = TIMEFRAMES[interval];
      if (!granularity) {
        console.log(`  Skipping unknown interval: ${interval}`);
        continue;
      }

      console.log(`  ${interval}:`);
      const candles = await fetchCandles(symbol, granularity, startTime, endTime);

      if (candles.length > 0) {
        const filepath = saveCandles(symbol, interval, config.days, candles);
        const priceRange = {
          low: Math.min(...candles.map(c => c.low)).toFixed(2),
          high: Math.max(...candles.map(c => c.high)).toFixed(2)
        };
        console.log(`  Saved: ${candles.length} candles ($${priceRange.low} - $${priceRange.high})`);

        results.push({
          symbol,
          interval,
          candles: candles.length,
          priceRange,
          file: path.basename(filepath)
        });
      } else {
        console.log(`  No data available`);
      }

      // Small delay between symbols/intervals
      await sleep(200);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const totalCandles = results.reduce((sum, r) => sum + r.candles, 0);
  console.log(`Total files: ${results.length}`);
  console.log(`Total candles: ${totalCandles.toLocaleString()}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);

  console.log('\nFiles created:');
  for (const r of results) {
    console.log(`  ${r.file} (${r.candles} candles)`);
  }

  console.log('\n' + '='.repeat(60));

  // Save summary
  const summaryPath = path.join(OUTPUT_DIR, '_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    fetchedAt: new Date().toISOString(),
    config,
    totalFiles: results.length,
    totalCandles,
    results
  }, null, 2));

  return results;
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { fetchCandles, saveCandles, TIMEFRAMES, DEFAULT_SYMBOLS };
