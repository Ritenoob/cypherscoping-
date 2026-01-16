/**
 * SCREENER ENGINE
 * Main orchestration for dual-timeframe market screener
 */

const config = require('./screenerConfig');
const DataFeed = require('./dataFeed');
const SignalEmitter = require('./signalEmitter');
const TimeframeAligner = require('./timeframeAligner');
const SignalGenerator = require('../core/SignalGenerator-configurable');
const signalWeights = require('../core/signal-weights');

const {
  RSIIndicator,
  MACDIndicator,
  WilliamsRIndicator,
  AwesomeOscillator,
  KDJIndicator,
  OBVIndicator
} = require('./indicatorEngines');

class ScreenerEngine {
  constructor(customConfig = {}) {
    this.config = { ...config, ...customConfig };
    this.dataFeed = new DataFeed(this.config.dataFeed);
    this.signalEmitter = new SignalEmitter(this.config.signalOutput);
    this.aligner = new TimeframeAligner();
    this.signalGenerator = new SignalGenerator(signalWeights);
    
    // Indicator instances per pair per timeframe
    this.indicators = new Map();
    
    // State
    this.running = false;
    this.stats = {
      signalsGenerated: 0,
      alignedSignals: 0,
      startTime: null
    };
  }

  /**
   * Initialize screener
   */
  async initialize() {
    console.log('[Screener] Initializing...');
    
    // Connect to data feed
    await this.dataFeed.connect();
    
    // Initialize indicators for each pair and timeframe
    for (const pair of this.config.pairs) {
      this.initializePairIndicators(pair, this.config.timeframes.primary);
      this.initializePairIndicators(pair, this.config.timeframes.secondary);
    }
    
    // Subscribe to market data
    for (const pair of this.config.pairs) {
      this.dataFeed.subscribe(pair, this.config.timeframes.primary);
      this.dataFeed.subscribe(pair, this.config.timeframes.secondary);
    }
    
    // Set up event handlers
    this.setupEventHandlers();
    
    console.log('[Screener] Initialized successfully');
  }

  /**
   * Initialize indicators for a pair and timeframe
   */
  initializePairIndicators(pair, timeframe) {
    const key = `${pair}:${timeframe}`;
    const indicators = {};

    if (this.config.indicators.rsi.enabled) {
      indicators.rsi = new RSIIndicator(this.config.indicators.rsi);
    }

    if (this.config.indicators.macd.enabled) {
      indicators.macd = new MACDIndicator(this.config.indicators.macd);
    }

    if (this.config.indicators.williamsR.enabled) {
      indicators.williamsR = new WilliamsRIndicator(this.config.indicators.williamsR);
    }

    if (this.config.indicators.ao.enabled) {
      indicators.ao = new AwesomeOscillator(this.config.indicators.ao);
    }

    if (this.config.indicators.kdj.enabled) {
      indicators.kdj = new KDJIndicator(this.config.indicators.kdj);
    }

    if (this.config.indicators.obv.enabled) {
      indicators.obv = new OBVIndicator(this.config.indicators.obv);
    }

    this.indicators.set(key, indicators);
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Handle candle data
    this.dataFeed.on('candle', (data) => {
      this.handleCandle(data);
    });

    // Handle disconnection
    this.dataFeed.on('disconnected', () => {
      console.log('[Screener] Data feed disconnected');
      if (this.running) {
        console.log('[Screener] Attempting reconnection...');
        setTimeout(() => this.dataFeed.connect(), this.config.dataFeed.reconnectDelay);
      }
    });
  }

  /**
   * Handle incoming candle data
   */
  handleCandle(data) {
    const { pair, timeframe, candle } = data;
    const key = `${pair}:${timeframe}`;
    
    const indicators = this.indicators.get(key);
    if (!indicators) return;

    // Update all indicators
    const indicatorValues = {};
    let allReady = true;

    for (const [name, indicator] of Object.entries(indicators)) {
      indicator.update(candle);
      
      if (indicator.isReady()) {
        indicatorValues[name] = indicator.getValue();
      } else {
        allReady = false;
      }
    }

    // Generate signal only if all indicators are ready
    if (allReady) {
      const signal = this.signalGenerator.generateSignal(indicatorValues);
      
      if (signal.signal !== 'NEUTRAL') {
        const signalData = {
          pair,
          timeframe,
          ...signal
        };

        // Add to aligner
        if (timeframe === this.config.timeframes.primary) {
          this.aligner.addPrimarySignal(pair, signalData);
        } else if (timeframe === this.config.timeframes.secondary) {
          this.aligner.addSecondarySignal(pair, signalData);
        }

        // Emit signal
        this.signalEmitter.emit('signal', signalData);
        this.stats.signalsGenerated++;

        // Check for alignment
        if (this.config.screening.requireAlignment) {
          const aligned = this.aligner.checkAlignment(pair);
          if (aligned && aligned.confidence >= this.config.screening.minConfidence) {
            this.signalEmitter.emit('alignedSignal', aligned);
            this.stats.alignedSignals++;
          }
        }
      }
    }
  }

  /**
   * Start screener
   */
  async start() {
    if (this.running) {
      console.log('[Screener] Already running');
      return;
    }

    console.log('[Screener] Starting...');
    this.running = true;
    this.stats.startTime = Date.now();

    await this.initialize();

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.aligner.cleanup();
    }, 60000);

    console.log('[Screener] Started successfully');
  }

  /**
   * Stop screener
   */
  stop() {
    if (!this.running) return;

    console.log('[Screener] Stopping...');
    this.running = false;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.dataFeed.disconnect();
    this.signalEmitter.close();

    console.log('[Screener] Stopped');
    this.printStats();
  }

  /**
   * Print statistics
   */
  printStats() {
    const runtime = Date.now() - this.stats.startTime;
    const runtimeMin = Math.floor(runtime / 60000);

    console.log('\n[Screener] Statistics:');
    console.log(`  Runtime: ${runtimeMin} minutes`);
    console.log(`  Signals Generated: ${this.stats.signalsGenerated}`);
    console.log(`  Aligned Signals: ${this.stats.alignedSignals}`);
    console.log('');
  }
}

// If run directly, start the screener
if (require.main === module) {
  const screener = new ScreenerEngine();
  
  screener.start().catch(err => {
    console.error('[Screener] Error:', err);
    process.exit(1);
  });

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n[Screener] Received SIGINT, shutting down...');
    screener.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[Screener] Received SIGTERM, shutting down...');
    screener.stop();
    process.exit(0);
  });
}

module.exports = ScreenerEngine;
