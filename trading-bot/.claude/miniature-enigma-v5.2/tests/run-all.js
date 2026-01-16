/**
 * Test Runner - Execute all test suites
 */
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('='.repeat(60));
  console.log('MINIATURE ENIGMA - TEST SUITE');
  console.log('='.repeat(60));
  
  const testFiles = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.test.js'))
    .sort();
  
  let passed = 0;
  let failed = 0;
  
  for (const file of testFiles) {
    console.log(`\nRunning: ${file}`);
    console.log('-'.repeat(40));
    
    try {
      const testModule = require(path.join(__dirname, file));
      if (typeof testModule.run === 'function') {
        const result = await testModule.run();
        passed += result.passed || 0;
        failed += result.failed || 0;
      }
    } catch (error) {
      console.error(`FAILED: ${error.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
