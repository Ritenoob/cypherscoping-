# Agent Development Patterns

Creating new trading agents in the multi-agent system.

## Agent Architecture

All agents extend `BaseAgent` with capabilities, load tracking, and event system.

```typescript
import { BaseAgent } from './base-agent';
import { AgentContext, AgentResult } from '../types';

export class MyNewAgent extends BaseAgent {
  constructor() {
    super({
      id: 'my-agent-id',
      name: 'My Agent Name',
      role: 'Agent Role',
      capabilities: ['capability1', 'capability2'],
      maxConcurrentTasks: 10,
      priority: 2
    });
  }

  async initialize(): Promise<void> {
    // Setup connections, load data, etc.
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    // Main agent logic
    return {
      success: true,
      action: { type: 'action-type', data: {...} }
    };
  }

  async shutdown(): Promise<void> {
    // Cleanup resources
  }
}
```

## Capability System

Agents declare capabilities that match task requirements:

```typescript
// Agent declaration
capabilities: ['market-analysis', 'signal-generation']

// Task requirements
const task = {
  requiredCapabilities: ['market-analysis']
};

// Orchestrator matches agents to tasks
agent.canHandleTask(task)  // true if capabilities match
```

**Built-in Capabilities:**
- `order-placement` - Can execute orders
- `order-management` - Can modify/cancel orders
- `position-tracking` - Monitors open positions
- `market-scanning` - Scans multiple symbols
- `signal-analysis` - Generates trading signals
- `risk-assessment` - Evaluates risk metrics

## Load Balancing

Orchestrator selects agents using priority + capacity scoring:

```typescript
const score =
  (agent.priority * 10) +                    // Priority weight
  (agent.maxConcurrentTasks - load) * 5 -   // Available capacity
  load;                                      // Current load penalty
```

**Guidelines:**
- **Priority 1:** Low-priority background tasks
- **Priority 2-3:** Standard agents (screener, signal)
- **Priority 4-5:** Critical agents (risk, execution)

**Max Concurrent Tasks:**
- CPU-bound: 5-10
- I/O-bound: 10-20
- Mixed: 8-15

## Agent Memory

Each agent has memory systems:

```typescript
// Short-term (current session)
this.memory.shortTerm.set('last-scan', scanResult);

// Long-term (persistent)
this.memory.longTerm.set('historical-pattern', pattern);

// Working (active task context)
this.memory.working.set('current-symbol', 'ETHUSDTM');
```

## Event System

Agents communicate via events:

```typescript
// Emit event
this.emit('signal-generated', {
  symbol: 'ETHUSDTM',
  signal: compositeSignal
});

// Listen for events
agent.on('signal-generated', (data) => {
  console.log('Signal:', data.signal);
});
```

## Error Handling

Always return structured results, never throw:

```typescript
// ✅ Good
async execute(context: AgentContext): Promise<AgentResult> {
  try {
    const result = await riskyOperation();
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      errorCode: 'E_OPERATION_FAILED'
    };
  }
}

// ❌ Bad
async execute(context: AgentContext): Promise<AgentResult> {
  const result = await riskyOperation();  // May throw
  return { success: true, data: result };
}
```

## Task Queue

Agents process tasks sequentially:

```typescript
protected taskQueue: Map<string, any> = new Map();

async processTask(task: any): Promise<any> {
  const taskId = task.id || this.generateTaskId();
  this.taskQueue.set(taskId, task);

  try {
    const result = await this.execute(task);
    return result;
  } finally {
    this.taskQueue.delete(taskId);
  }
}
```

## State Management

Get agent state for monitoring:

```typescript
const state = agent.getState();
// {
//   id: 'agent-id',
//   name: 'Agent Name',
//   role: 'Agent Role',
//   isRunning: true,
//   taskCount: 3
// }
```

## Testing Agents

```typescript
describe('MyNewAgent', () => {
  let agent: MyNewAgent;

  beforeEach(async () => {
    agent = new MyNewAgent();
    await agent.initialize();
  });

  afterEach(async () => {
    await agent.shutdown();
  });

  it('should execute task successfully', async () => {
    const context: AgentContext = {
      symbol: 'ETHUSDTM',
      // ... full context
    };

    const result = await agent.execute(context);
    expect(result.success).toBe(true);
  });
});
```

## Integration with Orchestrator

Register agent in orchestrator:

```typescript
// src/agents/orchestrator.ts
import { MyNewAgent } from './my-new-agent';

this.agents.set('my-agent', new MyNewAgent());
```

## Best Practices

1. **Single Responsibility** - One clear purpose per agent
2. **Idempotent Operations** - Safe to retry
3. **Graceful Degradation** - Return partial results on error
4. **Resource Cleanup** - Always implement `shutdown()`
5. **Logging** - Use audit logger for critical events
6. **Type Safety** - No `any` types in public APIs

## Example: New Agent Template

```typescript
import { BaseAgent } from './base-agent';
import { AgentContext, AgentResult } from '../types';

export class TemplateAgent extends BaseAgent {
  constructor() {
    super({
      id: 'template-agent',
      name: 'Template Agent',
      role: 'Example Role',
      capabilities: ['example-capability'],
      maxConcurrentTasks: 10,
      priority: 2
    });
  }

  async initialize(): Promise<void> {
    console.log('[TemplateAgent] Initialized');
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      // Agent logic here
      return {
        success: true,
        action: { type: 'example-action' }
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  async shutdown(): Promise<void> {
    console.log('[TemplateAgent] Shutdown');
  }
}
```

## References

- Base class: `cypherscoping-agent/src/agents/base-agent.ts`
- Type definitions: `cypherscoping-agent/src/types.ts`
- Example agents: `cypherscoping-agent/src/agents/`
