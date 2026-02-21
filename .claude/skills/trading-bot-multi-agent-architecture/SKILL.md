# Multi-Agent Trading Bot Architecture

**Type:** Architecture Pattern
**Domain:** Algorithmic Trading, Multi-Agent Systems
**Version:** 1.0.0
**Last Updated:** 2026-02-21

---

## When to Use This Pattern

Apply this multi-agent architecture when:

- Building cryptocurrency or financial trading systems with distinct responsibilities (screening, signal analysis, execution, risk management)
- Requiring separation of concerns between different trading phases (data collection, signal generation, order execution, risk control)
- Needing independent scaling of different system components (more signal processors, fewer screeners)
- Implementing complex trading strategies with multiple decision-making layers
- Building institutional-grade trading infrastructure with audit trails and compliance requirements
- Orchestrating multiple specialized services that communicate through events or message queues

**Do NOT use this pattern for:**
- Simple trading bots with single-strategy execution (use monolithic approach)
- Prototyping and backtesting (agent overhead not needed)
- Ultra-low latency HFT (agent coordination adds latency)

---

## Core Architecture Principles

### 1. Agent Specialization
Each agent has ONE primary responsibility:

| Agent Type | Single Responsibility | Inputs | Outputs |
|------------|----------------------|---------|---------|
| **Screener** | Market opportunity discovery | Universe of symbols, filters | Ranked list of tradeable symbols |
| **Signal Analysis** | Trade signal generation | Market data, indicators | Buy/sell signals with confidence scores |
| **Risk Management** | Position sizing and limits | Account state, signals | Approved trades with size/stops |
| **Trade Execution** | Order placement and tracking | Approved trades | Filled orders, positions |
| **Orchestrator** | Coordination and workflow | All agent outputs | Delegated tasks, system state |

### 2. Event-Driven Communication

Agents communicate through events, never direct calls:

```
Symbol Scan Event → Screener Agent → Candidate Event → Signal Agent → Trade Signal Event → Risk Agent → Approved Trade Event → Execution Agent → Order Filled Event → All Agents
```

**Benefits:**
- Decoupling: Agents don't know about each other
- Resilience: Agent failures don't cascade
- Auditability: Every decision is logged as an event
- Testability: Mock events for testing

### 3. Capability-Based Task Assignment

Agents declare capabilities, orchestrator assigns tasks:

```typescript
// Agent declaration
capabilities: ['market-analysis', 'signal-generation']

// Task requirements
const task = {
  requiredCapabilities: ['market-analysis']
};

// Orchestrator matches
orchestrator.findAgent(task) // Returns capable agent
```

---

## Implementation Guide

### Step 1: Define Agent Base Class

All agents extend a common base with lifecycle hooks:

```typescript
export abstract class BaseAgent {
  protected id: string;
  protected name: string;
  protected role: string;
  protected capabilities: string[];
  protected maxConcurrentTasks: number;
  protected priority: number;
  protected memory: AgentMemory;

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.capabilities = config.capabilities;
    this.maxConcurrentTasks = config.maxConcurrentTasks;
    this.priority = config.priority;
    this.memory = new AgentMemory();
  }

  // Lifecycle hooks
  abstract initialize(): Promise<void>;
  abstract execute(context: AgentContext): Promise<AgentResult>;
  abstract shutdown(): Promise<void>;

  // Capability check
  canHandleTask(task: Task): boolean {
    return task.requiredCapabilities.every(cap =>
      this.capabilities.includes(cap)
    );
  }

  // State reporting
  getState(): AgentState {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      isRunning: this.isRunning,
      taskCount: this.taskQueue.size
    };
  }
}
```

**Key Elements:**
- Lifecycle hooks: `initialize()`, `execute()`, `shutdown()`
- Capability matching: `canHandleTask()`
- State reporting: `getState()`
- Memory systems: short-term, long-term, working memory

### Step 2: Create Specialized Agents

Each agent implements domain-specific logic:

```typescript
export class CoinScreenerAgent extends BaseAgent {
  constructor() {
    super({
      id: 'coin-screener',
      name: 'Coin Screener',
      role: 'Market Scanner',
      capabilities: ['market-scanning', 'symbol-filtering'],
      maxConcurrentTasks: 10,
      priority: 2
    });
  }

  async initialize(): Promise<void> {
    // Load allowed symbols, connect to data providers
    this.allowedSymbols = await loadSymbolPolicy();
    this.dataProvider = new KuCoinClient();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      // Scan market for opportunities
      const candidates = await this.scanMarket(context.criteria);

      // Emit event for next agent
      this.emit('candidates-found', {
        symbols: candidates,
        timestamp: Date.now()
      });

      return {
        success: true,
        action: { type: 'scan-complete', data: { count: candidates.length } }
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        errorCode: 'E_SCAN_FAILED'
      };
    }
  }

  async shutdown(): Promise<void> {
    await this.dataProvider.disconnect();
  }
}
```

