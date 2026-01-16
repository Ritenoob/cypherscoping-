#!/usr/bin/env node
/**
 * Paper Trading Entry Point
 *
 * Starts the trading engine in paper mode with real-time market data.
 * Uses SignalGeneratorV2 with optimized weights for signal generation.
 *
 * Usage: node scripts/start-paper-trading.js [options]
 *   --symbols XBTUSDTM,ETHUSDTM  Comma-separated symbols to trade
 *   --balance 10000              Initial paper balance
 *   --timeframe 15min            Primary timeframe
 */

require('dotenv').config();
const WebSocket = require('ws');
const axios = require('axios');

const TradingEngineV3 = require('../src/trading/TradingEngineV3');
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

const KUCOIN_REST = 'https://api-futures.kucoin.com';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    symbols: (process.env.DEFAULT_SYMBOLS || 'XBTUSDTM,ETHUSDTM,SOLUSDTM').split(','),
    balance: parseFloat(process.env.INITIAL_BALANCE) || 10000,
    timeframe: process.env.PRIMARY_TIMEFRAME || '15min'
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];

    switch (key) {
      case 'symbols':
        config.symbols = value.split(',');
        break;
      case 'balance':
        config.balance = parseFloat(value);
        break;
      case 'timeframe':
        config.timeframe = value;
        break;
    }
  }

  return config;
}

// Initialize indicators for a symbol
function createIndicators() {
  return {
    rsi: new RSIIndicator({
      period: parseInt(process.env.RSI_PERIOD) || 14,
      oversold: parseInt(process.env.RSI_OVERSOLD) || 35,
      overbought: parseInt(process.env.RSI_OVERBOUGHT) || 65
    }),
    macd: new MACDIndicator({
      fastPeriod: parseInt(process.env.MACD_FAST) || 12,
      slowPeriod: parseInt(process.env.MACD_SLOW) || 26,
      signalPeriod: parseInt(process.env.MACD_SIGNAL) || 9
    }),
    bollinger: new BollingerBands({
      period: parseInt(process.env.BOLLINGER_PERIOD) || 20,
      stdDev: parseFloat(process.env.BOLLINGER_STDDEV) || 2.5
    }),
    emaTrend: new EMATrend({
      shortPeriod: parseInt(process.env.EMA_SHORT) || 9,
      mediumPeriod: parseInt(process.env.EMA_MEDIUM) || 21,
      longPeriod: parseInt(process.env.EMA_LONG) || 50
    }),
    williamsR: new WilliamsRIndicator({
      period: parseInt(process.env.WILLIAMS_PERIOD) || 14,
      oversold: parseInt(process.env.WILLIAMS_OVERSOLD) || -85,
      overbought: parseInt(process.env.WILLIAMS_OVERBOUGHT) || -15
    }),
    ao: new AwesomeOscillator({
      fastPeriod: parseInt(process.env.AO_FAST) || 5,
      slowPeriod: parseInt(process.env.AO_SLOW) || 34
    }),
    stochastic: new StochasticIndicator({
      kPeriod: 14,
      dPeriod: 3,
      smooth: 3
    }),
    kdj: new KDJIndicator({
      kPeriod: parseInt(process.env.KDJ_K_PERIOD) || 21,
      dPeriod: parseInt(process.env.KDJ_D_PERIOD) || 3,
      smooth: parseInt(process.env.KDJ_SMOOTH) || 3
    }),
    obv: new OBVIndicator({
      slopeWindow: parseInt(process.env.OBV_SLOPE_WINDOW) || 10,
      smoothingEma: parseInt(process.env.OBV_SMOOTHING) || 5
    })
  };
}

// Get WebSocket token
async function getWsToken() {
  try {
    const response = await axios.post(`${KUCOIN_REST}/api/v1/bullet-public`);
    if (response.data.code === '200000') {
      return response.data.data;
    }
    throw new Error('Failed to get WebSocket token');
  } catch (error) {
    console.error('Error getting WebSocket token:', error.message);
    throw error;
  }
}

// Fetch initial candles for warmup
async function fetchInitialCandles(symbol, timeframe, count = 250) {
  const granularity = {
    '1min': 1, '5min': 5, '15min': 15, '30min': 30,
    '1hour': 60, '4hour': 240, '1day': 1440
  }[timeframe] || 15;

  const endTime = Date.now();
  const startTime = endTime - count * granularity * 60 * 1000;

  try {
    const response = await axios.get(`${KUCOIN_REST}/api/v1/kline/query`, {
      params: {
        symbol,
        granularity,
        from: startTime,
        to: endTime
      }
    });

    if (response.data.code === '200000' && response.data.data) {
      return response.data.data.map(c => ({
        ts: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5])
      })).sort((a, b) => a.ts - b.ts);
    }

    return [];
  } catch (error) {
    console.error(`Error fetching candles for ${symbol}:`, error.message);
    return [];
  }
}

