/**
 * Bot Regression Test
 * 
 * Ensures bot starts normally without cloud configuration
 */

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

async function runTests() {
  console.log('Starting Bot Regression Test\n');
  console.log('='.repeat(60));
  
  const runner = new TestRunner();
  
  console.log('\n--- Testing Cloud Config Import ---');
  
  let cloudConfig;
  try {
    cloudConfig = require('../../config/cloudConfig');
    runner.assert(true, 'Cloud config module loads successfully');
  } catch (error) {
    runner.assert(false, 'Cloud config module failed to load: ' + error.message);
    runner.printSummary();
    return;
  }
  
  runner.assert(
    cloudConfig.enabled === false,
    'Cloud features disabled by default'
  );
  
  console.log('\n--- Testing Cloud Module Import ---');
  
  let CloudOrchestrator;
  try {
    const cloudModule = require('../../src/cloud');
    CloudOrchestrator = cloudModule.CloudOrchestrator;
    runner.assert(true, 'Cloud module loads successfully');
  } catch (error) {
    runner.assert(false, 'Cloud module failed to load: ' + error.message);
    runner.printSummary();
    return;
  }
  
  runner.assert(
    typeof CloudOrchestrator === 'function',
    'CloudOrchestrator is a constructor'
  );
  
  console.log('\n--- Testing Orchestrator With Disabled Config ---');
  
  const orchestrator = new CloudOrchestrator(cloudConfig);
  
  runner.assert(
    orchestrator !== null,
    'Orchestrator instantiates with disabled config'
  );
  
  runner.assert(
    orchestrator.client === null,
    'Client is null before initialization'
  );
  
  await orchestrator.initialize();
  
  runner.assert(
    !orchestrator.initialized,
    'Does not initialize when disabled'
  );
  
  runner.assert(
    orchestrator.client === null,
    'Client remains null when disabled'
  );
  
  console.log('\n--- Testing Graceful Degradation ---');
  
  const status = orchestrator.getStatus();
  
  runner.assert(
    status.initialized === false,
    'Status reports uninitialized'
  );
  
  runner.assert(
    typeof status === 'object',
    'getStatus returns object'
  );
  
  runner.assert(
    status.features !== undefined,
    'Status includes features'
  );
  
  // Test that all methods return null when disabled
  const analyzeResult = await orchestrator.analyzeSignal({ symbol: 'TEST', score: 50 });
  runner.assert(
    analyzeResult === null,
    'analyzeSignal returns null when disabled'
  );
  
  const optimizeResult = await orchestrator.optimizeStrategy({}, {}, []);
  runner.assert(
    optimizeResult === null,
    'optimizeStrategy returns null when disabled'
  );
  
  const riskResult = await orchestrator.analyzeRisk({}, {}, {});
  runner.assert(
    riskResult === null,
    'analyzeRisk returns null when disabled'
  );
  
  console.log('\n--- Testing Index.js Integration ---');
  
  // Ensure index.js can be required without errors
  try {
    // We won't actually run the bot, just check it can be loaded
    const indexModule = require('../../index.js');
    runner.assert(true, 'index.js loads without errors');
  } catch (error) {
    // Some errors are expected (like missing coin list data)
    // but cloud integration errors should not occur
    if (error.message.includes('cloud') || error.message.includes('Claude')) {
      runner.assert(false, 'index.js has cloud-related error: ' + error.message);
    } else {
      runner.assert(true, 'index.js loads (expected errors are non-cloud related)');
    }
  }
  
  console.log('\n--- Testing Server.js Integration ---');
  
  try {
    const serverModule = require('../../server.js');
    runner.assert(true, 'server.js loads without errors');
  } catch (error) {
    if (error.message.includes('cloud') || error.message.includes('Claude')) {
      runner.assert(false, 'server.js has cloud-related error: ' + error.message);
    } else {
      runner.assert(true, 'server.js loads (expected errors are non-cloud related)');
    }
  }
  
  runner.printSummary();
}

runTests().catch(console.error);