**Agent Implementation Checklist:**
- [ ] Extends `BaseAgent`
- [ ] Declares specific capabilities
- [ ] Implements all lifecycle hooks
- [ ] Never throws, always returns `AgentResult`
- [ ] Emits events for coordination
- [ ] Cleans up resources in `shutdown()`

### Step 3: Build the Orchestrator

The orchestrator coordinates all agents:

```typescript
export class Orchestrator {
  private agents: Map<string, BaseAgent>;
  private eventBus: EventEmitter;
  private taskQueue: PriorityQueue<Task>;

  constructor() {
    this.agents = new Map();
    this.eventBus = new EventEmitter();
    this.taskQueue = new PriorityQueue();
  }

  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);

    // Subscribe to agent events
    agent.on('*', (event, data) => {
      this.handleAgentEvent(agent.id, event, data);
    });
  }

  async processTask(task: Task): Promise<void> {
    // Find capable agent with lowest load
    const agent = this.selectAgent(task);

    if (!agent) {
      throw new Error(`No agent found for task: ${task.type}`);
    }

    // Delegate to agent
    const result = await agent.execute(task.context);

    // Log result
    await this.auditLogger.log({
      agentId: agent.id,
      taskId: task.id,
      result,
      timestamp: Date.now()
    });

    // Trigger next workflow step
    if (result.success && result.nextTask) {
      this.taskQueue.enqueue(result.nextTask);
    }
  }

  private selectAgent(task: Task): BaseAgent | null {
    let bestAgent: BaseAgent | null = null;
    let bestScore = -Infinity;

    for (const agent of this.agents.values()) {
      if (!agent.canHandleTask(task)) continue;

      const load = agent.getCurrentLoad();
      const capacity = agent.maxConcurrentTasks - load;

      // Score: higher priority, more capacity = better
      const score = (agent.priority * 10) + (capacity * 5) - load;

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  private handleAgentEvent(agentId: string, event: string, data: any): void {
    // Route events to next agent in workflow
    switch (event) {
      case 'candidates-found':
        this.taskQueue.enqueue({
          type: 'analyze-signals',
          requiredCapabilities: ['signal-analysis'],
          context: { symbols: data.symbols }
        });
        break;

      case 'signal-generated':
        this.taskQueue.enqueue({
          type: 'assess-risk',
          requiredCapabilities: ['risk-assessment'],
          context: { signal: data }
        });
        break;

      case 'risk-approved':
        this.taskQueue.enqueue({
          type: 'execute-trade',
          requiredCapabilities: ['order-placement'],
          context: { trade: data }
        });
        break;
    }
  }
}
```

**Orchestrator Responsibilities:**
1. Agent registration and lifecycle management
2. Task routing based on capabilities
3. Load balancing across agents
4. Event-based workflow coordination
5. Audit logging and monitoring

### Step 4: Define Communication Patterns

#### Pattern A: Event-Driven (Recommended)

```typescript
// Agent emits event
this.emit('signal-generated', {
  symbol: 'ETHUSDTM',
  direction: 'LONG',
  confidence: 0.92
});

// Orchestrator routes to next agent
orchestrator.on('signal-generated', (data) => {
  orchestrator.delegateTask('risk-management', data);
});
```

**Use when:**
- Agents don't need immediate response
- Workflow is linear (screener → signal → risk → execution)
- Audit trail required

#### Pattern B: Message Queue (High Volume)

```typescript
// Publish to queue
await redis.xadd('signals:pending', '*',
  'data', JSON.stringify(signal)
);

// Consumer agent reads from queue
const stream = redis.xread('BLOCK', 1000, 'STREAMS', 'signals:pending', lastId);
```

**Use when:**
- High message volume (1000+ signals/sec)
- Need persistence and replay
- Multiple consumers for load balancing

#### Pattern C: Direct RPC (Synchronous)

```typescript
// Only for critical paths requiring immediate response
const result = await orchestrator.executeSync('risk-check', trade);

if (!result.approved) {
  throw new Error('Risk check failed');
}
```

