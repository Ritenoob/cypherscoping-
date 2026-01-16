/**
 * Orchestrator - Master Agent Coordinator
 * 
 * Central brain that coordinates all agents, manages state, handles inter-agent
 * communication, and enforces system-wide invariants.
 */

const { AgentBase, AgentUtils } = require('./agent-base');
const EventEmitter = require('events');

const STATES = {
  INITIALIZING: 'INITIALIZING',
  READY: 'READY',
  TRADING: 'TRADING',
  PAUSED: 'PAUSED',
  EMERGENCY_STOP: 'EMERGENCY_STOP',
  SHUTDOWN: 'SHUTDOWN'
};

class Orchestrator extends AgentBase {
  constructor(config = {}) {
    super({
      id: 'orchestrator',
      name: 'Master Orchestrator',
      options: config
    });

    // Agent registry
    this.agents = new Map();
    this.agentClasses = config.agentClasses || {};
    
    // System state
    this.systemState = STATES.INITIALIZING;
    this.mode = config.mode || 'paper';
    
    // Event bus for inter-agent communication
    this.eventBus = new EventEmitter();
    this.eventBus.setMaxListeners(50);
    
    // Message routing
    this.pendingResponses = new Map();
    this.messageTimeout = config.messageTimeout || 30000;
    
    // Configuration
    this.config = config;
    this.symbols = config.symbols || [];
    this.timeframes = config.timeframes || ['15min', '1hour'];
    
    // Health tracking
    this.lastHealthCheck = new Map();
    this.unhealthyAgents = new Set();
  }

