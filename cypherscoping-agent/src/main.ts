import { CypherScopeOrchestrator } from './agents/orchestrator';
import { OHLCV } from './types';

export interface CypherScopeAgentOptions {
  allToolsAllowed?: boolean;
  optimizeExecution?: boolean;
  enabledTools?: string[];
}

class CypherScopeAgent {
  private orchestrator: CypherScopeOrchestrator;
  private isInitialized: boolean = false;

  constructor(options: CypherScopeAgentOptions = {}) {
    this.orchestrator = new CypherScopeOrchestrator(options);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await this.orchestrator.initialize();
    this.isInitialized = true;
    console.log('[CypherScope] Agent initialized');
  }

  async analyze(symbol: string, ohlcv: OHLCV[]): Promise<any> {
    if (!this.isInitialized) await this.initialize();
    return this.orchestrator.analyzeSymbol(symbol, ohlcv);
  }

  async scan(): Promise<any> {
    if (!this.isInitialized) await this.initialize();
    return this.orchestrator.scanMarket();
  }

  async trade(symbol: string, action: 'buy' | 'sell' | 'close', size?: number): Promise<any> {
    if (!this.isInitialized) await this.initialize();
    return this.orchestrator.executeTrade(symbol, action, size);
  }

  setMode(mode: 'manual' | 'algo'): void {
    this.orchestrator.setMode(mode);
  }

  getMode(): string {
    return this.orchestrator.getMode();
  }

  on(event: string, callback: (data: any) => void): void {
    this.orchestrator.on(event, callback);
  }

  getStats(): any {
    return this.orchestrator.getStats();
  }

  async shutdown(): Promise<void> {
    await this.orchestrator.shutdown();
    this.isInitialized = false;
  }
}

export default CypherScopeAgent;

export async function createAgent(options: CypherScopeAgentOptions = {}): Promise<CypherScopeAgent> {
  const agent = new CypherScopeAgent(options);
  await agent.initialize();
  return agent;
}
