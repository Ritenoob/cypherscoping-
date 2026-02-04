import { SignalGenerator } from '../src/core/SignalGenerator';
import { WilliamsRIndicator } from '../src/indicators/WilliamsRIndicator';
import { OHLCV, OHLCVWithIndex } from '../src/types';
import { EntryGates, GateConfig } from '../src/core/EntryGates';
import { ConfidenceCalculator } from '../src/core/ConfidenceCalculator';

function generateMockOHLCV(count: number, trend: 'up' | 'down' | 'neutral' = 'neutral'): OHLCV[] {
  const candles: OHLCV[] = [];
  let price = 50000;

  for (let i = 0; i < count; i++) {
    const volatility = 0.02;
    let change = 0;
    
    if (trend === 'up') {
      change = Math.random() * volatility * price * 0.8;
    } else if (trend === 'down') {
      change = -Math.random() * volatility * price * 0.8;
    } else {
      change = (Math.random() - 0.5) * volatility * price;
    }
    
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * volatility * price * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * price * 0.5;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open,
      high,
      low,
      close,
      volume: Math.random() * 1000000
    });

    price = close;
  }

  return candles;
}

function indexOHLCV(ohlcv: OHLCV[]): OHLCVWithIndex[] {
  return ohlcv.map((c, i) => ({ ...c, index: i }));
}

async function testWilliamsRV2() {
  console.log('\n=== Testing Williams %R V2 ===');
  
  const williamsR = new WilliamsRIndicator({ period: 14 });
  const ohlcvUp = generateMockOHLCV(100, 'up');
  const ohlcvDown = generateMockOHLCV(100, 'down');
  const ohlcvNeutral = generateMockOHLCV(100, 'neutral');

  const signalsUp = williamsR.analyze(indexOHLCV(ohlcvUp));
  const signalsDown = williamsR.analyze(indexOHLCV(ohlcvDown));
  const signalsNeutral = williamsR.analyze(indexOHLCV(ohlcvNeutral));

  console.log('Up trend signals:', signalsUp.slice(-5).map(s => `${s.type}:${s.direction}`));
  console.log('Down trend signals:', signalsDown.slice(-5).map(s => `${s.type}:${s.direction}`));
  console.log('Neutral trend signals:', signalsNeutral.slice(-5).map(s => `${s.type}:${s.direction}`));
  
  const latestValueUp = signalsUp[signalsUp.length - 1]?.value;
  const latestValueDown = signalsDown[signalsDown.length - 1]?.value;
  
  console.log(`Latest Williams %R (up): ${latestValueUp?.toFixed(2)}`);
  console.log(`Latest Williams %R (down): ${latestValueDown?.toFixed(2)}`);
  
  console.log('✅ Williams %R V2 test complete\n');
}

async function testEntryGates() {
  console.log('\n=== Testing Entry Gates ===');
  
  const entryGates = new EntryGates({
    deadZone: 20,
    thresholdScore: 80,
    minConfidence: 70,
    minIndicatorsAgreeing: 4,
    confluenceMin: 50,
    strictMode: false,
    blockSoloIndicator: true
  });

  const resultPass = entryGates.evaluate(95, 85, 6, 60, 'long', 5);
  const resultFail = entryGates.evaluate(-15, 95, 2, 30, 'long', 5);

  console.log('Pass test:', { authorized: resultPass.authorized, reasons: resultPass.blockReasons });
  console.log('Fail test:', { authorized: resultFail.authorized, reasons: resultFail.blockReasons });
  
  console.log('✅ Entry Gates test complete\n');
}

async function testConfidenceCalculator() {
  console.log('\n=== Testing Confidence Calculator ===');
  
  const confidenceCalc = new ConfidenceCalculator({
    chopPenalty: 15,
    volatilityPenalty: 10,
    conflictPenalty: 20
  });

  const confidence1 = confidenceCalc.adjust(90, { rsi: 40, atr: 0.02 }, 'ranging');
  const confidence2 = confidenceCalc.adjust(85, { rsi: 65, atr: 0.01 }, 'trending');

  console.log('Confidence 1 (choppy):', confidence1);
  console.log('Confidence 2 (trending):', confidence2);
  
  console.log('✅ Confidence Calculator test complete\n');
}

async function testSignalGenerator() {
  console.log('\n=== Testing Signal Generator ===');
  
  const signalGenerator = new SignalGenerator({
    strictMode: false
  });

  const ohlcvUp = generateMockOHLCV(100, 'up');
  const ohlcvDown = generateMockOHLCV(100, 'down');

  const signalUp = signalGenerator.generate(indexOHLCV(ohlcvUp), null, null);
  const signalDown = signalGenerator.generate(indexOHLCV(ohlcvDown), null, null);

  console.log('Up trend signal:', {
    score: signalUp.compositeScore,
    side: signalUp.side,
    confidence: signalUp.confidence,
    classification: signalUp.classification,
    authorized: signalUp.authorized,
    recommendedLeverage: signalUp.recommendedLeverage
  });

  console.log('Down trend signal:', {
    score: signalDown.compositeScore,
    side: signalDown.side,
    confidence: signalDown.confidence,
    classification: signalDown.classification,
    authorized: signalDown.authorized,
    recommendedLeverage: signalDown.recommendedLeverage
  });
  
  console.log('Indicator scores (up):', Array.from(signalUp.indicatorScores.entries()).slice(0, 5));
  console.log('Indicator scores (down):', Array.from(signalDown.indicatorScores.entries()).slice(0, 5));
  
  console.log('✅ Signal Generator test complete\n');
}

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   CYPHERSCOPE PHASE 1 - SIGNAL ENGINE TESTS');
  console.log('═══════════════════════════════════════════════════');
  
  try {
    await testWilliamsRV2();
    await testEntryGates();
    await testConfidenceCalculator();
    await testSignalGenerator();
    
    console.log('═══════════════════════════════════════════════════');
    console.log('   ✅ ALL TESTS PASSED');
    console.log('═══════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ TEST FAILED:', error);
    process.exit(1);
  }
}

runAllTests().catch(console.error);