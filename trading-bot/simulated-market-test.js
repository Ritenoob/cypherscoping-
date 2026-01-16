#!/usr/bin/env node
/**
 * Multi-Indicator Simulated Market Test
 * 
 * Since external API is blocked, this creates realistic market scenarios
 * to validate all indicator logic with controlled but market-like data.
 * 
 * Scenarios:
 * 1. Strong uptrend with pullbacks
 * 2. Strong downtrend with bounces
 * 3. Range-bound market
 * 4. Breakout after consolidation
 * 5. V-bottom reversal (oversold recovery)
 * 6. Inverse V-top reversal (overbought rejection)
 */

const {
  StochasticRSI,
  FastStochastic,
  AwesomeOscillator,
  OBVDualMA,
  EMACross,
  BollingerBands,
  MultiIndicatorSignalAggregator
} = require('../src/indicators/ChartOptimizedIndicators');
const WilliamsRIndicator = require('../src/indicators/WilliamsRIndicator');

// ============================================================================
// MARKET SCENARIO GENERATORS
// ============================================================================

function generateVBottomReversal(startPrice = 100, bars = 100) {
  /**
   * V-Bottom Reversal Pattern:
   * - Price drops sharply creating deep oversold
   * - Quick reversal and recovery
   * - Should trigger multiple long signals
   */
  const candles = [];
  let price = startPrice;
  
  for (let i = 0; i < bars; i++) {
    let open, high, low, close;
    
    if (i < 20) {
      // Initial stable period
      const noise = (Math.random() - 0.5) * 0.5;
      close = startPrice + noise;
      open = close - noise * 0.5;
      high = Math.max(open, close) + Math.random() * 0.3;
      low = Math.min(open, close) - Math.random() * 0.3;
    } else if (i < 40) {
      // Sharp decline (creates deep oversold)
      const dropRate = 0.8 + Math.random() * 0.4;
      price -= dropRate;
      close = price;
      open = price + dropRate * 0.8;
      high = open + Math.random() * 0.2;
      low = close - Math.random() * 0.3;
    } else if (i < 45) {
      // Bottom consolidation
      const noise = (Math.random() - 0.5) * 0.3;
      close = price + noise;
      open = close - noise * 0.3;
      high = Math.max(open, close) + Math.random() * 0.2;
      low = Math.min(open, close) - Math.random() * 0.2;
    } else if (i < 70) {
      // Recovery rally (should trigger long signals)
      const riseRate = 0.6 + Math.random() * 0.3;
      price += riseRate;
      close = price;
      open = price - riseRate * 0.7;
      high = close + Math.random() * 0.3;
      low = open - Math.random() * 0.2;
    } else {
      // Continuation with normal volatility
      const change = (Math.random() - 0.4) * 0.5;
      price += change;
      close = price;
      open = price - change * 0.5;
      high = Math.max(open, close) + Math.random() * 0.4;
      low = Math.min(open, close) - Math.random() * 0.3;
    }
    
    candles.push({
      timestamp: Date.now() - (bars - i) * 60000,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.random() * 2000 + (i > 40 && i < 50 ? 3000 : 0)
    });
  }
  
  return candles;
}

