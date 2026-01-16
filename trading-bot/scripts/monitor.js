#!/usr/bin/env node
/**
 * Live Performance Monitor & Auto-Tuner
 * 
 * Monitors live trading performance and automatically adjusts
 * parameters when performance degrades. Designed for autonomous
 * 24/7 operation with Claude Code oversight.
 * 
 * Usage: node scripts/monitor.js [--interval 300] [--auto-tune]
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class PerformanceMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      checkInterval: options.interval || 300000, // 5 minutes
      autoTune: options.autoTune || false,
      alertThresholds: {
        winRateMin: 0.50,
        winRateWarn: 0.55,
        profitFactorMin: 1.2,
        profitFactorWarn: 1.5,
        drawdownMax: 0.15,
        drawdownWarn: 0.10,
        consecutiveLossesMax: 5
      },
      tuningTriggers: {
        winRateBelow: 0.50,
        profitFactorBelow: 1.2,
        drawdownAbove: 0.12,
        consecutiveLossesAbove: 4
      },
      paths: {
        trades: './logs/trades.json',
        performance: './logs/performance.json',
        alerts: './logs/alerts.json',
        tuningLog: './logs/tuning_log.json'
      }
    };
    
    this.state = {
      running: false,
      lastCheck: null,
      currentMetrics: null,
      alerts: [],
      tuningHistory: []
    };
    
    this.trades = [];
    this.equityCurve = [];
  }
  
  log(msg, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [MONITOR] [${level}] ${msg}`;
    console.log(line);
    
    if (level === 'ALERT' || level === 'ERROR') {
      this.state.alerts.push({ timestamp, level, message: msg });
      this.emit('alert', { timestamp, level, message: msg });
    }
  }
  
  loadTrades() {
    try {
      if (fs.existsSync(this.options.paths.trades)) {
        this.trades = JSON.parse(fs.readFileSync(this.options.paths.trades, 'utf-8'));
        return true;
      }
    } catch (e) {
      this.log(`Error loading trades: ${e.message}`, 'ERROR');
    }
    return false;
  }
  
  saveTrades() {
    fs.writeFileSync(this.options.paths.trades, JSON.stringify(this.trades, null, 2));
  }
  
  recordTrade(trade) {
    this.trades.push({
      ...trade,
      timestamp: trade.timestamp || Date.now()
    });
    this.saveTrades();
    this.emit('trade', trade);
    
    // Check for alerts after each trade
    this.checkAlerts();
  }
  
  calculateMetrics(windowHours = 24) {
    const cutoff = Date.now() - (windowHours * 60 * 60 * 1000);
    const recentTrades = this.trades.filter(t => t.timestamp >= cutoff);
    
    if (recentTrades.length === 0) {
      return null;
    }
    
    const winners = recentTrades.filter(t => t.pnl > 0);
    const losers = recentTrades.filter(t => t.pnl <= 0);
    
    const grossProfit = winners.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0));
    
    // Calculate consecutive losses
    let maxConsecutiveLosses = 0;
    let currentStreak = 0;
    for (const trade of recentTrades.sort((a, b) => a.timestamp - b.timestamp)) {
      if (trade.pnl <= 0) {
        currentStreak++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    
    // Calculate drawdown
    let peak = 10000; // Starting equity
    let equity = 10000;
    let maxDrawdown = 0;
    
    for (const trade of recentTrades.sort((a, b) => a.timestamp - b.timestamp)) {
      equity += trade.pnl;
      peak = Math.max(peak, equity);
      const drawdown = (peak - equity) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    // Calculate Sharpe ratio (simplified)
    const returns = recentTrades.map(t => t.pnl / 10000);
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
    
    return {
      window: `${windowHours}h`,
      trades: recentTrades.length,
      winners: winners.length,
      losers: losers.length,
      winRate: recentTrades.length > 0 ? winners.length / recentTrades.length : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0),
      grossProfit,
      grossLoss,
      netPnl: grossProfit - grossLoss,
      avgWin: winners.length > 0 ? grossProfit / winners.length : 0,
      avgLoss: losers.length > 0 ? grossLoss / losers.length : 0,
      maxDrawdown,
      consecutiveLosses: maxConsecutiveLosses,
      currentStreak,
      sharpeRatio,
      timestamp: Date.now()
    };
  }
  
  checkAlerts() {
    const metrics = this.calculateMetrics(24);
    if (!metrics || metrics.trades < 5) return;
    
    const { alertThresholds } = this.options;
    
    // Critical alerts
    if (metrics.winRate < alertThresholds.winRateMin) {
      this.log(`CRITICAL: Win rate ${(metrics.winRate * 100).toFixed(1)}% below minimum ${alertThresholds.winRateMin * 100}%`, 'ALERT');
    }
    
    if (metrics.profitFactor < alertThresholds.profitFactorMin) {
      this.log(`CRITICAL: Profit factor ${metrics.profitFactor.toFixed(2)} below minimum ${alertThresholds.profitFactorMin}`, 'ALERT');
    }
    
    if (metrics.maxDrawdown > alertThresholds.drawdownMax) {
      this.log(`CRITICAL: Drawdown ${(metrics.maxDrawdown * 100).toFixed(1)}% exceeds maximum ${alertThresholds.drawdownMax * 100}%`, 'ALERT');
    }
    
    if (metrics.consecutiveLosses >= alertThresholds.consecutiveLossesMax) {
      this.log(`CRITICAL: ${metrics.consecutiveLosses} consecutive losses - consider pausing`, 'ALERT');
    }
    
    // Warning alerts
    if (metrics.winRate < alertThresholds.winRateWarn && metrics.winRate >= alertThresholds.winRateMin) {
      this.log(`WARNING: Win rate ${(metrics.winRate * 100).toFixed(1)}% approaching minimum`, 'WARN');
    }
    
    if (metrics.profitFactor < alertThresholds.profitFactorWarn && metrics.profitFactor >= alertThresholds.profitFactorMin) {
      this.log(`WARNING: Profit factor ${metrics.profitFactor.toFixed(2)} approaching minimum`, 'WARN');
    }
    
    // Check if auto-tuning should trigger
    if (this.options.autoTune) {
      this.checkAutoTune(metrics);
    }
    
    this.state.currentMetrics = metrics;
    return metrics;
  }
  
  checkAutoTune(metrics) {
    const { tuningTriggers } = this.options;
    let shouldTune = false;
    let reason = '';
    
    if (metrics.winRate < tuningTriggers.winRateBelow) {
      shouldTune = true;
      reason = `Win rate ${(metrics.winRate * 100).toFixed(1)}% below ${tuningTriggers.winRateBelow * 100}%`;
    } else if (metrics.profitFactor < tuningTriggers.profitFactorBelow) {
      shouldTune = true;
      reason = `Profit factor ${metrics.profitFactor.toFixed(2)} below ${tuningTriggers.profitFactorBelow}`;
    } else if (metrics.maxDrawdown > tuningTriggers.drawdownAbove) {
      shouldTune = true;
      reason = `Drawdown ${(metrics.maxDrawdown * 100).toFixed(1)}% above ${tuningTriggers.drawdownAbove * 100}%`;
    } else if (metrics.consecutiveLosses >= tuningTriggers.consecutiveLossesAbove) {
      shouldTune = true;
      reason = `${metrics.consecutiveLosses} consecutive losses`;
    }
    
    if (shouldTune) {
      this.log(`AUTO-TUNE TRIGGERED: ${reason}`, 'ALERT');
      this.emit('tune', { reason, metrics });
      this.triggerAutoTune(reason, metrics);
    }
  }
  
  async triggerAutoTune(reason, metrics) {
    this.log('Starting automatic parameter tuning...');
    
    const tuningEntry = {
      timestamp: Date.now(),
      reason,
      beforeMetrics: metrics,
      adjustments: []
    };
    
    // Load current config
    const envPath = './.env';
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    
    // Determine adjustments based on metrics
    const adjustments = this.determineAdjustments(metrics);
    
    for (const adj of adjustments) {
      this.log(`Adjusting ${adj.param}: ${adj.from} → ${adj.to} (${adj.reason})`);
      
      const regex = new RegExp(`^${adj.param}=.*$`, 'm');
      if (envContent.match(regex)) {
        envContent = envContent.replace(regex, `${adj.param}=${adj.to}`);
      } else {
        envContent += `\n${adj.param}=${adj.to}`;
      }
      
      tuningEntry.adjustments.push(adj);
    }
    
    // Save updated config
    fs.writeFileSync(envPath, envContent);
    
    // Log tuning
    this.state.tuningHistory.push(tuningEntry);
    fs.writeFileSync(
      this.options.paths.tuningLog,
      JSON.stringify(this.state.tuningHistory, null, 2)
    );
    
    this.log(`Applied ${adjustments.length} parameter adjustments`);
    this.emit('tuned', tuningEntry);
  }
  
  determineAdjustments(metrics) {
    const adjustments = [];
    
    // Low win rate → increase signal threshold, tighten stop loss
    if (metrics.winRate < 0.50) {
      adjustments.push({
        param: 'SIGNAL_MIN_SCORE',
        from: 50,
        to: 60,
        reason: 'Low win rate - increase entry quality'
      });
      adjustments.push({
        param: 'SIGNAL_MIN_INDICATORS',
        from: 3,
        to: 4,
        reason: 'Low win rate - require more confirmation'
      });
    }
    
    // Low profit factor → widen take profit, tighten stop loss
    if (metrics.profitFactor < 1.3) {
      adjustments.push({
        param: 'TAKE_PROFIT_ROI',
        from: 2.0,
        to: 2.5,
        reason: 'Low profit factor - increase winners'
      });
      adjustments.push({
        param: 'STOP_LOSS_ROI',
        from: 0.5,
        to: 0.4,
        reason: 'Low profit factor - cut losers faster'
      });
    }
    
    // High drawdown → reduce leverage, reduce position size
    if (metrics.maxDrawdown > 0.10) {
      adjustments.push({
        param: 'LEVERAGE_DEFAULT',
        from: 50,
        to: 35,
        reason: 'High drawdown - reduce leverage'
      });
      adjustments.push({
        param: 'POSITION_SIZE_DEFAULT',
        from: 0.5,
        to: 0.3,
        reason: 'High drawdown - reduce position size'
      });
    }
    
    // Consecutive losses → switch to conservative mode
    if (metrics.consecutiveLosses >= 4) {
      adjustments.push({
        param: 'STRATEGY_PROFILE',
        from: 'neutral',
        to: 'conservative',
        reason: 'Consecutive losses - switch to conservative'
      });
    }
    
    return adjustments;
  }
  
  generateReport() {
    const metrics24h = this.calculateMetrics(24);
    const metrics7d = this.calculateMetrics(168);
    const metrics30d = this.calculateMetrics(720);
    
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalTrades: this.trades.length,
        netPnl: this.trades.reduce((s, t) => s + t.pnl, 0),
        overallWinRate: this.trades.length > 0 ?
          this.trades.filter(t => t.pnl > 0).length / this.trades.length : 0
      },
      periods: {
        '24h': metrics24h,
        '7d': metrics7d,
        '30d': metrics30d
      },
      alerts: this.state.alerts.slice(-20),
      tuningHistory: this.state.tuningHistory.slice(-10),
      status: this.getStatus(metrics24h)
    };
    
    fs.writeFileSync(this.options.paths.performance, JSON.stringify(report, null, 2));
    return report;
  }
  
  getStatus(metrics) {
    if (!metrics) return 'UNKNOWN';
    
    if (metrics.winRate >= 0.60 && metrics.profitFactor >= 1.8) {
      return 'EXCELLENT';
    } else if (metrics.winRate >= 0.55 && metrics.profitFactor >= 1.5) {
      return 'GOOD';
    } else if (metrics.winRate >= 0.50 && metrics.profitFactor >= 1.2) {
      return 'ACCEPTABLE';
    } else if (metrics.winRate >= 0.45 || metrics.profitFactor >= 1.0) {
      return 'WARNING';
    } else {
      return 'CRITICAL';
    }
  }
  
  start() {
    if (this.state.running) return;
    
    this.log('Starting performance monitor');
    this.state.running = true;
    this.loadTrades();
    
    // Initial check
    this.checkAlerts();
    this.generateReport();
    
    // Schedule periodic checks
    this.interval = setInterval(() => {
      this.log('Running periodic performance check');
      this.checkAlerts();
      this.generateReport();
      this.state.lastCheck = Date.now();
    }, this.options.checkInterval);
    
    this.emit('started');
  }
  
  stop() {
    if (!this.state.running) return;
    
    this.log('Stopping performance monitor');
    clearInterval(this.interval);
    this.state.running = false;
    this.emit('stopped');
  }
  
  printStatus() {
    const metrics = this.calculateMetrics(24);
    const status = this.getStatus(metrics);
    
    console.log('\n' + '='.repeat(60));
    console.log('PERFORMANCE MONITOR STATUS');
    console.log('='.repeat(60));
    console.log(`Status: ${status}`);
    console.log(`Running: ${this.state.running}`);
    console.log(`Auto-tune: ${this.options.autoTune ? 'ENABLED' : 'DISABLED'}`);
    console.log(`Total trades: ${this.trades.length}`);
    
    if (metrics) {
      console.log('\n24-Hour Metrics:');
      console.log(`  Trades: ${metrics.trades}`);
      console.log(`  Win Rate: ${(metrics.winRate * 100).toFixed(1)}%`);
      console.log(`  Profit Factor: ${metrics.profitFactor.toFixed(2)}`);
      console.log(`  Net P&L: $${metrics.netPnl.toFixed(2)}`);
      console.log(`  Max Drawdown: ${(metrics.maxDrawdown * 100).toFixed(1)}%`);
      console.log(`  Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`);
    }
    
    console.log('\nRecent Alerts: ' + this.state.alerts.slice(-5).length);
    console.log('Tuning Events: ' + this.state.tuningHistory.length);
    console.log('='.repeat(60) + '\n');
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    interval: 300000,
    autoTune: false
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interval' && args[i + 1]) {
      options.interval = parseInt(args[i + 1]) * 1000;
    }
    if (args[i] === '--auto-tune') {
      options.autoTune = true;
    }
    if (args[i] === '--status') {
      const monitor = new PerformanceMonitor(options);
      monitor.loadTrades();
      monitor.printStatus();
      return;
    }
    if (args[i] === '--report') {
      const monitor = new PerformanceMonitor(options);
      monitor.loadTrades();
      const report = monitor.generateReport();
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    if (args[i] === '--help') {
      console.log(`
Live Performance Monitor

Usage: node scripts/monitor.js [options]

Options:
  --interval N    Check interval in seconds (default: 300)
  --auto-tune     Enable automatic parameter tuning
  --status        Print current status and exit
  --report        Generate and print report
  --help          Show this help

Example:
  node scripts/monitor.js --auto-tune --interval 60
      `);
      return;
    }
  }
  
  const monitor = new PerformanceMonitor(options);
  
  monitor.on('alert', (alert) => {
    console.log(`\n🚨 ALERT: ${alert.message}\n`);
  });
  
  monitor.on('tuned', (entry) => {
    console.log(`\n⚙️ AUTO-TUNED: ${entry.adjustments.length} parameters adjusted\n`);
  });
  
  monitor.start();
  
  // Handle shutdown
  process.on('SIGINT', () => {
    monitor.stop();
    process.exit(0);
  });
  
  // Keep running
  console.log('Performance monitor running. Press Ctrl+C to stop.');
}

module.exports = { PerformanceMonitor };

if (require.main === module) {
  main().catch(e => {
    console.error(`Fatal error: ${e.message}`);
    process.exit(1);
  });
}
