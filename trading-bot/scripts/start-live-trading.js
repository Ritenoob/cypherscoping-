#!/usr/bin/env node
/**
 * Live Trading Entry Point
 *
 * DANGER: This script trades with REAL MONEY.
 * Make sure you understand the risks before running.
 *
 * SAFETY REQUIREMENTS:
 * 1. ENABLE_LIVE_TRADING=true must be set in .env
 * 2. Valid KuCoin API credentials required
 * 3. API must have Futures trading permission
 *
 * Usage: node scripts/start-live-trading.js [options]
 *   --symbols XBTUSDTM,ETHUSDTM  Comma-separated symbols to trade
 *   --timeframe 15min            Primary timeframe
 *   --confirm                    Required flag to confirm live trading
 */

require('dotenv').config();
const WebSocket = require('ws');
const axios = require('axios');
const crypto = require('crypto');
const readline = require('readline');

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

// ANSI color codes
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    symbols: (process.env.DEFAULT_SYMBOLS || 'XBTUSDTM,ETHUSDTM').split(','),
    timeframe: process.env.PRIMARY_TIMEFRAME || '15min',
    confirm: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--confirm') {
      config.confirm = true;
    } else if (arg === '--symbols' && args[i + 1]) {
      config.symbols = args[i + 1].split(',');
      i++;
    } else if (arg === '--timeframe' && args[i + 1]) {
      config.timeframe = args[i + 1];
      i++;
    }
  }

  return config;
}

// Safety checks
function runSafetyChecks() {
  const errors = [];

  // Check live trading enabled
  if (process.env.ENABLE_LIVE_TRADING !== 'true') {
    errors.push('ENABLE_LIVE_TRADING is not set to true in .env');
  }

  // Check API credentials
  if (!process.env.KUCOIN_API_KEY) {
    errors.push('KUCOIN_API_KEY is not set');
  }
  if (!process.env.KUCOIN_API_SECRET) {
    errors.push('KUCOIN_API_SECRET is not set');
  }
  if (!process.env.KUCOIN_API_PASSPHRASE) {
    errors.push('KUCOIN_API_PASSPHRASE is not set');
  }

  return errors;
}

// Verify API connection and permissions
async function verifyAPIConnection() {
  const apiKey = process.env.KUCOIN_API_KEY;
  const apiSecret = process.env.KUCOIN_API_SECRET;
  const apiPassphrase = process.env.KUCOIN_API_PASSPHRASE;
  const apiVersion = process.env.KUCOIN_API_VERSION || '2';

  const timestamp = Date.now().toString();
  const endpoint = '/api/v1/account-overview';
  const method = 'GET';

  const signString = timestamp + method + endpoint;
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(signString)
    .digest('base64');

  let passphrase = apiPassphrase;
  if (apiVersion === '2') {
    passphrase = crypto
      .createHmac('sha256', apiSecret)
      .update(apiPassphrase)
      .digest('base64');
  }

  try {
    const response = await axios.get(`${KUCOIN_REST}${endpoint}`, {
      headers: {
        'KC-API-KEY': apiKey,
        'KC-API-SIGN': signature,
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-PASSPHRASE': passphrase,
        'KC-API-KEY-VERSION': apiVersion
      },
      timeout: 10000
    });

    if (response.data.code === '200000') {
      return {
        success: true,
        balance: response.data.data
      };
    }

    return { success: false, error: response.data.msg };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// User confirmation prompt
async function confirmLiveTrading(balance) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log(`\n${RED}${'='.repeat(60)}${RESET}`);
    console.log(`${RED}WARNING: LIVE TRADING MODE${RESET}`);
    console.log(`${RED}${'='.repeat(60)}${RESET}`);
    console.log(`\nAccount Balance: $${balance?.accountEquity || 'Unknown'}`);
    console.log(`Available Balance: $${balance?.availableBalance || 'Unknown'}`);
    console.log(`\n${YELLOW}You are about to trade with REAL MONEY.${RESET}`);
    console.log(`${YELLOW}Losses are possible and can be significant.${RESET}`);
    console.log(`\nRisk Settings:`);
    console.log(`  - Max Position Size: $${process.env.MAX_POSITION_SIZE_USD || 5000}`);
    console.log(`  - Max Leverage: ${process.env.LEVERAGE_MAX || 15}x`);
    console.log(`  - Stop Loss ROI: ${process.env.STOP_LOSS_ROI || 10}%`);
    console.log(`  - Take Profit ROI: ${process.env.TAKE_PROFIT_ROI || 30}%`);

    rl.question(`\n${RED}Type "I UNDERSTAND THE RISKS" to continue: ${RESET}`, (answer) => {
      rl.close();
      resolve(answer === 'I UNDERSTAND THE RISKS');
    });
  });
}

