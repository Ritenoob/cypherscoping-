/**
 * KuCoin Futures Trading Bot - Main Entry Point
 * 
 * AGI-Level Trading System with:
 * - 10 Enhanced Technical Indicators
 * - 3 Microstructure Analyzers (Live-Only)
 * - Cross-Timeframe Signal Alignment
 * - Walk-Forward Optimization
 * - Dynamic Coin Ranking
 * - Live Trading via KuCoin API
 */

const ScreenerEngine = require('./screenerEngine');
const coinList = require('./coinList');
const timeframeAligner = require('./timeframeAligner');
const screenerConfig = require('./screenerConfig');
const signalWeights = require('./signal-weights');

const indicators = require('./src/indicators');
const microstructure = require('./src/microstructure');
const { SignalGeneratorV2, IndicatorEnhancer, CoinRankerV2 } = require('./src/lib');
const { PaperTradingEngine, PaperTradingEngineV2 } = require('./src/optimizer');
const { PositionCalculator } = require('./src/utils');

// API Integration
const { getCredentials } = require('./config/apiCredentials');
const { getClient } = require('./config/apiClient');
const runtimeConfig = require('./config/runtimeConfig');

// Cloud AI Integration (optional)
const cloudConfig = require('./config/cloudConfig');
const { CloudOrchestrator } = require('./src/cloud');

class TradingBot {
  constructor(config = {}) {
    this.config = { ...screenerConfig, ...runtimeConfig, ...config };
    this.screener = null;
    this.coinRanker = new CoinRankerV2();
    this.indicatorEnhancer = new IndicatorEnhancer();
    this.positionCalculator = new PositionCalculator();
    this.paperTrader = null;
    this.apiClient = null;
    this.credentials = null;
    
    // Cloud orchestrator (optional, disabled by default)
    this.cloudOrchestrator = null;
    
    this.isRunning = false;
    this.mode = process.env.BOT_MODE || config.mode || 'paper';
    
    // Track open positions
    this.openPositions = new Map();
    this.lastTradeTime = new Map();
  }

  async initialize() {
    console.log('[Bot] Initializing...');
    console.log(`[Bot] Mode: ${this.mode.toUpperCase()}`);
    
    // Initialize API credentials for live mode
    if (this.mode === 'live') {
      this.credentials = getCredentials();
      
      if (!this.credentials.hasCredentials()) {
        console.error('[Bot] ERROR: Live mode requires API credentials');
        console.log('[Bot] Run "npm run setup" to configure your API keys');
        process.exit(1);
      }
      
      console.log('[Bot] Validating API credentials...');
      const isValid = await this.credentials.validateCredentials();
      
      if (!isValid) {
        console.error('[Bot] ERROR: Invalid API credentials');
        process.exit(1);
      }
      
      this.apiClient = getClient();
      console.log('[Bot] API client initialized');
      
      // Get and display account balance
      try {
        const balance = await this.apiClient.getAvailableBalance();
        console.log(`[Bot] Account Balance: $${balance.availableBalance.toFixed(2)}`);
      } catch (err) {
        console.error('[Bot] Failed to fetch balance:', err.message);
      }
    }
    
    await coinList.initialize();
    
    const topCoins = coinList.getTopCoins(20);
    this.config.symbols = topCoins.map(c => c.symbol);
    
    console.log(`[Bot] Trading ${this.config.symbols.length} symbols`);
    
    this.screener = new ScreenerEngine(this.config);
    
    this.screener.on('signal', (signal) => this._handleSignal(signal));
    
    if (this.mode === 'paper' || this.mode === 'optimize') {
      this.paperTrader = new PaperTradingEngine({
        initialBalance: this.config.initialBalance || 10000
      });
    }
    
    // NEW: Initialize cloud services if enabled
    if (cloudConfig.enabled) {
      try {
        console.log('[Bot] Initializing cloud AI services...');
        this.cloudOrchestrator = new CloudOrchestrator(cloudConfig);
        await this.cloudOrchestrator.initialize();
        console.log('[Bot] Cloud AI services enabled');
      } catch (err) {
        console.error('[Bot] Failed to initialize cloud services:', err.message);
        console.log('[Bot] Continuing without cloud features');
        this.cloudOrchestrator = null;
      }
    }
    
    console.log('[Bot] Initialization complete');
  }

