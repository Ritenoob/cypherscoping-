# Trading Bot Integration Merge Plan

## Current State Analysis

### Baseline
- **Tests**: 69 passing (29 indicators + 22 microstructure + 18 signalGenerator)
- **Dependencies**: axios, decimal.js, ws (all compatible with agents)
- **Code Style**: CommonJS, ES6 classes, JSDoc comments

### Issues to Fix
1. Malformed folder `{src` - contains nested malformed folder
2. Duplicate folders `strategy/` and `switches/` with overlapping content
3. Orphaned indicator files at root level

### Source Locations
- **Claude Mirror** (most up-to-date): `/V5.2/trading-bot/.claude/miniature-enigma-v5.2/`
- **Documentation**: `/seans emails/sources of truth/`
- **Orphaned files**: `/V5.2/files/`

---

## Merge Phases

### Phase 0: Cleanup
- [ ] Remove malformed `{src` folder
- [ ] Consolidate `strategy/` and `switches/` (keep switches, merge unique files from strategy)

### Phase 1: Core Agent Infrastructure
- [ ] Create `agents/` folder
- [ ] Add `agent-base.js` (foundation class)
- [ ] Run tests

### Phase 2: Orchestration Layer
- [ ] Add `orchestrator.js`
- [ ] Add `audit-agent.js`
- [ ] Run tests

### Phase 3: Data Layer
- [ ] Add `data-agent.js`
- [ ] Add `signal-agent.js`
- [ ] Add `screener-agent.js`
- [ ] Run tests

### Phase 4: Trading Layer
- [ ] Add `risk-agent.js`
- [ ] Add `execution-agent.js`
- [ ] Add `optimizer-agent.js`
- [ ] Run tests

### Phase 5: Production Safety
- [ ] Add `circuit-breaker.js`
- [ ] Add `alerting.js`
- [ ] Add `regime-agent.js`
- [ ] Add `production-controller.js`
- [ ] Run tests

### Phase 6: Dashboard
- [ ] Create `dashboard/` folder
- [ ] Add `dashboard/server.js`
- [ ] Add `dashboard/index.html`
- [ ] Add `dashboard/screener-dashboard.html`
- [ ] Run tests

### Phase 7: Scripts & Tools
- [ ] Add `scripts/mtf-optimizer.js`
- [ ] Add `scripts/health-check.js`
- [ ] Add `scripts/build-repo.sh`
- [ ] Run tests

### Phase 8: Documentation
- [ ] Create `knowledge-bank/truth-docs/`
- [ ] Copy TRAILING_STOP_GUIDE.md
- [ ] Copy SIGNAL_MODE_GUIDE.md
- [ ] Copy other source of truth docs

### Phase 9: Final Validation
- [ ] Run full test suite
- [ ] Verify all imports resolve
- [ ] Test agent initialization
- [ ] Update package.json with new scripts

---

## Success Criteria
- All 69+ tests pass
- No import/require errors
- Agents can be instantiated
- Dashboard starts without errors
