/**
 * AuditAgent - Logging, Compliance & Metrics
 * 
 * Records all system activity, enforces invariants, collects metrics.
 */

const { AgentBase } = require('./agent-base');
const fs = require('fs');
const path = require('path');

class AuditAgent extends AgentBase {
  constructor(config = {}) {
    super({
      id: 'audit-agent',
      name: 'Audit Agent',
      options: config
    });

    this.logDir = config.logDir || './logs';
    this.metricsInterval = config.metricsInterval || 60000; // 1 min

    // Metrics storage
    this.metrics = {
      signals: { total: 0, byDirection: { long: 0, short: 0, neutral: 0 } },
      trades: { total: 0, wins: 0, losses: 0, pnl: 0 },
      errors: { total: 0, byType: {} },
      latency: { samples: [], p50: 0, p95: 0, p99: 0 },
      uptime: { startTime: Date.now(), lastCheck: Date.now() }
    };

    // Invariant checks
    this.invariants = config.invariants || [];
    this.invariantViolations = [];

    // Log buffers
    this.signalLog = [];
    this.tradeLog = [];
    this.errorLog = [];

    this._metricsTimer = null;
  }

  async initialize() {
    this.log('Initializing Audit Agent');

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Message handlers
    this.onMessage('LOG_SIGNAL', this._handleLogSignal.bind(this));
    this.onMessage('LOG_TRADE', this._handleLogTrade.bind(this));
    this.onMessage('LOG_ERROR', this._handleLogError.bind(this));
    this.onMessage('LOG_POSITION', this._handleLogPosition.bind(this));
    this.onMessage('LOG_EMERGENCY', this._handleLogEmergency.bind(this));
    this.onMessage('CHECK_INVARIANTS', this._handleCheckInvariants.bind(this));
    this.onMessage('GET_METRICS', this._handleGetMetrics.bind(this));

    // Start metrics collection
    this._startMetricsCollection();

    return { ok: true, value: null };
  }

  // ===========================================================================
  // LOGGING
  // ===========================================================================

  logSignal(signal) {
    const entry = {
      timestamp: Date.now(),
      symbol: signal.symbol,
      direction: signal.direction,
      score: signal.score,
      confidence: signal.confidence
    };

    this.signalLog.push(entry);
    this.metrics.signals.total++;
    this.metrics.signals.byDirection[signal.direction]++;

    // Persist periodically
    if (this.signalLog.length >= 100) {
      this._persistSignalLog();
    }

    return entry;
  }

  logTrade(trade) {
    const entry = {
      timestamp: Date.now(),
      symbol: trade.symbol,
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      pnl: trade.pnl,
      reason: trade.reason,
      duration: trade.closeTime - trade.openTime
    };

    this.tradeLog.push(entry);
    this.metrics.trades.total++;
    
    if (trade.pnl > 0) {
      this.metrics.trades.wins++;
    } else {
      this.metrics.trades.losses++;
    }
    this.metrics.trades.pnl += trade.pnl;

    // Persist
    if (this.tradeLog.length >= 50) {
      this._persistTradeLog();
    }

    return entry;
  }

  logError(error, context = {}) {
    const entry = {
      timestamp: Date.now(),
      error: error.message || error,
      code: error.code,
      context,
      stack: error.stack
    };

    this.errorLog.push(entry);
    this.metrics.errors.total++;
    
    const errorType = error.code || 'UNKNOWN';
    this.metrics.errors.byType[errorType] = (this.metrics.errors.byType[errorType] || 0) + 1;

    // Persist immediately for errors
    this._persistErrorLog();

    return entry;
  }

  logEmergency(data) {
    const filename = `emergency_${Date.now()}.json`;
    const filepath = path.join(this.logDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify({
      ...data,
      metrics: this.metrics,
      recentSignals: this.signalLog.slice(-50),
      recentTrades: this.tradeLog.slice(-50),
      recentErrors: this.errorLog.slice(-50)
    }, null, 2));

    this.log(`Emergency log written: ${filename}`);
    return { filename, filepath };
  }

  // ===========================================================================
  // METRICS
  // ===========================================================================

  recordLatency(ms) {
    this.metrics.latency.samples.push(ms);
    
    // Keep last 1000 samples
    if (this.metrics.latency.samples.length > 1000) {
      this.metrics.latency.samples.shift();
    }

    this._updateLatencyPercentiles();
  }