// Initialize indicators
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

// Get authenticated WebSocket token
async function getWsToken() {
  const apiKey = process.env.KUCOIN_API_KEY;
  const apiSecret = process.env.KUCOIN_API_SECRET;
  const apiPassphrase = process.env.KUCOIN_API_PASSPHRASE;
  const apiVersion = process.env.KUCOIN_API_VERSION || '2';

  const timestamp = Date.now().toString();
  const endpoint = '/api/v1/bullet-private';
  const method = 'POST';

  const signString = timestamp + method + endpoint;
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(signString)
    .digest('base64');

  let passphrase = apiPassphrase;
  if (apiVersion === '2') {
    passphrase = crypto
      .createHmac('sha256', apiSecret)
      .update(apiPassphrase)
      .digest('base64');
  }

  const response = await axios.post(`${KUCOIN_REST}${endpoint}`, {}, {
    headers: {
      'KC-API-KEY': apiKey,
      'KC-API-SIGN': signature,
      'KC-API-TIMESTAMP': timestamp,
      'KC-API-PASSPHRASE': passphrase,
      'KC-API-KEY-VERSION': apiVersion
    }
  });

  if (response.data.code === '200000') {
    return response.data.data;
  }
  throw new Error('Failed to get WebSocket token');
}

// Fetch initial candles
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
  console.log(`${RED}LIVE TRADING ENGINE V3${RESET}`);
  console.log('='.repeat(60));

  // Run safety checks
  const safetyErrors = runSafetyChecks();
  if (safetyErrors.length > 0) {
    console.error(`\n${RED}Safety checks failed:${RESET}`);
    for (const error of safetyErrors) {
      console.error(`  - ${error}`);
    }
    console.error(`\nPlease fix these issues before running live trading.`);
    process.exit(1);
  }

  // Check --confirm flag
  if (!config.confirm) {
    console.error(`\n${RED}ERROR: --confirm flag required for live trading${RESET}`);
    console.error(`\nRun with: node scripts/start-live-trading.js --confirm`);
    process.exit(1);
  }

  // Verify API connection
  console.log('\nVerifying API connection...');
  const apiResult = await verifyAPIConnection();

  if (!apiResult.success) {
    console.error(`\n${RED}API verification failed: ${apiResult.error}${RESET}`);
    process.exit(1);
  }

  console.log(`${GREEN}API connection verified${RESET}`);

  // User confirmation
  const confirmed = await confirmLiveTrading(apiResult.balance);
  if (!confirmed) {
    console.log('\nLive trading cancelled.');
    process.exit(0);
  }

  console.log(`\n${GREEN}Starting live trading...${RESET}`);
  console.log(`Symbols: ${config.symbols.join(', ')}`);
  console.log(`Timeframe: ${config.timeframe}`);
  console.log('='.repeat(60) + '\n');

  // Create trading engine in live mode
  const engine = new TradingEngineV3({
    mode: 'live'
  });

  // Symbol state tracking
  const symbolState = new Map();

  // Initialize indicators and fetch warmup data
  console.log('Initializing indicators...\n');

  for (const symbol of config.symbols) {
    console.log(`  ${symbol}: Fetching initial data...`);

    const indicators = createIndicators();
    const candles = await fetchInitialCandles(symbol, config.timeframe);

    console.log(`  ${symbol}: Warming up with ${candles.length} candles...`);

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
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\nConnecting to authenticated WebSocket...');

  // Get private WebSocket token
  const wsToken = await getWsToken();
  const wsEndpoint = wsToken.instanceServers[0].endpoint;
  const connectId = Date.now();

  const ws = new WebSocket(`${wsEndpoint}?token=${wsToken.token}&connectId=${connectId}`);

  ws.on('open', () => {
    console.log(`${GREEN}WebSocket connected${RESET}\n`);

    // Subscribe to candle data
    for (const symbol of config.symbols) {
      ws.send(JSON.stringify({
        id: Date.now(),
        type: 'subscribe',
        topic: `/contractMarket/candle:${symbol}_${config.timeframe}`,
        response: true
      }));
    }

    // Subscribe to position updates
    ws.send(JSON.stringify({
      id: Date.now(),
      type: 'subscribe',
      topic: '/contractAccount/wallet',
      response: true
    }));

    // Start engine
    engine.start();
    console.log(`${GREEN}Live trading started.${RESET} Press Ctrl+C to stop.\n`);
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

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

        const isNewCandle = !state.lastCandle || candleData.ts !== state.lastCandle.ts;

        if (isNewCandle && state.lastCandle) {
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

          // Process in trading engine
          const result = await engine.processUpdate(symbol, {
            candle: state.lastCandle,
            indicators: indicatorResults
          });

          if (result && result.signal) {
            const sig = result.signal;
            const pos = result.position;

            if (Math.abs(sig.score) >= 60) {
              console.log(`[${new Date().toISOString()}] ${symbol}: Score=${sig.score} Type=${sig.type} Conf=${sig.confidence}%`);
            }

            if (pos) {
              const roiColor = pos.unrealizedROI >= 0 ? GREEN : RED;
              console.log(`  Position: ${pos.side.toUpperCase()} ROI=${roiColor}${pos.unrealizedROI?.toFixed(2) || 0}%${RESET}`);
            }
          }
        }

        state.lastCandle = candleData;
      }

      // Handle wallet updates
      if (message.topic === '/contractAccount/wallet') {
        const balance = message.data;
        if (balance) {
          console.log(`[WALLET] Balance: $${balance.availableBalance || balance.balance}`);
        }
      }

    } catch (error) {
      // Silent fail
    }
  });

  ws.on('error', (error) => {
    console.error(`${RED}WebSocket error: ${error.message}${RESET}`);
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

  // Status update every minute
  const statusInterval = setInterval(() => {
    const metrics = engine.getMetrics();
    const positions = engine.getPositions();

    console.log('\n' + '-'.repeat(40));
    console.log('STATUS UPDATE');
    console.log('-'.repeat(40));
    console.log(`Trades: ${metrics.totalTrades} | Win Rate: ${metrics.winRate}%`);
    console.log(`Active Positions: ${positions.length}`);
    for (const pos of positions) {
      const roiColor = pos.unrealizedROI >= 0 ? GREEN : RED;
      console.log(`  ${pos.symbol}: ${pos.side.toUpperCase()} ROI=${roiColor}${pos.unrealizedROI.toFixed(2)}%${RESET}`);
    }
    console.log('-'.repeat(40) + '\n');
  }, 60000);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down live trading...');

    clearInterval(heartbeat);
    clearInterval(statusInterval);

    // Close all positions
    console.log('Closing all positions...');
    await engine.closeAllPositions('SHUTDOWN');

    const metrics = engine.getMetrics();
    console.log('\n' + '='.repeat(60));
    console.log('FINAL REPORT');
    console.log('='.repeat(60));
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
  console.error(`${RED}Fatal error: ${error.message}${RESET}`);
  process.exit(1);
});
