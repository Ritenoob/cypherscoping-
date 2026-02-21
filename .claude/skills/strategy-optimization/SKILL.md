---
name: strategy-optimization
description: |
  Trading bot strategy optimization cycle. Use when: (1) user asks to optimize
  trading parameters, (2) performance degradation detected, (3) new strategy
  needs tuning, (4) regular optimization cycles. Multi-step workflow: collect
  trades → tune → validate → promote → health check. Commands: npm run
  collect:trades, tune:strategy, validate:strategy, promote:strategy,
  health:strategy, cycle:strategy (full cycle).
author: Claude Code
version: 1.0.0
---

# Strategy Optimization Workflow

## Problem

Trading strategies need continuous optimization to adapt to changing market conditions. Manual parameter tuning is error-prone and doesn't follow a systematic validation process.

## Context / Trigger Conditions

Use this workflow when:

- User requests strategy optimization or parameter tuning
- Performance metrics decline below thresholds
- Deploying a new trading strategy that needs baseline tuning
- Running scheduled optimization cycles (weekly/monthly)
- After significant market regime changes

**Indicators you need optimization:**
- Win rate < 55%
- Profit factor < 1.5
- Drawdown > 10%
- Consecutive losses > 3
- Health check reports degradation

## Solution

### Full Optimization Cycle

Run the complete cycle:

```bash
npm run cycle:strategy
```

This executes: `retrain:strategy` → `promote:strategy` automatically.

### Manual Step-by-Step

For more control, run each step individually:

#### Step 1: Export Trade History

Collect all trade outcomes from audit logs:

```bash
npm run collect:trades
```

**Output:** `data/trade-history-live.json` with all executed trades, outcomes, timestamps.

**Verify:**
```bash
cat data/trade-history-live.json | jq '.[-5:]'  # Last 5 trades
```

#### Step 2: Tune Strategy Parameters

Optimize thresholds based on historical performance:

```bash
npm run tune:strategy
```

**What it does:**
- Analyzes trade history
- Tests parameter combinations
- Finds optimal stop loss, take profit, score thresholds
- Generates `config/profit-tuned.env`

**Output:** `config/tune-report.json`

**Review tuning results:**
```bash
cat config/tune-report.json | jq '{winRate, profitFactor, expectancy}'
```

#### Step 3: Validate Strategy

Ensure tuned strategy meets minimum quality gates:

```bash
STRATEGY_ENV_PATH=config/profit-tuned.env npm run validate:strategy
```

**Validation gates:**
- Win rate ≥ 55%
- Profit factor ≥ 1.5
- Max drawdown ≤ 10%
- Minimum sample size (50+ trades for paper, 30+ for live)

**Output:** `config/validation-report.json`

**Check validation:**
```bash
cat config/validation-report.json | jq '.passed, .metrics, .gates'
```

**If validation fails:**
- Review trade history for systematic issues
- Adjust parameter ranges in tuning script
- Check for regime changes or data quality issues

#### Step 4: Promote to Active

If validation passes, promote tuned strategy to active:

```bash
npm run promote:strategy
```

**What it does:**
- Compares tuned vs active metrics
- Creates timestamped backup snapshot
- Updates `config/profit-active.env`
- Updates `config/active-strategy-metrics.json`
- Saves immutable snapshot to `config/strategy-backups/`

**Promotion criteria:**
- Validation passed
- Improved metrics OR first strategy ("profit_first_upgrade")

**Verify promotion:**
```bash
cat config/active-strategy-metrics.json | jq '.promotedAt, .metrics.winRate'
```

#### Step 5: Monitor Health

After promotion, monitor strategy health:

```bash
npm run health:strategy
```

**What it checks:**
- Recent trade performance (last 20 trades)
- Drawdown tracking
- Win rate vs baseline
- Profit factor vs baseline
- Consecutive loss streaks

**Output:** `config/health-report.json`

**Alert conditions:**
- `alert` → Performance degradation detected
- `throttle` → Significant degradation, reduce exposure
- `rollback` → Critical degradation, revert to previous strategy

**Check health status:**
```bash
cat config/health-report.json | jq '.action, .reason, .recommendation'
```

### Emergency Rollback

If health check recommends rollback or strategy performs poorly:

```bash
npm run rollback:strategy
```

**What it does:**
- Restores most recent backup from `config/strategy-backups/`
- Reverts to last known good configuration
- Updates active metrics to match backup

## Verification

**After optimization cycle:**

1. **Check active strategy:**
   ```bash
   cat config/profit-active.env | grep -E "STOP_LOSS|TAKE_PROFIT|LEVERAGE"
   ```

2. **Verify metrics improved:**
   ```bash
   jq -s '.[0].metrics.winRate - .[1].metrics.winRate' \
     config/active-strategy-metrics.json \
     config/strategy-backups/active-*.snapshot.metrics.json | head -1
   ```
   Positive number = improvement

3. **Confirm backup created:**
   ```bash
   ls -lt config/strategy-backups/ | head -5
   ```

4. **Run health check:**
   ```bash
   npm run health:strategy && cat config/health-report.json | jq .action
   ```
   Should return `"ok"` or `"continue"`

## Continuous Optimization

### Scheduled Cycles

Run optimization on a regular schedule:

```bash
# Weekly optimization (cron example)
0 0 * * 0 cd /path/to/cypherscoping && npm run cycle:strategy

# Manual continuation for iterative optimization
npm run continue:strategy
```

### Paper Trading Forward Test

After promotion, validate with forward paper trading:

```bash
npm run paper:forward
```

Simulates trades with new strategy parameters before live deployment.

## Example Workflow

**Scenario:** Win rate dropped to 52%, need to optimize

```bash
# 1. Export recent trades
npm run collect:trades
# Output: 1,902 trades exported

# 2. Tune parameters
npm run tune:strategy
# Output: Optimal settings found, win rate 65% in backtest

# 3. Validate tuned strategy
STRATEGY_ENV_PATH=config/profit-tuned.env npm run validate:strategy
# Output: ✅ All gates passed

# 4. Promote to active
npm run promote:strategy
# Output: Strategy promoted (metrics_improved)

# 5. Monitor health
npm run health:strategy
# Output: Status OK, continue trading

# 6. Verify active configuration
cat config/profit-active.env | grep STOP_LOSS_ROI
# STOP_LOSS_ROI=8 (updated from 6)
```

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Validation fails | Insufficient sample size | Collect more trades, lower sample threshold |
| No improvement | Parameters already optimal | Check for regime change, review indicators |
| Health degrades quickly | Overfitting to historical data | Add walk-forward validation, increase regularization |
| Promotion fails | Metrics worse than baseline | Review tuning parameters, check data quality |

## References

- Full audit: `MINIATURE_ENIGMA_AGI_AUDIT_REPORT.md`
- Scripts directory: `scripts/`
- Configuration: `config/profit-active.env`
- Metrics: `config/active-strategy-metrics.json`
- Project rules: `.claude/rules/project.md`

## Related Commands

```bash
# Policy validation
npm run policy:check

# Regular verification (sanity checks)
npm run verify:regular

# Test suite
npm test
```
