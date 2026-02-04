"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgent = createAgent;
const orchestrator_1 = require("./agents/orchestrator");
class CypherScopeAgent {
    constructor() {
        this.isInitialized = false;
        this.orchestrator = new orchestrator_1.CypherScopeOrchestrator();
    }
    async initialize() {
        if (this.isInitialized)
            return;
        await this.orchestrator.initialize();
        this.isInitialized = true;
        console.log('[CypherScope] Agent initialized');
    }
    async analyze(symbol, ohlcv) {
        if (!this.isInitialized)
            await this.initialize();
        return this.orchestrator.analyzeSymbol(symbol, ohlcv);
    }
    async scan() {
        if (!this.isInitialized)
            await this.initialize();
        return this.orchestrator.scanMarket();
    }
    async trade(symbol, action, size) {
        if (!this.isInitialized)
            await this.initialize();
        return this.orchestrator.executeTrade(symbol, action, size);
    }
    setMode(mode) {
        this.orchestrator.setMode(mode);
    }
    getMode() {
        return this.orchestrator.getMode();
    }
    on(event, callback) {
        this.orchestrator.on(event, callback);
    }
    getStats() {
        return this.orchestrator.getStats();
    }
    async shutdown() {
        await this.orchestrator.shutdown();
        this.isInitialized = false;
    }
}
exports.default = CypherScopeAgent;
async function createAgent() {
    const agent = new CypherScopeAgent();
    await agent.initialize();
    return agent;
}
//# sourceMappingURL=main.js.map