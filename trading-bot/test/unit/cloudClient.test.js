/**
 * Claude Client Test Suite
 * 
 * Tests the Claude API client structure and configuration
 * (Without making real API calls)
 */

const ClaudeClient = require('../../src/cloud/claudeClient');

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
  console.log('Starting Claude Client Test Suite\n');
  console.log('='.repeat(60));
  
  const runner = new TestRunner();
  
  const testConfig = {
    enabled: true,
    features: {
      signalAnalysis: true
    },
    claude: {
      apiKey: 'sk-ant-test-key',
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4096,
      temperature: 0.3,
      rateLimit: {
        requests: 45,
        window: 60000
      },
      timeout: 30000,
      retries: 3,
      retryDelay: 100
    },
    cache: {
      enabled: true,
      ttl: 300000
    },
    quotas: {
      maxDailyRequests: 5000,
      maxCostPerDay: 10.00
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      resetTimeout: 60000
    },
    logging: {
      level: 'error'
    }
  };
  
  console.log('\n--- Testing Client Structure ---');
  
  const client = new ClaudeClient(testConfig);
  
  runner.assert(
    client !== null,
    'Client instantiates'
  );
  
  runner.assert(
    !client.initialized,
    'Client starts uninitialized'
  );
  
  runner.assert(
    client.config === testConfig,
    'Config is stored'
  );
  
  runner.assert(
    client.client === null,
    'Anthropic client is null before init'
  );
  
  runner.assert(
    client.cache === null,
    'Cache is null before init'
  );
  
  runner.assert(
    Array.isArray(client.requestQueue),
    'Request queue is an array'
  );
  
  runner.assert(
    Array.isArray(client.requestTimestamps),
    'Request timestamps is an array'
  );
  
  console.log('\n--- Testing Circuit Breaker State ---');
  
  runner.assert(
    client.circuitState === 'closed',
    'Circuit starts closed'
  );
  
  runner.assert(
    client.consecutiveFailures === 0,
    'Consecutive failures starts at 0'
  );
  
  runner.assert(
    client.lastFailureTime === null,
    'Last failure time is null'
  );
  
  console.log('\n--- Testing Usage Tracking ---');
  
  runner.assert(
    typeof client.usage === 'object',
    'Usage is an object'
  );
  
  runner.assert(
    client.usage.requestsToday === 0,
    'Requests today starts at 0'
  );
  
  runner.assert(
    client.usage.costToday === 0,
    'Cost today starts at 0'
  );
  
  runner.assert(
    typeof client.usage.lastReset === 'number',
    'Last reset is a number'
  );
  
  console.log('\n--- Testing Methods Exist ---');
  
  runner.assert(
    typeof client.initialize === 'function',
    'initialize method exists'
  );
  
  runner.assert(
    typeof client.sendMessage === 'function',
    'sendMessage method exists'
  );
  
  runner.assert(
    typeof client.streamMessage === 'function',
    'streamMessage method exists'
  );
  
  runner.assert(
    typeof client.getUsage === 'function',
    'getUsage method exists'
  );
  
  runner.assert(
    typeof client.clearCache === 'function',
    'clearCache method exists'
  );
  
  runner.assert(
    typeof client.isHealthy === 'function',
    'isHealthy method exists'
  );
  
  console.log('\n--- Testing getUsage Before Init ---');
  
  const usage = client.getUsage();
  
  runner.assert(
    typeof usage === 'object',
    'getUsage returns object'
  );
  
  runner.assert(
    usage.requestsToday === 0,
    'Requests today is 0'
  );
  
  runner.assert(
    usage.costToday === 0,
    'Cost today is 0'
  );
  
  console.log('\n--- Testing Health Check Before Init ---');
  
  runner.assert(
    client.isHealthy() === false,
    'Client is not healthy before init'
  );
  
  console.log('\n--- Testing Clear Cache Before Init ---');
  
  try {
    client.clearCache();
    runner.assert(true, 'clearCache does not throw before init');
  } catch (error) {
    runner.assert(false, 'clearCache should not throw');
  }
  
  console.log('\n--- Testing Error Handling ---');
  
  try {
    const clientNoKey = new ClaudeClient({
      ...testConfig,
      claude: { ...testConfig.claude, apiKey: '' }
    });
    await clientNoKey.initialize();
    runner.assert(false, 'Should throw error with no API key');
  } catch (error) {
    runner.assert(
      error.message.includes('API key'),
      'Throws error when API key missing'
    );
  }
  
  runner.printSummary();
}

runTests().catch(console.error);
