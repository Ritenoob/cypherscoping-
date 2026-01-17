/**
 * Backwards Compatibility Test
 * 
 * Ensures all existing functionality works identically when cloud features are disabled
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
  console.log('Starting Backwards Compatibility Test\n');
  console.log('='.repeat(60));
  
  const runner = new TestRunner();
  
  console.log('\n--- Testing Configuration Files ---');
  
  // Test that old config files still work
  try {
    const screenerConfig = require('../../screenerConfig');
    runner.assert(true, 'screenerConfig.js loads');
    runner.assert(
      typeof screenerConfig === 'object',
      'screenerConfig is an object'
    );
  } catch (error) {
    runner.assert(false, 'screenerConfig.js failed to load: ' + error.message);
  }
  
  try {
    const runtimeConfig = require('../../config/runtimeConfig');
    runner.assert(true, 'runtimeConfig.js loads');
  } catch (error) {
    runner.assert(false, 'runtimeConfig.js failed to load: ' + error.message);
  }
  
  console.log('\n--- Testing Core Modules ---');
  
  // Test SignalGeneratorV2
  let SignalGeneratorV2;
  try {
    SignalGeneratorV2 = require('../../src/lib/SignalGeneratorV2');
    runner.assert(true, 'SignalGeneratorV2 loads');
    
    const generator = new SignalGeneratorV2();
    runner.assert(
      typeof generator.generate === 'function',
      'SignalGeneratorV2.generate is a function'
    );
  } catch (error) {
    runner.assert(false, 'SignalGeneratorV2 failed: ' + error.message);
  }
  
  // Test indicators
  try {
    const indicators = require('../../src/indicators');
    runner.assert(true, 'Indicators module loads');
    runner.assert(
      typeof indicators === 'object',
      'Indicators is an object'
    );
  } catch (error) {
    runner.assert(false, 'Indicators module failed: ' + error.message);
  }
  
  // Test microstructure
  try {
    const microstructure = require('../../src/microstructure');
    runner.assert(true, 'Microstructure module loads');
    runner.assert(
      typeof microstructure === 'object',
      'Microstructure is an object'
    );
  } catch (error) {
    runner.assert(false, 'Microstructure module failed: ' + error.message);
  }
  
  console.log('\n--- Testing Lib Module Exports ---');
  
  try {
    const lib = require('../../src/lib');
    runner.assert(true, 'Lib module loads');
    
    runner.assert(
      lib.SignalGeneratorV2 !== undefined,
      'SignalGeneratorV2 exported from lib'
    );
    
    runner.assert(
      lib.IndicatorEnhancer !== undefined,
      'IndicatorEnhancer exported from lib'
    );
    
    runner.assert(
      lib.CoinRankerV2 !== undefined,
      'CoinRankerV2 exported from lib'
    );
  } catch (error) {
    runner.assert(false, 'Lib module failed: ' + error.message);
  }
  
  console.log('\n--- Testing Optimizer Module ---');
  
  try {
    const optimizer = require('../../src/optimizer');
    runner.assert(true, 'Optimizer module loads');
    
    runner.assert(
      optimizer.PaperTradingEngine !== undefined,
      'PaperTradingEngine exported'
    );
    
    runner.assert(
      optimizer.PaperTradingEngineV2 !== undefined,
      'PaperTradingEngineV2 exported'
    );
  } catch (error) {
    runner.assert(false, 'Optimizer module failed: ' + error.message);
  }
  
  console.log('\n--- Testing Utils Module ---');
  
  try {
    const utils = require('../../src/utils');
    runner.assert(true, 'Utils module loads');
    
    runner.assert(
      utils.PositionCalculator !== undefined,
      'PositionCalculator exported'
    );
  } catch (error) {
    runner.assert(false, 'Utils module failed: ' + error.message);
  }
  
  console.log('\n--- Testing Environment Variables ---');
  
  // Verify cloud env vars don't interfere when not set
  runner.assert(
    process.env.ENABLE_CLAUDE_CLOUD !== 'true',
    'ENABLE_CLAUDE_CLOUD not set to true'
  );
  
  runner.assert(
    process.env.CLAUDE_API_KEY === undefined || process.env.CLAUDE_API_KEY === '',
    'CLAUDE_API_KEY not set'
  );
  
  console.log('\n--- Testing Package.json Scripts ---');
  
  try {
    const pkg = require('../../package.json');
    runner.assert(true, 'package.json loads');
    
    runner.assert(
      pkg.scripts.test !== undefined,
      'test script exists'
    );
    
    runner.assert(
      pkg.scripts.start !== undefined,
      'start script exists'
    );
    
    runner.assert(
      pkg.dependencies['@anthropic-ai/sdk'] !== undefined,
      'Anthropic SDK added to dependencies'
    );
    
    runner.assert(
      pkg.dependencies['node-cache'] !== undefined,
      'node-cache added to dependencies'
    );
    
    // Verify existing dependencies still present
    runner.assert(
      pkg.dependencies.axios !== undefined,
      'axios dependency preserved'
    );
    
    runner.assert(
      pkg.dependencies['decimal.js'] !== undefined,
      'decimal.js dependency preserved'
    );
    
    runner.assert(
      pkg.dependencies.ws !== undefined,
      'ws dependency preserved'
    );
  } catch (error) {
    runner.assert(false, 'package.json failed: ' + error.message);
  }
  
  console.log('\n--- Testing .env.example ---');
  
  const fs = require('fs');
  const path = require('path');
  
  try {
    const envPath = path.join(__dirname, '../../.env.example');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    runner.assert(
      envContent.includes('CLAUDE_API_KEY'),
      '.env.example includes CLAUDE_API_KEY'
    );
    
    runner.assert(
      envContent.includes('ENABLE_CLAUDE_CLOUD'),
      '.env.example includes ENABLE_CLAUDE_CLOUD'
    );
    
    runner.assert(
      envContent.includes('KUCOIN_API_KEY'),
      '.env.example preserves KUCOIN_API_KEY'
    );
  } catch (error) {
    runner.assert(false, '.env.example test failed: ' + error.message);
  }
  
  runner.printSummary();
}

runTests().catch(console.error);
