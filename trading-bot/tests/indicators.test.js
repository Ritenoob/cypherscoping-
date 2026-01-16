/**
 * Comprehensive Indicator Test Suite
 * 
 * Tests all 10 enhanced technical indicators for:
 * - Correct calculations
 * - Signal generation
 * - Edge cases
 * - Enhanced mode signals
 */

const {
  RSIIndicator,
  MACDIndicator,
  WilliamsRIndicator,
  AwesomeOscillator,
  StochasticIndicator,
  BollingerBands,
  EMATrend,
  KDJIndicator,
  OBVIndicator,
  DOMAnalyzer
} = require('../src/indicators');

function generateTestCandles(count, startPrice = 100, volatility = 0.02) {
  const candles = [];
  let price = startPrice;
  
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2 * volatility;
    price = price * (1 + change);
    
    const high = price * (1 + Math.random() * volatility);
    const low = price * (1 - Math.random() * volatility);
    const open = low + Math.random() * (high - low);
    const close = low + Math.random() * (high - low);
    const volume = 1000 + Math.random() * 9000;
    
    candles.push({
      ts: Date.now() + i * 60000,
      open,
      high,
      low,
      close,
      volume
    });
  }
  
  return candles;
}

function generateTrendingCandles(count, direction = 'up', strength = 0.01) {
  const candles = [];
  let price = 100;
  
  for (let i = 0; i < count; i++) {
    const trend = direction === 'up' ? strength : -strength;
    const noise = (Math.random() - 0.5) * 0.005;
    price = price * (1 + trend + noise);
    
    const range = price * 0.01;
    const high = price + range;
    const low = price - range;
    
    candles.push({
      ts: Date.now() + i * 60000,
      open: low + Math.random() * range,
      high,
      low,
      close: price,
      volume: 5000 + Math.random() * 5000
    });
  }
  
  return candles;
}

class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.results = [];
  }

  assert(condition, testName, details = '') {
    if (condition) {
      this.passed++;
      this.results.push({ name: testName, status: 'PASS' });
    } else {
      this.failed++;
      this.results.push({ name: testName, status: 'FAIL', details });
      console.error(`  FAIL: ${testName} - ${details}`);
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log(`Total:  ${this.passed + this.failed}`);
    console.log(`Success Rate: ${((this.passed / (this.passed + this.failed)) * 100).toFixed(1)}%`);
    console.log('='.repeat(60));
  }
}

async function testRSI(runner) {
  console.log('\n--- Testing RSI Indicator ---');
  
  const rsi = new RSIIndicator({ period: 14 });
  const candles = generateTestCandles(50);
  
  for (const candle of candles) {
    rsi.update({ close: candle.close });
  }
  
  const result = rsi.getResult();
  
  runner.assert(
    result.value >= 0 && result.value <= 100,
    'RSI value in valid range (0-100)',
    `Got: ${result.value}`
  );
  
  runner.assert(
    Array.isArray(result.signals),
    'RSI returns signals array'
  );
  
  const upCandles = generateTrendingCandles(30, 'up', 0.02);
  const rsiUp = new RSIIndicator({ period: 14 });
  for (const candle of upCandles) {
    rsiUp.update({ close: candle.close });
  }
  const upResult = rsiUp.getResult();
  
  runner.assert(
    upResult.value > 50,
    'RSI > 50 in uptrend',
    `Got: ${upResult.value}`
  );
  
  const downCandles = generateTrendingCandles(30, 'down', 0.02);
  const rsiDown = new RSIIndicator({ period: 14 });
  for (const candle of downCandles) {
    rsiDown.update({ close: candle.close });
  }
  const downResult = rsiDown.getResult();
  
  runner.assert(
    downResult.value < 50,
    'RSI < 50 in downtrend',
    `Got: ${downResult.value}`
  );
}