**Use when:**
- Must block on response (risk checks, order validation)
- Timeout acceptable
- Error handling critical

### Step 5: Implement Memory Systems

Each agent has three memory layers:

```typescript
class AgentMemory {
  // Short-term: current session
  shortTerm: Map<string, any> = new Map();

  // Long-term: persistent across restarts
  longTerm: PersistentStore;

  // Working: active task context
  working: Map<string, any> = new Map();

  set(key: string, value: any, layer: 'short' | 'long' | 'working' = 'short'): void {
    switch (layer) {
      case 'short':
        this.shortTerm.set(key, value);
        break;
      case 'long':
        this.longTerm.set(key, value);
        break;
      case 'working':
        this.working.set(key, value);
        break;
    }
  }

  get(key: string, layer: 'short' | 'long' | 'working' = 'short'): any {
    switch (layer) {
      case 'short':
        return this.shortTerm.get(key);
      case 'long':
        return this.longTerm.get(key);
      case 'working':
        return this.working.get(key);
    }
  }

  clearWorking(): void {
    this.working.clear();
  }
}
```

**Memory Usage:**
- **Short-term:** Last 100 signals, recent market data
- **Long-term:** Historical patterns, learned behaviors
- **Working:** Current trade context, intermediate calculations

### Step 6: Add Error Handling and Recovery

Never throw exceptions from agents:

```typescript
async execute(context: AgentContext): Promise<AgentResult> {
  try {
    // Agent logic
    const result = await this.process(context);

    return {
      success: true,
      data: result,
      action: { type: 'next-step', data: result }
    };
  } catch (error) {
    // Log but don't throw
    console.error(`[${this.name}] Error:`, error);

    return {
      success: false,
      error: (error as Error).message,
      errorCode: 'E_AGENT_FAILED',
      retry: true, // Signal to orchestrator to retry
      retryDelay: 5000 // 5 seconds
    };
  }
}
```

**Error Recovery Strategy:**
1. Agent returns error result (never throws)
2. Orchestrator checks `retry` flag
3. If retryable, add back to queue with delay
4. If not retryable, emit error event
5. Circuit breaker halts system on repeated failures

### Step 7: Testing Strategy

#### Unit Test: Individual Agent

```typescript
describe('SignalAnalysisAgent', () => {
  let agent: SignalAnalysisAgent;

  beforeEach(async () => {
    agent = new SignalAnalysisAgent();
    await agent.initialize();
  });

  afterEach(async () => {
    await agent.shutdown();
  });

  it('should generate signal from market data', async () => {
    const context: AgentContext = {
      symbol: 'ETHUSDTM',
      marketData: mockMarketData(),
      indicators: mockIndicators()
    };

    const result = await agent.execute(context);

    expect(result.success).toBe(true);
    expect(result.action?.type).toBe('signal-generated');
    expect(result.action?.data.confidence).toBeGreaterThan(0);
  });

  it('should handle missing data gracefully', async () => {
    const context: AgentContext = {
      symbol: 'INVALID',
      marketData: null
    };

    const result = await agent.execute(context);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('E_INVALID_DATA');
  });
});
```

#### Integration Test: Agent Workflow

```typescript
describe('Trading Workflow', () => {
  let orchestrator: Orchestrator;
  let agents: BaseAgent[];

  beforeEach(async () => {
    orchestrator = new Orchestrator();

    agents = [
      new CoinScreenerAgent(),
      new SignalAnalysisAgent(),
      new RiskManagementAgent(),
      new TradingExecutorAgent()
    ];

    for (const agent of agents) {
      await agent.initialize();
      orchestrator.registerAgent(agent);
    }
  });

  it('should execute full trading workflow', async () => {
    const events: string[] = [];

    orchestrator.on('*', (event) => {
      events.push(event);
    });

    await orchestrator.startScan({ universe: 'crypto' });

    // Wait for workflow completion
    await waitFor(() => events.includes('trade-executed'), 10000);

    expect(events).toEqual([
      'scan-started',
      'candidates-found',
      'signal-generated',
      'risk-approved',
      'trade-executed'
    ]);
  });
});
```

---

## Agent Communication Workflows

### Workflow 1: Market Scan → Signal → Trade

