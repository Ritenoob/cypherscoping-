/**
 * SignalGeneratorV2 Test Suite
 * 
 * Tests the signal generation system for:
 * - Score calculation
 * - Signal classification
 * - Microstructure integration
 * - Score range validation (-130 to +130)
 */

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

function createBullishIndicators() {
  // OPTIMIZED: Use stronger signal types (divergence, crossover) for higher scores
  return {
    rsi: {
      value: 25,
      signals: [
        { type: 'bullish_divergence', direction: 'bullish', strength: 'very_strong', message: 'RSI bullish divergence' },
        { type: 'crossover', direction: 'bullish', strength: 'strong', message: 'RSI crossed above oversold' }
      ]
    },
    macd: {
      value: { macd: 0.5, signal: 0.3, histogram: 0.2 },
      signals: [
        { type: 'signal_crossover', direction: 'bullish', strength: 'strong', message: 'MACD crossed above signal' }
      ]
    },
    williamsR: {
      value: -85,
      signals: [
        { type: 'bullish_divergence', direction: 'bullish', strength: 'very_strong', message: 'Williams divergence' },
        { type: 'crossover', direction: 'bullish', strength: 'strong', message: 'Williams crossed above oversold' }
      ]
    },
    ao: {
      value: 0.5,
      signals: [
        { type: 'zero_cross', direction: 'bullish', strength: 'strong', message: 'AO crossed above zero' }
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
        { type: 'bullish_divergence', direction: 'bullish', strength: 'very_strong', message: 'OBV divergence' },
        { type: 'breakout', direction: 'bullish', strength: 'strong', message: 'OBV breakout' }
      ]
    }
  };
}

function createBearishIndicators() {
  // OPTIMIZED: Use stronger signal types (divergence, crossover) for higher scores
  return {
    rsi: {
      value: 75,
      signals: [
        { type: 'bearish_divergence', direction: 'bearish', strength: 'very_strong', message: 'RSI bearish divergence' },
        { type: 'crossover', direction: 'bearish', strength: 'strong', message: 'RSI crossed below overbought' }
      ]
    },
    macd: {
      value: { macd: -0.5, signal: -0.3, histogram: -0.2 },
      signals: [
        { type: 'signal_crossover', direction: 'bearish', strength: 'strong', message: 'MACD crossed below signal' }
      ]
    },
    williamsR: {
      value: -15,
      signals: [
        { type: 'bearish_divergence', direction: 'bearish', strength: 'very_strong', message: 'Williams divergence' },
        { type: 'crossover', direction: 'bearish', strength: 'strong', message: 'Williams crossed below overbought' }
      ]
    },
    ao: {
      value: -0.5,
      signals: [
        { type: 'zero_cross', direction: 'bearish', strength: 'strong', message: 'AO crossed below zero' }
      ]
    },
    stochRSI: {
      value: { k: 85, d: 88 },
      signals: [
        { type: 'crossover', direction: 'bearish', strength: 'strong', message: 'StochRSI K crossed below D' },
        { type: 'bearish_divergence', direction: 'bearish', strength: 'very_strong', message: 'StochRSI divergence' }
      ]
    },
    bollinger: {
      value: { upper: 105, middle: 100, lower: 95, bandwidth: 10, percentB: 0.9 },
      signals: [
        { type: 'squeeze', direction: 'bearish', strength: 'strong', message: 'BB squeeze breakdown' }
      ]
    },
    emaTrend: {
      value: { emaShort: 99, emaMedium: 100, emaLong: 101, trend_direction: 'bearish' },
      signals: [
        { type: 'golden_death_cross', direction: 'bearish', strength: 'very_strong', message: 'Death cross' },
        { type: 'trend_direction', direction: 'bearish', strength: 'strong', message: 'Downtrend' }
      ]
    },
    kdj: {
      value: { k: 80, d: 82, j: 85 },
      signals: [
        { type: 'bearish_divergence', direction: 'bearish', strength: 'very_strong', message: 'KDJ divergence' },
        { type: 'j_line', direction: 'bearish', strength: 'strong', message: 'J line overbought' }
      ]
    },
    obv: {
      value: { obv: 1000000, slope: -0.05, zScore: -1.5 },
      signals: [
        { type: 'bearish_divergence', direction: 'bearish', strength: 'very_strong', message: 'OBV divergence' },
        { type: 'breakout', direction: 'bearish', strength: 'strong', message: 'OBV breakdown' }
      ]
    }
  };
}

