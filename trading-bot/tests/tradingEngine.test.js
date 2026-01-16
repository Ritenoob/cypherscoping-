/**
 * TradingEngineV3 Test Suite
 *
 * Tests the trading engine for:
 * - Paper trading mode
 * - Entry requirements validation
 * - Position management
 * - Risk calculations
 * - Break-even and trailing stop
 */

const TradingEngineV3 = require('../src/trading/TradingEngineV3');
const SignalGeneratorV2 = require('../src/lib/SignalGeneratorV2');

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

// Create bullish indicators with strong signals
function createBullishIndicators() {
  return {
    rsi: {
      value: 25,
      signals: [
        { type: 'bullish_divergence', direction: 'bullish', strength: 'very_strong', message: 'RSI bullish divergence' },
        { type: 'crossover', direction: 'bullish', strength: 'strong', message: 'RSI crossed above oversold' }
      ]
    },
    williamsR: {
      value: -85,
      signals: [
        { type: 'bullish_divergence', direction: 'bullish', strength: 'very_strong', message: 'Williams divergence' },
        { type: 'crossover', direction: 'bullish', strength: 'strong', message: 'Williams crossed above oversold' }
      ]
    },
    stochRSI: {
      value: { k: 15, d: 12 },
      signals: [
        { type: 'crossover', direction: 'bullish', strength: 'strong', message: 'StochRSI K crossed above D' },
        { type: 'bullish_divergence', direction: 'bullish', strength: 'very_strong', message: 'StochRSI divergence' }
      ]
    },
    bollinger: {
      value: { upper: 105, middle: 100, lower: 95, bandwidth: 10, percentB: 0.1 },
      signals: [
        { type: 'squeeze', direction: 'bullish', strength: 'strong', message: 'BB squeeze breakout' }
      ]
    },
    emaTrend: {
      value: { emaShort: 101, emaMedium: 100, emaLong: 99, trend_direction: 'bullish' },
      signals: [
        { type: 'golden_death_cross', direction: 'bullish', strength: 'very_strong', message: 'Golden cross' },
        { type: 'trend_direction', direction: 'bullish', strength: 'strong', message: 'Uptrend' }
      ]
    },
    kdj: {
      value: { k: 20, d: 18, j: 15 },
      signals: [
        { type: 'bullish_divergence', direction: 'bullish', strength: 'very_strong', message: 'KDJ divergence' },
        { type: 'j_line', direction: 'bullish', strength: 'strong', message: 'J line oversold' }
      ]
    },
    obv: {
      value: { obv: 1000000, slope: 0.05, zScore: 1.5 },
      signals: [
        { type: 'bullish_divergence', direction: 'bullish', strength: 'very_strong', message: 'OBV divergence' }
      ]
    },
    ao: {
      value: 0.5,
      signals: [
        { type: 'zero_cross', direction: 'bullish', strength: 'strong', message: 'AO crossed above zero' }
      ]
    },
    atr: {
      percentValue: 1.5  // 1.5% volatility
    }
  };
}

// Create weak/neutral indicators
function createWeakIndicators() {
  return {
    rsi: {
      value: 50,
      signals: [
        { type: 'zone', direction: 'bullish', strength: 'weak', message: 'RSI neutral' }
      ]
    },
    williamsR: {
      value: -50,
      signals: []
    },
    stochRSI: {
      value: { k: 50, d: 50 },
      signals: []
    },
    emaTrend: {
      value: { emaShort: 100, emaMedium: 100, emaLong: 100, trend_direction: 'neutral' },
      signals: []
    },
    atr: {
      percentValue: 1.0
    }
  };
}

async function testEngineInitialization(runner) {
  console.log('\n--- Testing Engine Initialization ---');

  // Test paper mode initialization
  const paperEngine = new TradingEngineV3({
    mode: 'paper',
    initialBalance: 5000
  });

  runner.assert(
    paperEngine.mode === 'paper',
    'Paper mode initialization',
    `Expected 'paper', got '${paperEngine.mode}'`
  );

  runner.assert(
    paperEngine.balance.toNumber() === 5000,
    'Initial balance set correctly',
    `Expected 5000, got ${paperEngine.balance.toNumber()}`
  );

  runner.assert(
    !paperEngine.isRunning,
    'Engine starts in stopped state',
    `Expected false, got ${paperEngine.isRunning}`
  );

  // Test default config values
  runner.assert(
    paperEngine.riskConfig.leverageDefault === 5,
    'Default leverage is 5x',
    `Expected 5, got ${paperEngine.riskConfig.leverageDefault}`
  );

  runner.assert(
    paperEngine.signalConfig.minScore === 85,
    'Min signal score is 85',
    `Expected 85, got ${paperEngine.signalConfig.minScore}`
  );
}

