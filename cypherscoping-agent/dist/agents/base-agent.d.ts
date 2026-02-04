import { EventEmitter } from 'events';
import { AgentContext, AgentResult } from '../types';
export interface AgentConfig {
    id: string;
    name: string;
    role: string;
    capabilities: string[];
    maxConcurrentTasks: number;
    priority: number;
}
export declare abstract class BaseAgent extends EventEmitter {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    protected isRunning: boolean;
    protected taskQueue: Map<string, any>;
    protected memory: AgentMemory;
    constructor(config: AgentConfig);
    abstract initialize(): Promise<void>;
    abstract execute(context: AgentContext): Promise<AgentResult>;
    abstract shutdown(): Promise<void>;
    processTask(task: any): Promise<AgentResult>;
    getState(): {
        id: string;
        name: string;
        role: string;
        isRunning: boolean;
        taskCount: number;
    };
}
export declare class AgentMemory {
    private shortTerm;
    private longTerm;
    private episodic;
    private semantic;
    remember(key: string, value: any, ttlMs?: number): void;
    recall(key: string): any;
    store(key: string, value: any, metadata?: any): void;
    retrieve(key: string): any;
    recordEpisode(episode: any): void;
    learn(concept: string, knowledge: any): void;
    getKnowledge(concept: string): any;
    searchEpisodes(query: any): any[];
}
export declare class MLEngine {
    private patterns;
    private experiences;
    private learningRate;
    private explorationRate;
    recordExperience(exp: any): void;
    findSimilarExperiences(task: string, params: any): any[];
    private similarity;
    private extractPatterns;
    getPatterns(key: string): any[];
    predict(task: string, params: any): {
        confidence: number;
        recommendation: string;
    };
    getStats(): any;
}
export declare class AgentOrchestrator {
    private agents;
    private taskQueue;
    private metrics;
    registerAgent(agent: BaseAgent): void;
    executeTask(task: any, preferredAgent?: string): Promise<any>;
    private selectBestAgent;
    getStats(): any;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=base-agent.d.ts.map