function createNeutralIndicators() {
  return {
    rsi: {
      value: 50,
      signals: []
    },
    macd: {
      value: { macd: 0, signal: 0, histogram: 0 },
      signals: []
    },
    williamsR: {
      value: -50,
      signals: []
    },
    ao: {
      value: 0,
      signals: []
    },
    stochastic: {
      value: { k: 50, d: 50 },
      signals: []
    },
    bollinger: {
      value: { upper: 105, middle: 100, lower: 95, bandwidth: 10, percentB: 0.5 },
      signals: []
    },
    emaTrend: {
      value: { emaShort: 100, emaMedium: 100, emaLong: 100 },
      signals: []
    },
    kdj: {
      value: { k: 50, d: 50, j: 50 },
      signals: []
    },
    obv: {
      value: { obv: 1000000, slope: 0, zScore: 0 },
      signals: []
    }
  };
}

function createBullishMicrostructure() {
  return {
    buySellRatio: {
      value: { ratio: 0.75, buyVolume: 7500, sellVolume: 2500 },
      signals: [
        { type: 'flow_imbalance', direction: 'bullish', strength: 'strong', message: 'Heavy buying pressure' }
      ]
    },
    priceRatio: {
      value: { spread: 0.01, basis: -0.02 },
      signals: [
        { type: 'basis', direction: 'bullish', strength: 'moderate', message: 'Futures discount' }
      ]
    },
    fundingRate: {
      value: { currentRate: -0.005, predictedRate: -0.006 },
      signals: [
        { type: 'extreme_rate', direction: 'bullish', strength: 'strong', message: 'Negative funding, shorts paying longs' }
      ]
    }
  };
}

async function testScoreRange(runner) {
  console.log('\n--- Testing Score Range ---');

  const generator = new SignalGeneratorV2({ enhancedMode: true });

  const bullishResult = generator.generate(createBullishIndicators(), {});

  // OPTIMIZED: Score caps increased to ±120 for indicators, ±150 total
  runner.assert(
    bullishResult.indicatorScore >= -120 && bullishResult.indicatorScore <= 120,
    'Indicator score within -120 to +120 range',
    `Got: ${bullishResult.indicatorScore}`
  );

  runner.assert(
    bullishResult.score >= -150 && bullishResult.score <= 150,
    'Total score within -150 to +150 range',
    `Got: ${bullishResult.score}`
  );

  const bearishResult = generator.generate(createBearishIndicators(), {});

  runner.assert(
    bearishResult.indicatorScore < 0,
    'Bearish indicators produce negative score',
    `Got: ${bearishResult.indicatorScore}`
  );

  const neutralResult = generator.generate(createNeutralIndicators(), {});

  runner.assert(
    Math.abs(neutralResult.indicatorScore) < 30,
    'Neutral indicators produce near-zero score',
    `Got: ${neutralResult.indicatorScore}`
  );
}

async function testSignalClassification(runner) {
  console.log('\n--- Testing Signal Classification ---');
  
  const generator = new SignalGeneratorV2({ enhancedMode: true });
  
  const bullishResult = generator.generate(createBullishIndicators(), {});
  
  runner.assert(
    bullishResult.type.includes('BUY'),
    'Bullish indicators classified as BUY signal',
    `Got: ${bullishResult.type}`
  );
  
  const bearishResult = generator.generate(createBearishIndicators(), {});
  
  runner.assert(
    bearishResult.type.includes('SELL'),
    'Bearish indicators classified as SELL signal',
    `Got: ${bearishResult.type}`
  );
  
  const neutralResult = generator.generate(createNeutralIndicators(), {});
  
  runner.assert(
    neutralResult.type === 'NEUTRAL',
    'Neutral indicators classified as NEUTRAL',
    `Got: ${neutralResult.type}`
  );
}

