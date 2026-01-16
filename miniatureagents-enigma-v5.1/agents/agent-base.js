/**
 * AgentBase - Foundation class for all AI agents
 * 
 * Provides:
 * - Lifecycle management (start, stop, restart)
 * - Health monitoring and self-healing
 * - Message bus communication
 * - Task queue processing
 * - Metrics collection
 * - Result pattern enforcement
 */

const EventEmitter = require('events');
const Decimal = require('decimal.js');

// Configure Decimal.js for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_DOWN });

/**
 * @typedef {Object} Result
 * @property {boolean} ok
 * @property {*} [value]
 * @property {Object} [error]
 */

/**
 * @typedef {Object} AgentMessage
 * @property {string} id
 * @property {string} from
 * @property {string} to
 * @property {'REQUEST'|'RESPONSE'|'EVENT'|'COMMAND'} type
 * @property {string} action
 * @property {*} payload
 * @property {number} timestamp
 * @property {string} [correlationId]
 * @property {'LOW'|'NORMAL'|'HIGH'|'CRITICAL'} priority
 */

/**
 * @typedef {'INITIALIZING'|'READY'|'RUNNING'|'PAUSED'|'ERROR'|'STOPPED'} AgentState
 */

class AgentBase extends EventEmitter {
  /**
   * @param {Object} config
   * @param {string} config.id - Unique agent identifier
   * @param {string} config.name - Human-readable name
   * @param {Object} [config.options] - Agent-specific options
   */
  constructor(config) {
    super();
    
    // Identity
    this.id = config.id;
    this.name = config.name;
    this.version = '1.0.0';
    
    // State
    this.state = 'INITIALIZING';
    this.startTime = null;
    this.lastActivity = null;
    this.taskQueue = [];
    this.processingTask = false;
    
    // Health
    this.health = {
      status: 'UNKNOWN',
      lastCheck: null,
      consecutiveFailures: 0,
      totalTasks: 0,
      failedTasks: 0,
      avgTaskDuration: 0
    };
    
    // Metrics
    this.metrics = {
      tasksProcessed: 0,
      tasksFailed: 0,
      messagesReceived: 0,
      messagesSent: 0,
      errors: []
    };
    
    // Configuration
    this.options = config.options || {};
    this.healthCheckInterval = this.options.healthCheckInterval || 30000;
    this.maxQueueSize = this.options.maxQueueSize || 100;
    this.taskTimeout = this.options.taskTimeout || 30000;
    
    // Timers
    this._healthTimer = null;
    this._taskTimer = null;
    
    // Message handlers
    this._messageHandlers = new Map();
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Initialize and start the agent
   * @returns {Promise<Result>}
   */
  async start() {
    try {
      this.log(`Starting agent: ${this.name}`);
      
      // Run pre-start validation
      const validation = await this._validateConfig();
      if (!validation.ok) {
        return validation;
      }
      
      // Initialize agent-specific resources
      const init = await this.initialize();
      if (!init.ok) {
        this.state = 'ERROR';
        return init;
      }
      
      this.startTime = Date.now();
      this.state = 'READY';
      
      // Start health monitoring
      this._startHealthCheck();
      
      // Start task processing loop
      this._startTaskProcessor();
      
      this.state = 'RUNNING';
      this.emit('started', { agentId: this.id, timestamp: Date.now() });
      
      this.log(`Agent started successfully`);
      return { ok: true, value: { agentId: this.id, state: this.state } };
      
    } catch (error) {
      this.state = 'ERROR';
      this.logError('Failed to start agent', error);
      return { ok: false, error: { code: 'START_FAILED', message: error.message } };
    }
  }

  /**
   * Gracefully stop the agent
   * @returns {Promise<Result>}
   */
  async stop() {
    try {
      this.log(`Stopping agent: ${this.name}`);
      this.state = 'STOPPED';
      
      // Clear timers
      if (this._healthTimer) clearInterval(this._healthTimer);
      if (this._taskTimer) clearInterval(this._taskTimer);
      
      // Wait for current task to complete (with timeout)
      if (this.processingTask) {
        await this._waitForTaskCompletion(5000);
      }
      
      // Cleanup agent-specific resources
      await this.cleanup();
      
      this.emit('stopped', { agentId: this.id, timestamp: Date.now() });
      this.log(`Agent stopped`);
      
      return { ok: true, value: { agentId: this.id, state: this.state } };
      
    } catch (error) {
      this.logError('Error during shutdown', error);
      return { ok: false, error: { code: 'STOP_FAILED', message: error.message } };
    }
  }

  /**
   * Restart the agent
   * @returns {Promise<Result>}
   */
  async restart() {
    const stopResult = await this.stop();
    if (!stopResult.ok) return stopResult;
    
    // Brief pause before restart
    await this._sleep(1000);
    
    return this.start();
  }

  /**
   * Pause task processing (does not stop health checks)
   */
  pause() {
    if (this.state === 'RUNNING') {
      this.state = 'PAUSED';
      this.emit('paused', { agentId: this.id, timestamp: Date.now() });
    }
  }

  /**
   * Resume task processing
   */
  resume() {
    if (this.state === 'PAUSED') {
      this.state = 'RUNNING';
      this.emit('resumed', { agentId: this.id, timestamp: Date.now() });
    }
  }

  // ===========================================================================
  // ABSTRACT METHODS (Override in subclasses)
  // ===========================================================================

  /**
   * Initialize agent-specific resources
   * @returns {Promise<Result>}
   */
  async initialize() {
    return { ok: true, value: null };
  }

  /**
   * Cleanup agent-specific resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    // Override in subclass
  }

  /**
   * Process a single task
   * @param {Object} task
   * @returns {Promise<Result>}
   */
  async processTask(task) {
    // Override in subclass
    return { ok: true, value: null };
  }

  /**
   * Perform health check
   * @returns {Promise<Object>}
   */
  async performHealthCheck() {
    // Override in subclass for custom health checks
    return {
      status: this.state === 'RUNNING' ? 'HEALTHY' : 'DEGRADED',
      details: {}
    };
  }

  // ===========================================================================
  // TASK QUEUE
  // ===========================================================================

  /**
   * Add task to queue
   * @param {Object} task
   * @param {'LOW'|'NORMAL'|'HIGH'|'CRITICAL'} [priority='NORMAL']
   * @returns {Result}
   */
  enqueue(task, priority = 'NORMAL') {
    if (this.taskQueue.length >= this.maxQueueSize) {
      return { ok: false, error: { code: 'QUEUE_FULL', message: 'Task queue at capacity' } };
    }
    
    const queuedTask = {
      id: this._generateId(),
      task,
      priority,
      enqueuedAt: Date.now()
    };
    
    // Insert based on priority
    if (priority === 'CRITICAL') {
      this.taskQueue.unshift(queuedTask);
    } else if (priority === 'HIGH') {
      const idx = this.taskQueue.findIndex(t => t.priority !== 'CRITICAL');
      this.taskQueue.splice(idx === -1 ? 0 : idx, 0, queuedTask);
    } else {
      this.taskQueue.push(queuedTask);
    }
    
    return { ok: true, value: { taskId: queuedTask.id, queuePosition: this.taskQueue.length } };
  }

  /**
   * Get queue status
   * @returns {Object}
   */
  getQueueStatus() {
    return {
      size: this.taskQueue.length,
      maxSize: this.maxQueueSize,
      processing: this.processingTask,
      oldestTask: this.taskQueue[0]?.enqueuedAt || null
    };
  }

  _startTaskProcessor() {
    this._taskTimer = setInterval(async () => {
      if (this.state !== 'RUNNING' || this.processingTask || this.taskQueue.length === 0) {
        return;
      }
      
      this.processingTask = true;
      const queuedTask = this.taskQueue.shift();
      const startTime = Date.now();
      
      try {
        const result = await Promise.race([
          this.processTask(queuedTask.task),
          this._createTimeout(this.taskTimeout)
        ]);
        
        const duration = Date.now() - startTime;
        this._updateTaskMetrics(true, duration);
        
        this.emit('taskCompleted', {
          taskId: queuedTask.id,
          duration,
          result
        });
        
      } catch (error) {
        const duration = Date.now() - startTime;
        this._updateTaskMetrics(false, duration);
        this.logError(`Task ${queuedTask.id} failed`, error);
        
        this.emit('taskFailed', {
          taskId: queuedTask.id,
          duration,
          error: error.message
        });
      }
      
      this.processingTask = false;
      this.lastActivity = Date.now();
      
    }, 100); // Process tasks every 100ms
  }

  _updateTaskMetrics(success, duration) {
    this.health.totalTasks++;
    if (!success) this.health.failedTasks++;
    
    // Exponential moving average for duration
    const alpha = 0.2;
    this.health.avgTaskDuration = 
      this.health.avgTaskDuration * (1 - alpha) + duration * alpha;
    
    this.metrics.tasksProcessed++;
    if (!success) this.metrics.tasksFailed++;
  }

  // ===========================================================================
  // MESSAGING
  // ===========================================================================

  /**
   * Register handler for message type
   * @param {string} action
   * @param {Function} handler
   */
  onMessage(action, handler) {
    this._messageHandlers.set(action, handler);
  }

  /**
   * Handle incoming message
   * @param {AgentMessage} message
   * @returns {Promise<Result>}
   */
  async handleMessage(message) {
    this.metrics.messagesReceived++;
    
    const handler = this._messageHandlers.get(message.action);
    if (!handler) {
      return { ok: false, error: { code: 'NO_HANDLER', message: `No handler for action: ${message.action}` } };
    }
    
    try {
      const result = await handler(message.payload, message);
      return { ok: true, value: result };
    } catch (error) {
      return { ok: false, error: { code: 'HANDLER_ERROR', message: error.message } };
    }
  }

  /**
   * Send message to another agent
   * @param {string} to - Target agent ID
   * @param {string} action
   * @param {*} payload
   * @param {'LOW'|'NORMAL'|'HIGH'|'CRITICAL'} [priority='NORMAL']
   * @returns {AgentMessage}
   */
  createMessage(to, action, payload, priority = 'NORMAL') {
    this.metrics.messagesSent++;
    
    return {
      id: this._generateId(),
      from: this.id,
      to,
      type: 'REQUEST',
      action,
      payload,
      timestamp: Date.now(),
      priority
    };
  }

  /**
   * Create response to a message
   * @param {AgentMessage} originalMessage
   * @param {*} payload
   * @returns {AgentMessage}
   */
  createResponse(originalMessage, payload) {
    return {
      id: this._generateId(),
      from: this.id,
      to: originalMessage.from,
      type: 'RESPONSE',
      action: originalMessage.action,
      payload,
      timestamp: Date.now(),
      correlationId: originalMessage.id,
      priority: originalMessage.priority
    };
  }

  // ===========================================================================
  // HEALTH MONITORING
  // ===========================================================================

  _startHealthCheck() {
    this._healthTimer = setInterval(async () => {
      try {
        const healthResult = await this.performHealthCheck();
        this.health.status = healthResult.status;
        this.health.lastCheck = Date.now();
        
        if (healthResult.status === 'HEALTHY') {
          this.health.consecutiveFailures = 0;
        } else {
          this.health.consecutiveFailures++;
        }
        
        // Auto-restart on repeated failures
        if (this.health.consecutiveFailures >= 3) {
          this.logError('Health check failed 3 times, attempting restart');
          this.emit('healthDegraded', { agentId: this.id, failures: this.health.consecutiveFailures });
          await this.restart();
        }
        
        this.emit('healthCheck', { agentId: this.id, health: this.health });
        
      } catch (error) {
        this.health.consecutiveFailures++;
        this.logError('Health check error', error);
      }
    }, this.healthCheckInterval);
  }

  /**
   * Get comprehensive status
   * @returns {Object}
   */
  getStatus() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      state: this.state,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      lastActivity: this.lastActivity,
      health: this.health,
      queue: this.getQueueStatus(),
      metrics: this.metrics
    };
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Validate configuration (override for custom validation)
   * @returns {Promise<Result>}
   */
  async _validateConfig() {
    if (!this.id) {
      return { ok: false, error: { code: 'INVALID_CONFIG', message: 'Agent ID required' } };
    }
    return { ok: true, value: null };
  }

  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _createTimeout(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), ms);
    });
  }

  async _waitForTaskCompletion(timeoutMs) {
    const start = Date.now();
    while (this.processingTask && Date.now() - start < timeoutMs) {
      await this._sleep(100);
    }
  }

  // ===========================================================================
  // LOGGING
  // ===========================================================================

  log(message, data = null) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${this.name}] ${message}`;
    console.log(logLine, data ? JSON.stringify(data) : '');
    this.emit('log', { level: 'INFO', message, data, timestamp });
  }

  logError(message, error = null) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${this.name}] ERROR: ${message}`;
    console.error(logLine, error?.message || '');
    
    this.metrics.errors.push({
      timestamp,
      message,
      error: error?.message || 'Unknown error'
    });
    
    // Keep only last 100 errors
    if (this.metrics.errors.length > 100) {
      this.metrics.errors.shift();
    }
    
    this.emit('log', { level: 'ERROR', message, error: error?.message, timestamp });
  }

  logWarn(message, data = null) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${this.name}] WARN: ${message}`;
    console.warn(logLine, data ? JSON.stringify(data) : '');
    this.emit('log', { level: 'WARN', message, data, timestamp });
  }
}

// ===========================================================================
// SHARED UTILITIES FOR ALL AGENTS
// ===========================================================================

const D = Decimal;

const AgentUtils = {
  /**
   * Wrap async function in Result pattern
   * @param {Function} fn
   * @returns {Function}
   */
  wrapInResult(fn) {
    return async (...args) => {
      try {
        const value = await fn(...args);
        return { ok: true, value };
      } catch (error) {
        return { ok: false, error: { code: 'EXECUTION_ERROR', message: error.message } };
      }
    };
  },

  /**
   * Retry with exponential backoff
   * @param {Function} fn
   * @param {number} maxRetries
   * @param {number} baseDelayMs
   * @returns {Promise<Result>}
   */
  async retryWithBackoff(fn, maxRetries = 3, baseDelayMs = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await fn();
        return { ok: true, value: result };
      } catch (error) {
        lastError = error;
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }
    
    return { ok: false, error: { code: 'RETRY_EXHAUSTED', message: lastError.message } };
  },

  /**
   * Decimal.js helpers
   */
  decimal: {
    add: (a, b) => new D(a).add(b).toNumber(),
    sub: (a, b) => new D(a).sub(b).toNumber(),
    mul: (a, b) => new D(a).mul(b).toNumber(),
    div: (a, b) => new D(a).div(b).toNumber(),
    abs: (a) => new D(a).abs().toNumber(),
    floor: (a) => new D(a).floor().toNumber(),
    ceil: (a) => new D(a).ceil().toNumber(),
    round: (a, dp = 2) => new D(a).toDP(dp).toNumber()
  }
};

module.exports = { AgentBase, AgentUtils, Decimal };