// Main function
async function main() {
  const config = parseArgs();

  console.log('\n' + '='.repeat(60));
  console.log('PAPER TRADING ENGINE V3');
  console.log('='.repeat(60));
  console.log(`Symbols: ${config.symbols.join(', ')}`);
  console.log(`Initial Balance: $${config.balance}`);
  console.log(`Timeframe: ${config.timeframe}`);
  console.log(`Mode: PAPER (Simulated Trading)`);
  console.log('='.repeat(60) + '\n');

  // Create trading engine
  const engine = new TradingEngineV3({
    mode: 'paper',
    initialBalance: config.balance
  });

  // Symbol state tracking
  const symbolState = new Map();

  // Initialize indicators and fetch warmup data for each symbol
  console.log('Initializing indicators and fetching warmup data...\n');

  for (const symbol of config.symbols) {
    console.log(`  ${symbol}: Fetching initial data...`);

    const indicators = createIndicators();
    const candles = await fetchInitialCandles(symbol, config.timeframe);

    console.log(`  ${symbol}: Warming up indicators with ${candles.length} candles...`);

    // Warm up indicators
    for (const candle of candles) {
      const candleData = {
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      };

      for (const [name, indicator] of Object.entries(indicators)) {
        indicator.update(candleData);
      }
    }

    symbolState.set(symbol, {
      indicators,
      lastCandle: candles[candles.length - 1] || null,
      candleBuffer: candles.slice(-100)
    });

    console.log(`  ${symbol}: Ready`);

    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\nConnecting to WebSocket...');

  // Get WebSocket token
  const wsToken = await getWsToken();
  const wsEndpoint = wsToken.instanceServers[0].endpoint;
  const connectId = Date.now();

  // Connect to WebSocket
  const ws = new WebSocket(`${wsEndpoint}?token=${wsToken.token}&connectId=${connectId}`);

  ws.on('open', () => {
    console.log('WebSocket connected\n');

    // Subscribe to candle data for each symbol
    for (const symbol of config.symbols) {
      const subMessage = {
        id: Date.now(),
        type: 'subscribe',
        topic: `/contractMarket/candle:${symbol}_${config.timeframe}`,
        response: true
      };
      ws.send(JSON.stringify(subMessage));
    }

    // Start engine
    engine.start();
    console.log('Paper trading started. Press Ctrl+C to stop.\n');
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Handle ping
      if (message.type === 'pong') return;

      // Handle candle data
      if (message.topic && message.topic.includes('/contractMarket/candle:')) {
        const symbolMatch = message.topic.match(/candle:([A-Z]+)/);
        if (!symbolMatch) return;

        const symbol = symbolMatch[1];
        const state = symbolState.get(symbol);
        if (!state) return;

        const candle = message.data?.candles;
        if (!candle || candle.length < 6) return;

        const candleData = {
          ts: candle[0],
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5])
        };

        // Check if new candle
        const isNewCandle = !state.lastCandle || candleData.ts !== state.lastCandle.ts;

        if (isNewCandle && state.lastCandle) {
          // Update indicators with closed candle
          const closedCandle = {
            high: state.lastCandle.high,
            low: state.lastCandle.low,
            close: state.lastCandle.close,
            volume: state.lastCandle.volume
          };

          const indicatorResults = {};
          for (const [name, indicator] of Object.entries(state.indicators)) {
            indicatorResults[name] = indicator.update(closedCandle);
          }

          // Process update in trading engine
          const result = await engine.processUpdate(symbol, {
            candle: state.lastCandle,
            indicators: indicatorResults
          });

          if (result && result.signal) {
            const sig = result.signal;
            const pos = result.position;

            // Log signal if significant
            if (Math.abs(sig.score) >= 40) {
              console.log(`[${new Date().toISOString()}] ${symbol}: Score=${sig.score} Type=${sig.type} Conf=${sig.confidence}%`);
            }

            // Log position updates
            if (pos) {
              console.log(`  Position: ${pos.side.toUpperCase()} ROI=${pos.unrealizedROI?.toFixed(2) || 0}%`);
            }
          }
        }

        // Update current candle
        state.lastCandle = candleData;
      }
    } catch (error) {
      // Silent fail on parse errors
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });

  ws.on('close', () => {
    console.log('WebSocket disconnected');
    engine.stop();
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping', id: Date.now() }));
    }
  }, 18000);

  // Status update every 5 minutes
  const statusInterval = setInterval(() => {
    const metrics = engine.getMetrics();
    console.log('\n' + '-'.repeat(40));
    console.log('STATUS UPDATE');
    console.log('-'.repeat(40));
    console.log(`Balance: $${metrics.balance.toFixed(2)} (${metrics.totalReturn >= 0 ? '+' : ''}${metrics.totalReturn.toFixed(2)}%)`);
    console.log(`Trades: ${metrics.totalTrades} | Win Rate: ${metrics.winRate}% | PF: ${metrics.profitFactor}`);
    console.log(`Active Positions: ${metrics.activePositions}`);
    console.log('-'.repeat(40) + '\n');
  }, 300000);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');

    clearInterval(heartbeat);
    clearInterval(statusInterval);

    // Close all positions
    await engine.closeAllPositions('SHUTDOWN');

    // Final report
    const metrics = engine.getMetrics();
    console.log('\n' + '='.repeat(60));
    console.log('FINAL REPORT');
    console.log('='.repeat(60));
    console.log(`Final Balance: $${metrics.balance.toFixed(2)}`);
    console.log(`Total Return: ${metrics.totalReturn >= 0 ? '+' : ''}${metrics.totalReturn.toFixed(2)}%`);
    console.log(`Total Trades: ${metrics.totalTrades}`);
    console.log(`Win Rate: ${metrics.winRate}%`);
    console.log(`Profit Factor: ${metrics.profitFactor}`);
    console.log(`Max Drawdown: ${metrics.maxDrawdown}%`);
    console.log('='.repeat(60));

    ws.close();
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
