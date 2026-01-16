# Trading Bot Repository Optimization & Upgrade Plan

## Context
You are optimizing a live production trading bot. The system must maintain 100% uptime during optimization with zero breaking changes.

## Audit Findings Location
See files in this directory for detailed audit results:
- `audit-report.md` - Executive summary
- `strategy-analysis.txt` - Current strategy implementation
- `formulas.txt` - Mathematical calculations
- `exit-logic.txt` - Stop loss & trailing logic
- `limits-check.txt` - Position & risk limits
- `todos.txt` - Incomplete items
- `critical-findings.txt` - MUST FIX items

## Optimization Objectives (Priority Order)

### PHASE 1: CRITICAL FIXES (Do First)
1. **Fix any critical findings** from `critical-findings.txt`
   - Missing stop loss implementations
   - Untrailing stop prevention
   - Order validation bypasses
   - Strategy enforcement gaps

2. **Ensure all formulas use Decimal** (never native float)
   - Position sizing calculations
   - Leverage calculations
   - Stop loss calculations
   - Break-even calculations
   - PnL calculations

3. **Implement missing exit logic components**
   - Trailing stop with anti-untrail protection
   - Break-even lock system
   - Profit protection at milestones
   - Emergency stop loss enforcement

### PHASE 2: STRATEGY HARDENING
4. **Add comprehensive validation layer**
   - Pre-trade validation (position size, leverage, risk)
   - Post-calculation validation (invariants check)
   - Market data validation (staleness, sanity checks)
   - Order validation before submission

5. **Implement inverse leverage scaling**
   - Lower position size as leverage increases
   - Dynamic risk adjustment based on volatility
   - Conservative scaling under high ATR

6. **Fee-adjusted break-even**
   - Calculate assuming taker+taker fees
   - Never move break-even unfavorably
   - Account for slippage buffer

### PHASE 3: CODE QUALITY
7. **Replace all TODO/PLACEHOLDER items**
   - Implement proper solutions
   - Remove temporary workarounds
   - Add proper error handling

8. **Add Result<T,E> pattern throughout**
   - Replace throw statements in hot path
   - Return explicit error types
   - Enable error recovery

9. **Performance optimization**
   - Reduce memory allocations in hot path
   - Batch operations where possible
   - Optimize order book processing
   - Cache frequently accessed data

### PHASE 4: OBSERVABILITY
10. **Enhanced monitoring & metrics**
    - Real-time invariant checking
    - Performance metrics (latency, memory)
    - Trade execution metrics
    - Strategy effectiveness metrics

11. **Comprehensive logging**
    - Structured logging with context
    - Trade decision audit trail
    - Error tracking with stack traces
    - Performance profiling data

12. **Health & safety endpoints**
    - /health - Current state & invariants
    - /metrics - Prometheus-compatible metrics
    - /trades - Recent trade history
    - /strategy - Current strategy state

### PHASE 5: TESTING & VALIDATION
13. **Comprehensive test suite**
    - Unit tests for all calculations
    - Property-based tests for invariants
    - Integration tests with mock exchange
    - Regression tests for past bugs

14. **Backtest framework**
    - Historical data replay
    - Strategy parameter optimization
    - Risk metric calculation
    - Performance attribution

## Implementation Requirements

### Must Preserve
- ✅ All existing functionality
- ✅ Current API contracts
- ✅ Database schema
- ✅ Configuration format
- ✅ Deployment process

### Must Add
- ✅ ESLint + Prettier
- ✅ Pre-commit hooks
- ✅ CI/CD pipeline config
- ✅ Comprehensive README
- ✅ API documentation
- ✅ Deployment guide

### Code Standards
- Use Decimal.js for ALL financial calculations
- Result<T,E> pattern for runtime errors
- Explicit invariant checking
- Comprehensive JSDoc comments
- No magic numbers (use named constants)
- Maximum function complexity: 15
- Maximum file length: 500 lines

### Safety Requirements
- All changes must be backward compatible
- Add feature flags for new behavior
- Gradual rollout capability
- Instant rollback mechanism
- Zero data loss guarantee

## Deliverables

For each phase, provide:
1. **Modified files** with inline comments explaining changes
2. **New test files** covering the changes
3. **Migration guide** if needed
4. **Performance benchmarks** before/after
5. **Updated documentation**

## Execution Order
1. Run Phase 1 (critical fixes) first - stop if any test fails
2. After Phase 1 passes, run full audit again
3. Proceed to Phase 2 only after Phase 1 verified
4. Each phase must pass all tests before next phase
5. Create git commit after each successful phase

## Success Criteria
- [ ] All critical findings resolved
- [ ] All formulas use Decimal
- [ ] 100% test coverage on financial calculations
- [ ] No breaking changes to API
- [ ] Performance maintained or improved
- [ ] Memory usage <512MB
- [ ] All invariants enforced
- [ ] Zero TODOs in production code
- [ ] Full documentation coverage

