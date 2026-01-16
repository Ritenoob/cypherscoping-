/**
 * ProductionController - System Health & Safety Manager
 *
 * Integrates circuit breakers, alerting, and health monitoring.
 * Provides centralized control for production operations.
 */

const { AgentBase } = require('./agent-base');
const CircuitBreaker = require('./circuit-breaker');
const { manager: cbManager, STATE } = require('./circuit-breaker');
const AlertManager = require('./alerting');

class ProductionController extends AgentBase {
  constructor(config = {}) {
    super({
      id: 'production-controller',
      name: 'Production Controller',
      options: config
    });

    // Alert manager
    this.alertManager = new AlertManager({
      initialBalance: config.initialBalance || 10000,
      consecutiveLossesWarning: config.consecutiveLossesWarning || 3,
      consecutiveLossesCritical: config.consecutiveLossesCritical || 5,
      drawdownWarningPct: config.drawdownWarningPct || 3,
      drawdownCriticalPct: config.drawdownCriticalPct || 5,
      drawdownEmergencyPct: config.drawdownEmergencyPct || 10,
      onAlert: (alert) => this._handleAlert(alert)
    });

    // Circuit breakers
    this.cbManager = cbManager;
    this._setupCircuitBreakers(config);

    // Health check interval
    this.healthCheckInterval = config.healthCheckInterval || 30000;
    this.healthCheckTimer = null;

    // Registered agents
    this.agents = new Map();

    // Emergency state
    this.isEmergencyMode = false;
    this.emergencyReason = null;

    // Metrics
    this.metrics = {
      startTime: Date.now(),
      healthChecks: 0,
      circuitTrips: 0,
      emergencyStops: 0
    };
  }

  _setupCircuitBreakers(config) {
    // API circuit breaker
    this.cbManager.get('api', {
      failureThreshold: config.apiFailureThreshold || 5,
      timeout: config.apiTimeout || 30000,
      maxRequestsPerMinute: config.apiRateLimit || 100
    });

    // Order execution circuit breaker
    this.cbManager.get('orders', {
      failureThreshold: config.orderFailureThreshold || 3,
      timeout: config.orderTimeout || 60000,
      maxRequestsPerMinute: config.orderRateLimit || 50
    });

    // WebSocket circuit breaker
    this.cbManager.get('websocket', {
      failureThreshold: config.wsFailureThreshold || 3,
      timeout: config.wsTimeout || 15000
    });

    // Listen for circuit events
    this.cbManager.on('stateChange', (data) => {
      if (data.to === STATE.OPEN) {
        this.metrics.circuitTrips++;
        this.alertManager.circuitTrip(data.name, 'failure_threshold');
        this.log(`Circuit ${data.name} OPENED`);
      } else if (data.to === STATE.CLOSED) {
        this.log(`Circuit ${data.name} recovered`);
      }
    });

    this.cbManager.on('emergencyStop', (data) => {
      this.metrics.emergencyStops++;
      this.isEmergencyMode = true;
      this.emergencyReason = data.reason;
    });
  }

  async initialize() {
    this.log('Initializing Production Controller');

    this.onMessage('REGISTER_AGENT', this._handleRegisterAgent.bind(this));
    this.onMessage('RECORD_TRADE', this._handleRecordTrade.bind(this));
    this.onMessage('HEALTH_CHECK', this._handleHealthCheck.bind(this));
    this.onMessage('EMERGENCY_STOP', this._handleEmergencyStop.bind(this));
    this.onMessage('RESUME', this._handleResume.bind(this));
    this.onMessage('GET_STATUS', this._handleGetStatus.bind(this));

    // Start health check loop
    this._startHealthCheckLoop();

    return { ok: true, value: null };
  }

  async stop() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    await super.stop();
    return { ok: true };
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Register an agent for monitoring
   */
  registerAgent(agent) {
    this.agents.set(agent.id, agent);
    this.log(`Registered agent: ${agent.name}`);
  }

  /**
   * Record a completed trade
   */
  recordTrade(trade) {
    this.alertManager.recordTrade(trade);

    // Check for emergency stop conditions
    const status = this.alertManager.getStatus();
    if (status.currentDrawdown >= 10) {
      this.emergencyStop('drawdown_exceeded');
    }
  }

  /**
   * Execute with circuit breaker
   */
  async executeWithCircuitBreaker(breakerName, fn) {
    if (this.isEmergencyMode) {
      return { ok: false, error: { code: 'EMERGENCY_MODE', message: 'System in emergency mode' } };
    }
    return this.cbManager.execute(breakerName, fn);
  }

