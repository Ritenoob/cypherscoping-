#!/usr/bin/env node
const fs = require('fs');

console.log('=== KILLSWITCH FAILURE ANALYSIS ===\n');

const data = JSON.parse(fs.readFileSync('data/trade-history-live.json', 'utf8'));

// Configuration from profit-active.env
const KILLSWITCH_WINDOW_TRADES = 8;
const KILLSWITCH_MIN_TRADES = 4;
const KILLSWITCH_MIN_EXPECTANCY = -0.1;
const KILLSWITCH_MIN_PROFIT_FACTOR = 0.8;
const KILLSWITCH_MAX_DRAWDOWN = 2.5;

// Find the 28-loss streak (trades 466-493)
const streakStart = 466;
const streakEnd = 493;
const streakTrades = data.slice(streakStart, streakEnd + 1);

console.log(`Loss Streak: ${streakTrades.length} trades (${streakStart}-${streakEnd})`);
console.log(`Time: ${new Date(streakTrades[0].timestamp).toISOString()} to ${new Date(streakTrades[streakTrades.length-1].timestamp).toISOString()}\n`);

// Simulate the killswitch logic as each trade comes in
console.log('Simulating killswitch evaluation after each loss:\n');

let recentPnlPercent = [];

for (let i = 0; i < streakTrades.length; i++) {
  const trade = streakTrades[i];
  const tradeNum = streakStart + i;

  // Add this trade's PnL to the recent window
  recentPnlPercent.push(trade.pnlPercent);

  // Keep only last KILLSWITCH_WINDOW_TRADES
  if (recentPnlPercent.length > KILLSWITCH_WINDOW_TRADES) {
    recentPnlPercent.shift();
  }

  // Calculate metrics for recent window
  const metrics = computeRecentMetrics(recentPnlPercent);

  // Check killswitch conditions
  const shouldTrigger =
    metrics.trades >= KILLSWITCH_MIN_TRADES &&
    (metrics.expectancy < KILLSWITCH_MIN_EXPECTANCY ||
     metrics.profitFactor < KILLSWITCH_MIN_PROFIT_FACTOR ||
     metrics.maxDrawdown > KILLSWITCH_MAX_DRAWDOWN);

  if (i === 0 || i === 7 || i === 14 || i === 21 || i === streakTrades.length - 1 || shouldTrigger) {
    console.log(`Trade #${tradeNum} (loss ${i+1}/${streakTrades.length}):`);
    console.log(`  Recent window: ${recentPnlPercent.length} trades, PnL: [${recentPnlPercent.slice(0,3).map(p => p.toFixed(1)).join(', ')}${recentPnlPercent.length > 3 ? ', ...' : ''}]`);
    console.log(`  Expectancy: ${metrics.expectancy.toFixed(3)}% (threshold: ${KILLSWITCH_MIN_EXPECTANCY}%)`);
    console.log(`  Profit Factor: ${metrics.profitFactor.toFixed(2)} (threshold: ${KILLSWITCH_MIN_PROFIT_FACTOR})`);
    console.log(`  Max Drawdown: ${metrics.maxDrawdown.toFixed(2)}% (threshold: ${KILLSWITCH_MAX_DRAWDOWN}%)`);
    console.log(`  Killswitch SHOULD trigger: ${shouldTrigger ? '✅ YES' : '❌ NO'}`);

    if (shouldTrigger) {
      console.log(`  >>> KILLSWITCH SHOULD HAVE STOPPED TRADING HERE <<<`);
    }
    console.log();
  }
}

console.log('=== KILLSWITCH CONFIGURATION ANALYSIS ===\n');
console.log(`Window Size: ${KILLSWITCH_WINDOW_TRADES} trades`);
console.log(`Min Trades: ${KILLSWITCH_MIN_TRADES}`);
console.log(`Min Expectancy: ${KILLSWITCH_MIN_EXPECTANCY}%`);
console.log(`Min Profit Factor: ${KILLSWITCH_MIN_PROFIT_FACTOR}`);
console.log(`Max Drawdown: ${KILLSWITCH_MAX_DRAWDOWN}%\n`);

console.log('=== ROOT CAUSE ANALYSIS ===\n');

console.log('The killswitch logic SHOULD have triggered after trade 8 because:');
console.log('  - Expectancy (-1.0%) < threshold (-0.1%) ✓');
console.log('  - Profit Factor (0.0) < threshold (0.8) ✓');
console.log('  - Max Drawdown (7.73%) > threshold (2.5%) ✓\n');

console.log('Possible reasons why trading continued:\n');
console.log('1. ❌ Killswitch evaluation is not being called');
console.log('2. ❌ Feature disabling is not preventing new trades');
console.log('3. ❌ The "disabledUntil" timestamp is being ignored');
console.log('4. ❌ Multiple concurrent trades entered before first evaluation');
console.log('5. ❌ Bug in the featureKey matching logic');
console.log('6. ❌ Paper trading mode bypasses killswitch checks\n');

console.log('=== IMMEDIATE FIXES REQUIRED ===\n');
console.log('1. Add consecutive loss counter (currently exists but never incremented)');
console.log('2. Stop trading after 5-10 consecutive losses REGARDLESS of killswitch window');
console.log('3. Add pre-trade check: "Is feature disabled?" before executing any order');
console.log('4. Add audit log entry when killswitch triggers');
console.log('5. Add circuit breaker UI indicator/alert\n');

function computeRecentMetrics(values) {
  if (values.length === 0) {
    return { trades: 0, expectancy: 0, profitFactor: 0, maxDrawdown: 0 };
  }

  let total = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let equity = 100;
  let peak = 100;
  let maxDrawdown = 0;

  for (const pnlPercent of values) {
    total += pnlPercent;
    if (pnlPercent >= 0) grossProfit += pnlPercent;
    else grossLoss += Math.abs(pnlPercent);
    equity *= 1 + pnlPercent / 100;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
  }

  return {
    trades: values.length,
    expectancy: total / values.length,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0),
    maxDrawdown
  };
}
