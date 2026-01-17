/**
 * Cloud Orchestrator Test Suite
 * 
 * Tests the cloud orchestrator coordination logic
 */

const CloudOrchestrator = require('../../src/cloud/orchestrator');

class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
  }

  assert(condition, testName) {
    if (condition) {
      this.passed++;
      console.log(`  ✓ PASS: ${testName}`);
    } else {
      this.failed++;
      console.error(`  ✗ FAIL: ${testName}`);
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

async function runTests() {
  console.log('Starting Cloud Orchestrator Test Suite\n');
  console.log('='.repeat(60));
  
  const runner = new TestRunner();
  
  console.log('\n--- Testing Disabled State ---');
  
  const disabledConfig = {
    enabled: false,
    features: {
      signalAnalysis: false,
      strategyOptimizer: false,
      riskIntelligence: false,
      nlInterface: false,
      decisionSupport: false
    }
  };
  
  const disabledOrchestrator = new CloudOrchestrator(disabledConfig);
  
  runner.assert(
    !disabledOrchestrator.initialized,
    'Orchestrator starts uninitialized'
  );
  
  await disabledOrchestrator.initialize();
  
  runner.assert(
    !disabledOrchestrator.initialized,
    'Does not initialize when disabled'
  );
  
  runner.assert(
    disabledOrchestrator.client === null,
    'Client is null when disabled'
  );
  
  console.log('\n--- Testing Feature Flags ---');
  
  const result = await disabledOrchestrator.analyzeSignal({
    symbol: 'BTCUSDTM',
    score: 50,
    signals: {},
    confidence: 80
  });
  
  runner.assert(
    result === null,
    'Returns null when feature disabled'
  );
  
  console.log('\n--- Testing Status ---');
  
  const status = disabledOrchestrator.getStatus();
  
  runner.assert(
    status.initialized === false,
    'Status shows uninitialized'
  );
  
  runner.assert(
    status.healthy !== undefined,
    'Status includes health check'
  );
  
  runner.assert(
    typeof status.features === 'object',
    'Status includes features object'
  );
  
  runner.assert(
    status.features.signalAnalysis === false,
    'Signal analysis feature is false'
  );
  
  console.log('\n--- Testing Metrics ---');
  
  const metrics = disabledOrchestrator.getMetrics();
  
  runner.assert(
    metrics.totalRequests === 0,
    'Total requests starts at 0'
  );
  
  runner.assert(
    metrics.successfulRequests === 0,
    'Successful requests starts at 0'
  );
  
  runner.assert(
    metrics.failedRequests === 0,
    'Failed requests starts at 0'
  );
  
  runner.assert(
    typeof metrics.featureUsage === 'object',
    'Feature usage tracking exists'
  );
  
  runner.assert(
    metrics.averageLatency === 0,
    'Average latency starts at 0'
  );
  
  runner.assert(
    metrics.successRate === 0,
    'Success rate starts at 0'
  );
  
  console.log('\n--- Testing Health Check ---');
  
  const healthy = await disabledOrchestrator.healthCheck();
  
  runner.assert(
    typeof healthy === 'boolean',
    'Health check returns boolean'
  );
  
  console.log('\n--- Testing Cache Operations ---');
  
  // Should not throw when disabled
  try {
    disabledOrchestrator.clearCache();
    runner.assert(true, 'Clear cache does not throw when disabled');
  } catch (error) {
    runner.assert(false, 'Clear cache should not throw');
  }
  
  console.log('\n--- Testing All Feature Methods Return Null When Disabled ---');
  
  const optimizeResult = await disabledOrchestrator.optimizeStrategy({}, {}, []);
  runner.assert(
    optimizeResult === null,
    'optimizeStrategy returns null when disabled'
  );
  
  const riskResult = await disabledOrchestrator.analyzeRisk({}, {}, {});
  runner.assert(
    riskResult === null,
    'analyzeRisk returns null when disabled'
  );
  
  const regimeResult = await disabledOrchestrator.classifyRegime({});
  runner.assert(
    regimeResult === null,
    'classifyRegime returns null when disabled'
  );
  
  const queryResult = await disabledOrchestrator.processQuery('test', {});
  runner.assert(
    queryResult === null,
    'processQuery returns null when disabled'
  );
  
  const reportResult = await disabledOrchestrator.generateReport('daily', {});
  runner.assert(
    reportResult === null,
    'generateReport returns null when disabled'
  );
  
  const validateResult = await disabledOrchestrator.validateTrade({}, {}, {});
  runner.assert(
    validateResult === null,
    'validateTrade returns null when disabled'
  );
  
  const exitResult = await disabledOrchestrator.suggestExit({}, {}, {});
  runner.assert(
    exitResult === null,
    'suggestExit returns null when disabled'
  );
  
  runner.printSummary();
}

runTests().catch(console.error);
