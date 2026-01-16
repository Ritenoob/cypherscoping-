/**
 * CircuitBreaker - Production Safety System
 *
 * Implements circuit breaker pattern for fault tolerance.
 * Monitors system health, rate limits, consecutive failures.
 * Auto-trips to prevent cascading failures.
 */

const EventEmitter = require('events');

// Circuit states
const STATE = {
  CLOSED: 'closed',      // Normal operation
  OPEN: 'open',          // Failures exceeded threshold, blocking calls
  HALF_OPEN: 'half_open' // Testing if system recovered
};

class CircuitBreaker extends EventEmitter {
  constructor(config = {}) {
    super();

    this.name = config.name || 'default';

    // Failure thresholds
    this.failureThreshold = config.failureThreshold || 5;
    this.successThreshold = config.successThreshold || 3;
    this.timeout = config.timeout || 30000; // Time before trying again

    // Rate limiting
    this.maxRequestsPerMinute = config.maxRequestsPerMinute || 100;
    this.requestWindow = [];

    // State
    this.state = STATE.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();

    // Metrics
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      stateChanges: []
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn) {
    this.metrics.totalCalls++;

    // Check rate limit
    if (!this._checkRateLimit()) {
      this.metrics.rejectedCalls++;
      return { ok: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } };
    }

    // Check circuit state
    if (this.state === STATE.OPEN) {
      if (this._shouldAttemptReset()) {
        this._setState(STATE.HALF_OPEN);
      } else {
        this.metrics.rejectedCalls++;
        return { ok: false, error: { code: 'CIRCUIT_OPEN', message: 'Circuit breaker is open' } };
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure(error);
      return { ok: false, error: { code: 'EXECUTION_FAILED', message: error.message } };
    }
  }

  /**
   * Check if rate limit allows request
   */
  _checkRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove old requests
    this.requestWindow = this.requestWindow.filter(t => t > oneMinuteAgo);

    if (this.requestWindow.length >= this.maxRequestsPerMinute) {
      return false;
    }

    this.requestWindow.push(now);
    return true;
  }

  /**
   * Handle successful execution
   */
  _onSuccess() {
    this.metrics.successfulCalls++;

    if (this.state === STATE.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this._setState(STATE.CLOSED);
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  /**
   * Handle failed execution
   */
  _onFailure(error) {
    this.metrics.failedCalls++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === STATE.HALF_OPEN) {
      this._setState(STATE.OPEN);
      this.successCount = 0;
    } else if (this.failureCount >= this.failureThreshold) {
      this._setState(STATE.OPEN);
    }

    this.emit('failure', { name: this.name, error, failureCount: this.failureCount });
  }

  /**
   * Check if we should attempt to reset
   */
  _shouldAttemptReset() {
    return Date.now() - this.lastStateChange >= this.timeout;
  }

  /**
   * Set circuit state
   */
  _setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    this.metrics.stateChanges.push({
      from: oldState,
      to: newState,
      timestamp: Date.now()
    });

    // Keep only last 100 state changes
    if (this.metrics.stateChanges.length > 100) {
      this.metrics.stateChanges.shift();
    }

    this.emit('stateChange', { name: this.name, from: oldState, to: newState });
  }

  /**
   * Force open the circuit (emergency stop)
   */
  trip() {
    this._setState(STATE.OPEN);
    this.emit('tripped', { name: this.name, reason: 'manual' });
  }

  /**
   * Force reset the circuit
   */
  reset() {
    this._setState(STATE.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
    this.emit('reset', { name: this.name });
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      metrics: this.metrics,
      requestsThisMinute: this.requestWindow.length,
      isHealthy: this.state === STATE.CLOSED
    };
  }
}

/**
 * CircuitBreakerManager - Manages multiple circuit breakers
 */
class CircuitBreakerManager extends EventEmitter {
  constructor() {
    super();
    this.breakers = new Map();
    this.globalPause = false;
  }

  /**
   * Create or get a circuit breaker
   */
  get(name, config = {}) {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker({ name, ...config });

      // Forward events
      breaker.on('failure', (data) => this.emit('failure', data));
      breaker.on('stateChange', (data) => this.emit('stateChange', data));
      breaker.on('tripped', (data) => this.emit('tripped', data));

      this.breakers.set(name, breaker);
    }
    return this.breakers.get(name);
  }

  /**
   * Execute with circuit breaker protection
   */
  async execute(name, fn, config = {}) {
    if (this.globalPause) {
      return { ok: false, error: { code: 'GLOBAL_PAUSE', message: 'System is paused' } };
    }

    const breaker = this.get(name, config);
    return breaker.execute(fn);
  }

  /**
   * Emergency stop - trip all breakers
   */
  emergencyStop(reason = 'emergency') {
    this.globalPause = true;
    for (const breaker of this.breakers.values()) {
      breaker.trip();
    }
    this.emit('emergencyStop', { reason, timestamp: Date.now() });
  }

  /**
   * Resume all breakers
   */
  resume() {
    this.globalPause = false;
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    this.emit('resumed', { timestamp: Date.now() });
  }

  /**
   * Get health status of all breakers
   */
  getHealth() {
    const statuses = {};
    let overallHealthy = true;

    for (const [name, breaker] of this.breakers) {
      const status = breaker.getStatus();
      statuses[name] = status;
      if (!status.isHealthy) overallHealthy = false;
    }

    return {
      globalPause: this.globalPause,
      overallHealthy,
      breakers: statuses
    };
  }
}

// Singleton manager
const manager = new CircuitBreakerManager();

module.exports = CircuitBreaker;
module.exports.CircuitBreakerManager = CircuitBreakerManager;
module.exports.manager = manager;
module.exports.STATE = STATE;