  _updateLatencyPercentiles() {
    const sorted = [...this.metrics.latency.samples].sort((a, b) => a - b);
    const len = sorted.length;
    
    this.metrics.latency.p50 = sorted[Math.floor(len * 0.5)] || 0;
    this.metrics.latency.p95 = sorted[Math.floor(len * 0.95)] || 0;
    this.metrics.latency.p99 = sorted[Math.floor(len * 0.99)] || 0;
  }

  getMetrics() {
    const uptime = Date.now() - this.metrics.uptime.startTime;
    const winRate = this.metrics.trades.total > 0 
      ? (this.metrics.trades.wins / this.metrics.trades.total * 100) 
      : 0;

    return {
      ...this.metrics,
      uptime: {
        ms: uptime,
        hours: Math.round(uptime / 3600000 * 100) / 100
      },
      winRate: Math.round(winRate * 100) / 100,
      avgPnl: this.metrics.trades.total > 0 
        ? Math.round(this.metrics.trades.pnl / this.metrics.trades.total * 100) / 100 
        : 0
    };
  }

  _startMetricsCollection() {
    this._metricsTimer = setInterval(() => {
      this.metrics.uptime.lastCheck = Date.now();
      this.emit('metricsUpdate', this.getMetrics());
    }, this.metricsInterval);
  }

  // ===========================================================================
  // INVARIANT CHECKING
  // ===========================================================================

  checkInvariants(state) {
    const violations = [];

    for (const invariant of this.invariants) {
      try {
        const result = invariant.check(state);
        if (!result.passed) {
          violations.push({
            id: invariant.id,
            rule: invariant.rule,
            severity: invariant.severity,
            message: result.message
          });
        }
      } catch (error) {
        violations.push({
          id: invariant.id,
          rule: invariant.rule,
          severity: 'ERROR',
          message: `Check failed: ${error.message}`
        });
      }
    }

    if (violations.length > 0) {
      this.invariantViolations.push({
        timestamp: Date.now(),
        violations
      });
      
      this.emit('invariantViolation', violations);
    }

    return { passed: violations.length === 0, violations };
  }

  // ===========================================================================
  // PERSISTENCE
  // ===========================================================================

  _persistSignalLog() {
    const filename = `signals_${Date.now()}.json`;
    const filepath = path.join(this.logDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(this.signalLog, null, 2));
    this.signalLog = [];
  }

  _persistTradeLog() {
    const filename = `trades_${Date.now()}.json`;
    const filepath = path.join(this.logDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(this.tradeLog, null, 2));
    this.tradeLog = [];
  }

  _persistErrorLog() {
    const filename = `errors_${Date.now()}.json`;
    const filepath = path.join(this.logDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(this.errorLog, null, 2));
    this.errorLog = [];
  }

  // ===========================================================================
  // MESSAGE HANDLERS
  // ===========================================================================

  async _handleLogSignal(payload) {
    return { ok: true, value: this.logSignal(payload) };
  }

  async _handleLogTrade(payload) {
    return { ok: true, value: this.logTrade(payload) };
  }

  async _handleLogError(payload) {
    return { ok: true, value: this.logError(payload.error, payload.context) };
  }

  async _handleLogPosition(payload) {
    if (payload.pnl !== undefined) {
      return { ok: true, value: this.logTrade(payload) };
    }
    return { ok: true, value: null };
  }

  async _handleLogEmergency(payload) {
    return { ok: true, value: this.logEmergency(payload) };
  }

  async _handleCheckInvariants(payload) {
    return { ok: true, value: this.checkInvariants(payload.state) };
  }

  async _handleGetMetrics() {
    return { ok: true, value: this.getMetrics() };
  }

  async performHealthCheck() {
    return {
      status: 'HEALTHY',
      details: {
        signalsLogged: this.metrics.signals.total,
        tradesLogged: this.metrics.trades.total,
        errorsLogged: this.metrics.errors.total,
        invariantViolations: this.invariantViolations.length
      }
    };
  }

  async cleanup() {
    clearInterval(this._metricsTimer);
    
    // Persist remaining logs
    if (this.signalLog.length > 0) this._persistSignalLog();
    if (this.tradeLog.length > 0) this._persistTradeLog();
    if (this.errorLog.length > 0) this._persistErrorLog();
  }
}

module.exports = AuditAgent;