```
┌──────────────┐
│ Orchestrator │
│   analyze()  │
└──────┬───────┘
       │
       ├──→ Step 1: Screener Agent
       │    ├─ Scan market for symbols
       │    ├─ Apply filters (volume, volatility)
       │    └─ Emit: candidates-found
       │
       ├──→ Step 2: Signal Agent
       │    ├─ Analyze each candidate
       │    ├─ Generate signals with confidence
       │    └─ Emit: signal-generated
       │
       ├──→ Step 3: Risk Agent
       │    ├─ Check position limits
       │    ├─ Calculate position size
       │    ├─ Validate against drawdown
       │    └─ Emit: risk-approved OR risk-rejected
       │
       └──→ Step 4: Execution Agent
            ├─ Place order with exchange
            ├─ Monitor fill status
            └─ Emit: trade-executed
```

### Workflow 2: Direct Trade (Manual Override)

```
User Input → Orchestrator.directTrade()
  ├─ Validate symbol against policy
  ├─ Skip screener (user provided symbol)
  ├─→ Risk Agent (mandatory risk check)
  │   └─ If approved → Execution Agent
  │   └─ If rejected → Reject trade
  └─ Return result to user
```

### Workflow 3: Position Monitoring (Continuous)

```
Position Update Event (WebSocket)
  │
  ├──→ Risk Agent
  │    ├─ Update P&L calculations
  │    ├─ Check stop-loss triggers
  │    ├─ Monitor drawdown
  │    └─ Emit: stop-loss-triggered (if needed)
  │
  └──→ Execution Agent (on stop-loss)
       ├─ Place close order
       └─ Emit: position-closed
```

---

## Load Balancing Strategy

Orchestrator selects agents using composite scoring:

```typescript
function scoreAgent(agent: BaseAgent, task: Task): number {
  const load = agent.getCurrentLoad();
  const capacity = agent.maxConcurrentTasks - load;

  // Scoring formula
  return (agent.priority * 10) +      // Priority weight
         (capacity * 5) -             // Available capacity bonus
         (load);                      // Current load penalty
}
```

**Priority Guidelines:**
- **Priority 1:** Background/batch tasks (data collection)
- **Priority 2-3:** Standard agents (screener, signal)
- **Priority 4-5:** Critical agents (risk, execution)

**Max Concurrent Tasks:**
- CPU-bound agents: 5-10
- I/O-bound agents: 10-20
- Mixed workload: 8-15

---

## Common Patterns & Best Practices

### Pattern: Idempotent Operations

Every agent operation should be idempotent (safe to retry):

```typescript
async placeOrder(order: Order): Promise<OrderResult> {
  // Use deterministic order ID
  const orderId = generateIdempotentId(order);

  // Check if already processed
  const existing = await this.idempotencyStore.get(orderId);
  if (existing) {
    return existing.result; // Return cached result
  }

  // Process order
  const result = await this.exchange.placeOrder({
    ...order,
    clientOid: orderId // Exchange uses this for deduplication
  });

  // Store result
  await this.idempotencyStore.set(orderId, { order, result });

  return result;
}
```

### Pattern: Circuit Breaker

Halt system on repeated failures:

```typescript
class CircuitBreaker {
  private failures = 0;
  private readonly threshold = 5;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      throw new Error('Circuit breaker is OPEN - system halted');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;

    if (this.failures >= this.threshold) {
      this.state = 'open';
      this.emit('circuit-breaker-tripped', {
        failures: this.failures,
        timestamp: Date.now()
      });
    }
  }
}
```

### Pattern: Audit Trail

Log every decision for compliance:

```typescript
interface AuditLogEntry {
  timestamp: number;
  correlationId: string;
  agentId: string;
  action: string;
  context: Record<string, any>;
  result: AgentResult;
  metadata?: Record<string, any>;
}

class AuditLogger {
  async log(entry: AuditLogEntry): Promise<void> {
    const formattedEntry = {
      ...entry,
      timestamp: new Date(entry.timestamp).toISOString()
    };

    // Write to append-only log (JSONL format)
    await fs.appendFile(
      this.logPath,
      JSON.stringify(formattedEntry) + '\n'
    );

    // Also send to centralized logging
    await this.sendToLogAggregator(formattedEntry);
  }
}
```

---

## Deployment Considerations

### Single-Process Deployment (Simple)

All agents run in one Node.js process:

```typescript
// main.ts
const orchestrator = new Orchestrator();

const agents = [
  new CoinScreenerAgent(),
  new SignalAnalysisAgent(),
  new RiskManagementAgent(),
  new TradingExecutorAgent()
];

for (const agent of agents) {
  await agent.initialize();
  orchestrator.registerAgent(agent);
}

await orchestrator.start();
```