function generateInverseVTop(startPrice = 100, bars = 100) {
  /**
   * Inverse V-Top Pattern:
   * - Price rises sharply creating deep overbought
   * - Quick reversal and decline
   * - Should trigger multiple short signals
   */
  const candles = [];
  let price = startPrice;
  
  for (let i = 0; i < bars; i++) {
    let open, high, low, close;
    
    if (i < 20) {
      // Initial stable period
      const noise = (Math.random() - 0.5) * 0.5;
      close = startPrice + noise;
      open = close - noise * 0.5;
      high = Math.max(open, close) + Math.random() * 0.3;
      low = Math.min(open, close) - Math.random() * 0.3;
    } else if (i < 40) {
      // Sharp rally (creates deep overbought)
      const riseRate = 0.8 + Math.random() * 0.4;
      price += riseRate;
      close = price;
      open = price - riseRate * 0.8;
      high = close + Math.random() * 0.3;
      low = open - Math.random() * 0.2;
    } else if (i < 45) {
      // Top consolidation
      const noise = (Math.random() - 0.5) * 0.3;
      close = price + noise;
      open = close - noise * 0.3;
      high = Math.max(open, close) + Math.random() * 0.2;
      low = Math.min(open, close) - Math.random() * 0.2;
    } else if (i < 70) {
      // Decline (should trigger short signals)
      const dropRate = 0.6 + Math.random() * 0.3;
      price -= dropRate;
      close = price;
      open = price + dropRate * 0.7;
      high = open + Math.random() * 0.2;
      low = close - Math.random() * 0.3;
    } else {
      // Continuation decline
      const change = (Math.random() - 0.6) * 0.5;
      price += change;
      close = price;
      open = price - change * 0.5;
      high = Math.max(open, close) + Math.random() * 0.3;
      low = Math.min(open, close) - Math.random() * 0.4;
    }
    
    candles.push({
      timestamp: Date.now() - (bars - i) * 60000,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.random() * 2000 + (i > 40 && i < 50 ? 3000 : 0)
    });
  }
  
  return candles;
}

function generateSqueezeBreakout(startPrice = 100, bars = 100) {
  /**
   * Bollinger Squeeze Breakout:
   * - Price consolidates in tight range
   * - Volatility compression (squeeze)
   * - Breakout with expansion
   */
  const candles = [];
  let price = startPrice;
  
  for (let i = 0; i < bars; i++) {
    let open, high, low, close;
    
    if (i < 60) {
      // Tight consolidation (squeeze)
      const range = 0.2 + (i / 100) * 0.1; // Gradually tightening
      const noise = (Math.random() - 0.5) * range;
      close = startPrice + noise;
      open = close - noise * 0.3;
      high = Math.max(open, close) + Math.random() * range * 0.5;
      low = Math.min(open, close) - Math.random() * range * 0.5;
    } else if (i < 70) {
      // Breakout
      const breakoutStrength = 0.8 + Math.random() * 0.5;
      price += breakoutStrength;
      close = price;
      open = price - breakoutStrength * 0.6;
      high = close + Math.random() * 0.4;
      low = open - Math.random() * 0.1;
    } else {
      // Continuation with higher volatility
      const change = (Math.random() - 0.3) * 1.0;
      price += change;
      close = price;
      open = price - change * 0.5;
      high = Math.max(open, close) + Math.random() * 0.6;
      low = Math.min(open, close) - Math.random() * 0.4;
    }
    
    candles.push({
      timestamp: Date.now() - (bars - i) * 60000,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.random() * 1500 + (i > 58 && i < 70 ? 4000 : 0)
    });
  }
  
  return candles;
}

function generateTrendWithPullbacks(startPrice = 100, bars = 150, direction = 'up') {
  /**
   * Trend with healthy pullbacks:
   * - Clear directional movement
   * - Periodic retracements
   * - Good for testing trend-following signals
   */
  const candles = [];
  let price = startPrice;
  const trendMultiplier = direction === 'up' ? 1 : -1;
  
  for (let i = 0; i < bars; i++) {
    let open, high, low, close;
    
    // Determine if in pullback phase (every 20-30 bars)
    const cyclePosition = i % 25;
    const inPullback = cyclePosition > 18 && cyclePosition < 25;
    
    if (inPullback) {
      // Pullback against trend
      const pullbackStrength = 0.3 + Math.random() * 0.2;
      price -= pullbackStrength * trendMultiplier;
    } else {
      // Trend continuation
      const trendStrength = 0.15 + Math.random() * 0.2;
      price += trendStrength * trendMultiplier;
    }
    
    close = price;
    const change = close - (candles.length > 0 ? candles[candles.length - 1].close : startPrice);
    open = close - change * 0.6;
    
    if (trendMultiplier > 0) {
      high = close + Math.random() * 0.3;
      low = Math.min(open, close) - Math.random() * 0.2;
    } else {
      high = Math.max(open, close) + Math.random() * 0.2;
      low = close - Math.random() * 0.3;
    }
    
    candles.push({
      timestamp: Date.now() - (bars - i) * 60000,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.random() * 2000
    });
  }
  
  return candles;
}

