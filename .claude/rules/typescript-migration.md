# TypeScript Migration Guide

Continuing the JavaScript → TypeScript migration.

## Current Status (Indicator Migration Complete)

**Complete:**
- ✅ Agent architecture (6 agents)
- ✅ Type system (`src/types.ts`)
- ✅ Symbol policy & risk controls
- ✅ Audit logging & idempotency
- ✅ Core signal generation
- ✅ Indicator migration (18/18 complete)
- ✅ Rate limiting (p-limit controls)
- ✅ Test harness (95/95 passing)

**In Progress:**
- 🚧 KuCoin live API parity hardening
- 🚧 Dashboard integration

**Blocking:** None for paper-trading validation. Live deployment still requires final KuCoin parity checks.

## File Mapping

| Legacy (Root) | New (TypeScript) | Status |
|---------------|------------------|--------|
| `agents/screener-agent.js` | `src/agents/coin-screener-agent.ts` | ✅ Complete |
| `agents/signal-agent.js` | `src/agents/signal-analysis-agent.ts` | ✅ Complete |
| `agents/execution-agent.js` | `src/agents/trading-executor-agent.ts` | ✅ Complete |
| `agents/risk-agent.js` | `src/agents/risk-management-agent.ts` | ✅ Complete |
| `config/apiClient.js` | `src/agents/coin-screener-agent.ts` provider path | 🚧 Partial parity |
| `src/indicators/` (18 files) | `src/indicators/` (18 files) | ✅ Complete |

## Migration Workflow

### Step 1: Copy Legacy File
```bash
cp src/indicators/RSIIndicator.js cypherscoping-agent/src/indicators/RSIIndicator.ts
```

### Step 2: Add TypeScript Types
```typescript
// Add imports
import { OHLCV, IndicatorResult } from '../types';

// Type parameters and return values
export function calculateRSI(
  candles: OHLCV[],
  period: number = 14
): IndicatorResult {
  // ... implementation
}
```

### Step 3: Write Tests
```typescript
// cypherscoping-agent/test/indicators.test.ts
import { calculateRSI } from '../src/indicators/RSIIndicator';

describe('RSI Indicator', () => {
  it('should calculate RSI correctly', () => {
    const candles = mockOHLCV(50);
    const result = calculateRSI(candles, 14);
    expect(result.value).toBeGreaterThan(0);
    expect(result.value).toBeLessThan(100);
  });
});
```

### Step 4: Build & Test
```bash
cd cypherscoping-agent
npm run build       # Check compilation
npm test           # Run all tests
```

### Step 5: Integration
Update agent to use new indicator:
```typescript
// src/agents/signal-analysis-agent.ts
import { calculateRSI } from '../indicators/RSIIndicator';
```

## Critical Requirements

**Before Production:**
1. Fix 3 HIGH-priority issues (see `CODEX_CONTINUATION_ANALYSIS.md`)
2. Complete KuCoin API live parity validation
3. Verify paper-trading monitor + validation scripts
4. Run 100+ paper trades
5. Validate all safety controls

**Type Safety Rules:**
- No `any` types (use `unknown` if needed)
- All public APIs typed with interfaces
- Error codes as string literals (`'E_SYMBOL_DENIED'`)
- Enum for known sets (not string unions)

## Integration Strategy

**Recommended: Gradual Migration**
1. Run both systems in parallel (1 week)
2. Switch screener to TypeScript (1 week)
3. Switch signal analysis (1 week)
4. Full cutover (24-hour monitoring)

**Rollback:** Keep legacy system until TypeScript validated.

## Common Patterns

**Error Handling:**
```typescript
try {
  const result = await riskyOperation();
} catch (error) {
  const err = error as Error;  // Type assertion
  console.error(`Operation failed: ${err.message}`);
}
```

**Async Operations:**
```typescript
async function batchFetch(symbols: string[]): Promise<MarketData[]> {
  const results = await Promise.allSettled(
    symbols.map(s => this.fetchData(s))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
}
```

**Testing:**
```typescript
describe('TradingExecutor', () => {
  beforeEach(() => {
    process.env.TRADING_MODE = 'paper';  // Force paper mode
  });

  it('should reject duplicate orders', async () => {
    // ... test implementation
  });
});
```

## Next Hardening Targets

**Priority Order:**
1. `scripts/monitor-paper-trading.sh` session-based operational monitoring
2. `scripts/validate-phase-2-3.sh` safety validation fidelity
3. KuCoin live execution parity tests
4. Dashboard integration (`server.js` path)

## References

- Migration status: `CODEX_CONTINUATION_ANALYSIS.md`
- Type definitions: `cypherscoping-agent/src/types.ts`
- Test examples: `cypherscoping-agent/test/`
