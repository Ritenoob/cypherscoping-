import { OHLCV } from './types';
declare class CypherScopeAgent {
    private orchestrator;
    private isInitialized;
    constructor();
    initialize(): Promise<void>;
    analyze(symbol: string, ohlcv: OHLCV[]): Promise<any>;
    scan(): Promise<any>;
    trade(symbol: string, action: 'buy' | 'sell' | 'close', size?: number): Promise<any>;
    setMode(mode: 'manual' | 'algo'): void;
    getMode(): string;
    on(event: string, callback: (data: any) => void): void;
    getStats(): any;
    shutdown(): Promise<void>;
}
export default CypherScopeAgent;
export declare function createAgent(): Promise<CypherScopeAgent>;
//# sourceMappingURL=main.d.ts.map