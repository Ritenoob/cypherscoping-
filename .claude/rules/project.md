# Project: CypherScoping Trading Bot

**Last Updated:** 2026-02-21

## Overview

AI-powered cryptocurrency trading bot with multi-agent architecture for KuCoin Futures. Features dual-codebase architecture: legacy JavaScript (production-ready) and new TypeScript (indicator migration complete: 18/18).

## Technology Stack

- **Language:** TypeScript (cypherscoping-agent/) + JavaScript (root - legacy)
- **Runtime:** Node.js >= 18.0.0
- **Testing:** Jest (95/95 tests passing in TypeScript)
- **Package Manager:** npm
- **Exchange:** KuCoin Futures Perpetual Contracts
- **Architecture:** Multi-agent (6 specialized agents)

## Directory Structure

```
.
├── cypherscoping-agent/          # TypeScript agent system (NEW, indicator migration complete)
│   ├── src/
│   │   ├── agents/               # 6 trading agents
│   │   ├── core/                 # Signal generation, gates, confidence
│   │   ├── config/               # Symbol policy, weights
│   │   └── indicators/           # 18 migrated indicators
│   ├── test/                     # 26 Jest tests
│   └── runtime/                  # Audit logs, idempotency store
├── config/                       # Strategy configs, API credentials
├── scripts/                      # 22 utility scripts (optimization, validation)
├── data/                         # Historical OHLCV data, trade history
├── cli.js                        # Root CLI (routes to agent system)
└── index.js                      # Legacy entry point
```

## Key Files

- **Config:** `config/profit-active.env` (active strategy), `cypherscoping-agent/src/config/symbol-policy.ts`
- **Entry Points:** `cypherscoping-agent/src/main.ts` (TypeScript), `cli.js` (root)
- **Tests:** `cypherscoping-agent/test/` (26 unit tests)
- **Documentation:** `CODEX_CONTINUATION_ANALYSIS.md` (project status)

## Development Commands

```bash
# Build TypeScript system
npm run build

# Run tests
npm test                          # All tests (unit + smoke)
npm run test:unit                 # TypeScript unit tests only

# Trading operations
npm run analyze                   # Analyze symbol
npm run scan                      # Market scan
npm run trade                     # Execute trade (demo)

# Strategy management
npm run collect:trades            # Export trade history
npm run tune:strategy             # Optimize parameters
npm run validate:strategy         # Validate strategy metrics
npm run promote:strategy          # Promote tuned strategy to active
npm run health:strategy           # Health check
npm run cycle:strategy            # Full optimization cycle

# Policy & safety
npm run policy:check              # Verify symbol policy
```

## Architecture Notes

### Two Parallel Systems

**Legacy (Root):** Production-ready JavaScript with 80% win rate, 103 tests passing. Used for:
- Active trading
- 18 technical indicators
- Full KuCoin API integration
- Dashboard server

**New (TypeScript):** Indicator migration complete with:
- Symbol policy governance (BTC denylist)
- Idempotency protection
- Audit logging
- Risk controls
- 18 migrated indicators
- 95/95 tests passing

**Integration Status:** Paper-trading ready; live KuCoin parity validation remains.

### Multi-Agent System

Six specialized agents coordinate trading operations:
1. **Orchestrator** - Coordinates all agents, enforces policies
2. **CoinScreenerAgent** - Scans markets for opportunities
3. **SignalAnalysisAgent** - Generates multi-indicator trading signals
4. **RiskManagementAgent** - Manages risk, drawdown protection
5. **TradingExecutorAgent** - Executes orders with safety controls
6. **BaseAgent** - Abstract base with capabilities, load balancing

### Critical Systems

- **Symbol Policy:** `cypherscoping-agent/src/config/symbol-policy.ts` - Trading universe, BTC denylist
- **Idempotency:** Prevents duplicate orders via hash-based deduplication
- **Audit Logging:** JSONL format with correlation IDs (`runtime/audit.log`)
- **Circuit Breaker:** Emergency stop on excessive drawdown

## Current Status

- **Branch:** `debug/type-fixes`
- **TypeScript Migration:** Indicator migration complete (18/18)
- **Blocking Issues:** None for paper-trading validation
- **Next Steps:** Continue paper-forward validation and complete live KuCoin parity checks

## References

- Full audit: `MINIATURE_ENIGMA_AGI_AUDIT_REPORT.md`
- Code review: `CODEX_CONTINUATION_ANALYSIS.md`
- Tech spec: `MINIATURE_ENIGMA_TECHNICAL_SPECIFICATION.md`
- Remediation: `RED_SEAL_REMEDIATION_PLAN.md`