// ============================================================================
// TEST RUNNER
// ============================================================================

function runScenarioTest(name, candles, expectedSignals) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`SCENARIO: ${name}`);
  console.log('='.repeat(70));
  
  // Initialize all indicators
  const wr = new WilliamsRIndicator({ period: 14, deepOversold: -85, deepOverbought: -15 });
  const stochRSI = new StochasticRSI({ rsiPeriod: 50, stochPeriod: 16, kSmooth: 4, dSmooth: 5 });
  const stoch = new FastStochastic({ kPeriod: 14, dPeriod: 3 });
  const ao = new AwesomeOscillator({ fastPeriod: 5, slowPeriod: 34 });
  const obv = new OBVDualMA({ wmaPeriod: 20, smaPeriod: 20 });
  const ema = new EMACross({ fastPeriod: 10, slowPeriod: 3 });
  const bb = new BollingerBands({ period: 20, stdDev: 2 });
  const aggregator = new MultiIndicatorSignalAggregator({ minSignalsForEntry: 3 });
  
  // Track signals
  const signals = {
    williamsR: { long: 0, short: 0 },
    stochRSI: { long: 0, short: 0 },
    stochastic: { long: 0, short: 0 },
    ao: { long: 0, short: 0 },
    obv: { long: 0, short: 0 },
    ema: { long: 0, short: 0 },
    bollinger: { long: 0, short: 0 },
    aggregated: { long: 0, short: 0 }
  };
  
  const detailedSignals = [];
  
  // Process candles
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    
    // Update individual indicators
    const wrResult = wr.update(candle);
    const stochRSIResult = stochRSI.update(candle);
    const stochResult = stoch.update(candle);
    const aoResult = ao.update(candle);
    const obvResult = obv.update(candle);
    const emaResult = ema.update(candle);
    const bbResult = bb.update(candle);
    const aggResult = aggregator.update(candle);
    
    // Count Williams %R signals
    for (const sig of wrResult.signals || []) {
      if (sig.type === 'bullish_crossover') {
        signals.williamsR.long++;
        detailedSignals.push({ bar: i, indicator: 'Williams %R', direction: 'LONG', type: sig.type });
      } else if (sig.type === 'bearish_crossover') {
        signals.williamsR.short++;
        detailedSignals.push({ bar: i, indicator: 'Williams %R', direction: 'SHORT', type: sig.type });
      }
    }
    
    // Count StochRSI signals
    if (stochRSIResult.signal) {
      if (stochRSIResult.signal.direction === 'long') {
        signals.stochRSI.long++;
        detailedSignals.push({ bar: i, indicator: 'StochRSI', direction: 'LONG', type: stochRSIResult.signal.type });
      } else if (stochRSIResult.signal.direction === 'short') {
        signals.stochRSI.short++;
        detailedSignals.push({ bar: i, indicator: 'StochRSI', direction: 'SHORT', type: stochRSIResult.signal.type });
      }
    }
    
    // Count Stochastic signals
    if (stochResult.signal) {
      if (stochResult.signal.direction === 'long') {
        signals.stochastic.long++;
        detailedSignals.push({ bar: i, indicator: 'Stochastic', direction: 'LONG', type: stochResult.signal.type });
      } else if (stochResult.signal.direction === 'short') {
        signals.stochastic.short++;
        detailedSignals.push({ bar: i, indicator: 'Stochastic', direction: 'SHORT', type: stochResult.signal.type });
      }
    }
    
    // Count AO signals
    if (aoResult.signal) {
      if (aoResult.signal.direction === 'long') {
        signals.ao.long++;
        detailedSignals.push({ bar: i, indicator: 'AO', direction: 'LONG', type: aoResult.signal.type });
      } else if (aoResult.signal.direction === 'short') {
        signals.ao.short++;
        detailedSignals.push({ bar: i, indicator: 'AO', direction: 'SHORT', type: aoResult.signal.type });
      }
    }
    
    // Count OBV signals
    if (obvResult.signal) {
      if (obvResult.signal.direction === 'long') {
        signals.obv.long++;
        detailedSignals.push({ bar: i, indicator: 'OBV', direction: 'LONG', type: obvResult.signal.type });
      } else if (obvResult.signal.direction === 'short') {
        signals.obv.short++;
        detailedSignals.push({ bar: i, indicator: 'OBV', direction: 'SHORT', type: obvResult.signal.type });
      }
    }
    
    // Count EMA signals
    if (emaResult.signal) {
      if (emaResult.signal.direction === 'long') {
        signals.ema.long++;
        detailedSignals.push({ bar: i, indicator: 'EMA', direction: 'LONG', type: emaResult.signal.type });
      } else if (emaResult.signal.direction === 'short') {
        signals.ema.short++;
        detailedSignals.push({ bar: i, indicator: 'EMA', direction: 'SHORT', type: emaResult.signal.type });
      }
    }
    
    // Count Bollinger signals
    if (bbResult.signal && bbResult.signal.direction !== 'neutral') {
      if (bbResult.signal.direction === 'long') {
        signals.bollinger.long++;
        detailedSignals.push({ bar: i, indicator: 'Bollinger', direction: 'LONG', type: bbResult.signal.type });
      } else if (bbResult.signal.direction === 'short') {
        signals.bollinger.short++;
        detailedSignals.push({ bar: i, indicator: 'Bollinger', direction: 'SHORT', type: bbResult.signal.type });
      }
    }
    
    // Count aggregated signals
    if (aggResult.signal) {
      if (aggResult.signal.direction === 'long') {
        signals.aggregated.long++;
      } else if (aggResult.signal.direction === 'short') {
        signals.aggregated.short++;
      }
    }
  }
  
  // Display results
  console.log('\n--- Individual Indicator Signals ---');
  for (const [ind, counts] of Object.entries(signals)) {
    if (ind !== 'aggregated') {
      console.log(`  ${ind.padEnd(12)}: ${counts.long} LONG, ${counts.short} SHORT`);
    }
  }
  
  console.log('\n--- Aggregated Multi-Indicator Signals ---');
  console.log(`  LONG signals:  ${signals.aggregated.long}`);
  console.log(`  SHORT signals: ${signals.aggregated.short}`);
  
  // Validate against expected
  const totalLong = signals.aggregated.long;
  const totalShort = signals.aggregated.short;
  
  let passed = true;
  if (expectedSignals.long && totalLong < expectedSignals.long) {
    console.log(`\n  ✗ Expected at least ${expectedSignals.long} LONG signals, got ${totalLong}`);
    passed = false;
  } else if (expectedSignals.long) {
    console.log(`\n  ✓ LONG signals meet expectations (${totalLong} >= ${expectedSignals.long})`);
  }
  
  if (expectedSignals.short && totalShort < expectedSignals.short) {
    console.log(`  ✗ Expected at least ${expectedSignals.short} SHORT signals, got ${totalShort}`);
    passed = false;
  } else if (expectedSignals.short) {
    console.log(`  ✓ SHORT signals meet expectations (${totalShort} >= ${expectedSignals.short})`);
  }
  
  // Show detailed signal timeline
  if (detailedSignals.length > 0) {
    console.log('\n--- Signal Timeline (first 10) ---');
    for (const sig of detailedSignals.slice(0, 10)) {
      console.log(`  Bar ${sig.bar.toString().padStart(3)}: ${sig.indicator.padEnd(12)} ${sig.direction} (${sig.type})`);
    }
    if (detailedSignals.length > 10) {
      console.log(`  ... and ${detailedSignals.length - 10} more signals`);
    }
  }
  
  return { passed, signals, detailedSignals };
}