  async initialize() {
    this.log('Initializing Orchestrator');
    
    // Spawn all agents
    const agentConfigs = [
      { id: 'signal-agent', class: 'SignalAgent', config: this.config.signals },
      { id: 'risk-agent', class: 'RiskAgent', config: this.config.risk },
      { id: 'data-agent', class: 'DataAgent', config: this.config.data },
      { id: 'execution-agent', class: 'ExecutionAgent', config: this.config.execution },
      { id: 'optimizer-agent', class: 'OptimizerAgent', config: this.config.optimizer },
      { id: 'audit-agent', class: 'AuditAgent', config: this.config.audit }
    ];

    for (const agentConfig of agentConfigs) {
      const result = await this._spawnAgent(agentConfig);
      if (!result.ok) {
        this.logError(`Failed to spawn ${agentConfig.id}`, result.error);
      }
    }

    // Setup event routing
    this._setupEventRouting();
    
    // Register message handlers
    this.onMessage('BROADCAST', this._handleBroadcast.bind(this));
    this.onMessage('ROUTE', this._handleRoute.bind(this));
    this.onMessage('GET_STATUS', this._handleGetStatus.bind(this));

    return { ok: true, value: { agentsSpawned: this.agents.size } };
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  async startTrading() {
    if (this.systemState !== STATES.READY && this.systemState !== STATES.PAUSED) {
      return { ok: false, error: { code: 'INVALID_STATE', message: `Cannot start from state: ${this.systemState}` } };
    }

    // Pre-flight checks
    const preflight = await this._runPreflightChecks();
    if (!preflight.ok) {
      return preflight;
    }

    this.systemState = STATES.TRADING;
    this.log('Trading started');
    this.broadcast('system.tradingStarted', { timestamp: Date.now() });
    
    return { ok: true, value: { state: this.systemState } };
  }

  async pauseTrading(reason = 'Manual pause') {
    if (this.systemState !== STATES.TRADING) {
      return { ok: false, error: { code: 'INVALID_STATE', message: `Cannot pause from state: ${this.systemState}` } };
    }

    this.systemState = STATES.PAUSED;
    this.log(`Trading paused: ${reason}`);
    this.broadcast('system.tradingPaused', { reason, timestamp: Date.now() });
    
    return { ok: true, value: { state: this.systemState } };
  }

  async emergencyStop(reason) {
    this.logError(`EMERGENCY STOP: ${reason}`);
    this.systemState = STATES.EMERGENCY_STOP;

    // Notify all agents
    this.broadcast('system.emergencyStop', { reason, timestamp: Date.now() });

    // Execute emergency procedures
    await this._executeEmergencyProcedures(reason);

    return { ok: true, value: { state: this.systemState, reason } };
  }

  async resume() {
    if (this.systemState === STATES.PAUSED) {
      return this.startTrading();
    }
    
    if (this.systemState === STATES.EMERGENCY_STOP) {
      // Require explicit acknowledgment
      return { ok: false, error: { code: 'REQUIRES_ACK', message: 'Emergency stop requires manual acknowledgment via dashboard' } };
    }

    return { ok: false, error: { code: 'INVALID_STATE', message: `Cannot resume from state: ${this.systemState}` } };
  }

  // ===========================================================================
  // AGENT MANAGEMENT
  // ===========================================================================

  async _spawnAgent(config) {
    try {
      const AgentClass = this.agentClasses[config.class];
      
      if (!AgentClass) {
        // Try dynamic require
        const modulePath = `./${config.id}.js`;
        try {
          const loaded = require(modulePath);
          this.agentClasses[config.class] = loaded;
        } catch (e) {
          this.log(`Agent class ${config.class} not available, skipping`);
          return { ok: true, value: { skipped: true } };
        }
      }

      const agent = new (this.agentClasses[config.class] || Object)(config.config || {});
      
      // Setup agent event forwarding
      agent.on('log', (log) => this.emit('agentLog', { agentId: config.id, ...log }));
      agent.on('healthDegraded', (data) => this._handleAgentHealthDegraded(config.id, data));
      
      // Start agent
      const startResult = await agent.start();
      if (!startResult.ok) {
        return startResult;
      }

      this.agents.set(config.id, agent);
      this.log(`Spawned agent: ${config.id}`);
      
      return { ok: true, value: { agentId: config.id } };

    } catch (error) {
      return { ok: false, error: { code: 'SPAWN_FAILED', message: error.message } };
    }
  }

  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  async restartAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Agent ${agentId} not found` } };
    }

    return agent.restart();
  }

  // ===========================================================================
  // MESSAGE ROUTING
  // ===========================================================================

  /**
   * Send message to specific agent
   */
  async sendMessage(to, action, payload, priority = 'NORMAL') {
    const agent = this.agents.get(to);
    if (!agent) {
      return { ok: false, error: { code: 'AGENT_NOT_FOUND', message: `Agent ${to} not found` } };
    }

    const message = this.createMessage(to, action, payload, priority);
    return agent.handleMessage(message);
  }

  /**
   * Send message and wait for response
   */
  async sendMessageAsync(to, action, payload, timeoutMs = null) {
    const timeout = timeoutMs || this.messageTimeout;
    const message = this.createMessage(to, action, payload, 'NORMAL');
    
    return new Promise(async (resolve) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(message.id);
        resolve({ ok: false, error: { code: 'TIMEOUT', message: 'Response timeout' } });
      }, timeout);

      this.pendingResponses.set(message.id, { resolve, timer });
      
      const agent = this.agents.get(to);
      if (!agent) {
        clearTimeout(timer);
        this.pendingResponses.delete(message.id);
        resolve({ ok: false, error: { code: 'AGENT_NOT_FOUND', message: `Agent ${to} not found` } });
        return;
      }

      const result = await agent.handleMessage(message);
      clearTimeout(timer);
      this.pendingResponses.delete(message.id);
      resolve(result);
    });
  }

  /**
   * Broadcast event to all agents
   */
  broadcast(event, data) {
    this.eventBus.emit(event, data);
    
    for (const [agentId, agent] of this.agents) {
      agent.emit('broadcast', { event, data });
    }
  }

  _setupEventRouting() {
    // Route signals to Risk Agent for approval
    this.eventBus.on('signal.generated', async (signal) => {
      if (this.systemState !== STATES.TRADING) return;
      
      const riskResult = await this.sendMessage('risk-agent', 'VALIDATE_TRADE', {
        symbol: signal.symbol,
        direction: signal.direction,
        entryPrice: signal.currentPrice,
        leverage: signal.leverage || 50,
        positionPercent: signal.positionPercent || 1.0
      });

      if (riskResult.ok) {
        this.eventBus.emit('risk.approved', { signal, positionDetails: riskResult.value });
      } else {
        this.eventBus.emit('risk.rejected', { signal, reason: riskResult.error });
      }
    });

    // Route approved trades to Execution
    this.eventBus.on('risk.approved', async (data) => {
      if (this.systemState !== STATES.TRADING) return;
      
      await this.sendMessage('execution-agent', 'EXECUTE_TRADE', {
        ...data.signal,
        ...data.positionDetails
      });
    });

    // Route position updates
    this.eventBus.on('position.opened', (data) => {
      this.sendMessage('risk-agent', 'UPDATE_POSITION', data);
      this.sendMessage('audit-agent', 'LOG_POSITION', data);
    });

    this.eventBus.on('position.closed', (data) => {
      this.sendMessage('risk-agent', 'RECORD_TRADE_RESULT', { pnl: data.pnl, isWin: data.pnl > 0 });
      this.sendMessage('optimizer-agent', 'RECORD_TRADE', data);
      this.sendMessage('audit-agent', 'LOG_POSITION', data);
    });
  }

  // ===========================================================================
  // HEALTH & MONITORING
  // ===========================================================================

  async _runPreflightChecks() {
    const failures = [];

    // Check all agents are healthy
    for (const [agentId, agent] of this.agents) {
      const health = await agent.performHealthCheck();
      if (health.status !== 'HEALTHY') {
        failures.push({ agent: agentId, status: health.status, details: health.details });
      }
    }

    // Check mode-specific requirements
    if (this.mode === 'live') {
      // Verify API credentials
      const execAgent = this.agents.get('execution-agent');
      if (!execAgent) {
        failures.push({ check: 'EXECUTION_AGENT', message: 'Execution agent not available' });
      }
    }

    if (failures.length > 0) {
      return { ok: false, error: { code: 'PREFLIGHT_FAILED', failures } };
    }

    return { ok: true, value: { checksRun: this.agents.size + 1 } };
  }

  async runHealthChecks() {
    const results = {};
    
    for (const [agentId, agent] of this.agents) {
      try {
        const status = agent.getStatus();
        const health = await agent.performHealthCheck();
        results[agentId] = { ...status, health };
        this.lastHealthCheck.set(agentId, Date.now());
        
        if (health.status !== 'HEALTHY') {
          this.unhealthyAgents.add(agentId);
        } else {
          this.unhealthyAgents.delete(agentId);
        }
      } catch (error) {
        results[agentId] = { error: error.message };
        this.unhealthyAgents.add(agentId);
      }
    }

    return results;
  }

  _handleAgentHealthDegraded(agentId, data) {
    this.logWarn(`Agent ${agentId} health degraded: ${JSON.stringify(data)}`);
    this.unhealthyAgents.add(agentId);
    
    // If critical agent unhealthy, pause trading
    const criticalAgents = ['signal-agent', 'risk-agent', 'execution-agent'];
    if (criticalAgents.includes(agentId) && this.systemState === STATES.TRADING) {
      this.pauseTrading(`Critical agent ${agentId} unhealthy`);
    }
  }

  // ===========================================================================
  // EMERGENCY PROCEDURES
  // ===========================================================================

  async _executeEmergencyProcedures(reason) {
    this.log('Executing emergency procedures...');

    // 1. Cancel all pending orders
    const execAgent = this.agents.get('execution-agent');
    if (execAgent) {
      await this.sendMessage('execution-agent', 'CANCEL_ALL_ORDERS', {});
    }

    // 2. Close all positions (if configured)
    if (this.config.emergencyClosePositions) {
      await this.sendMessage('execution-agent', 'CLOSE_ALL_POSITIONS', { reason });
    }

    // 3. Log state
    await this.sendMessage('audit-agent', 'LOG_EMERGENCY', {
      reason,
      systemState: this.getSystemStatus(),
      timestamp: Date.now()
    });

    // 4. Send notifications
    this.broadcast('system.emergencyComplete', { reason, timestamp: Date.now() });

    this.log('Emergency procedures completed');
  }

  // ===========================================================================
  // STATUS
  // ===========================================================================

  getSystemStatus() {
    const agentStatuses = {};
    for (const [agentId, agent] of this.agents) {
      agentStatuses[agentId] = agent.getStatus();
    }

    return {
      state: this.systemState,
      mode: this.mode,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      agents: {
        total: this.agents.size,
        healthy: this.agents.size - this.unhealthyAgents.size,
        unhealthy: Array.from(this.unhealthyAgents)
      },
      agentStatuses,
      config: {
        symbols: this.symbols.length,
        timeframes: this.timeframes
      }
    };
  }

  // ===========================================================================
  // MESSAGE HANDLERS
  // ===========================================================================

  async _handleBroadcast(payload) {
    this.broadcast(payload.event, payload.data);
    return { ok: true, value: null };
  }

  async _handleRoute(payload) {
    return this.sendMessage(payload.to, payload.action, payload.data, payload.priority);
  }

  async _handleGetStatus() {
    return { ok: true, value: this.getSystemStatus() };
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  async cleanup() {
    this.log('Shutting down all agents...');
    
    for (const [agentId, agent] of this.agents) {
      await agent.stop();
    }
    
    this.agents.clear();
    this.eventBus.removeAllListeners();
    this.systemState = STATES.SHUTDOWN;
  }
}

module.exports = Orchestrator;
