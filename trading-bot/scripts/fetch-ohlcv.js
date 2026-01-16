#!/usr/bin/env node
/**
 * OHLCV Data Fetcher for Binance Perpetual Futures
 *
 * Fetches historical candlestick data and saves locally for backtesting.
 *
 * Usage:
 *   node scripts/fetch-ohlcv.js                     # Fetch all configured coins
 *   node scripts/fetch-ohlcv.js --symbol BTCUSDT   # Fetch specific coin
 *   node scripts/fetch-ohlcv.js --days 60          # Fetch 60 days of data
 *   node scripts/fetch-ohlcv.js --interval 1h      # Use 1-hour candles
 *
 * Created: 2026-01-16
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Binance Perpetual Futures API
const BINANCE_FUTURES_API = 'https://fapi.binance.com';

// Default configuration
const CONFIG = {
  // Target coins for optimization
  symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'],

  // Timeframe intervals to fetch
  intervals: ['15m', '1h', '4h'],

  // Days of historical data
  days: 30,

  // Max candles per request (Binance limit is 1500)
  maxCandlesPerRequest: 1500,

  // Rate limit delay (ms between requests)
  rateLimitDelay: 100,

  // Output directory
  outputDir: path.join(__dirname, '..', 'data', 'ohlcv')
};

// Interval to milliseconds mapping
const INTERVAL_MS = {
  '1m': 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000
};

/**
 * Fetch candles from Binance Futures API
 */
async function fetchCandles(symbol, interval, startTime, endTime) {
  const url = `${BINANCE_FUTURES_API}/fapi/v1/klines`;

  try {
    const response = await axios.get(url, {
      params: {
        symbol,
        interval,
        startTime,
        endTime,
        limit: CONFIG.maxCandlesPerRequest
      },
      timeout: 10000
    });

    // Transform Binance format to our standard format
    // Binance: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote, ignore]
    return response.data.map(candle => ({
      ts: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
      quoteVolume: parseFloat(candle[7]),
      trades: candle[8],
      takerBuyVolume: parseFloat(candle[9])
    }));
  } catch (error) {
    console.error(`Error fetching ${symbol} ${interval}:`, error.message);
    return [];
  }
}

/**
 * Fetch all historical data for a symbol with pagination
 */
async function fetchAllCandles(symbol, interval, days) {
  const intervalMs = INTERVAL_MS[interval];
  if (!intervalMs) {
    console.error(`Unknown interval: ${interval}`);
    return [];
  }

  const endTime = Date.now();
  const startTime = endTime - (days * 24 * 60 * 60 * 1000);

  console.log(`  Fetching ${symbol} ${interval} from ${new Date(startTime).toISOString().split('T')[0]} to ${new Date(endTime).toISOString().split('T')[0]}`);

  const allCandles = [];
  let currentStart = startTime;
  let requestCount = 0;

  while (currentStart < endTime) {
    const candles = await fetchCandles(symbol, interval, currentStart, endTime);

    if (candles.length === 0) {
      break;
    }

    allCandles.push(...candles);
    requestCount++;

    // Move start time to after last candle
    const lastTs = candles[candles.length - 1].ts;
    currentStart = lastTs + intervalMs;

    // Progress indicator
    const progress = Math.min(100, Math.round(((currentStart - startTime) / (endTime - startTime)) * 100));
    process.stdout.write(`\r    Progress: ${progress}% (${allCandles.length} candles, ${requestCount} requests)`);

    // Rate limiting
    await new Promise(r => setTimeout(r, CONFIG.rateLimitDelay));
  }

  console.log(''); // New line after progress

  // Remove duplicates and sort by timestamp
  const uniqueCandles = [];
  const seenTs = new Set();

  for (const candle of allCandles) {
    if (!seenTs.has(candle.ts)) {
      seenTs.add(candle.ts);
      uniqueCandles.push(candle);
    }
  }

  return uniqueCandles.sort((a, b) => a.ts - b.ts);
}

/**
 * Save candles to JSON file
 */
function saveCandles(symbol, interval, candles) {
  // Ensure output directory exists
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  const filename = `${symbol}_${interval}_${CONFIG.days}d.json`;
  const filepath = path.join(CONFIG.outputDir, filename);

  const data = {
    symbol,
    interval,
    days: CONFIG.days,
    source: 'binance_futures',
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
  console.log(`    Saved: ${filepath} (${candles.length} candles)`);

  return filepath;
}

/**
 * Generate summary statistics
 */
function generateSummary(results) {
  const summaryPath = path.join(CONFIG.outputDir, 'fetch_summary.json');

  const summary = {
    fetchedAt: new Date().toISOString(),
    config: {
      symbols: CONFIG.symbols,
      intervals: CONFIG.intervals,
      days: CONFIG.days
    },
    results: results.map(r => ({
      symbol: r.symbol,
      interval: r.interval,
      candles: r.candles,
      file: r.file,
      priceRange: r.priceRange
    })),
    totalCandles: results.reduce((sum, r) => sum + r.candles, 0),
    totalFiles: results.length
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\nSummary saved: ${summaryPath}`);

  return summary;
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];

    switch (key) {
      case 'symbol':
        CONFIG.symbols = [value.toUpperCase()];
        break;
      case 'symbols':
        CONFIG.symbols = value.split(',').map(s => s.trim().toUpperCase());
        break;
      case 'interval':
        CONFIG.intervals = [value];
        break;
      case 'intervals':
        CONFIG.intervals = value.split(',').map(s => s.trim());
        break;
      case 'days':
        CONFIG.days = parseInt(value);
        break;
      case 'output':
        CONFIG.outputDir = value;
        break;
    }
  }

  return CONFIG;
}

/**
 * Main execution
 */
async function main() {
  parseArgs();

  console.log('\n' + '='.repeat(60));
  console.log('OHLCV DATA FETCHER - Binance Perpetual Futures');
  console.log('='.repeat(60));
  console.log(`Symbols:   ${CONFIG.symbols.join(', ')}`);
  console.log(`Intervals: ${CONFIG.intervals.join(', ')}`);
  console.log(`Days:      ${CONFIG.days}`);
  console.log(`Output:    ${CONFIG.outputDir}`);
  console.log('='.repeat(60) + '\n');

  const results = [];

  for (const symbol of CONFIG.symbols) {
    console.log(`\n[${symbol}]`);

    for (const interval of CONFIG.intervals) {
      const candles = await fetchAllCandles(symbol, interval, CONFIG.days);

      if (candles.length > 0) {
        const filepath = saveCandles(symbol, interval, candles);

        results.push({
          symbol,
          interval,
          candles: candles.length,
          file: filepath,
          priceRange: {
            low: Math.min(...candles.map(c => c.low)),
            high: Math.max(...candles.map(c => c.high))
          }
        });
      } else {
        console.log(`    No data retrieved for ${symbol} ${interval}`);
      }
    }
  }

  // Generate summary
  const summary = generateSummary(results);

  console.log('\n' + '='.repeat(60));
  console.log('FETCH COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total files: ${summary.totalFiles}`);
  console.log(`Total candles: ${summary.totalCandles}`);
  console.log('='.repeat(60) + '\n');

  return results;
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { fetchCandles, fetchAllCandles, saveCandles, CONFIG };
