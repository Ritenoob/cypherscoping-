/**
 * Miniature Enigma - AI Agent-Orchestrated Trading System
 * Main Entry Point with High-Speed Screener
 *
 * Fixed startup sequence: WebSocket connects BEFORE scanning starts
 */

const Orchestrator = require('./agents/orchestrator');
const SignalAgent = require('./agents/signal-agent');
const RiskAgent = require('./agents/risk-agent');
const DataAgent = require('./agents/data-agent');
const ExecutionAgent = require('./agents/execution-agent');
const ScreenerAgent = require('./agents/screener-agent');
const OptimizerAgent = require('./agents/optimizer-agent');
const AuditAgent = require('./agents/audit-agent');
const RegimeAgent = require('./agents/regime-agent');
const ProductionController = require('./agents/production-controller');
const DashboardServer = require('./dashboard/server');

require('dotenv').config?.() || {};

const config = {
  mode: process.env.BOT_MODE || 'paper',
  timeframes: [
    process.env.PRIMARY_TIMEFRAME || '15min',
    process.env.SECONDARY_TIMEFRAME || '1hour'
  ],

  risk: {
    stopLossROI: parseFloat(process.env.STOP_LOSS_ROI) || 5,
    takeProfitROI: parseFloat(process.env.TAKE_PROFIT_ROI) || 100,
    maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS) || 5,
    maxDailyDrawdown: parseFloat(process.env.MAX_DAILY_DRAWDOWN) || 5.0,
    defaultLeverage: parseInt(process.env.LEVERAGE_DEFAULT) || 10,
    trailingEnabled: process.env.TRAILING_STOP_ENABLED === 'true',
    trailingActivation: parseFloat(process.env.TRAILING_STOP_ACTIVATION) || 4,
    trailingDistance: parseFloat(process.env.TRAILING_STOP_TRAIL) || 2,
    breakEvenEnabled: process.env.BREAK_EVEN_ENABLED === 'true',
    breakEvenActivation: parseFloat(process.env.BREAK_EVEN_ACTIVATION) || 3
  },

  screener: {
    scanInterval: parseInt(process.env.SCAN_INTERVAL) || 5000,
    minScore: parseInt(process.env.SIGNAL_MIN_SCORE) || 80,
    batchSize: parseInt(process.env.BATCH_SIZE) || 20,
    minVolume24h: parseInt(process.env.MIN_VOLUME_24H) || 10000000
  },

  dashboard: {
    port: parseInt(process.env.DASHBOARD_PORT) || 3000,
    wsPort: parseInt(process.env.WEBSOCKET_PORT) || 3001
  },

  agentClasses: {
    SignalAgent,
    RiskAgent,
    DataAgent,
    ExecutionAgent,
    ScreenerAgent,
    OptimizerAgent,
    AuditAgent,
    RegimeAgent,
    ProductionController
  }
};