  async start() {
    if (this.isRunning) {
      console.log('[Bot] Already running');
      return;
    }
    
    console.log('[Bot] Starting...');
    
    await this.screener.start();
    
    if (this.paperTrader) {
      this.paperTrader.start();
    }
    
    this.isRunning = true;
    
    this._startCoinListRefresh();
    
    console.log('[Bot] Started successfully');
    console.log('[Bot] Listening for signals...');
  }

  async stop() {
    console.log('[Bot] Stopping...');
    
    if (this.screener) {
      await this.screener.stop();
    }
    
    if (this.paperTrader) {
      this.paperTrader.stop();
    }
    
    coinList.stop();
    
    this.isRunning = false;
    
    console.log('[Bot] Stopped');
  }

  _handleSignal(signal) {
    console.log(`\n[Bot] Signal received: ${signal.symbol} ${signal.direction.toUpperCase()}`);
    console.log(`[Bot] Score: ${signal.score}, Confidence: ${signal.confidence}%`);
    
    if (signal.confidence < this.config.thresholds.minConfidence) {
      console.log('[Bot] Signal rejected: Low confidence');
      return;
    }
    
    if (Math.abs(signal.score) < this.config.thresholds.minScore) {
      console.log('[Bot] Signal rejected: Score below threshold');
      return;
    }
    
    // Check cooldown
    const lastTrade = this.lastTradeTime.get(signal.symbol) || 0;
    const cooldown = this.config.signals?.cooldownMs || 60000;
    if (Date.now() - lastTrade < cooldown) {
      console.log('[Bot] Signal rejected: Cooldown active');
      return;
    }
    
    // Check max positions
    const maxPositions = this.config.throttle?.maxOpenPositions || 5;
    if (this.openPositions.size >= maxPositions) {
      console.log('[Bot] Signal rejected: Max positions reached');
      return;
    }
    
    const positionMultiplier = this.coinRanker.getPositionSizeMultiplier(signal.symbol);
    
    const tradeSignal = {
      ...signal,
      positionMultiplier,
      timestamp: new Date().toISOString()
    };
    
    if (this.mode === 'paper' && this.paperTrader) {
      console.log('[Bot] Forwarding to paper trader...');
    } else if (this.mode === 'live') {
      this._executeLiveTrade(tradeSignal).catch(err => {
        console.error('[Bot] Trade execution error:', err.message);
      });
    }
    
    this._logSignal(tradeSignal);
  }