// ============================================================================
// PERFORMANCE SIMULATION
// ============================================================================

function simulateTrading(candles, signals) {
  console.log('\n--- Trading Simulation ---');
  
  const trades = [];
  let position = null;
  let equity = 10000;
  const positionSize = 0.1; // 10% of equity per trade
  
  // Create signal map for quick lookup
  const signalMap = new Map();
  for (const sig of signals) {
    if (!signalMap.has(sig.bar)) {
      signalMap.set(sig.bar, []);
    }
    signalMap.get(sig.bar).push(sig);
  }
  
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const barSignals = signalMap.get(i) || [];
    
    // Check for exit conditions if in position
    if (position) {
      const pl = position.direction === 'LONG' ?
        (candle.close - position.entry) / position.entry :
        (position.entry - candle.close) / position.entry;
      
      // Exit on opposite signal or stop/target
      const oppositeSignal = barSignals.some(s => 
        s.direction !== position.direction && 
        ['Williams %R', 'Stochastic', 'StochRSI'].includes(s.indicator)
      );
      
      if (pl >= 0.015 || pl <= -0.01 || oppositeSignal) {
        const tradeReturn = pl * positionSize * equity;
        equity += tradeReturn;
        
        trades.push({
          entry: position.entry,
          exit: candle.close,
          direction: position.direction,
          return: pl,
          profit: tradeReturn
        });
        
        position = null;
      }
    }
    
    // Check for entry signals (if not in position)
    if (!position && barSignals.length >= 2) {
      const longSignals = barSignals.filter(s => s.direction === 'LONG');
      const shortSignals = barSignals.filter(s => s.direction === 'SHORT');
      
      if (longSignals.length >= 2) {
        position = {
          direction: 'LONG',
          entry: candle.close,
          bar: i
        };
      } else if (shortSignals.length >= 2) {
        position = {
          direction: 'SHORT',
          entry: candle.close,
          bar: i
        };
      }
    }
  }
  
  // Calculate metrics
  const wins = trades.filter(t => t.return > 0).length;
  const losses = trades.filter(t => t.return <= 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const totalReturn = trades.reduce((sum, t) => sum + t.return, 0);
  const avgReturn = trades.length > 0 ? totalReturn / trades.length : 0;
  
  console.log(`  Total trades: ${trades.length}`);
  console.log(`  Wins: ${wins}, Losses: ${losses}`);
  console.log(`  Win Rate: ${winRate.toFixed(1)}%`);
  console.log(`  Average Return: ${(avgReturn * 100).toFixed(2)}%`);
  console.log(`  Total Return: ${(totalReturn * 100).toFixed(2)}%`);
  console.log(`  Final Equity: $${equity.toFixed(2)} (from $10,000)`);
  
  return { trades, winRate, totalReturn, finalEquity: equity };
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('MULTI-INDICATOR SIMULATED MARKET TEST');
  console.log('█'.repeat(70));
  
  let totalPassed = 0;
  let totalTests = 0;
  const allResults = [];
  
  // Test 1: V-Bottom Reversal (expects LONG signals)
  console.log('\n\n' + '▓'.repeat(70));
  console.log('TEST 1: V-BOTTOM REVERSAL');
  console.log('▓'.repeat(70));
  const vBottom = generateVBottomReversal(100, 100);
  const result1 = runScenarioTest('V-Bottom Reversal', vBottom, { long: 1, short: 0 });
  const sim1 = simulateTrading(vBottom, result1.detailedSignals);
  allResults.push({ name: 'V-Bottom', ...result1, simulation: sim1 });
  totalTests++;
  if (result1.passed) totalPassed++;
  
  // Test 2: Inverse V-Top (expects SHORT signals)
  console.log('\n\n' + '▓'.repeat(70));
  console.log('TEST 2: INVERSE V-TOP');
  console.log('▓'.repeat(70));
  const vTop = generateInverseVTop(100, 100);
  const result2 = runScenarioTest('Inverse V-Top', vTop, { long: 0, short: 1 });
  const sim2 = simulateTrading(vTop, result2.detailedSignals);
  allResults.push({ name: 'Inverse V-Top', ...result2, simulation: sim2 });
  totalTests++;
  if (result2.passed) totalPassed++;
  
  // Test 3: Squeeze Breakout
  console.log('\n\n' + '▓'.repeat(70));
  console.log('TEST 3: SQUEEZE BREAKOUT');
  console.log('▓'.repeat(70));
  const squeeze = generateSqueezeBreakout(100, 100);
  const result3 = runScenarioTest('Squeeze Breakout', squeeze, { long: 1 });
  const sim3 = simulateTrading(squeeze, result3.detailedSignals);
  allResults.push({ name: 'Squeeze Breakout', ...result3, simulation: sim3 });
  totalTests++;
  if (result3.passed) totalPassed++;
  
  // Test 4: Uptrend with Pullbacks
  console.log('\n\n' + '▓'.repeat(70));
  console.log('TEST 4: UPTREND WITH PULLBACKS');
  console.log('▓'.repeat(70));
  const uptrend = generateTrendWithPullbacks(100, 150, 'up');
  const result4 = runScenarioTest('Uptrend with Pullbacks', uptrend, { long: 1 });
  const sim4 = simulateTrading(uptrend, result4.detailedSignals);
  allResults.push({ name: 'Uptrend', ...result4, simulation: sim4 });
  totalTests++;
  if (result4.passed) totalPassed++;
  
  // Test 5: Downtrend with Bounces
  console.log('\n\n' + '▓'.repeat(70));
  console.log('TEST 5: DOWNTREND WITH BOUNCES');
  console.log('▓'.repeat(70));
  const downtrend = generateTrendWithPullbacks(100, 150, 'down');
  const result5 = runScenarioTest('Downtrend with Bounces', downtrend, { short: 1 });
  const sim5 = simulateTrading(downtrend, result5.detailedSignals);
  allResults.push({ name: 'Downtrend', ...result5, simulation: sim5 });
  totalTests++;
  if (result5.passed) totalPassed++;
  
  // Summary
  console.log('\n\n' + '█'.repeat(70));
  console.log('FINAL SUMMARY');
  console.log('█'.repeat(70));
  
  console.log(`\n--- Scenario Test Results ---`);
  console.log(`Passed: ${totalPassed}/${totalTests} (${((totalPassed/totalTests)*100).toFixed(0)}%)`);
  
  console.log(`\n--- Aggregated Trading Performance ---`);
  let totalTrades = 0, totalWins = 0, totalPL = 0;
  
  for (const r of allResults) {
    if (r.simulation) {
      totalTrades += r.simulation.trades.length;
      totalWins += r.simulation.trades.filter(t => t.return > 0).length;
      totalPL += r.simulation.totalReturn;
      console.log(`  ${r.name.padEnd(20)}: ${r.simulation.trades.length} trades, ${r.simulation.winRate.toFixed(1)}% WR, ${(r.simulation.totalReturn * 100).toFixed(2)}% return`);
    }
  }
  
  const overallWinRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
  console.log(`\n  OVERALL: ${totalTrades} trades, ${overallWinRate.toFixed(1)}% win rate, ${(totalPL * 100).toFixed(2)}% total return`);
  
  // Indicator Performance Analysis
  console.log(`\n--- Indicator Signal Count by Scenario ---`);
  console.log('Indicator'.padEnd(15) + allResults.map(r => r.name.slice(0, 10).padStart(12)).join(''));
  
  const indicators = ['williamsR', 'stochRSI', 'stochastic', 'ao', 'obv', 'ema', 'bollinger'];
  for (const ind of indicators) {
    let row = ind.padEnd(15);
    for (const r of allResults) {
      const total = (r.signals[ind]?.long || 0) + (r.signals[ind]?.short || 0);
      row += total.toString().padStart(12);
    }
    console.log(row);
  }
  
  console.log('\n' + '█'.repeat(70));
  console.log('VALIDATION COMPLETE');
  console.log('█'.repeat(70));
  
  return totalPassed === totalTests;
}

const success = main();
process.exit(success ? 0 : 1);
