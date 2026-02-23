#!/usr/bin/env node
const fs = require('fs');

console.log('Analyzing consecutive loss streaks in trade history...\n');

const data = JSON.parse(fs.readFileSync('data/trade-history-live.json', 'utf8'));

// Find all consecutive loss streaks
let maxStreak = 0;
let currentStreak = 0;
let maxStreakStart = -1;
let maxStreakEnd = -1;
let currentStreakStart = -1;

const streaks = [];

data.forEach((trade, idx) => {
  const isLoss = trade.pnlPercent < 0;

  if (isLoss) {
    if (currentStreak === 0) {
      currentStreakStart = idx;
    }
    currentStreak++;

    if (currentStreak > maxStreak) {
      maxStreak = currentStreak;
      maxStreakStart = currentStreakStart;
      maxStreakEnd = idx;
    }
  } else {
    if (currentStreak > 0) {
      streaks.push({
        start: currentStreakStart,
        end: idx - 1,
        length: currentStreak
      });
    }
    currentStreak = 0;
  }
});

// Handle case where data ends with a loss streak
if (currentStreak > 0) {
  streaks.push({
    start: currentStreakStart,
    end: data.length - 1,
    length: currentStreak
  });
}

console.log(`Total trades analyzed: ${data.length}`);
console.log(`Max consecutive loss streak: ${maxStreak}`);
console.log(`Streak location: trades ${maxStreakStart} to ${maxStreakEnd}\n`);

// Show top 10 longest streaks
console.log('Top 10 longest loss streaks:');
streaks.sort((a, b) => b.length - a.length).slice(0, 10).forEach((streak, i) => {
  const startTrade = data[streak.start];
  const endTrade = data[streak.end];
  const startDate = new Date(startTrade.timestamp).toISOString();
  const endDate = new Date(endTrade.timestamp).toISOString();
  console.log(`${i + 1}. ${streak.length} losses: trades ${streak.start}-${streak.end} (${startDate} to ${endDate})`);
});

// Detailed analysis of max streak
if (maxStreak > 0) {
  console.log(`\n=== DETAILED ANALYSIS OF MAX STREAK (${maxStreak} losses) ===\n`);

  const streakTrades = data.slice(maxStreakStart, maxStreakEnd + 1);
  const firstTrade = streakTrades[0];
  const lastTrade = streakTrades[streakTrades.length - 1];

  console.log(`Time period: ${new Date(firstTrade.timestamp).toISOString()} to ${new Date(lastTrade.timestamp).toISOString()}`);
  console.log(`Duration: ${((lastTrade.timestamp - firstTrade.timestamp) / 1000 / 60).toFixed(1)} minutes`);
  console.log(`Symbol: ${firstTrade.symbol}`);
  console.log(`Feature: ${firstTrade.featureKey}`);

  const totalLoss = streakTrades.reduce((sum, t) => sum + t.pnlPercent, 0);
  const avgLoss = totalLoss / streakTrades.length;
  const worstLoss = Math.min(...streakTrades.map(t => t.pnlPercent));

  console.log(`\nLoss Statistics:`);
  console.log(`Total cumulative loss: ${totalLoss.toFixed(2)}%`);
  console.log(`Average loss per trade: ${avgLoss.toFixed(2)}%`);
  console.log(`Worst single loss: ${worstLoss.toFixed(2)}%`);

  // Sample trades
  console.log(`\nFirst 5 trades in streak:`);
  streakTrades.slice(0, 5).forEach((t, i) => {
    console.log(`  ${i + 1}. ${new Date(t.timestamp).toISOString().substr(11, 8)} | PnL: ${t.pnlPercent}% | ${t.featureKey}`);
  });

  console.log(`\nLast 5 trades in streak:`);
  streakTrades.slice(-5).forEach((t, i) => {
    console.log(`  ${streakTrades.length - 5 + i + 1}. ${new Date(t.timestamp).toISOString().substr(11, 8)} | PnL: ${t.pnlPercent}% | ${t.featureKey}`);
  });

  // Check what happened before and after
  if (maxStreakStart > 0) {
    const before = data[maxStreakStart - 1];
    console.log(`\nTrade before streak: ${before.pnlPercent > 0 ? 'WIN' : 'LOSS'} ${before.pnlPercent}%`);
  }

  if (maxStreakEnd < data.length - 1) {
    const after = data[maxStreakEnd + 1];
    console.log(`Trade after streak: ${after.pnlPercent > 0 ? 'WIN' : 'LOSS'} ${after.pnlPercent}%`);
  }
}

// Calculate overall statistics
const wins = data.filter(t => t.pnlPercent > 0).length;
const losses = data.filter(t => t.pnlPercent < 0).length;
const winRate = (wins / data.length * 100).toFixed(2);

console.log(`\n=== OVERALL STATISTICS ===`);
console.log(`Win rate: ${winRate}% (${wins} wins, ${losses} losses)`);
console.log(`Total loss streaks found: ${streaks.length}`);
console.log(`Average loss streak length: ${(streaks.reduce((sum, s) => sum + s.length, 0) / streaks.length).toFixed(1)}`);