  async _executeLiveTrade(signal) {
    if (!this.apiClient) {
      console.error('[Bot] API client not initialized');
      return;
    }
    
    console.log(`[Bot] EXECUTING LIVE TRADE: ${signal.symbol} ${signal.direction.toUpperCase()}`);
    
    try {
      // Get current price
      const ticker = await this.apiClient.getTicker(signal.symbol);
      const currentPrice = parseFloat(ticker.price);
      
      // Get account balance
      const balance = await this.apiClient.getAvailableBalance();
      const availableBalance = balance.availableBalance;
      
      // Calculate position size
      const positionPercent = (this.config.positionSizing?.defaultPercent || 0.5) * signal.positionMultiplier;
      const leverage = this.config.leverage?.defaultLeverage || 50;
      
      // Get contract details for lot size
      const contract = await this.apiClient.getContractDetails(signal.symbol);
      const multiplier = parseFloat(contract.multiplier);
      const lotSize = parseFloat(contract.lotSize) || 1;
      
      // Calculate position
      const positionDetails = this.positionCalculator.calculatePosition({
        balance: availableBalance,
        positionPercent,
        price: currentPrice,
        leverage,
        multiplier,
        lotSize,
        stopLossROI: this.config.riskManagement?.stopLossROI || 0.5,
        takeProfitROI: this.config.riskManagement?.takeProfitROI || 2.0
      });
      
      console.log(`[Bot] Position details:`);
      console.log(`  Size: ${positionDetails.size} lots`);
      console.log(`  Entry: $${currentPrice}`);
      console.log(`  Stop Loss: $${positionDetails.stopLoss}`);
      console.log(`  Take Profit: $${positionDetails.takeProfit}`);
      
      if (positionDetails.size < lotSize) {
        console.log('[Bot] Position size too small, skipping trade');
        return;
      }
      
      // Execute the trade
      let result;
      if (signal.direction === 'long') {
        result = await this.apiClient.openLong({
          symbol: signal.symbol,
          size: positionDetails.size,
          leverage,
          stopLossPrice: positionDetails.stopLoss,
          takeProfitPrice: positionDetails.takeProfit
        });
      } else {
        result = await this.apiClient.openShort({
          symbol: signal.symbol,
          size: positionDetails.size,
          leverage,
          stopLossPrice: positionDetails.stopLoss,
          takeProfitPrice: positionDetails.takeProfit
        });
      }
      
      console.log(`[Bot] Trade executed successfully!`);
      console.log(`[Bot] Entry Order ID: ${result.entry?.orderId}`);
      
      // Track the position
      this.openPositions.set(signal.symbol, {
        direction: signal.direction,
        entryPrice: currentPrice,
        size: positionDetails.size,
        openedAt: Date.now(),
        orders: result
      });
      
      this.lastTradeTime.set(signal.symbol, Date.now());
      
    } catch (error) {
      console.error(`[Bot] Trade execution failed: ${error.message}`);
      throw error;
    }
  }

  _logSignal(signal) {
    const logLine = [
      new Date().toISOString(),
      signal.symbol,
      signal.direction.toUpperCase(),
      `Score:${signal.score}`,
      `Conf:${signal.confidence}%`,
      `Mult:${signal.positionMultiplier}`
    ].join(' | ');
    
    console.log(`[TRADE] ${logLine}`);
  }

  _startCoinListRefresh() {
    setInterval(async () => {
      const newCoins = coinList.getTopCoins(20);
      const newSymbols = newCoins.map(c => c.symbol);
      
      const changed = newSymbols.some(s => !this.config.symbols.includes(s)) ||
                     this.config.symbols.some(s => !newSymbols.includes(s));
      
      if (changed) {
        console.log('[Bot] Coin list updated, refreshing subscriptions...');
        this.config.symbols = newSymbols;
        this.screener.updateSymbols(newSymbols);
      }
    }, 60 * 60 * 1000);
  }

  getStatus() {
    return {
      running: this.isRunning,
      mode: this.mode,
      symbols: this.config.symbols.length,
      timeframes: [this.config.primaryTimeframe, this.config.secondaryTimeframe]
    };
  }
}

async function main() {
  const bot = new TradingBot({
    mode: process.env.BOT_MODE || 'paper',
    initialBalance: parseFloat(process.env.INITIAL_BALANCE) || 10000
  });
  
  process.on('SIGINT', async () => {
    console.log('\n[Bot] Received SIGINT, shutting down...');
    await bot.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n[Bot] Received SIGTERM, shutting down...');
    await bot.stop();
    process.exit(0);
  });
  
  try {
    await bot.initialize();
    await bot.start();
  } catch (error) {
    console.error('[Bot] Fatal error:', error);
    process.exit(1);
  }
}

module.exports = {
  TradingBot,
  indicators,
  microstructure,
  SignalGeneratorV2,
  IndicatorEnhancer,
  CoinRankerV2,
  PaperTradingEngine,
  PaperTradingEngineV2,
  ScreenerEngine,
  coinList,
  timeframeAligner,
  screenerConfig,
  signalWeights
};

if (require.main === module) {
  main();
}
