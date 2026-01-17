/**
 * Cloud Configuration Test Suite
 * 
 * Tests the cloud configuration module
 */

const cloudConfig = require('../../config/cloudConfig');

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
  console.log('Starting Cloud Configuration Test Suite\n');
  console.log('='.repeat(60));
  
  const runner = new TestRunner();
  
  console.log('\n--- Testing Configuration Structure ---');
  
  // Test configuration object exists
  runner.assert(
    typeof cloudConfig === 'object',
    'Cloud config is an object'
  );
  
  // Test master switch defaults to false
  runner.assert(
    cloudConfig.enabled === false,
    'Master switch (enabled) defaults to false'
  );
  
  // Test feature flags exist
  runner.assert(
    typeof cloudConfig.features === 'object',
    'Features object exists'
  );
  
  runner.assert(
    cloudConfig.features.signalAnalysis === false,
    'signalAnalysis feature defaults to false'
  );
  
  runner.assert(
    cloudConfig.features.strategyOptimizer === false,
    'strategyOptimizer feature defaults to false'
  );
  
  runner.assert(
    cloudConfig.features.riskIntelligence === false,
    'riskIntelligence feature defaults to false'
  );
  
  runner.assert(
    cloudConfig.features.nlInterface === false,
    'nlInterface feature defaults to false'
  );
  
  runner.assert(
    cloudConfig.features.decisionSupport === false,
    'decisionSupport feature defaults to false'
  );
  
  console.log('\n--- Testing Claude Configuration ---');
  
  runner.assert(
    typeof cloudConfig.claude === 'object',
    'Claude config object exists'
  );
  
  runner.assert(
    cloudConfig.claude.model === 'claude-3-5-sonnet-20241022',
    'Claude model is set correctly'
  );
  
  runner.assert(
    cloudConfig.claude.maxTokens === 4096,
    'Max tokens is 4096'
  );
  
  runner.assert(
    cloudConfig.claude.temperature === 0.3,
    'Temperature is 0.3'
  );
  
  runner.assert(
    cloudConfig.claude.timeout === 30000,
    'Timeout is 30 seconds'
  );
  
  runner.assert(
    cloudConfig.claude.retries === 3,
    'Retries is 3'
  );
  
  console.log('\n--- Testing Rate Limiting ---');
  
  runner.assert(
    cloudConfig.claude.rateLimit.requests === 45,
    'Rate limit is 45 requests per window'
  );
  
  runner.assert(
    cloudConfig.claude.rateLimit.window === 60000,
    'Rate limit window is 60 seconds'
  );
  
  console.log('\n--- Testing Cache Configuration ---');
  
  runner.assert(
    cloudConfig.cache.enabled === true,
    'Cache is enabled by default'
  );
  
  runner.assert(
    cloudConfig.cache.ttl === 300000,
    'Cache TTL is 5 minutes'
  );
  
  console.log('\n--- Testing Quotas ---');
  
  runner.assert(
    cloudConfig.quotas.maxDailyRequests === 5000,
    'Max daily requests is 5000'
  );
  
  runner.assert(
    cloudConfig.quotas.maxCostPerDay === 10.00,
    'Max daily cost is $10.00'
  );
  
  console.log('\n--- Testing Circuit Breaker ---');
  
  runner.assert(
    cloudConfig.circuitBreaker.enabled === true,
    'Circuit breaker is enabled'
  );
  
  runner.assert(
    cloudConfig.circuitBreaker.failureThreshold === 5,
    'Circuit breaker failure threshold is 5'
  );
  
  runner.assert(
    cloudConfig.circuitBreaker.resetTimeout === 60000,
    'Circuit breaker reset timeout is 60 seconds'
  );
  
  runner.printSummary();
}

runTests().catch(console.error);