  /**
   * Emergency stop all trading
   */
  emergencyStop(reason = 'manual') {
    this.isEmergencyMode = true;
    this.emergencyReason = reason;
    this.cbManager.emergencyStop(reason);

    this.alertManager.trigger({
      type: 'EMERGENCY_STOP',
      severity: 'emergency',
      message: `EMERGENCY STOP: ${reason}`,
      data: { reason }
    });

    this.emit('emergencyStop', { reason, timestamp: Date.now() });
    this.log(`EMERGENCY STOP: ${reason}`);

    return { ok: true, value: { reason } };
  }

  /**
   * Resume trading after emergency
   */
  resume() {
    this.isEmergencyMode = false;
    this.emergencyReason = null;
    this.cbManager.resume();
    this.alertManager.reset();

    this.emit('resumed', { timestamp: Date.now() });
    this.log('System resumed');

    return { ok: true };
  }

  /**
   * Get system status
   */
  getStatus() {
    const cbHealth = this.cbManager.getHealth();
    const alertStatus = this.alertManager.getStatus();
    const uptime = Date.now() - this.metrics.startTime;

    return {
      isEmergencyMode: this.isEmergencyMode,
      emergencyReason: this.emergencyReason,
      circuitBreakers: cbHealth,
      alerts: alertStatus,
      agents: this._getAgentStatuses(),
      uptime: {
        ms: uptime,
        hours: Math.floor(uptime / 3600000),
        formatted: this._formatUptime(uptime)
      },
      metrics: this.metrics
    };
  }

  // ===========================================================================
  // HEALTH MONITORING
  // ===========================================================================

  _startHealthCheckLoop() {
    this.healthCheckTimer = setInterval(async () => {
      await this._performHealthCheck();
    }, this.healthCheckInterval);
  }

  async _performHealthCheck() {
    this.metrics.healthChecks++;
    const issues = [];

    // Check all registered agents
    for (const [id, agent] of this.agents) {
      try {
        if (typeof agent.performHealthCheck === 'function') {
          const health = await agent.performHealthCheck();
          if (health.status !== 'HEALTHY') {
            issues.push({ agent: id, status: health.status, details: health.details });
          }
        }
      } catch (error) {
        issues.push({ agent: id, status: 'ERROR', error: error.message });
      }
    }

    // Check circuit breakers
    const cbHealth = this.cbManager.getHealth();
    if (!cbHealth.overallHealthy) {
      const unhealthy = Object.entries(cbHealth.breakers)
        .filter(([_, status]) => !status.isHealthy)
        .map(([name]) => name);
      issues.push({ component: 'circuit_breakers', unhealthy });
    }

    // Emit health status
    const healthy = issues.length === 0;
    this.emit('healthCheck', { healthy, issues, timestamp: Date.now() });

    if (!healthy) {
      this.log(`Health check found ${issues.length} issues`);
    }

    return { healthy, issues };
  }

  _getAgentStatuses() {
    const statuses = {};
    for (const [id, agent] of this.agents) {
      statuses[id] = {
        name: agent.name,
        state: agent.state,
        isRunning: agent.isRunning
      };
    }
    return statuses;
  }

  _formatUptime(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  _handleAlert(alert) {
    // Log to console
    console.log(`[PRODUCTION] Alert: ${alert.severity} - ${alert.message}`);

    // Check if we need to take action
    if (alert.action === 'STOP_TRADING') {
      this.emergencyStop(alert.type);
    }

    // Emit for external handlers
    this.emit('alert', alert);
  }

  // ===========================================================================
  // MESSAGE HANDLERS
  // ===========================================================================

  async _handleRegisterAgent(payload) {
    this.registerAgent(payload.agent);
    return { ok: true };
  }

  async _handleRecordTrade(payload) {
    this.recordTrade(payload.trade);
    return { ok: true };
  }

  async _handleHealthCheck() {
    return { ok: true, value: await this._performHealthCheck() };
  }

  async _handleEmergencyStop(payload) {
    return this.emergencyStop(payload?.reason);
  }

  async _handleResume() {
    return this.resume();
  }

  async _handleGetStatus() {
    return { ok: true, value: this.getStatus() };
  }

  async performHealthCheck() {
    const check = await this._performHealthCheck();
    return {
      status: check.healthy ? 'HEALTHY' : 'UNHEALTHY',
      details: {
        isEmergencyMode: this.isEmergencyMode,
        issueCount: check.issues.length,
        issues: check.issues
      }
    };
  }
}

module.exports = ProductionController;