**Pros:** Simple deployment, low overhead
**Cons:** No horizontal scaling, single point of failure

### Multi-Process Deployment (Scalable)

Each agent type runs in separate process:

```yaml
# docker-compose.yml
services:
  orchestrator:
    image: trading-bot/orchestrator
    environment:
      - REDIS_URL=redis://redis:6379

  screener:
    image: trading-bot/screener-agent
    replicas: 2  # Scale out screeners
    environment:
      - REDIS_URL=redis://redis:6379

  signal-analyzer:
    image: trading-bot/signal-agent
    replicas: 4  # More signal processors
    environment:
      - REDIS_URL=redis://redis:6379

  risk-manager:
    image: trading-bot/risk-agent
    environment:
      - REDIS_URL=redis://redis:6379

  executor:
    image: trading-bot/execution-agent
    environment:
      - REDIS_URL=redis://redis:6379
```

**Pros:** Horizontal scaling, fault isolation
**Cons:** Requires message queue (Redis Streams/NATS), more complex

---

## Monitoring & Observability

### Agent Metrics to Track

```typescript
interface AgentMetrics {
  // Performance
  tasksProcessed: number;
  averageExecutionTime: number;
  successRate: number;

  // Load
  currentLoad: number;
  queueDepth: number;

  // Health
  lastHeartbeat: number;
  errorCount: number;

  // Business
  signalsGenerated?: number;
  tradesExecuted?: number;
  riskRejectionsCount?: number;
}
```

### Health Check Endpoint

```typescript
app.get('/health', async (req, res) => {
  const agentStates = Array.from(orchestrator.agents.values())
    .map(agent => agent.getState());

  const allHealthy = agentStates.every(s => s.isRunning);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    agents: agentStates,
    timestamp: Date.now()
  });
});
```

---

## Example: Complete Agent Implementation

```typescript
export class SignalAnalysisAgent extends BaseAgent {
  private signalGenerator: SignalGenerator;
  private confidenceCalculator: ConfidenceCalculator;

  constructor() {
    super({
      id: 'signal-analysis',
      name: 'Signal Analysis Agent',
      role: 'Trading Signal Generator',
      capabilities: ['signal-analysis', 'signal-generation'],
      maxConcurrentTasks: 15,
      priority: 3
    });
  }

  async initialize(): Promise<void> {
    this.signalGenerator = new SignalGenerator();
    this.confidenceCalculator = new ConfidenceCalculator();
    console.log('[SignalAnalysisAgent] Initialized');
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { symbol, marketData, indicators } = context;

    try {
      // Generate composite signal
      const signal = this.signalGenerator.generate({
        symbol,
        indicators,
        marketData
      });

      // Calculate confidence
      const confidence = this.confidenceCalculator.calculate(signal);

      // Store in memory
      this.memory.shortTerm.set(`last-signal-${symbol}`, signal);

      // Emit event
      this.emit('signal-generated', {
        symbol,
        signal: signal.direction,
        confidence,
        breakdown: signal.breakdown,
        timestamp: Date.now()
      });

      return {
        success: true,
        action: {
          type: 'signal-generated',
          data: { symbol, signal, confidence }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        errorCode: 'E_SIGNAL_GENERATION_FAILED'
      };
    }
  }

  async shutdown(): Promise<void> {
    this.memory.shortTerm.clear();
    console.log('[SignalAnalysisAgent] Shutdown complete');
  }
}
```

---

## Key Takeaways

1. **Separation of Concerns**: Each agent handles ONE trading phase (scan, signal, risk, execution)
2. **Event-Driven**: Agents communicate through events, never direct calls
3. **Capability-Based**: Orchestrator assigns tasks based on agent capabilities
4. **Never Throw**: Agents return structured results, errors are data
5. **Idempotent**: All operations safe to retry
6. **Auditable**: Every decision logged with correlation ID
7. **Scalable**: Agents can run in separate processes/containers
8. **Resilient**: Circuit breakers halt system on repeated failures

---

## References

- Current Implementation: `/home/nygmaee/Desktop/cypherscoping/cypherscoping-agent/src/agents/`
- Base Agent: `base-agent.ts`
- Orchestrator: `orchestrator.ts`
- Type Definitions: `../types.ts`

## Related Patterns

- Event Sourcing (for audit trails)
- Command Query Responsibility Segregation (CQRS)
- Saga Pattern (for distributed transactions)
- Circuit Breaker (for fault tolerance)
