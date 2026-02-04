import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { AgentContext, AgentResult, AIAnalysis } from '../types';

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
  maxConcurrentTasks: number;
  priority: number;
}

export abstract class BaseAgent extends EventEmitter {
  public readonly id: string;
  public readonly name: string;
  public readonly role: string;
  protected isRunning: boolean = false;
  protected taskQueue: Map<string, any> = new Map();
  protected memory: AgentMemory = new AgentMemory();

  constructor(config: AgentConfig) {
    super();
    this.id = config.id || uuidv4();
    this.name = config.name;
    this.role = config.role;
  }

  abstract initialize(): Promise<void>;
  abstract execute(context: AgentContext): Promise<AgentResult>;
  abstract shutdown(): Promise<void>;

  async processTask(task: any): Promise<AgentResult> {
    try {
      this.isRunning = true;
      this.emit('task:started', { agent: this.name, taskId: task.id });
      
      const result = await this.execute(task.context);
      
      this.emit('task:completed', { agent: this.name, taskId: task.id, result });
      this.memory.recordEpisode({
        task,
        result,
        timestamp: Date.now()
      });
      
      return result;
    } catch (error) {
      this.emit('task:error', { agent: this.name, taskId: task.id, error });
      return {
        success: false,
        error: (error as Error).message
      };
    } finally {
      this.isRunning = false;
    }
  }

  getState(): { id: string; name: string; role: string; isRunning: boolean; taskCount: number } {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      isRunning: this.isRunning,
      taskCount: this.taskQueue.size
    };
  }
}

export class AgentMemory {
  private shortTerm: Map<string, { value: any; expires: number }> = new Map();
  private longTerm: Map<string, any> = new Map();
  private episodic: any[] = [];
  private semantic: Map<string, any> = new Map();

  remember(key: string, value: any, ttlMs: number = 300000): void {
    this.shortTerm.set(key, { value, expires: Date.now() + ttlMs });
  }

  recall(key: string): any {
    const entry = this.shortTerm.get(key);
    if (entry && entry.expires > Date.now()) {
      return entry.value;
    }
    this.shortTerm.delete(key);
    return null;
  }

  store(key: string, value: any, metadata?: any): void {
    this.longTerm.set(key, { value, metadata, timestamp: Date.now() });
  }

  retrieve(key: string): any {
    return this.longTerm.get(key)?.value;
  }

  recordEpisode(episode: any): void {
    this.episodic.push(episode);
    if (this.episodic.length > 1000) {
      this.episodic.shift();
    }
  }

  learn(concept: string, knowledge: any): void {
    this.semantic.set(concept, knowledge);
  }

  getKnowledge(concept: string): any {
    return this.semantic.get(concept);
  }

  searchEpisodes(query: any): any[] {
    return this.episodic.filter(ep => {
      return Object.entries(query).every(([key, val]) => ep.task?.[key] === val);
    });
  }
}

export class MLEngine {
  private patterns: Map<string, any[]> = new Map();
  private experiences: any[] = [];
  private learningRate: number = 0.1;
  private explorationRate: number = 0.2;

  recordExperience(exp: any): void {
    this.experiences.push({ ...exp, timestamp: Date.now() });
    if (this.experiences.length > 10000) {
      this.experiences.shift();
    }
    this.extractPatterns(exp);
  }

  findSimilarExperiences(task: string, params: any): any[] {
    return this.experiences.filter(exp => 
      exp.task === task && this.similarity(exp.params, params) > 0.7
    );
  }

  private similarity(a: any, b: any): number {
    const keys = Object.keys({ ...a, ...b });
    let matches = 0;
    for (const key of keys) {
      if (a[key] === b[key]) matches++;
    }
    return matches / keys.length;
  }

  private extractPatterns(exp: any): void {
    const key = `${exp.task}:${exp.success ? 'success' : 'failure'}`;
    if (!this.patterns.has(key)) {
      this.patterns.set(key, []);
    }
    const patterns = this.patterns.get(key)!;
    patterns.push(exp);
    if (patterns.length > 100) {
      patterns.shift();
    }
  }

  getPatterns(key: string): any[] {
    return this.patterns.get(key) || [];
  }

  predict(task: string, params: any): { confidence: number; recommendation: string } {
    const similar = this.findSimilarExperiences(task, params);
    if (similar.length === 0) {
      return { confidence: 0.5, recommendation: 'unknown' };
    }
    const successCount = similar.filter(e => e.success).length;
    const confidence = successCount / similar.length;
    return {
      confidence,
      recommendation: confidence > 0.7 ? 'proceed' : confidence > 0.4 ? 'cautious' : 'avoid'
    };
  }

  getStats(): any {
    return {
      experienceCount: this.experiences.length,
      patternKeys: Array.from(this.patterns.keys()),
      learningRate: this.learningRate,
      explorationRate: this.explorationRate
    };
  }
}

export class AgentOrchestrator {
  private agents: Map<string, BaseAgent> = new Map();
  private taskQueue: Array<{ task: any; priority: number }> = [];
  private metrics: OrchestratorMetrics = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    avgExecutionTime: 0,
    agentLoad: new Map()
  };

  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);
    this.metrics.agentLoad.set(agent.id, 0);
  }

  async executeTask(task: any, preferredAgent?: string): Promise<any> {
    const agent = preferredAgent 
      ? this.agents.get(preferredAgent) 
      : this.selectBestAgent(task);

    if (!agent) {
      throw new Error('No suitable agent found for task');
    }

    this.metrics.totalTasks++;
    const startTime = Date.now();
    
    try {
      const result = await agent.processTask(task);
      this.metrics.completedTasks++;
      this.metrics.avgExecutionTime = 
        (this.metrics.avgExecutionTime * (this.metrics.completedTasks - 1) + 
         (Date.now() - startTime)) / this.metrics.completedTasks;
      return result;
    } catch (error) {
      this.metrics.failedTasks++;
      throw error;
    }
  }

  private selectBestAgent(task: any): BaseAgent | null {
    let bestAgent: BaseAgent | null = null;
    let bestScore = -Infinity;

    for (const agent of this.agents.values()) {
      const load = this.metrics.agentLoad.get(agent.id) || 0;
      const score = 100 - load;
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    if (bestAgent) {
      const currentLoad = this.metrics.agentLoad.get(bestAgent.id) || 0;
      this.metrics.agentLoad.set(bestAgent.id, currentLoad + 1);
    }

    return bestAgent;
  }

  getStats(): any {
    return {
      ...this.metrics,
      agentCount: this.agents.size,
      queuedTasks: this.taskQueue.length,
      agentStates: Array.from(this.agents.values()).map(a => a.getState())
    };
  }

  async shutdown(): Promise<void> {
    for (const agent of this.agents.values()) {
      await agent.shutdown();
    }
    this.agents.clear();
  }
}

interface OrchestratorMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgExecutionTime: number;
  agentLoad: Map<string, number>;
}