async function testStartStop(runner) {
  console.log('\n--- Testing Start/Stop ---');

  const engine = new TradingEngineV3({ mode: 'paper' });

  engine.start();
  runner.assert(
    engine.isRunning === true,
    'Engine starts correctly',
    `Expected true, got ${engine.isRunning}`
  );

  engine.stop();
  runner.assert(
    engine.isRunning === false,
    'Engine stops correctly',
    `Expected false, got ${engine.isRunning}`
  );
}

async function testLeverageCalculation(runner) {
  console.log('\n--- Testing Leverage Calculation ---');

  const engine = new TradingEngineV3({ mode: 'paper' });

  // High volatility -> low leverage
  const highVolLeverage = engine._calculateLeverage(3.0);
  runner.assert(
    highVolLeverage <= 5,
    'High volatility results in low leverage',
    `Expected <= 5, got ${highVolLeverage}`
  );

  // Low volatility -> higher leverage (but capped by conservative settings)
  const lowVolLeverage = engine._calculateLeverage(0.2);
  runner.assert(
    lowVolLeverage >= highVolLeverage,
    'Low volatility results in higher leverage than high volatility',
    `Expected >= ${highVolLeverage}, got ${lowVolLeverage}`
  );

  // Medium volatility
  const medVolLeverage = engine._calculateLeverage(0.8);
  runner.assert(
    medVolLeverage >= 5 && medVolLeverage <= 10,
    'Medium volatility results in moderate leverage',
    `Expected 5-10, got ${medVolLeverage}`
  );
}

async function testPositionSizing(runner) {
  console.log('\n--- Testing Position Sizing ---');

  const engine = new TradingEngineV3({
    mode: 'paper',
    initialBalance: 10000
  });

  // Create mock signal
  const signal = { score: 100, confidence: 80 };

  // Normal volatility
  const normalSize = engine._calculatePositionSize(signal, 1.0);
  runner.assert(
    normalSize > 0 && normalSize <= 500,  // 2% of 10000 * 1.25 (strong signal)
    'Normal volatility position size',
    `Expected reasonable size, got ${normalSize}`
  );

  // High volatility should reduce size
  const highVolSize = engine._calculatePositionSize(signal, 3.0);
  runner.assert(
    highVolSize < normalSize,
    'High volatility reduces position size',
    `Expected < ${normalSize}, got ${highVolSize}`
  );

  // Extreme signal should increase size
  const extremeSignal = { score: 120, confidence: 90 };
  const extremeSize = engine._calculatePositionSize(extremeSignal, 1.0);
  runner.assert(
    extremeSize > normalSize,
    'Extreme signal increases position size',
    `Expected > ${normalSize}, got ${extremeSize}`
  );
}

async function testMicrostructureFilters(runner) {
  console.log('\n--- Testing Microstructure Filters ---');

  const engine = new TradingEngineV3({ mode: 'paper' });

  // Normal conditions should pass
  const normalMicro = {
    priceRatio: { value: { spread: 0.01 } },
    fundingRate: { value: { currentRate: 0.5 } },
    buySellRatio: { value: { ratio: 0.5 } }
  };

  runner.assert(
    engine._checkMicrostructureFilters(normalMicro) === true,
    'Normal microstructure passes filter',
    'Expected true'
  );

  // High spread should fail
  const highSpreadMicro = {
    priceRatio: { value: { spread: 0.05 } },
    fundingRate: { value: { currentRate: 0.5 } },
    buySellRatio: { value: { ratio: 0.5 } }
  };

  runner.assert(
    engine._checkMicrostructureFilters(highSpreadMicro) === false,
    'High spread fails filter',
    'Expected false'
  );

  // Extreme buy/sell ratio should fail
  const extremeRatioMicro = {
    priceRatio: { value: { spread: 0.01 } },
    fundingRate: { value: { currentRate: 0.5 } },
    buySellRatio: { value: { ratio: 0.95 } }  // Extreme
  };

  runner.assert(
    engine._checkMicrostructureFilters(extremeRatioMicro) === false,
    'Extreme buy/sell ratio fails filter',
    'Expected false'
  );
}

