/**
 * Microstructure Analyzer Test Suite
 * 
 * Tests all 3 live-only microstructure analyzers:
 * - BuySellRatioAnalyzer
 * - PriceRatioAnalyzer
 * - FundingRateAnalyzer
 */

const {
  BuySellRatioAnalyzer,
  PriceRatioAnalyzer,
  FundingRateAnalyzer
} = require('../src/microstructure');

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

function generateTrades(count, buyRatio = 0.5) {
  const trades = [];
  const basePrice = 100;
  
  for (let i = 0; i < count; i++) {
    const isBuy = Math.random() < buyRatio;
    const price = basePrice + (Math.random() - 0.5) * 2;
    const size = 100 + Math.random() * 900;
    
    trades.push({
      side: isBuy ? 'buy' : 'sell',
      price,
      size,
      ts: Date.now() + i * 100
    });
  }
  
  return trades;
}

async function testBuySellRatioAnalyzer(runner) {
  console.log('\n--- Testing BuySellRatio Analyzer ---');
  
  const analyzer = new BuySellRatioAnalyzer();
  
  const tradesNotLive = generateTrades(100);
  for (const trade of tradesNotLive) {
    analyzer.processTrade(trade);
  }
  
  const resultNotLive = analyzer.getResult();
  
  runner.assert(
    resultNotLive.signals.length === 0,
    'BuySellRatio returns no signals when not in live mode'
  );
  
  runner.assert(
    resultNotLive.warning && resultNotLive.warning.includes('live'),
    'BuySellRatio includes warning when not in live mode'
  );
  
  analyzer.enableLiveMode();
  
  const heavyBuyTrades = generateTrades(100, 0.8);
  for (const trade of heavyBuyTrades) {
    analyzer.processTrade(trade);
  }
  
  const resultLive = analyzer.getResult();
  
  runner.assert(
    typeof resultLive.value === 'object',
    'BuySellRatio returns object in live mode'
  );
  
  runner.assert(
    'ratio' in resultLive.value || 'buyVolume' in resultLive.value,
    'BuySellRatio has volume/ratio data'
  );
  
  runner.assert(
    Array.isArray(resultLive.signals),
    'BuySellRatio returns signals array in live mode'
  );
  
  const heavySellAnalyzer = new BuySellRatioAnalyzer();
  heavySellAnalyzer.enableLiveMode();
  
  const heavySellTrades = generateTrades(100, 0.2);
  for (const trade of heavySellTrades) {
    heavySellAnalyzer.processTrade(trade);
  }
  
  const sellResult = heavySellAnalyzer.getResult();
  
  runner.assert(
    sellResult.signals.some(s => s.direction === 'bearish') || 
    (sellResult.value.ratio !== undefined && sellResult.value.ratio < 0.5),
    'BuySellRatio detects heavy selling pressure'
  );
}

async function testPriceRatioAnalyzer(runner) {
  console.log('\n--- Testing PriceRatio Analyzer ---');
  
  const analyzer = new PriceRatioAnalyzer();
  
  const normalPrices = {
    bid: 99.95,
    ask: 100.05,
    last: 100.00,
    mark: 100.02,
    index: 100.01
  };
  
  const resultNotLive = analyzer.update(normalPrices);
  
  runner.assert(
    resultNotLive.signals.length === 0,
    'PriceRatio returns no signals when not in live mode'
  );
  
  analyzer.enableLiveMode();
  
  for (let i = 0; i < 10; i++) {
    analyzer.update(normalPrices);
  }
  
  const resultLive = analyzer.getResult();
  
  runner.assert(
    typeof resultLive.value === 'object',
    'PriceRatio returns object in live mode'
  );
  
  runner.assert(
    'spread' in resultLive.value || 'basis' in resultLive.value,
    'PriceRatio has spread/basis data'
  );
  
  const premiumAnalyzer = new PriceRatioAnalyzer();
  premiumAnalyzer.enableLiveMode();
  
  const premiumPrices = {
    bid: 101.00,
    ask: 101.10,
    last: 101.05,
    mark: 101.05,
    index: 100.00
  };
  
  for (let i = 0; i < 10; i++) {
    premiumAnalyzer.update(premiumPrices);
  }
  
  const premiumResult = premiumAnalyzer.getResult();
  
  runner.assert(
    premiumResult.value.basis > 0 || 
    premiumResult.signals.some(s => s.type && s.type.includes('basis')),
    'PriceRatio detects futures premium'
  );
  
  const wideSpreadAnalyzer = new PriceRatioAnalyzer();
  wideSpreadAnalyzer.enableLiveMode();
  
  const wideSpreadPrices = {
    bid: 99.00,
    ask: 101.00,
    last: 100.00,
    mark: 100.00,
    index: 100.00
  };
  
  for (let i = 0; i < 10; i++) {
    wideSpreadAnalyzer.update(wideSpreadPrices);
  }
  
  const wideSpreadResult = wideSpreadAnalyzer.getResult();
  
  runner.assert(
    wideSpreadResult.value.spread > 1 || 
    wideSpreadResult.signals.some(s => s.type && s.type.includes('spread')),
    'PriceRatio detects wide spread'
  );
}