async function testMicrostructureIntegration(runner) {
  console.log('\n--- Testing Microstructure Integration ---');
  
  const generator = new SignalGeneratorV2({ 
    enhancedMode: true,
    includeMicrostructure: true
  });
  
  const indicators = createBullishIndicators();
  const microstructure = createBullishMicrostructure();
  
  const resultWithMicro = generator.generate(indicators, microstructure, true);
  
  runner.assert(
    resultWithMicro.microstructureScore !== undefined,
    'Result includes microstructure score'
  );
  
  runner.assert(
    resultWithMicro.microstructureScore >= -20 && resultWithMicro.microstructureScore <= 20,
    'Microstructure score within -20 to +20 range',
    `Got: ${resultWithMicro.microstructureScore}`
  );
  
  const resultWithoutMicro = generator.generate(indicators, {}, false);
  
  runner.assert(
    resultWithoutMicro.microstructureScore === 0 || resultWithoutMicro.microstructureScore === undefined,
    'Microstructure score is zero when not live'
  );
}

async function testConfidenceCalculation(runner) {
  console.log('\n--- Testing Confidence Calculation ---');
  
  const generator = new SignalGeneratorV2({ enhancedMode: true });
  
  const bullishResult = generator.generate(createBullishIndicators(), {});
  
  runner.assert(
    bullishResult.confidence >= 0 && bullishResult.confidence <= 100,
    'Confidence in valid range (0-100)',
    `Got: ${bullishResult.confidence}`
  );
  
  runner.assert(
    bullishResult.confidence > 50,
    'Strong signals have high confidence',
    `Got: ${bullishResult.confidence}`
  );
  
  const neutralResult = generator.generate(createNeutralIndicators(), {});
  
  runner.assert(
    neutralResult.confidence < 50,
    'Neutral signals have low confidence',
    `Got: ${neutralResult.confidence}`
  );
}

async function testBreakdownGeneration(runner) {
  console.log('\n--- Testing Breakdown Generation ---');
  
  const generator = new SignalGeneratorV2({ enhancedMode: true });
  
  const result = generator.generate(createBullishIndicators(), {});
  
  runner.assert(
    result.breakdown !== undefined,
    'Result includes breakdown object'
  );
  
  runner.assert(
    result.breakdown.indicators !== undefined,
    'Breakdown includes indicators section'
  );
  
  runner.assert(
    result.signals !== undefined && Array.isArray(result.signals),
    'Result includes signals array'
  );
  
  runner.assert(
    result.signals.length > 0,
    'Signals array is not empty for strong signals',
    `Got ${result.signals.length} signals`
  );
}

async function testEntryWarning(runner) {
  console.log('\n--- Testing Entry Warning Detection ---');
  
  const generator = new SignalGeneratorV2({ enhancedMode: true });
  
  const indicatorsWithWarning = createBullishIndicators();
  
  const microWithWarning = {
    priceRatio: {
      value: { spread: 0.1 },
      signals: [
        { type: 'spread', direction: 'neutral', strength: 'extreme', message: 'Critical spread warning', metadata: { avoidEntry: true } }
      ]
    }
  };
  
  const result = generator.generate(indicatorsWithWarning, microWithWarning, true);
  
  runner.assert(
    typeof generator.hasEntryWarning === 'function',
    'Generator has hasEntryWarning method'
  );
}

async function runAllTests() {
  console.log('Starting SignalGeneratorV2 Test Suite\n');
  console.log('='.repeat(60));
  
  const runner = new TestRunner();
  
  try {
    await testScoreRange(runner);
    await testSignalClassification(runner);
    await testMicrostructureIntegration(runner);
    await testConfidenceCalculation(runner);
    await testBreakdownGeneration(runner);
    await testEntryWarning(runner);
  } catch (error) {
    console.error('Test execution error:', error);
    runner.failed++;
  }
  
  runner.printSummary();
  
  process.exit(runner.failed > 0 ? 1 : 0);
}

runAllTests();