async function testProcessUpdate(runner) {
  console.log('\n--- Testing Process Update ---');

  const engine = new TradingEngineV3({
    mode: 'paper',
    initialBalance: 10000
  });

  engine.start();

  // Process with strong bullish signal
  const result = await engine.processUpdate('XBTUSDTM', {
    candle: { ts: Date.now(), open: 100000, high: 100100, low: 99900, close: 100050, volume: 1000 },
    indicators: createBullishIndicators()
  });

  runner.assert(
    result !== null,
    'Process update returns result',
    'Expected non-null result'
  );

  runner.assert(
    result.signal !== undefined,
    'Result includes signal',
    'Expected signal in result'
  );

  engine.stop();
}

async function testMetrics(runner) {
  console.log('\n--- Testing Metrics ---');

  const engine = new TradingEngineV3({
    mode: 'paper',
    initialBalance: 10000
  });

  const metrics = engine.getMetrics();

  runner.assert(
    metrics.mode === 'paper',
    'Metrics include mode',
    `Expected 'paper', got '${metrics.mode}'`
  );

  runner.assert(
    metrics.balance === 10000,
    'Metrics include balance',
    `Expected 10000, got ${metrics.balance}`
  );

  runner.assert(
    metrics.totalTrades === 0,
    'Initial total trades is 0',
    `Expected 0, got ${metrics.totalTrades}`
  );

  runner.assert(
    metrics.activePositions === 0,
    'Initial active positions is 0',
    `Expected 0, got ${metrics.activePositions}`
  );
}

async function testReset(runner) {
  console.log('\n--- Testing Reset ---');

  const engine = new TradingEngineV3({
    mode: 'paper',
    initialBalance: 10000
  });

  // Modify state
  engine.balance = engine.balance.plus(1000);

  runner.assert(
    engine.balance.toNumber() === 11000,
    'Balance was modified',
    `Expected 11000, got ${engine.balance.toNumber()}`
  );

  // Reset
  engine.reset();

  runner.assert(
    engine.balance.toNumber() === 10000,
    'Reset restores initial balance',
    `Expected 10000, got ${engine.balance.toNumber()}`
  );

  runner.assert(
    engine.positions.size === 0,
    'Reset clears positions',
    `Expected 0, got ${engine.positions.size}`
  );

  runner.assert(
    engine.trades.length === 0,
    'Reset clears trades',
    `Expected 0, got ${engine.trades.length}`
  );
}

async function testSignalIntegration(runner) {
  console.log('\n--- Testing Signal Integration ---');

  const generator = new SignalGeneratorV2({ enhancedMode: true });
  const indicators = createBullishIndicators();

  const signal = generator.generate(indicators, {});

  runner.assert(
    signal.score > 0,
    'Bullish indicators generate positive score',
    `Expected positive, got ${signal.score}`
  );

  runner.assert(
    signal.meetsEntryRequirements === true,
    'Strong signal meets entry requirements',
    `Expected true, got ${signal.meetsEntryRequirements}`
  );

  runner.assert(
    signal.indicatorsAgreeing >= 4,
    'At least 4 indicators agree',
    `Expected >= 4, got ${signal.indicatorsAgreeing}`
  );

  // Test weak signal does not meet requirements
  const weakSignal = generator.generate(createWeakIndicators(), {});

  runner.assert(
    weakSignal.meetsEntryRequirements === false,
    'Weak signal does not meet entry requirements',
    `Expected false, got ${weakSignal.meetsEntryRequirements}`
  );
}

async function runAllTests() {
  console.log('Starting TradingEngineV3 Test Suite\n');
  console.log('='.repeat(60));

  const runner = new TestRunner();

  try {
    await testEngineInitialization(runner);
    await testStartStop(runner);
    await testLeverageCalculation(runner);
    await testPositionSizing(runner);
    await testMicrostructureFilters(runner);
    await testProcessUpdate(runner);
    await testMetrics(runner);
    await testReset(runner);
    await testSignalIntegration(runner);
  } catch (error) {
    console.error('Test execution error:', error);
    runner.failed++;
  }

  runner.printSummary();

  process.exit(runner.failed > 0 ? 1 : 0);
}

runAllTests();
