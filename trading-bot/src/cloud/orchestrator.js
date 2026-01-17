/**
 * Cloud Orchestrator
 * 
 * Coordinates all cloud agents:
 * - Manages API quota across agents
 * - Aggregates results
 * - Handles failover and graceful degradation
 * - Collects metrics
 */

const ClaudeClient = require('./claudeClient');
const SignalAnalysisAgent = require('./signalAnalysisAgent');
const StrategyOptimizerAgent = require('./strategyOptimizerAgent');
const RiskIntelligenceAgent = require('./riskIntelligenceAgent');
const NaturalLanguageInterface = require('./nlInterface');
const DecisionSupportSystem = require('./decisionSupport');

class CloudOrchestrator {
  constructor(config) {
    this.config = config;
    this.client = null;
    
    // Agents
    this.signalAnalysisAgent = null;
    this.strategyOptimizerAgent = null;
    this.riskIntelligenceAgent = null;
    this.nlInterface = null;
    this.decisionSupport = null;
    
    // State
    this.initialized = false;
    this.healthy = true;
    this.lastHealthCheck = null;
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      featureUsage: {
        signalAnalysis: 0,
        strategyOptimizer: 0,
        riskIntelligence: 0,
        nlInterface: 0,
        decisionSupport: 0
      }
    };
  }

  /**
   * Initialize the cloud orchestrator
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    if (!this.config.enabled) {
      this._log('info', 'Cloud features disabled');
      return;
    }

    try {
      this._log('info', 'Initializing cloud orchestrator...');

      // Initialize Claude client
      this.client = new ClaudeClient(this.config);
      await this.client.initialize();

      // Initialize agents based on feature flags
      if (this.config.features.signalAnalysis) {
        this.signalAnalysisAgent = new SignalAnalysisAgent(this.client, this.config);
        this._log('info', 'Signal Analysis Agent enabled');
      }

      if (this.config.features.strategyOptimizer) {
        this.strategyOptimizerAgent = new StrategyOptimizerAgent(this.client, this.config);
        this._log('info', 'Strategy Optimizer Agent enabled');
      }

      if (this.config.features.riskIntelligence) {
        this.riskIntelligenceAgent = new RiskIntelligenceAgent(this.client, this.config);
        this._log('info', 'Risk Intelligence Agent enabled');
      }

      if (this.config.features.nlInterface) {
        this.nlInterface = new NaturalLanguageInterface(this.client, this.config);
        this._log('info', 'Natural Language Interface enabled');
      }

      if (this.config.features.decisionSupport) {
        this.decisionSupport = new DecisionSupportSystem(this.client, this.config);
        this._log('info', 'Decision Support System enabled');
      }

      this.initialized = true;
      this.healthy = true;
      this.lastHealthCheck = Date.now();

      this._log('info', 'Cloud orchestrator initialized successfully');

    } catch (error) {
      this._log('error', 'Failed to initialize cloud orchestrator', { error: error.message });
      this.healthy = false;
      throw error;
    }
  }

  /**
   * Analyze a signal (if feature enabled)
   * @param {Object} signalData - Signal data from SignalGeneratorV2
   * @returns {Promise<Object|null>} Analysis result or null if disabled
   */
  async analyzeSignal(signalData) {
    if (!this.config.features.signalAnalysis || !this.signalAnalysisAgent) {
      return null;
    }

    return this._executeWithMetrics(
      'signalAnalysis',
      () => this.signalAnalysisAgent.analyzeSignal(signalData)
    );
  }

  /**
   * Optimize strategy (if feature enabled)
   * @param {Object} performanceData - Performance metrics
   * @param {Object} currentWeights - Current indicator weights
   * @param {Array} recentTrades - Recent trades
   * @returns {Promise<Object|null>} Optimization recommendations or null if disabled
   */
  async optimizeStrategy(performanceData, currentWeights, recentTrades) {
    if (!this.config.features.strategyOptimizer || !this.strategyOptimizerAgent) {
      return null;
    }

    return this._executeWithMetrics(
      'strategyOptimizer',
      () => this.strategyOptimizerAgent.optimizeStrategy(performanceData, currentWeights, recentTrades)
    );
  }

  /**
   * Analyze risk (if feature enabled)
   * @param {Object} tradeData - Proposed trade
   * @param {Object} marketData - Market conditions
   * @param {Object} portfolioData - Portfolio state
   * @returns {Promise<Object|null>} Risk analysis or null if disabled
   */
  async analyzeRisk(tradeData, marketData, portfolioData) {
    if (!this.config.features.riskIntelligence || !this.riskIntelligenceAgent) {
      return null;
    }

    return this._executeWithMetrics(
      'riskIntelligence',
      () => this.riskIntelligenceAgent.analyzeRisk(tradeData, marketData, portfolioData)
    );
  }

  /**
   * Classify market regime (if feature enabled)
   * @param {Object} marketData - Market indicators
   * @returns {Promise<Object|null>} Regime classification or null if disabled
   */
  async classifyRegime(marketData) {
    if (!this.config.features.riskIntelligence || !this.riskIntelligenceAgent) {
      return null;
    }

    return this._executeWithMetrics(
      'riskIntelligence',
      () => this.riskIntelligenceAgent.classifyRegime(marketData)
    );
  }

  /**
   * Process natural language query (if feature enabled)
   * @param {string} query - User query
   * @param {Object} context - Bot context
   * @returns {Promise<Object|null>} Response or null if disabled
   */
  async processQuery(query, context) {
    if (!this.config.features.nlInterface || !this.nlInterface) {
      return null;
    }

    return this._executeWithMetrics(
      'nlInterface',
      () => this.nlInterface.processQuery(query, context)
    );
  }

  /**
   * Generate report (if feature enabled)
   * @param {string} reportType - Report type
   * @param {Object} data - Report data
   * @returns {Promise<Object|null>} Report or null if disabled
   */
  async generateReport(reportType, data) {
    if (!this.config.features.nlInterface || !this.nlInterface) {
      return null;
    }

    return this._executeWithMetrics(
      'nlInterface',
      () => this.nlInterface.generateReport(reportType, data)
    );
  }

  /**
   * Validate trade decision (if feature enabled)
   * @param {Object} tradeDecision - Proposed trade
   * @param {Object} signalData - Signal data
   * @param {Object} marketContext - Market context
   * @returns {Promise<Object|null>} Validation result or null if disabled
   */
  async validateTrade(tradeDecision, signalData, marketContext) {
    if (!this.config.features.decisionSupport || !this.decisionSupport) {
      return null;
    }

    return this._executeWithMetrics(
      'decisionSupport',
      () => this.decisionSupport.validateTrade(tradeDecision, signalData, marketContext)
    );
  }

  /**
   * Suggest exit timing (if feature enabled)
   * @param {Object} position - Open position
   * @param {Object} currentSignals - Current signals
   * @param {Object} performance - Position performance
   * @returns {Promise<Object|null>} Exit suggestion or null if disabled
   */
  async suggestExit(position, currentSignals, performance) {
    if (!this.config.features.decisionSupport || !this.decisionSupport) {
      return null;
    }

    return this._executeWithMetrics(
      'decisionSupport',
      () => this.decisionSupport.suggestExit(position, currentSignals, performance)
    );
  }

  /**
   * Get orchestrator status
   * @returns {Object} Status information
   */
  getStatus() {
    const usage = this.client ? this.client.getUsage() : null;

    return {
      initialized: this.initialized,
      healthy: this.healthy,
      lastHealthCheck: this.lastHealthCheck,
      features: {
        signalAnalysis: this.config.features.signalAnalysis && this.signalAnalysisAgent !== null,
        strategyOptimizer: this.config.features.strategyOptimizer && this.strategyOptimizerAgent !== null,
        riskIntelligence: this.config.features.riskIntelligence && this.riskIntelligenceAgent !== null,
        nlInterface: this.config.features.nlInterface && this.nlInterface !== null,
        decisionSupport: this.config.features.decisionSupport && this.decisionSupport !== null
      },
      metrics: { ...this.metrics },
      usage: usage || { requestsToday: 0, costToday: 0 },
      clientHealthy: this.client ? this.client.isHealthy() : false
    };
  }

  /**
   * Get metrics
   * @returns {Object} Metrics data
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageLatency: this.metrics.totalRequests > 0 ? 
        this.metrics.totalLatency / this.metrics.totalRequests : 0,
      successRate: this.metrics.totalRequests > 0 ? 
        (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 : 0
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    if (this.client) {
      this.client.clearCache();
      this._log('info', 'Cache cleared');
    }
  }

  /**
   * Perform health check
   * @returns {boolean} Health status
   */
  async healthCheck() {
    try {
      if (!this.initialized) {
        this.healthy = false;
        return false;
      }

      this.healthy = this.client && this.client.isHealthy();
      this.lastHealthCheck = Date.now();

      return this.healthy;

    } catch (error) {
      this._log('error', 'Health check failed', { error: error.message });
      this.healthy = false;
      return false;
    }
  }

  /**
   * Execute a function with metrics tracking
   * @private
   */
  async _executeWithMetrics(featureName, fn) {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    this.metrics.featureUsage[featureName]++;

    try {
      const result = await fn();
      
      if (result && result.success !== false) {
        this.metrics.successfulRequests++;
      } else {
        this.metrics.failedRequests++;
      }

      const latency = Date.now() - startTime;
      this.metrics.totalLatency += latency;

      this._log('debug', `${featureName} completed`, { latency, success: result?.success });

      return result;

    } catch (error) {
      this.metrics.failedRequests++;
      
      const latency = Date.now() - startTime;
      this.metrics.totalLatency += latency;

      this._log('error', `${featureName} failed`, { 
        latency, 
        error: error.message 
      });

      // Return error result instead of throwing to allow graceful degradation
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Logging utility
   * @private
   */
  _log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [CloudOrchestrator] [${level.toUpperCase()}] ${message}`, 
      Object.keys(meta).length > 0 ? meta : '');
  }
}

module.exports = CloudOrchestrator;
