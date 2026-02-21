# Trading Bot Phased Deployment Skill

**Created:** 2026-02-21
**Source Documents:**
- `/home/nygmaee/Desktop/cypherscoping/PRODUCTION_DEPLOYMENT_PLAN.md`
- `/home/nygmaee/Desktop/valuable_crypto_bot_docs_20260218/BOT_PRODUCTION_REFERENCE_GUIDE.md`

---

## Overview

This skill provides a comprehensive phased deployment strategy for trading bots, from paper trading through live production deployment.

## What's Included

### Phase-by-Phase Deployment Strategy

1. **Phase 0: Code Quality Gates** - Pre-deployment validation
2. **Phase 1: Environment Configuration** - Paper trading setup
3. **Phase 2: Paper Trading Validation** - 100+ trades, 0 errors
4. **Phase 3: Live Mode Preparation** - Security audit, conservative settings
5. **Phase 4: Live Deployment** - First live trades with minimal risk
6. **Phase 5: Monitoring & Maintenance** - Ongoing operations
7. **Phase 6: Rollback Procedures** - Emergency recovery

### Safety Controls

- **Circuit Breakers:** Automatic stop on excessive drawdown
- **Symbol Policy:** BTC denylist enforcement
- **Idempotency Protection:** Prevents duplicate orders
- **Rate Limiting:** API throttling protection
- **Conservative Risk Parameters:** Reduced exposure for initial live deployment

### Pre-Flight Checklists

- Environment configuration validation
- API credential verification
- Symbol policy enforcement checks
- Risk parameter validation
- Build and test verification

### Monitoring Tools

- Real-time trading dashboard
- Paper trading progress monitor
- Daily health check automation
- Slack alerting integration
- Audit log analysis

### Emergency Procedures

- Emergency rollback script
- Circuit breaker triggers
- Rollback decision criteria
- Position closing procedures
- Recovery workflow

## Key Features

### Gradual Risk Escalation

| Phase | Max Trades | Mode | Risk Level |
|-------|-----------|------|------------|
| Day 1 | 1-3 trades | Manual approval | Minimal |
| Day 2 | 5-10 trades | Manual approval | Conservative |
| Day 3 | 10-20 trades | Semi-automated | Conservative |
| Week 2+ | Full automation | Automated | Normal |

### Success Criteria

**Paper Trading:**
- 100+ paper trades with 0 system errors
- Win rate ≥ 55%
- Profit factor ≥ 1.5
- Symbol policy enforced (0 BTC trades)
- Rate limiting active

**Live Trading:**
- 50+ live trades with 0 system errors
- Win rate matches paper (±5%)
- All safety systems validated
- Monitoring operational

## Usage

```bash
# Start paper trading validation
export $(cat cypherscoping-agent/.env | xargs)
npm run paper:forward

# Monitor progress
./scripts/monitor-paper-trading.sh

# Pre-flight check before live
./scripts/pre-flight-checklist.sh

# Emergency stop
./scripts/emergency-rollback.sh
```

## Timeline

**Total Duration:** 2-3 weeks from code complete to full live deployment

- **Phase 0-1:** 2-3 days (setup)
- **Phase 2:** 1 week (paper trading validation)
- **Phase 3:** 2-3 days (live preparation)
- **Phase 4:** 1-3 days (initial live trades)
- **Phase 5:** Ongoing (monitoring)

## Common Issues Covered

1. API rate limiting
2. Duplicate orders
3. Circuit breaker false positives
4. Win rate below baseline
5. Exchange connectivity issues

## Reference Integration

This skill integrates knowledge from:
- CypherScoping production deployment plan
- Bot production reference guide
- Trading infrastructure overview
- Risk management best practices
- Exchange API integration patterns

## Related Skills

- `testing` - Test automation and coverage
- `typescript-migration` - Migration strategies
- `agent-development` - Multi-agent systems
- `symbol-policy` - Trading universe governance

---

**File:** `.claude/skills/trading-bot-phased-deployment/SKILL.md`
**Lines:** 1,102
**Format:** Markdown with executable bash scripts
