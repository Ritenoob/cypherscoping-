/**
 * Miniature Enigma - AI Agent-Orchestrated Trading System
 * Main Entry Point with High-Speed Screener
 */

const Orchestrator = require('./agents/orchestrator');
const SignalAgent = require('./agents/signal-agent');
const RiskAgent = require('./agents/risk-agent');
const DataAgent = require('./agents/data-agent');
const ExecutionAgent = require('./agents/execution-agent');
const ScreenerAgent = require('./agents/screener-agent');
const OptimizerAgent = require('./agents/optimizer-agent');
const AuditAgent = require('./agents/audit-agent');

require('dotenv').config?.() || {};

const config = {
  mode: process.env.BOT_MODE || 'paper',
  timeframes: [
    process.env.PRIMARY_TIMEFRAME || '15min',
    process.env.SECONDARY_TIMEFRAME || '1hour'
  ],
  
  risk: {
    stopLossROI: parseFloat(process.env.STOP_LOSS_ROI) || 0.5,
    takeProfitROI: parseFloat(process.env.TAKE_PROFIT_ROI) || 2.0,
    maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS) || 5,
    maxDailyDrawdown: parseFloat(process.env.MAX_DAILY_DRAWDOWN) || 5.0,
    defaultLeverage: parseInt(process.env.LEVERAGE_DEFAULT) || 50
  },
  
  screener: {
    scanInterval: parseInt(process.env.SCAN_INTERVAL) || 5000,
    minScore: parseInt(process.env.SIGNAL_MIN_SCORE) || 50,
    batchSize: parseInt(process.env.BATCH_SIZE) || 10
  },
  
  agentClasses: {
    SignalAgent,
    RiskAgent,
    DataAgent,
    ExecutionAgent,
    ScreenerAgent,
    OptimizerAgent,
    AuditAgent
  }
};

async function main() {
  console.log('='.repeat(60));
  console.log('MINIATURE ENIGMA - AI Agent Trading System v5.1');
  console.log('='.repeat(60));
  console.log(`Mode: ${config.mode.toUpperCase()}`);
  console.log('='.repeat(60));

  // Initialize agents directly for standalone operation
  const dataAgent = new DataAgent({
    apiKey: process.env.KUCOIN_API_KEY,
    apiSecret: process.env.KUCOIN_API_SECRET,
    apiPassphrase: process.env.KUCOIN_API_PASSPHRASE
  });

  const signalAgent = new SignalAgent();
  const riskAgent = new RiskAgent(config.risk);
  const executionAgent = new ExecutionAgent({ 
    mode: config.mode,
    dataAgent 
  });
  const auditAgent = new AuditAgent({ logDir: './logs' });
  const optimizerAgent = new OptimizerAgent({ dataAgent, signalAgent });
  
  const screenerAgent = new ScreenerAgent({
    dataAgent,
    signalAgent,
    scanInterval: config.screener.scanInterval,
    minScore: config.screener.minScore,
    batchSize: config.screener.batchSize,
    primaryTimeframe: config.timeframes[0],
    timeframes: config.timeframes,
    onSignal: (signal) => {
      console.log(`[SIGNAL] ${signal.direction.toUpperCase().padEnd(5)} | ${signal.symbol.padEnd(12)} | Score: ${signal.score.toString().padStart(4)} | Price: ${signal.currentPrice}`);
    },
    onScanComplete: (stats) => {
      console.log(`[SCAN] #${stats.scanCount} | ${stats.symbolsScanned} symbols | ${stats.signalsFound} signals | ${stats.duration}ms`);
    }
  });

  // Start agents
  await dataAgent.start();
  await signalAgent.start();
  await riskAgent.start();
  await executionAgent.start();
  await auditAgent.start();
  await optimizerAgent.start();
  await screenerAgent.start();

  console.log('\nAll agents started.');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    screenerAgent.stopScanning();
    await dataAgent.stop();
    await signalAgent.stop();
    await riskAgent.stop();
    await executionAgent.stop();
    await auditAgent.stop();
    await optimizerAgent.stop();
    await screenerAgent.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect WebSocket if API keys available
  if (process.env.KUCOIN_API_KEY) {
    console.log('Connecting WebSocket...');
    const wsResult = await dataAgent.connectWebSocket();
    if (wsResult.ok) {
      console.log('WebSocket connected.');
    } else {
      console.log('WebSocket connection failed, using REST API only.');
    }
  }

  // Start screener
  console.log('\nStarting screener...');
  console.log('Scanning ALL coins continuously...\n');
  
  await screenerAgent.startScanning();

  // Keep process alive
  setInterval(() => {
    const stats = screenerAgent.getStats();
    const metrics = auditAgent.getMetrics();
    
    console.log(`\n[STATUS] Scans: ${stats.totalScans} | Avg: ${stats.avgScanDuration}ms | Signals: ${stats.signalsGenerated} | Uptime: ${metrics.uptime.hours}h`);
    
    const top = screenerAgent.getTopSignals(5);
    if (top.length > 0) {
      console.log('TOP SIGNALS:');
      top.forEach((s, i) => {
        console.log(`  ${i+1}. ${s.symbol.padEnd(12)} ${s.direction.toUpperCase().padEnd(5)} Score: ${s.score}`);
      });
    }
  }, 30000);
}

module.exports = { 
  Orchestrator, SignalAgent, RiskAgent, DataAgent, 
  ExecutionAgent, ScreenerAgent, OptimizerAgent, AuditAgent, 
  config 
};

if (require.main === module) {
  main();
}