async function main() {
  console.log('='.repeat(60));
  console.log('MINIATURE ENIGMA - AI Agent Trading System v5.2');
  console.log('='.repeat(60));
  console.log(`Mode: ${config.mode.toUpperCase()}`);
  console.log(`Signal Threshold: ${config.screener.minScore}+`);
  console.log(`Timeframes: ${config.timeframes.join(', ')}`);
  console.log('='.repeat(60));

  // Initialize Data Agent first
  const dataAgent = new DataAgent({
    apiKey: process.env.KUCOIN_API_KEY,
    apiSecret: process.env.KUCOIN_API_SECRET,
    apiPassphrase: process.env.KUCOIN_API_PASSPHRASE
  });

  // Initialize other agents
  const signalAgent = new SignalAgent();
  const riskAgent = new RiskAgent(config.risk);
  const executionAgent = new ExecutionAgent({
    mode: config.mode,
    dataAgent,
    trailingEnabled: config.risk.trailingEnabled,
    trailingActivation: config.risk.trailingActivation,
    trailingDistance: config.risk.trailingDistance,
    breakEvenEnabled: config.risk.breakEvenEnabled,
    breakEvenActivation: config.risk.breakEvenActivation
  });
  const auditAgent = new AuditAgent({ logDir: './logs' });
  const optimizerAgent = new OptimizerAgent({ dataAgent, signalAgent });
  const regimeAgent = new RegimeAgent({ dataAgent });

  // Production controller for safety & monitoring
  const productionController = new ProductionController({
    initialBalance: executionAgent.paperBalance,
    drawdownWarningPct: config.risk.maxDailyDrawdown * 0.6,
    drawdownCriticalPct: config.risk.maxDailyDrawdown,
    drawdownEmergencyPct: config.risk.maxDailyDrawdown * 2
  });

  const screenerAgent = new ScreenerAgent({
    dataAgent,
    signalAgent,
    regimeAgent,
    scanInterval: config.screener.scanInterval,
    minScore: config.screener.minScore,
    batchSize: config.screener.batchSize,
    minVolume24h: config.screener.minVolume24h,
    primaryTimeframe: config.timeframes[0],
    timeframes: config.timeframes,
    onSignal: async (signal) => {
      // Threshold mode: 'base' uses base score, 'final' uses finalScore
      const thresholdMode = process.env.THRESHOLD_MODE || 'base';
      const threshold = parseInt(process.env.SIGNAL_THRESHOLD) || config.screener.minScore;
      const scoreToCheck = thresholdMode === 'final' ? Math.abs(signal.finalScore || signal.score) : Math.abs(signal.score);

      if (scoreToCheck >= threshold) {
        const emoji = signal.direction === 'long' ? '🟢' : '🔴';
        const quality = signal.signalQuality || 'D';
        const aligned = signal.alignedTFs || 1;
        const total = signal.totalTFs || 1;
        console.log(`${emoji} [SIGNAL] ${signal.direction.toUpperCase().padEnd(5)} | ${signal.symbol.padEnd(12)} | Base:${signal.score.toString().padStart(3)} Final:${(signal.finalScore||signal.score).toString().padStart(3)} [${quality}] ${aligned}/${total}TF | $${signal.currentPrice.toFixed(4)}`);

        // Execute paper trade if enabled (works in both paper and live mode)
        if (process.env.PAPER_TRADE_ENABLED === 'true') {
          // Check if we already have a position in this symbol
          const positions = executionAgent.getPositions();
          if (!positions[signal.symbol]) {
            // Calculate position size (0.5% of balance per trade)
            const balance = executionAgent.getBalance();
            const positionSize = balance * (parseFloat(process.env.POSITION_SIZE_DEFAULT) || 0.5) / 100;
            const leverage = parseInt(process.env.LEVERAGE_DEFAULT) || 10;

            // Calculate SL/TP based on ROI settings
            const stopLossROI = parseFloat(process.env.STOP_LOSS_ROI) || 5;
            const takeProfitROI = parseFloat(process.env.TAKE_PROFIT_ROI) || 100;
            const slMultiplier = signal.direction === 'long' ? (1 - stopLossROI/100/leverage) : (1 + stopLossROI/100/leverage);
            const tpMultiplier = signal.direction === 'long' ? (1 + takeProfitROI/100/leverage) : (1 - takeProfitROI/100/leverage);

            const result = await executionAgent.executeTrade({
              symbol: signal.symbol,
              direction: signal.direction,
              size: positionSize,
              leverage: leverage,
              stopLoss: signal.currentPrice * slMultiplier,
              takeProfit: signal.currentPrice * tpMultiplier,
              entryPrice: signal.currentPrice
            });

            if (result.ok) {
              console.log(`   ✅ [PAPER TRADE] Executed ${signal.direction.toUpperCase()} on ${signal.symbol} | Size: $${positionSize.toFixed(2)} | Leverage: ${leverage}x`);
            } else {
              console.log(`   ❌ [PAPER TRADE] Failed: ${result.error?.message || 'Unknown error'}`);
            }
          } else {
            console.log(`   ⏭️  [SKIP] Already have position in ${signal.symbol}`);
          }
        }
      }
    },
    onScanComplete: (stats) => {
      const thresholdMode = process.env.THRESHOLD_MODE || 'base';
      const threshold = parseInt(process.env.SIGNAL_THRESHOLD) || config.screener.minScore;
      const highQuality = screenerAgent.getTopSignals(20).filter(s => {
        const scoreToCheck = thresholdMode === 'final' ? Math.abs(s.finalScore || s.score) : Math.abs(s.score);
        return scoreToCheck >= threshold;
      });
      const modeLabel = thresholdMode === 'final' ? 'final' : 'base';
      console.log(`[SCAN] #${stats.scanCount} | ${stats.symbolsScanned} coins | ${highQuality.length} signals (${modeLabel}≥${threshold}) | ${stats.duration}ms`);
    }
  });

  // Start agents in order
  console.log('\n[Starting agents...]');
  await dataAgent.start();
  await signalAgent.start();
  await riskAgent.start();
  await executionAgent.start();
  await auditAgent.start();
  await optimizerAgent.start();
  await regimeAgent.start();
  await productionController.start();
  await screenerAgent.start();

  // Register agents with production controller
  productionController.registerAgent(dataAgent);
  productionController.registerAgent(screenerAgent);
  productionController.registerAgent(executionAgent);

  // Start dashboard server
  const dashboard = new DashboardServer({
    port: config.dashboard.port,
    wsPort: config.dashboard.wsPort,
    screenerAgent,
    executionAgent,
    regimeAgent,
    optimizerAgent,
    auditAgent,
    productionController,
    dataAgent
  });
  dashboard.start();

  console.log('[All agents initialized]');
  console.log(`[Dashboard: http://localhost:${config.dashboard.port}]`);

  // Graceful shutdown handler
  const shutdown = async () => {
    console.log('\n[Shutting down...]');
    dashboard.stop();
    screenerAgent.stopScanning();
    await dataAgent.stop();
    await signalAgent.stop();
    await riskAgent.stop();
    await executionAgent.stop();
    await auditAgent.stop();
    await optimizerAgent.stop();
    await regimeAgent.stop();
    await productionController.stop();
    await screenerAgent.stop();
    console.log('[Shutdown complete]');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect WebSocket FIRST (critical for real data)
  console.log('\n[Connecting to KuCoin WebSocket...]');
  if (process.env.KUCOIN_API_KEY) {
    const wsResult = await dataAgent.connectWebSocket();
    if (wsResult.ok) {
      console.log('[WebSocket connected - using LIVE market data]');

      // Subscribe to top coins
      const instruments = await dataAgent.fetchInstruments();
      if (instruments.ok) {
        console.log(`[Found ${instruments.value.length} tradeable contracts]`);

        // Filter to USDT perpetuals with volume
        const topCoins = instruments.value
          .filter(c => c.symbol.endsWith('USDTM') && c.status === 'Open')
          .sort((a, b) => parseFloat(b.turnoverOf24h || 0) - parseFloat(a.turnoverOf24h || 0))
          .slice(0, parseInt(process.env.TOP_COINS_COUNT) || 100);

        console.log(`[Tracking top ${topCoins.length} coins by volume]`);
        console.log(`[Top 5: ${topCoins.slice(0, 5).map(c => c.symbol).join(', ')}]`);
      }
    } else {
      console.log('[WebSocket failed - using REST API for data]');
    }
  } else {
    console.log('[No API key - using simulated data for testing]');
  }

  // NOW start scanning (after WebSocket is ready)
  console.log('\n[Starting continuous scanner...]');
  console.log(`[Looking for signals with score ≥ ${config.screener.minScore}]\n`);

  await screenerAgent.startScanning();

  // Status updates every 30 seconds
  setInterval(() => {
    const stats = screenerAgent.getStats();
    const metrics = auditAgent.getMetrics();
    const uptimeHours = metrics.uptime?.hours || Math.floor((Date.now() - (auditAgent.startTime || Date.now())) / 3600000);

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[STATUS] Scans: ${stats.totalScans} | Avg: ${stats.avgScanDuration}ms | Uptime: ${uptimeHours}h`);
    console.log(`[DATA] WS: ${dataAgent.wsConnected ? 'LIVE' : 'REST'} | Buffer: ${dataAgent.candleBuffers.size} symbols`);

    const top = screenerAgent.getTopSignals(5).filter(s => Math.abs(s.finalScore || s.score) >= 50);
    if (top.length > 0) {
      console.log('[TOP SIGNALS]:');
      top.forEach((s, i) => {
        const dir = s.direction === 'long' ? '🟢 LONG ' : '🔴 SHORT';
        const quality = s.signalQuality || 'D';
        const aligned = s.alignedTFs || 1;
        const total = s.totalTFs || 1;
        const finalScore = s.finalScore || s.score;
        const baseScore = s.score;
        // Show final score (with convergence) and base score in parentheses
        console.log(`  ${i+1}. ${s.symbol.padEnd(12)} ${dir} Final: ${finalScore.toString().padStart(4)} (base:${baseScore}) [${quality}] ${aligned}/${total}TF`);
      });
    } else {
      console.log('[No signals above threshold yet - market is quiet]');
    }
    console.log(`${'─'.repeat(60)}\n`);
  }, 30000);
}

module.exports = {
  Orchestrator, SignalAgent, RiskAgent, DataAgent,
  ExecutionAgent, ScreenerAgent, OptimizerAgent, AuditAgent,
  RegimeAgent, ProductionController, DashboardServer,
  config
};

if (require.main === module) {
  main().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
  });
}
