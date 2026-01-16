/**
 * Strategy Profiles Test Suite
 * 
 * Tests the updated strategy profiles to ensure:
 * - Correct threshold values for confidence and indicator agreement
 * - Profile activation and filtering logic
 * - Scenarios where profiles are activated or skipped
 */

const StrategyRouter = require('../switches/strategyRouter');

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
      console.log(`  ✓ PASS: ${testName}`);
    } else {
      this.failed++;
      this.results.push({ name: testName, status: 'FAIL', details });
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
    
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

// Test helper to create mock signals
function createMockSignal(score, confidence, indicatorsAgreeing) {
  return {
    score: score,
    confidence: confidence,
    indicatorsAgreeing: indicatorsAgreeing,
    direction: score > 0 ? 'long' : 'short',
    timestamp: Date.now()
  };
}

// Test helper to create mock indicators
function createMockIndicators() {
  return {
    rsi: { value: 50, signals: [] },
    macd: { value: 0, signals: [] },
    williamsR: { value: -50, signals: [] },
    ao: { value: 0, signals: [] },
    emaTrend: { value: { trend_direction: 'bullish' }, signals: [{ direction: 'bullish' }] },
    stochastic: { value: 50, signals: [] },
    bollinger: { value: {}, signals: [] },
    kdj: { value: {}, signals: [] },
    obv: { value: {}, signals: [{ direction: 'bullish' }] },
    dom: { value: {}, signals: [] }
  };
}

function testProfileThresholds() {
  console.log('\n📋 Testing Profile Threshold Values...');
  const runner = new TestRunner();
  const router = new StrategyRouter();

  // Test Conservative Profile
  const conservative = router.getStrategyConfig('conservative');
  runner.assert(
    conservative !== undefined,
    'Conservative profile exists',
    'Profile not found'
  );
  runner.assert(
    conservative.thresholds.minConfidence === 80,
    'Conservative profile minConfidence is 80%',
    `Expected 80, got ${conservative.thresholds.minConfidence}`
  );
  runner.assert(
    conservative.thresholds.minIndicatorsAgreeing === 5,
    'Conservative profile requires 5 indicators',
    `Expected 5, got ${conservative.thresholds.minIndicatorsAgreeing}`
  );

  // Test Neutral Profile
  const neutral = router.getStrategyConfig('neutral');
  runner.assert(
    neutral !== undefined,
    'Neutral profile exists',
    'Profile not found'
  );
  runner.assert(
    neutral.thresholds.minConfidence === 85,
    'Neutral profile minConfidence is 85%',
    `Expected 85, got ${neutral.thresholds.minConfidence}`
  );
  runner.assert(
    neutral.thresholds.minIndicatorsAgreeing === 4,
    'Neutral profile requires 4 indicators',
    `Expected 4, got ${neutral.thresholds.minIndicatorsAgreeing}`
  );

  // Test Aggressive Profile
  const aggressive = router.getStrategyConfig('aggressive');
  runner.assert(
    aggressive !== undefined,
    'Aggressive profile exists',
    'Profile not found'
  );
  runner.assert(
    aggressive.thresholds.minConfidence === 90,
    'Aggressive profile minConfidence is 90%',
    `Expected 90, got ${aggressive.thresholds.minConfidence}`
  );
  runner.assert(
    aggressive.thresholds.minIndicatorsAgreeing === 3,
    'Aggressive profile requires 3 indicators',
    `Expected 3, got ${aggressive.thresholds.minIndicatorsAgreeing}`
  );

  return runner;
}

function testConservativeProfileFiltering() {
  console.log('\n📋 Testing Conservative Profile Filtering...');
  const runner = new TestRunner();
  const router = new StrategyRouter();
  router.setActiveStrategy('conservative');
  
  const indicators = createMockIndicators();

  // Test Case 1: Signal meets all requirements - should pass
  const goodSignal = createMockSignal(75, 85, 5);
  const result1 = router.routeSignal(goodSignal, indicators);
  runner.assert(
    result1 !== null,
    'Conservative: Signal with confidence 85% and 5 indicators passes',
    'Signal should pass but was filtered'
  );

  // Test Case 2: Confidence too low - should fail
  const lowConfidenceSignal = createMockSignal(75, 75, 5);
  const result2 = router.routeSignal(lowConfidenceSignal, indicators);
  runner.assert(
    result2 === null,
    'Conservative: Signal with confidence 75% is filtered (< 80%)',
    'Signal should be filtered but passed'
  );

  // Test Case 3: Not enough indicators - should fail
  const fewIndicatorsSignal = createMockSignal(75, 85, 4);
  const result3 = router.routeSignal(fewIndicatorsSignal, indicators);
  runner.assert(
    result3 === null,
    'Conservative: Signal with 4 indicators is filtered (< 5)',
    'Signal should be filtered but passed'
  );

  // Test Case 4: Score too low - should fail
  const lowScoreSignal = createMockSignal(60, 85, 5);
  const result4 = router.routeSignal(lowScoreSignal, indicators);
  runner.assert(
    result4 === null,
    'Conservative: Signal with score 60 is filtered (< 70)',
    'Signal should be filtered but passed'
  );

  // Test Case 5: Exactly at threshold - should pass
  const edgeSignal = createMockSignal(70, 80, 5);
  const result5 = router.routeSignal(edgeSignal, indicators);
  runner.assert(
    result5 !== null,
    'Conservative: Signal at exact threshold passes (score=70, conf=80, ind=5)',
    'Signal at threshold should pass'
  );

  return runner;
}

function testNeutralProfileFiltering() {
  console.log('\n📋 Testing Neutral Profile Filtering...');
  const runner = new TestRunner();
  const router = new StrategyRouter();
  router.setActiveStrategy('neutral');
  
  const indicators = createMockIndicators();

  // Test Case 1: Signal meets all requirements - should pass
  const goodSignal = createMockSignal(55, 90, 4);
  const result1 = router.routeSignal(goodSignal, indicators);
  runner.assert(
    result1 !== null,
    'Neutral: Signal with confidence 90% and 4 indicators passes',
    'Signal should pass but was filtered'
  );

  // Test Case 2: Confidence too low - should fail
  const lowConfidenceSignal = createMockSignal(55, 80, 4);
  const result2 = router.routeSignal(lowConfidenceSignal, indicators);
  runner.assert(
    result2 === null,
    'Neutral: Signal with confidence 80% is filtered (< 85%)',
    'Signal should be filtered but passed'
  );

  // Test Case 3: Not enough indicators - should fail
  const fewIndicatorsSignal = createMockSignal(55, 90, 3);
  const result3 = router.routeSignal(fewIndicatorsSignal, indicators);
  runner.assert(
    result3 === null,
    'Neutral: Signal with 3 indicators is filtered (< 4)',
    'Signal should be filtered but passed'
  );

  // Test Case 4: Exactly at threshold - should pass
  const edgeSignal = createMockSignal(50, 85, 4);
  const result4 = router.routeSignal(edgeSignal, indicators);
  runner.assert(
    result4 !== null,
    'Neutral: Signal at exact threshold passes (score=50, conf=85, ind=4)',
    'Signal at threshold should pass'
  );

  return runner;
}

function testAggressiveProfileFiltering() {
  console.log('\n📋 Testing Aggressive Profile Filtering...');
  const runner = new TestRunner();
  const router = new StrategyRouter();
  router.setActiveStrategy('aggressive');
  
  const indicators = createMockIndicators();

  // Test Case 1: Signal meets all requirements - should pass
  const goodSignal = createMockSignal(45, 95, 3);
  const result1 = router.routeSignal(goodSignal, indicators);
  runner.assert(
    result1 !== null,
    'Aggressive: Signal with confidence 95% and 3 indicators passes',
    'Signal should pass but was filtered'
  );

  // Test Case 2: Confidence too low - should fail
  const lowConfidenceSignal = createMockSignal(45, 85, 3);
  const result2 = router.routeSignal(lowConfidenceSignal, indicators);
  runner.assert(
    result2 === null,
    'Aggressive: Signal with confidence 85% is filtered (< 90%)',
    'Signal should be filtered but passed'
  );

  // Test Case 3: Not enough indicators - should fail
  const fewIndicatorsSignal = createMockSignal(45, 95, 2);
  const result3 = router.routeSignal(fewIndicatorsSignal, indicators);
  runner.assert(
    result3 === null,
    'Aggressive: Signal with 2 indicators is filtered (< 3)',
    'Signal should be filtered but passed'
  );

  // Test Case 4: Exactly at threshold - should pass
  const edgeSignal = createMockSignal(40, 90, 3);
  const result4 = router.routeSignal(edgeSignal, indicators);
  runner.assert(
    result4 !== null,
    'Aggressive: Signal at exact threshold passes (score=40, conf=90, ind=3)',
    'Signal at threshold should pass'
  );

  return runner;
}

function testProfileComparison() {
  console.log('\n📋 Testing Profile Comparison...');
  const runner = new TestRunner();
  const router = new StrategyRouter();

  const conservative = router.getStrategyConfig('conservative');
  const neutral = router.getStrategyConfig('neutral');
  const aggressive = router.getStrategyConfig('aggressive');

  // Conservative should have higher thresholds than Aggressive for indicators
  runner.assert(
    conservative.thresholds.minIndicatorsAgreeing > aggressive.thresholds.minIndicatorsAgreeing,
    'Conservative requires more indicators than Aggressive',
    `Conservative: ${conservative.thresholds.minIndicatorsAgreeing}, Aggressive: ${aggressive.thresholds.minIndicatorsAgreeing}`
  );

  // Neutral should be between Conservative and Aggressive for indicators
  runner.assert(
    neutral.thresholds.minIndicatorsAgreeing < conservative.thresholds.minIndicatorsAgreeing &&
    neutral.thresholds.minIndicatorsAgreeing > aggressive.thresholds.minIndicatorsAgreeing,
    'Neutral indicator requirement is between Conservative and Aggressive',
    `Conservative: ${conservative.thresholds.minIndicatorsAgreeing}, Neutral: ${neutral.thresholds.minIndicatorsAgreeing}, Aggressive: ${aggressive.thresholds.minIndicatorsAgreeing}`
  );

  // All profiles should have high confidence requirements (>=80%)
  runner.assert(
    conservative.thresholds.minConfidence >= 80 &&
    neutral.thresholds.minConfidence >= 80 &&
    aggressive.thresholds.minConfidence >= 80,
    'All profiles require high confidence (>=80%)',
    `Conservative: ${conservative.thresholds.minConfidence}%, Neutral: ${neutral.thresholds.minConfidence}%, Aggressive: ${aggressive.thresholds.minConfidence}%`
  );

  // Aggressive should have highest confidence requirement
  runner.assert(
    aggressive.thresholds.minConfidence > conservative.thresholds.minConfidence &&
    aggressive.thresholds.minConfidence > neutral.thresholds.minConfidence,
    'Aggressive has highest confidence requirement',
    `Conservative: ${conservative.thresholds.minConfidence}%, Neutral: ${neutral.thresholds.minConfidence}%, Aggressive: ${aggressive.thresholds.minConfidence}%`
  );

  return runner;
}

// Run all tests
console.log('='.repeat(60));
console.log('STRATEGY PROFILES TEST SUITE');
console.log('='.repeat(60));

const runners = [
  testProfileThresholds(),
  testConservativeProfileFiltering(),
  testNeutralProfileFiltering(),
  testAggressiveProfileFiltering(),
  testProfileComparison()
];

// Aggregate results
const totalPassed = runners.reduce((sum, r) => sum + r.passed, 0);
const totalFailed = runners.reduce((sum, r) => sum + r.failed, 0);

console.log('\n' + '='.repeat(60));
console.log('OVERALL TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total Passed: ${totalPassed}`);
console.log(`Total Failed: ${totalFailed}`);
console.log(`Total Tests:  ${totalPassed + totalFailed}`);
console.log(`Success Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

if (totalFailed > 0) {
  process.exit(1);
}