async function testFundingRateAnalyzer(runner) {
  console.log('\n--- Testing FundingRate Analyzer ---');
  
  const analyzer = new FundingRateAnalyzer();
  
  const normalFunding = {
    currentRate: 0.0001,
    predictedRate: 0.00012,
    nextFundingTime: Date.now() + 4 * 60 * 60 * 1000
  };
  
  const resultNotLive = analyzer.update(normalFunding);
  
  runner.assert(
    resultNotLive.signals.length === 0,
    'FundingRate returns no signals when not in live mode'
  );
  
  analyzer.enableLiveMode();
  
  for (let i = 0; i < 5; i++) {
    analyzer.update(normalFunding);
  }
  
  const resultLive = analyzer.getResult();
  
  runner.assert(
    typeof resultLive.value === 'object',
    'FundingRate returns object in live mode'
  );
  
  runner.assert(
    'currentRate' in resultLive.value || 'rate' in resultLive.value,
    'FundingRate has rate data'
  );
  
  const extremeAnalyzer = new FundingRateAnalyzer();
  extremeAnalyzer.enableLiveMode();
  
  const extremeFunding = {
    currentRate: 0.015,
    predictedRate: 0.018,
    nextFundingTime: Date.now() + 1 * 60 * 60 * 1000
  };
  
  for (let i = 0; i < 5; i++) {
    extremeAnalyzer.update(extremeFunding);
  }
  
  const extremeResult = extremeAnalyzer.getResult();
  
  runner.assert(
    extremeResult.signals.some(s => 
      s.strength === 'extreme' || 
      s.strength === 'very_strong' ||
      (s.type && s.type.includes('extreme'))
    ),
    'FundingRate detects extreme funding rate'
  );
  
  const negativeAnalyzer = new FundingRateAnalyzer();
  negativeAnalyzer.enableLiveMode();
  
  const negativeFunding = {
    currentRate: -0.012,
    predictedRate: -0.015,
    nextFundingTime: Date.now() + 2 * 60 * 60 * 1000
  };
  
  for (let i = 0; i < 5; i++) {
    negativeAnalyzer.update(negativeFunding);
  }
  
  const negativeResult = negativeAnalyzer.getResult();
  
  runner.assert(
    negativeResult.value.currentRate < 0 || negativeResult.value.rate < 0,
    'FundingRate handles negative funding rates'
  );
}

async function testLiveOnlyValidation(runner) {
  console.log('\n--- Testing Live-Only Validation ---');
  
  const bsr = new BuySellRatioAnalyzer();
  const pr = new PriceRatioAnalyzer();
  const fr = new FundingRateAnalyzer();
  
  runner.assert(
    bsr.liveOnlyValidation === true,
    'BuySellRatioAnalyzer has liveOnlyValidation flag'
  );
  
  runner.assert(
    pr.liveOnlyValidation === true,
    'PriceRatioAnalyzer has liveOnlyValidation flag'
  );
  
  runner.assert(
    fr.liveOnlyValidation === true,
    'FundingRateAnalyzer has liveOnlyValidation flag'
  );
  
  runner.assert(
    typeof bsr.enableLiveMode === 'function',
    'BuySellRatioAnalyzer has enableLiveMode method'
  );
  
  runner.assert(
    typeof pr.enableLiveMode === 'function',
    'PriceRatioAnalyzer has enableLiveMode method'
  );
  
  runner.assert(
    typeof fr.enableLiveMode === 'function',
    'FundingRateAnalyzer has enableLiveMode method'
  );
}

async function runAllTests() {
  console.log('Starting Microstructure Analyzer Test Suite\n');
  console.log('='.repeat(60));
  
  const runner = new TestRunner();
  
  try {
    await testBuySellRatioAnalyzer(runner);
    await testPriceRatioAnalyzer(runner);
    await testFundingRateAnalyzer(runner);
    await testLiveOnlyValidation(runner);
  } catch (error) {
    console.error('Test execution error:', error);
    runner.failed++;
  }
  
  runner.printSummary();
  
  process.exit(runner.failed > 0 ? 1 : 0);
}

runAllTests();
