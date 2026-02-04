"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentOrchestrator = exports.MLEngine = exports.AgentMemory = exports.BaseAgent = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
class BaseAgent extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.isRunning = false;
        this.taskQueue = new Map();
        this.memory = new AgentMemory();
        this.id = config.id || (0, uuid_1.v4)();
        this.name = config.name;
        this.role = config.role;
    }
    async processTask(task) {
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
        }
        catch (error) {
            this.emit('task:error', { agent: this.name, taskId: task.id, error });
            return {
                success: false,
                error: error.message
            };
        }
        finally {
            this.isRunning = false;
        }
    }
    getState() {
        return {
            id: this.id,
            name: this.name,
            role: this.role,
            isRunning: this.isRunning,
            taskCount: this.taskQueue.size
        };
    }
}
exports.BaseAgent = BaseAgent;
class AgentMemory {
    constructor() {
        this.shortTerm = new Map();
        this.longTerm = new Map();
        this.episodic = [];
        this.semantic = new Map();
    }
    remember(key, value, ttlMs = 300000) {
        this.shortTerm.set(key, { value, expires: Date.now() + ttlMs });
    }
    recall(key) {
        const entry = this.shortTerm.get(key);
        if (entry && entry.expires > Date.now()) {
            return entry.value;
        }
        this.shortTerm.delete(key);
        return null;
    }
    store(key, value, metadata) {
        this.longTerm.set(key, { value, metadata, timestamp: Date.now() });
    }
    retrieve(key) {
        return this.longTerm.get(key)?.value;
    }
    recordEpisode(episode) {
        this.episodic.push(episode);
        if (this.episodic.length > 1000) {
            this.episodic.shift();
        }
    }
    learn(concept, knowledge) {
        this.semantic.set(concept, knowledge);
    }
    getKnowledge(concept) {
        return this.semantic.get(concept);
    }
    searchEpisodes(query) {
        return this.episodic.filter(ep => {
            return Object.entries(query).every(([key, val]) => ep.task?.[key] === val);
        });
    }
}
exports.AgentMemory = AgentMemory;
class MLEngine {
    constructor() {
        this.patterns = new Map();
        this.experiences = [];
        this.learningRate = 0.1;
        this.explorationRate = 0.2;
    }
    recordExperience(exp) {
        this.experiences.push({ ...exp, timestamp: Date.now() });
        if (this.experiences.length > 10000) {
            this.experiences.shift();
        }
        this.extractPatterns(exp);
    }
    findSimilarExperiences(task, params) {
        return this.experiences.filter(exp => exp.task === task && this.similarity(exp.params, params) > 0.7);
    }
    similarity(a, b) {
        const keys = Object.keys({ ...a, ...b });
        let matches = 0;
        for (const key of keys) {
            if (a[key] === b[key])
                matches++;
        }
        return matches / keys.length;
    }
    extractPatterns(exp) {
        const key = `${exp.task}:${exp.success ? 'success' : 'failure'}`;
        if (!this.patterns.has(key)) {
            this.patterns.set(key, []);
        }
        const patterns = this.patterns.get(key);
        patterns.push(exp);
        if (patterns.length > 100) {
            patterns.shift();
        }
    }
    getPatterns(key) {
        return this.patterns.get(key) || [];
    }
    predict(task, params) {
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
    getStats() {
        return {
            experienceCount: this.experiences.length,
            patternKeys: Array.from(this.patterns.keys()),
            learningRate: this.learningRate,
            explorationRate: this.explorationRate
        };
    }
}
exports.MLEngine = MLEngine;
class AgentOrchestrator {
    constructor() {
        this.agents = new Map();
        this.taskQueue = [];
        this.metrics = {
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            avgExecutionTime: 0,
            agentLoad: new Map()
        };
    }
    registerAgent(agent) {
        this.agents.set(agent.id, agent);
        this.metrics.agentLoad.set(agent.id, 0);
    }
    async executeTask(task, preferredAgent) {
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
        }
        catch (error) {
            this.metrics.failedTasks++;
            throw error;
        }
    }
    selectBestAgent(task) {
        let bestAgent = null;
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
    getStats() {
        return {
            ...this.metrics,
            agentCount: this.agents.size,
            queuedTasks: this.taskQueue.length,
            agentStates: Array.from(this.agents.values()).map(a => a.getState())
        };
    }
    async shutdown() {
        for (const agent of this.agents.values()) {
            await agent.shutdown();
        }
        this.agents.clear();
    }
}
exports.AgentOrchestrator = AgentOrchestrator;
//# sourceMappingURL=base-agent.js.map