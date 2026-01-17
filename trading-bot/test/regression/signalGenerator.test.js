/**
 * Signal Generator Regression Test
 * 
 * Ensures SignalGeneratorV2 behavior is unchanged when cloud features are disabled
 */

const SignalGeneratorV2 = require('../../src/lib/SignalGeneratorV2');

class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
  }

  assert(condition, testName, details = '') {
    if (condition) {
      this.passed++;
      console.log(`  ✓ PASS: ${testName}`);
    } else {
      this.failed++;
      console.error(`  ✗ FAIL: ${testName} - ${details}`);
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
    
    process.exit(this.failed > 0 ? 1 : 0);
  }
}

function createTestIndicators() {
  return {
    rsi: {
      value: 30,
      signals: [
        { type: 'oversold', direction: 'bullish', strength: 'strong', message: 'RSI oversold' }
      ]
    },
    macd: {
      value: { macd: 0.5, signal: 0.3, histogram: 0.2 },
      signals: [
        { type: 'crossover', direction: 'bullish', strength: 'moderate', message: 'MACD bullish crossover' }
      ]
    },
    williamsR: {
      value: -85,
      signals: [
        { type: 'oversold', direction: 'bullish', strength: 'strong', message: 'Williams %R oversold' }
      ]
    }
  };
}

async function runTests() {
  console.log('Starting Signal Generator Regression Test\n');
  console.log('='.repeat(60));
  
  const runner = new TestRunner();
  
  console.log('\n--- Testing Signal Generation Without Cloud ---');
  
  // Create generator WITHOUT cloud orchestrator (default behavior)
  const generator = new SignalGeneratorV2();
  
  runner.assert(
    generator.cloudOrchestrator === null,
    'Cloud orchestrator is null by default'
  );
  
  const indicators = createTestIndicators();
  const result = generator.generate(indicators, {});
  
  runner.assert(
    result !== null && result !== undefined,
    'Generates signal without cloud'
  );
  
  runner.assert(
    typeof result.score === 'number',
    'Result includes score'
  );
  
  runner.assert(
    typeof result.confidence === 'number',
    'Result includes confidence'
  );
  
  runner.assert(
    typeof result.type === 'string',
    'Result includes type'
  );
  
  runner.assert(
    result.aiAnalysis === undefined,
    'No AI analysis in result when cloud disabled'
  );
  
  runner.assert(
    result.confidenceAdjustedByAI === undefined,
    'Confidence not adjusted by AI when disabled'
  );
  
  console.log('\n--- Testing Score Range Consistency ---');
  
  runner.assert(
    result.score >= -150 && result.score <= 150,
    'Score within valid range (-150 to +150)'
  );
  
  runner.assert(
    result.confidence >= 0 && result.confidence <= 100,
    'Confidence within valid range (0 to 100)'
  );
  
  console.log('\n--- Testing Result Structure ---');
  
  runner.assert(
    result.indicatorScore !== undefined,
    'Result includes indicatorScore'
  );
  
  runner.assert(
    result.microstructureScore !== undefined,
    'Result includes microstructureScore'
  );
  
  runner.assert(
    result.breakdown !== undefined,
    'Result includes breakdown'
  );
  
  runner.assert(
    result.signals !== undefined,
    'Result includes signals'
  );
  
  runner.assert(
    result.timestamp !== undefined,
    'Result includes timestamp'
  );
  
  runner.assert(
    result.regime !== undefined,
    'Result includes regime'
  );
  
  console.log('\n--- Testing Multiple Signal Generations ---');
  
  // Generate multiple signals to ensure consistency
  const result2 = generator.generate(indicators, {});
  const result3 = generator.generate(indicators, {});
  
  runner.assert(
    result2.score === result.score,
    'Same inputs produce same score'
  );
  
  runner.assert(
    result3.score === result.score,
    'Score is deterministic'
  );
  
  console.log('\n--- Testing With Null Cloud Orchestrator ---');
  
  // Explicitly pass null cloud orchestrator
  const generatorWithNull = new SignalGeneratorV2({ cloudOrchestrator: null });
  const resultWithNull = generatorWithNull.generate(indicators, {});
  
  runner.assert(
    resultWithNull.score === result.score,
    'Null cloud orchestrator produces same score'
  );
  
  runner.assert(
    resultWithNull.aiAnalysis === undefined,
    'No AI analysis with null orchestrator'
  );
  
  runner.printSummary();
}

runTests().catch(console.error);