async function testMACD(runner) {
  console.log('\n--- Testing MACD Indicator ---');
  
  const macd = new MACDIndicator({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
  const candles = generateTestCandles(50);
  
  for (const candle of candles) {
    macd.update({ close: candle.close });
  }
  
  const result = macd.getResult();
  
  runner.assert(
    typeof result.value === 'object',
    'MACD returns object with components'
  );
  
  runner.assert(
    'macd' in result.value && 'signal' in result.value && 'histogram' in result.value,
    'MACD has macd, signal, histogram properties'
  );
  
  runner.assert(
    Array.isArray(result.signals),
    'MACD returns signals array'
  );
}

async function testWilliamsR(runner) {
  console.log('\n--- Testing Williams %R Indicator ---');
  
  const wr = new WilliamsRIndicator({ period: 14 });
  const candles = generateTestCandles(30);
  
  for (const candle of candles) {
    wr.update(candle);
  }
  
  const result = wr.getResult();
  
  runner.assert(
    result.value >= -100 && result.value <= 0,
    'Williams %R in valid range (-100 to 0)',
    `Got: ${result.value}`
  );
  
  runner.assert(
    Array.isArray(result.signals),
    'Williams %R returns signals array'
  );
}

async function testAwesomeOscillator(runner) {
  console.log('\n--- Testing Awesome Oscillator ---');
  
  const ao = new AwesomeOscillator({ fastPeriod: 5, slowPeriod: 34 });
  const candles = generateTestCandles(50);
  
  for (const candle of candles) {
    ao.update(candle);
  }
  
  const result = ao.getResult();
  
  runner.assert(
    typeof result.value === 'number',
    'AO returns numeric value'
  );
  
  runner.assert(
    Array.isArray(result.signals),
    'AO returns signals array'
  );
}

async function testStochastic(runner) {
  console.log('\n--- Testing Stochastic Indicator ---');
  
  const stoch = new StochasticIndicator({ kPeriod: 14, dPeriod: 3, smooth: 3 });
  const candles = generateTestCandles(30);
  
  for (const candle of candles) {
    stoch.update(candle);
  }
  
  const result = stoch.getResult();
  
  runner.assert(
    typeof result.value === 'object',
    'Stochastic returns object'
  );
  
  runner.assert(
    result.value.k >= 0 && result.value.k <= 100,
    'Stochastic K in valid range (0-100)',
    `Got K: ${result.value.k}`
  );
  
  runner.assert(
    result.value.d >= 0 && result.value.d <= 100,
    'Stochastic D in valid range (0-100)',
    `Got D: ${result.value.d}`
  );
}

async function testBollingerBands(runner) {
  console.log('\n--- Testing Bollinger Bands ---');
  
  const bb = new BollingerBands({ period: 20, stdDev: 2 });
  const candles = generateTestCandles(40);
  
  for (const candle of candles) {
    bb.update({ close: candle.close });
  }
  
  const result = bb.getResult();
  
  runner.assert(
    typeof result.value === 'object',
    'Bollinger returns object'
  );
  
  runner.assert(
    result.value.upper > result.value.middle && result.value.middle > result.value.lower,
    'Bollinger bands in correct order (upper > middle > lower)',
    `Got upper: ${result.value.upper}, middle: ${result.value.middle}, lower: ${result.value.lower}`
  );
  
  runner.assert(
    result.value.bandwidth > 0,
    'Bollinger bandwidth is positive'
  );
}

async function testEMATrend(runner) {
  console.log('\n--- Testing EMA Trend ---');
  
  const ema = new EMATrend({ shortPeriod: 9, mediumPeriod: 21, longPeriod: 50 });
  const candles = generateTestCandles(70);
  
  for (const candle of candles) {
    ema.update({ close: candle.close });
  }
  
  const result = ema.getResult();
  
  runner.assert(
    typeof result.value === 'object',
    'EMA Trend returns object'
  );
  
  runner.assert(
    'emaShort' in result.value && 'emaMedium' in result.value && 'emaLong' in result.value,
    'EMA Trend has all EMA components'
  );
  
  runner.assert(
    Array.isArray(result.signals),
    'EMA Trend returns signals array'
  );
}

async function testKDJ(runner) {
  console.log('\n--- Testing KDJ Indicator ---');
  
  const kdj = new KDJIndicator({ kPeriod: 9, dPeriod: 3, smooth: 3 });
  const candles = generateTestCandles(30);
  
  for (const candle of candles) {
    kdj.update(candle);
  }
  
  const result = kdj.getResult();
  
  runner.assert(
    typeof result.value === 'object',
    'KDJ returns object'
  );
  
  runner.assert(
    'k' in result.value && 'd' in result.value && 'j' in result.value,
    'KDJ has K, D, J components'
  );
  
  runner.assert(
    Array.isArray(result.signals),
    'KDJ returns signals array'
  );
}

async function testOBV(runner) {
  console.log('\n--- Testing OBV Indicator ---');
  
  const obv = new OBVIndicator({ slopeWindow: 14 });
  const candles = generateTestCandles(30);
  
  for (const candle of candles) {
    obv.update(candle);
  }
  
  const result = obv.getResult();
  
  runner.assert(
    typeof result.value === 'object',
    'OBV returns object'
  );
  
  runner.assert(
    'obv' in result.value,
    'OBV has obv property'
  );
  
  runner.assert(
    Array.isArray(result.signals),
    'OBV returns signals array'
  );
}

async function testDOMAnalyzer(runner) {
  console.log('\n--- Testing DOM Analyzer ---');
  
  const dom = new DOMAnalyzer({ depthLevels: [5, 10] });
  
  const orderbook = {
    bids: Array(10).fill(null).map((_, i) => ({
      price: 100 - i * 0.1,
      size: 1000 + Math.random() * 2000
    })),
    asks: Array(10).fill(null).map((_, i) => ({
      price: 100.1 + i * 0.1,
      size: 1000 + Math.random() * 2000
    }))
  };
  
  const resultNotLive = dom.update(orderbook);
  
  runner.assert(
    resultNotLive.signals.length === 0,
    'DOM returns no signals when not in live mode'
  );
  
  dom.enableLiveMode();
  const resultLive = dom.update(orderbook);
  
  runner.assert(
    typeof resultLive.value === 'object',
    'DOM returns object in live mode'
  );
  
  runner.assert(
    'bidVolume' in resultLive.value || 'totalBidVolume' in resultLive.value,
    'DOM has volume data'
  );
}

async function runAllTests() {
  console.log('Starting Indicator Test Suite\n');
  console.log('='.repeat(60));
  
  const runner = new TestRunner();
  
  try {
    await testRSI(runner);
    await testMACD(runner);
    await testWilliamsR(runner);
    await testAwesomeOscillator(runner);
    await testStochastic(runner);
    await testBollingerBands(runner);
    await testEMATrend(runner);
    await testKDJ(runner);
    await testOBV(runner);
    await testDOMAnalyzer(runner);
  } catch (error) {
    console.error('Test execution error:', error);
    runner.failed++;
  }
  
  runner.printSummary();
  
  process.exit(runner.failed > 0 ? 1 : 0);
}

runAllTests();
