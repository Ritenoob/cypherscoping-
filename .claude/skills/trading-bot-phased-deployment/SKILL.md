# Trading Bot Phased Deployment

**Type:** Production Deployment Process
**When to use:** Deploying trading bots from paper trading through live production
**Difficulty:** Advanced
**Prerequisites:** TypeScript/JavaScript trading bot, KuCoin API integration, testing framework

---

## What This Skill Covers

This skill provides a complete phased deployment strategy for trading bots, covering:
- Paper trading validation (Phase 0-2)
- Live mode preparation (Phase 3)
- Conservative live deployment (Phase 4)
- Monitoring and maintenance (Phase 5)
- Emergency rollback procedures (Phase 6)

The approach emphasizes safety, gradual risk escalation, and fail-safe mechanisms to prevent capital loss during deployment.

---

## Phase Overview

| Phase | Goal | Duration | Key Metrics |
|-------|------|----------|-------------|
| **Phase 0** | Code Quality Gates | 1-2 days | 0 build errors, all tests pass |
| **Phase 1** | Environment Setup | 1 day | Config validated, API connected |
| **Phase 2** | Paper Trading | 1 week | 100+ trades, 0 system errors |
| **Phase 3** | Live Prep | 2-3 days | Security audit, conservative settings |
| **Phase 4** | Live Deployment | 1-3 days | First live trades, gradual ramp-up |
| **Phase 5** | Monitoring | Ongoing | Daily health checks, alerting |
| **Phase 6** | Rollback Ready | As needed | Emergency procedures tested |

---

## Phase 0: Code Quality Gates

**Objective:** Ensure codebase is production-ready

### Checklist

```bash
# Build verification
npm run build
# Expected: No TypeScript errors, clean compilation

# Test suite
npm test
# Expected: All tests passing (unit + integration)

# Type checking
npm run typecheck
# Expected: No type errors

# Symbol policy validation
npm run policy:check
# Expected: BTC denylist active, trading universe configured

# Coverage check
npm run test:coverage
# Expected: ≥ 80% code coverage

# Security audit
npm audit
# Expected: 0 HIGH vulnerabilities
```

### Success Criteria

- [x] Build succeeds with 0 errors
- [x] All tests pass (100% pass rate)
- [x] Type checking clean
- [x] Symbol policy validated (BTC denied)
- [x] Batch error handling implemented (Promise.allSettled)
- [x] Credentials validation active (E_MISSING_CREDENTIALS)
- [x] Rate limiting configured (max concurrent API calls)

**Decision Point:** ALL criteria must pass. Fix any failures before proceeding.

---

## Phase 1: Environment Configuration

**Objective:** Set up paper trading environment safely

### Step 1.1: Create Paper Trading Environment

```bash
# Create .env file for paper trading
cat > cypherscoping-agent/.env <<'EOF'
# Trading Mode
TRADING_MODE=paper
SIMULATION=true

# KuCoin API (Use testnet for paper trading)
KUCOIN_API_KEY=your-testnet-api-key
KUCOIN_API_SECRET=your-testnet-api-secret
KUCOIN_API_PASSPHRASE=your-testnet-passphrase
KUCOIN_API_BASE_URL=https://api-sandbox-futures.kucoin.com

# Symbol Policy (enforced by symbol-policy.ts)
TRADING_UNIVERSE=ETHUSDTM,SOLUSDTM,XRPUSDTM,ADAUSDTM,DOGEUSDTM,MATICUSDTM,LINKUSDTM,AVAXUSDTM,DOTUSDTM,UNIUSDTM,ATOMUSDTM,LTCUSDTM,BCHUSDTM,ETCUSDTM
DENYLIST_SYMBOLS=BTC/USDT,BTCUSDT,BTCUSDTM,XBT/USDT,XBTUSDT,XBTUSDTM
DEFAULT_SYMBOL=ETHUSDTM

# Logging
AUDIT_LOG_PATH=runtime/audit.log
IDEMPOTENCY_STORE_PATH=runtime/idempotency-store.json
LOG_LEVEL=info

# Rate Limiting
MAX_CONCURRENT_API_CALLS=3
EOF
```

### Step 1.2: Verify Environment

```bash
# Verify .env file created
if [ -f "cypherscoping-agent/.env" ]; then
  echo "✅ Environment file exists"
  cat cypherscoping-agent/.env | grep -E "TRADING_MODE|SIMULATION"
else
  echo "❌ Environment file missing"
  exit 1
fi

# Create runtime directory
mkdir -p cypherscoping-agent/runtime
echo "✅ Runtime directory ready"

# Verify build succeeds
cd cypherscoping-agent && npm run build
if [ $? -eq 0 ]; then
  echo "✅ Build succeeds"
else
  echo "❌ Build failed"
  exit 1
fi
```

### Step 1.3: Test API Connection (Optional)

```bash
cd cypherscoping-agent

# Load environment
export $(cat .env | xargs)

# Simple connection test (if credentials configured)
npm run cli -- --scan --symbol ETHUSDTM

# Expected: Scans market data or shows simulation mode active
```

**Note:** Skip if using SIMULATION=true. MockMarketDataProvider will be used automatically.

---

## Phase 2: Paper Trading Validation

**Objective:** Validate all systems with simulated trading (100+ trades, 0 errors)
**Duration:** 1 week minimum

### Step 2.1: Start Paper Trading Session

**Option A: Built-in Paper Forward Script (Recommended)**

```bash
# Create logs directory
mkdir -p logs

# Run paper forward testing (simulates 100+ trades automatically)
npm run paper:forward > logs/paper-forward-$(date +%Y%m%d-%H%M%S).log 2>&1 &

PAPER_PID=$!
echo "Paper trading started. PID: $PAPER_PID"
echo "Monitor with: tail -f logs/paper-forward-*.log"

# Check status
ps aux | grep $PAPER_PID
```

**Option B: Continuous Market Scanning Loop**

```bash
cd cypherscoping-agent

# Load environment
export $(cat .env | xargs)

# Build first
npm run build

# Create continuous scan wrapper
cat > ../scripts/continuous-scan.sh <<'EOF'
#!/bin/bash
# Continuous market scanning for paper trading

LOG_FILE="../logs/continuous-scan-$(date +%Y%m%d-%H%M%S).log"
SCAN_INTERVAL=300  # 5 minutes

echo "Starting continuous scan. Logging to: $LOG_FILE"

while true; do
  echo "=== Scan started at $(date) ===" >> "$LOG_FILE"
  npm run cli -- --scan --json >> "$LOG_FILE" 2>&1

  if [ $? -eq 0 ]; then
    echo "✅ Scan completed successfully" >> "$LOG_FILE"
  else
    echo "❌ Scan failed with exit code $?" >> "$LOG_FILE"
  fi

  echo "Sleeping for ${SCAN_INTERVAL}s..." >> "$LOG_FILE"
  sleep $SCAN_INTERVAL
done
EOF

chmod +x ../scripts/continuous-scan.sh

# Run in background
nohup ../scripts/continuous-scan.sh > /dev/null 2>&1 &

SCAN_PID=$!
echo "Continuous scan started. PID: $SCAN_PID"
echo "Monitor with: tail -f logs/continuous-scan-*.log"
```

**Option C: Manual Individual Scans (Testing)**

```bash
cd cypherscoping-agent

# Load environment
export $(cat .env | xargs)

# Single market scan
npm run cli -- --scan

# Analyze specific symbol
npm run cli -- --analyze --symbol ETHUSDTM

# Scan with JSON output for programmatic processing
npm run cli -- --scan --json
```

### Step 2.2: Monitor Paper Trading Metrics

**Create Custom Paper Trading Monitor:**

```bash
cat > scripts/monitor-paper-trading.sh <<'EOF'
#!/bin/bash
# Monitor paper trading progress

AUDIT_LOG="cypherscoping-agent/runtime/audit.log"
THRESHOLD_TRADES=100

# Check if audit log exists
if [ ! -f "$AUDIT_LOG" ]; then
  echo "⚠️ No audit log found. Paper trading may not have started."
  exit 0
fi

# Count total events
TOTAL_EVENTS=$(wc -l < "$AUDIT_LOG" 2>/dev/null || echo "0")
echo "=== Paper Trading Monitor ==="
echo "Total Audit Events: $TOTAL_EVENTS"

# Count specific event types
SCANS=$(grep -c '"eventType":"market_scan"' "$AUDIT_LOG" 2>/dev/null || echo "0")
SIGNALS=$(grep -c '"eventType":"signal_generated"' "$AUDIT_LOG" 2>/dev/null || echo "0")
ORDERS=$(grep -c '"eventType":"order_placed"' "$AUDIT_LOG" 2>/dev/null || echo "0")
POLICY_BLOCKS=$(grep -c '"eventType":"policy_rejection"' "$AUDIT_LOG" 2>/dev/null || echo "0")

echo "Market Scans: $SCANS"
echo "Signals Generated: $SIGNALS"
echo "Orders Placed: $ORDERS"
echo "Policy Blocks (BTC/denied symbols): $POLICY_BLOCKS"

# Check for errors
ERRORS=$(grep -c '"level":"error"' "$AUDIT_LOG" 2>/dev/null || echo "0")
echo "Errors: $ERRORS"

# Progress toward 100 trade goal
if [ "$ORDERS" -ge "$THRESHOLD_TRADES" ]; then
  echo ""
  echo "✅ TARGET REACHED: $ORDERS / $THRESHOLD_TRADES trades"
  echo "Ready to proceed to Phase 3!"
else
  REMAINING=$((THRESHOLD_TRADES - ORDERS))
  echo ""
  echo "⏸️ Progress: $ORDERS / $THRESHOLD_TRADES trades ($REMAINING remaining)"
fi

# Show last 3 events
echo ""
echo "Last 3 Audit Events:"
tail -3 "$AUDIT_LOG" | jq -r '"\(.timestamp) [\(.eventType)] \(.message // .action // "no description")"' 2>/dev/null || tail -3 "$AUDIT_LOG"
EOF

chmod +x scripts/monitor-paper-trading.sh
```

**Run Monitoring:**

```bash
# Manual check
./scripts/monitor-paper-trading.sh

# Automated monitoring every hour
watch -n 3600 './scripts/monitor-paper-trading.sh'
```

### Step 2.3: Paper Trading Success Criteria

**Minimum Requirements:**

- ✅ 100+ orders placed (tracked via audit log)
- ✅ 0 system errors (level:error in audit log)
- ✅ 0 duplicate orders (idempotency working)
- ✅ Symbol policy enforced (BTC never traded)
- ✅ Rate limiting active (no API ban errors)
- ✅ All safety systems functional

**Validation Commands:**

```bash
AUDIT_LOG="cypherscoping-agent/runtime/audit.log"

# 1. Count orders placed
ORDERS=$(grep -c '"eventType":"order_placed"' "$AUDIT_LOG" 2>/dev/null || echo "0")
echo "Orders Placed: $ORDERS / 100 (target)"

# 2. Check for system errors
ERRORS=$(grep -c '"level":"error"' "$AUDIT_LOG" 2>/dev/null || echo "0")
echo "System Errors: $ERRORS (must be 0)"

# 3. Verify idempotency (check for duplicate order errors)
DUPLICATES=$(grep -c '"errorCode":"E_DUPLICATE_ORDER"' "$AUDIT_LOG" 2>/dev/null || echo "0")
echo "Duplicate Orders Blocked: $DUPLICATES (shows idempotency working)"

# 4. Check symbol policy enforcement
POLICY_BLOCKS=$(grep -c '"eventType":"policy_rejection"' "$AUDIT_LOG" 2>/dev/null || echo "0")
echo "Policy Rejections: $POLICY_BLOCKS (BTC and denied symbols)"

# 5. Verify BTC never traded
BTC_TRADES=$(grep '"eventType":"order_placed"' "$AUDIT_LOG" 2>/dev/null | grep -c '"symbol":"BTC' || echo "0")
if [ "$BTC_TRADES" -eq 0 ]; then
  echo "✅ BTC Denylist Enforced: 0 BTC trades"
else
  echo "❌ BTC TRADED: $BTC_TRADES times - CRITICAL FAILURE"
  exit 1
fi

# 6. Check for API rate limit errors
RATE_LIMIT_ERRORS=$(grep -c 'rate limit\|429' "$AUDIT_LOG" 2>/dev/null || echo "0")
echo "Rate Limit Errors: $RATE_LIMIT_ERRORS (should be 0)"

# Summary
echo ""
echo "=== Validation Summary ==="
if [ "$ORDERS" -ge 100 ] && [ "$ERRORS" -eq 0 ] && [ "$BTC_TRADES" -eq 0 ] && [ "$RATE_LIMIT_ERRORS" -eq 0 ]; then
  echo "✅ ALL CRITERIA MET - Ready for Phase 3"
else
  echo "❌ Some criteria not met - continue testing"
fi
```

**Strategy Health Check (Legacy System):**

```bash
# This analyzes trade history from legacy system
npm run health:strategy

# Check results
cat config/health-report.json | jq '{action, recentWinRate, profitFactor, recommendation}'
```

**Decision Point:**
- ✅ All validation checks pass → Proceed to Phase 3
- ❌ Errors or BTC trades detected → STOP, debug, fix, restart
- ⏸️ < 100 orders → Continue testing until target reached

---

## Phase 3: Live Mode Preparation

**Objective:** Prepare for live trading with real funds
**Duration:** 2-3 days

### Step 3.1: Final Code Review

```bash
cd cypherscoping-agent

# Type checking
npm run typecheck

# Full test suite
npm test

# Coverage report
npm run test:coverage

# Security audit
npm audit

# Check for unused dependencies
npx depcheck
```

**Expected:** All checks pass

### Step 3.2: Create Live Trading Environment

```bash
cat > cypherscoping-agent/.env.live <<'EOF'
# Trading Mode
TRADING_MODE=live
SIMULATION=false

# KuCoin API (Production)
KUCOIN_API_KEY=your-live-api-key
KUCOIN_API_SECRET=your-live-api-secret
KUCOIN_API_PASSPHRASE=your-live-passphrase
KUCOIN_API_BASE_URL=https://api-futures.kucoin.com

# Symbol Policy (same as paper)
TRADING_UNIVERSE=ETHUSDTM,SOLUSDTM,XRPUSDTM,ADAUSDTM,DOGEUSDTM,MATICUSDTM,LINKUSDTM,AVAXUSDTM,DOTUSDTM,UNIUSDTM,ATOMUSDTM,LTCUSDTM,BCHUSDTM,ETCUSDTM
DENYLIST_SYMBOLS=BTC/USDT,BTCUSDT,BTCUSDTM,XBT/USDT,XBTUSDT,XBTUSDTM
DEFAULT_SYMBOL=ETHUSDTM

# Risk Parameters (CONSERVATIVE for first live run)
MAX_EXPOSURE_RATIO=0.5          # 50% (reduced from 80%)
MAX_RISK_PER_TRADE=0.01         # 1% (reduced from 2%)
MIN_POSITION_SIZE=0.01
CIRCUIT_BREAKER_THRESHOLD=0.10  # 10% (reduced from 15%)
MAX_DRAWDOWN_PERCENT=5          # 5% (reduced from 10%)

# Live Mode Safety
REQUIRE_MANUAL_APPROVAL=true    # Human confirmation for each trade
MAX_DAILY_TRADES=10             # Limit exposure on first day

# Logging (verbose for first run)
AUDIT_LOG_PATH=runtime/audit-live.log
IDEMPOTENCY_STORE_PATH=runtime/idempotency-store-live.json
LOG_LEVEL=debug

# Alerting
ALERT_EMAIL=your-email@example.com
ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
EOF
```

**Key Risk Parameters (Conservative Settings):**
- **MAX_EXPOSURE_RATIO:** 0.5 (50% max portfolio allocation)
- **MAX_RISK_PER_TRADE:** 0.01 (1% risk per trade)
- **CIRCUIT_BREAKER_THRESHOLD:** 0.10 (10% drawdown triggers stop)
- **MAX_DRAWDOWN_PERCENT:** 5 (5% max drawdown before alerting)
- **REQUIRE_MANUAL_APPROVAL:** true (human-in-the-loop)
- **MAX_DAILY_TRADES:** 10 (limit exposure on first day)

### Step 3.3: Backup Current Configuration

```bash
# Create deployment snapshot
SNAPSHOT_DIR="deployment-snapshots/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SNAPSHOT_DIR"

# Backup critical files
cp cypherscoping-agent/.env.live "$SNAPSHOT_DIR/"
cp config/profit-active.env "$SNAPSHOT_DIR/"
cp config/active-strategy-metrics.json "$SNAPSHOT_DIR/"
cp cypherscoping-agent/runtime/audit.log "$SNAPSHOT_DIR/" 2>/dev/null || true

# Git commit
git add cypherscoping-agent/
git commit -m "feat: production deployment ready

- All HIGH-priority fixes complete
- 28/28 tests passing
- Paper trading validated (100+ trades)
- Ready for live deployment

Pre-deployment checklist:
✅ Batch error handling (Promise.allSettled)
✅ Credentials validation (E_MISSING_CREDENTIALS)
✅ Rate limiting (p-limit max 3 concurrent)
✅ Symbol policy enforcement (BTC denied)
✅ Idempotency protection
✅ Circuit breaker logic
✅ Audit logging active"

# Tag release
git tag -a v1.0.0-production -m "Production release: TypeScript agent system

Validated with 100+ paper trades
Win rate: [INSERT_ACTUAL]%
Profit factor: [INSERT_ACTUAL]
Zero system errors"

git push origin $(git branch --show-current)
git push origin v1.0.0-production
```

### Step 3.4: Pre-Live Smoke Test

```bash
# Load live config (but don't trade yet)
export $(cat cypherscoping-agent/.env.live | xargs)
export TRADING_MODE=paper  # Override to paper for smoke test

# Test market data connection
npm run cli -- --scan --limit 1

# Expected: Successfully scans 1 symbol, no errors

# Test order validation (without execution)
npm run cli -- --analyze --symbol ETHUSDTM --dry-run

# Expected: Analysis completes, no orders placed
```

---

## Phase 4: Live Deployment

**Objective:** First live trades with minimal risk
**Duration:** Day 1 (1-3 trades)

### Step 4.1: Pre-Flight Checklist

```bash
cd cypherscoping-agent

echo "🔍 Pre-Flight Checklist:"
echo ""

# 1. Credentials
if [ -n "$KUCOIN_API_KEY" ] && [ -n "$KUCOIN_API_SECRET" ]; then
  echo "✅ API credentials set"
else
  echo "❌ API credentials missing"
  exit 1
fi

# 2. Trading mode
if [ "$TRADING_MODE" = "live" ]; then
  echo "✅ Trading mode: LIVE"
else
  echo "⚠️ Trading mode: $TRADING_MODE (not live)"
  exit 1
fi

# 3. Risk parameters
echo "Risk Settings:"
echo "  - Max Exposure: ${MAX_EXPOSURE_RATIO:-0.8}"
echo "  - Risk Per Trade: ${MAX_RISK_PER_TRADE:-0.02}"
echo "  - Circuit Breaker: ${CIRCUIT_BREAKER_THRESHOLD:-0.15}"

# 4. Symbol policy
echo "Symbol Policy:"
echo "  - Universe: ${TRADING_UNIVERSE:-NOT SET}"
echo "  - Denylist: ${DENYLIST_SYMBOLS:-NOT SET}"

# 5. Test build
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Build succeeds"
else
  echo "❌ Build failed"
  exit 1
fi

# 6. Test suite
npm test > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ All tests pass"
else
  echo "❌ Tests failed"
  exit 1
fi

echo ""
echo "🚀 Ready for live deployment!"
```

### Step 4.2: Start Live Trading (Conservative Mode)

```bash
# Load live config
export $(cat cypherscoping-agent/.env.live | xargs)

# Start with single symbol, manual approval
npm run cli -- --analyze --symbol ETHUSDTM --require-approval

# Monitor in real-time
tail -f cypherscoping-agent/runtime/audit-live.log
```

### Step 4.3: First Trade Validation

**After first trade executes:**

```bash
# Verify trade in audit log
grep "trade_executed" cypherscoping-agent/runtime/audit-live.log | tail -1 | jq .

# Check KuCoin exchange
# - Verify order exists on exchange
# - Verify position opened
# - Verify no duplicate orders

# Check idempotency store
cat cypherscoping-agent/runtime/idempotency-store-live.json | jq .

# Verify audit trail
# - Correlation ID logged
# - Symbol policy checked
# - Risk parameters applied
```

**Decision Point:**
- ✅ First trade successful → Continue with conservative settings
- ❌ Any errors → STOP, investigate, fix, restart

### Step 4.4: Gradual Ramp-Up

**Timeline:**

| Day | Max Trades | Mode | Risk Level |
|-----|-----------|------|------------|
| **Day 1** | 1-3 trades | Manual approval | Minimal |
| **Day 2** | 5-10 trades | Manual approval | Conservative |
| **Day 3** | 10-20 trades | Semi-automated | Conservative |
| **Week 2** | Full automation | Automated | Normal |

**Risk Escalation:**

1. **Days 1-3:** Conservative settings (50% exposure, 1% risk/trade)
2. **Days 4-7:** Moderate settings (65% exposure, 1.5% risk/trade)
3. **Week 2+:** Normal settings (80% exposure, 2% risk/trade)

**Monitor at each transition:**
- Win rate matches paper trading (±5%)
- Drawdown stays under threshold
- No system errors
- Idempotency working

---

## Phase 5: Monitoring & Maintenance

**Objective:** Continuous monitoring and optimization
**Duration:** Ongoing

### Step 5.1: Real-Time Monitoring Dashboard

```bash
cat > scripts/live-dashboard.sh <<'EOF'
#!/bin/bash
# Live trading dashboard

clear
echo "=== CypherScoping Live Trading Dashboard ==="
echo ""

# Today's stats
TODAY=$(date +%Y-%m-%d)
AUDIT_LOG="cypherscoping-agent/runtime/audit-live.log"

# Trades today
TRADES_TODAY=$(grep "trade_executed" "$AUDIT_LOG" | grep "$TODAY" | wc -l)
echo "Trades Today: $TRADES_TODAY"

# Wins vs losses
WINS=$(grep "trade_executed" "$AUDIT_LOG" | grep "$TODAY" | grep -c '"outcome":"win"')
LOSSES=$(grep "trade_executed" "$AUDIT_LOG" | grep "$TODAY" | grep -c '"outcome":"loss"')
WIN_RATE=$(echo "scale=2; $WINS / $TRADES_TODAY" | bc 2>/dev/null || echo "0")
echo "Win Rate: $WIN_RATE ($WINS wins, $LOSSES losses)"

# Errors today
ERRORS=$(grep "ERROR" "$AUDIT_LOG" | grep "$TODAY" | wc -l)
echo "Errors: $ERRORS"

# Circuit breaker status
CIRCUIT_BREAKER=$(grep "circuit_breaker" "$AUDIT_LOG" | grep "$TODAY" | tail -1 | jq -r '.status' 2>/dev/null || echo "OK")
echo "Circuit Breaker: $CIRCUIT_BREAKER"

# Last trade
echo ""
echo "Last Trade:"
grep "trade_executed" "$AUDIT_LOG" | tail -1 | jq '{symbol, side, size, outcome, timestamp}'

echo ""
echo "Press Ctrl+C to exit. Refreshing every 30s..."
sleep 30
EOF

chmod +x scripts/live-dashboard.sh

# Run dashboard
watch -n 30 ./scripts/live-dashboard.sh
```

### Step 5.2: Alerting Configuration

```bash
cat > scripts/send-alert.sh <<'EOF'
#!/bin/bash
# Send alerts to Slack

MESSAGE="$1"
SEVERITY="${2:-info}"  # info, warning, critical

SLACK_WEBHOOK="${ALERT_SLACK_WEBHOOK}"

if [ -n "$SLACK_WEBHOOK" ]; then
  curl -X POST "$SLACK_WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"[$SEVERITY] CypherScoping: $MESSAGE\"}"
fi
EOF

chmod +x scripts/send-alert.sh

# Test alert
./scripts/send-alert.sh "Live trading started" "info"
```

### Step 5.3: Daily Health Checks

```bash
# Add to crontab: Run at 6 AM daily
0 6 * * * cd /path/to/cypherscoping && npm run health:strategy && ./scripts/send-alert.sh "Daily health check complete" "info"

# Weekly strategy optimization
0 0 * * 0 cd /path/to/cypherscoping && npm run cycle:strategy && ./scripts/send-alert.sh "Weekly optimization complete" "info"
```

**Daily Monitoring Checklist:**

- [ ] Review audit logs for errors
- [ ] Check win rate vs. baseline
- [ ] Verify drawdown within limits
- [ ] Confirm no symbol policy violations
- [ ] Check API rate limit status
- [ ] Review idempotency store for duplicates
- [ ] Verify circuit breaker status

---

## Phase 6: Rollback Procedures

**Objective:** Emergency stop and recovery procedures

### Emergency Rollback Script

```bash
cat > scripts/emergency-rollback.sh <<'EOF'
#!/bin/bash
# Emergency rollback procedure

echo "🚨 EMERGENCY ROLLBACK INITIATED"

# 1. Stop live trading immediately
pkill -f "cypherscoping-agent.*--scan"
echo "✅ Stopped all trading processes"

# 2. Close open positions (manual step)
echo "⚠️ MANUAL ACTION REQUIRED: Close all open positions on KuCoin"
echo "   URL: https://futures.kucoin.com/futures/positions"

# 3. Switch to paper mode
export TRADING_MODE=paper
echo "✅ Switched to paper mode"

# 4. Restore previous configuration
LATEST_SNAPSHOT=$(ls -t deployment-snapshots/ | head -1)
if [ -n "$LATEST_SNAPSHOT" ]; then
  cp "deployment-snapshots/$LATEST_SNAPSHOT/profit-active.env" config/
  echo "✅ Restored configuration from $LATEST_SNAPSHOT"
fi

# 5. Send alert
./scripts/send-alert.sh "EMERGENCY ROLLBACK COMPLETE - System stopped" "critical"

echo ""
echo "Rollback complete. System stopped."
echo "Investigate logs before restarting:"
echo "  - cypherscoping-agent/runtime/audit-live.log"
echo "  - logs/monitoring.log"
EOF

chmod +x scripts/emergency-rollback.sh
```

### Rollback Triggers

**Automatic triggers:**
- Circuit breaker activated (drawdown > threshold)
- Consecutive losses > 3
- API errors > 5 in 1 hour

**Manual triggers:**
- Unexpected behavior detected
- Win rate drops > 10% below baseline
- Drawdown exceeds safe limit
- System errors in audit log
- Exchange connectivity issues

### Rollback Procedure

```bash
# 1. Execute emergency rollback
./scripts/emergency-rollback.sh

# 2. Close all positions manually on exchange
# URL: https://futures.kucoin.com/futures/positions

# 3. Investigate logs
tail -100 cypherscoping-agent/runtime/audit-live.log
grep -i "error" cypherscoping-agent/runtime/audit-live.log

# 4. Identify root cause
# - Symbol policy violation?
# - Rate limiting issue?
# - Market volatility spike?
# - Code bug?

# 5. Fix issue
# - Update code
# - Adjust risk parameters
# - Fix configuration

# 6. Validate fix
npm test
npm run build
./scripts/monitor-paper-trading.sh

# 7. Restart paper trading
export TRADING_MODE=paper
npm run cli -- --scan --continuous

# 8. Re-validate (50+ paper trades)
# Monitor for 24-48 hours

# 9. Resume live trading (if validated)
export TRADING_MODE=live
npm run cli -- --analyze --symbol ETHUSDTM --require-approval
```

---

## Risk Management Controls

### Circuit Breaker System

**Automatic stop conditions:**

| Condition | Threshold | Action | Recovery |
|-----------|-----------|--------|----------|
| **Drawdown** | 10% (conservative), 15% (normal) | Stop all trading | Manual restart after review |
| **Consecutive Losses** | 3 in a row | Pause 1 hour | Auto-resume after cooldown |
| **API Errors** | 5 in 1 hour | Stop trading | Manual restart |
| **Win Rate Drop** | > 10% below baseline | Alert operator | Review strategy |

**Circuit breaker validation:**

```bash
# Check circuit breaker status
grep "circuit_breaker" cypherscoping-agent/runtime/audit-live.log | tail -5

# Test circuit breaker (paper mode)
export CIRCUIT_BREAKER_THRESHOLD=0.01  # Lower threshold for testing
npm run cli -- --scan
# Should trigger after small drawdown
```

### Symbol Policy Enforcement

**Critical rules:**

1. **BTC Denylist:** BTC/BTCUSDT/BTCUSDTM always blocked
2. **Trading Universe:** Only symbols in TRADING_UNIVERSE allowed
3. **Canonicalization:** All symbols normalized before validation
4. **Enforcement Points:** Orchestrator, Trading Executor, Coin Screener

**Validation:**

```bash
# Verify BTC never traded
BTC_TRADES=$(grep '"eventType":"order_placed"' cypherscoping-agent/runtime/audit-live.log | grep -c '"symbol":"BTC' || echo "0")
if [ "$BTC_TRADES" -eq 0 ]; then
  echo "✅ BTC policy enforced"
else
  echo "❌ CRITICAL: BTC traded $BTC_TRADES times"
  ./scripts/emergency-rollback.sh
fi
```

### Position Sizing Safety

**Conservative mode (Days 1-3):**
- Max exposure: 50% of portfolio
- Risk per trade: 1%
- Min position size: 0.01 contracts
- Max daily trades: 10

**Normal mode (Week 2+):**
- Max exposure: 80% of portfolio
- Risk per trade: 2%
- Min position size: 0.01 contracts
- Max daily trades: unlimited

**Leverage limits:**
- Initial: 5x max
- After validation: 10x max
- Never exceed: 20x

---

## Success Criteria by Phase

### Paper Trading Phase

- [x] 100+ paper trades with 0 system errors
- [x] Win rate ≥ 55%
- [x] Profit factor ≥ 1.5
- [x] Idempotency working (0 duplicate orders)
- [x] Symbol policy enforced (0 BTC trades)
- [x] Rate limiting preventing bans

### Live Trading Phase (Days 1-7)

- [ ] 50+ live trades with 0 system errors
- [ ] Win rate matches paper trading (±5%)
- [ ] No unexpected behaviors
- [ ] Monitoring & alerting functional
- [ ] Rollback procedure tested

### Operational Maturity (Week 2+)

- [ ] 1 week of stable live trading
- [ ] Daily health checks automated
- [ ] Weekly optimization cycle tested
- [ ] Team trained on monitoring & rollback
- [ ] Documentation complete

---

## Common Issues & Solutions

### Issue: API Rate Limiting

**Symptoms:**
- 429 errors in audit log
- "Rate limit exceeded" messages
- Failed market scans

**Solution:**
```bash
# Reduce concurrent API calls
export MAX_CONCURRENT_API_CALLS=2  # Down from 3

# Increase scan interval
export SCAN_INTERVAL=600  # 10 minutes instead of 5

# Restart with new settings
./scripts/emergency-rollback.sh
# Update .env with new limits
npm run cli -- --scan --continuous
```

### Issue: Duplicate Orders

**Symptoms:**
- E_DUPLICATE_ORDER in audit log
- Multiple orders for same signal
- Idempotency store has duplicates

**Solution:**
```bash
# Verify idempotency store is writable
ls -la cypherscoping-agent/runtime/idempotency-store-live.json

# Check for hash collisions
cat cypherscoping-agent/runtime/idempotency-store-live.json | jq 'length'
# Should grow monotonically

# If corrupted, backup and reset
cp cypherscoping-agent/runtime/idempotency-store-live.json backups/
echo '{}' > cypherscoping-agent/runtime/idempotency-store-live.json

# Restart
npm run cli -- --scan
```

### Issue: Circuit Breaker False Positives

**Symptoms:**
- Circuit breaker triggers during normal volatility
- Trading stops frequently
- Drawdown calculation incorrect

**Solution:**
```bash
# Adjust threshold for market conditions
export CIRCUIT_BREAKER_THRESHOLD=0.12  # Up from 0.10

# Or use time-based cooldown instead
export CIRCUIT_BREAKER_COOLDOWN=3600  # 1 hour

# Re-calibrate based on recent trades
npm run health:strategy
cat config/health-report.json | jq '.maxDrawdown'
# Set threshold 2x above historical max
```

### Issue: Win Rate Below Baseline

**Symptoms:**
- Win rate < 55% for extended period
- Profit factor < 1.5
- health:strategy shows "alert" or "rollback"

**Solution:**
```bash
# Stop live trading
./scripts/emergency-rollback.sh

# Run strategy optimization
npm run cycle:strategy

# Review optimization results
cat config/tuned-strategy-metrics.json | jq '{winRate, profitFactor, recommendation}'

# If improved, promote and restart
npm run promote:strategy

# Restart paper trading for validation
export TRADING_MODE=paper
npm run cli -- --scan --continuous

# Validate with 50+ trades before resuming live
```

---

## Emergency Contacts

**System Owner:** [Your Name]
**Email:** [your-email]
**Phone:** [your-phone]
**Slack:** #cypherscoping-alerts

**KuCoin Support:**
- Support: https://support.kucoin.plus/hc/en-us
- Status: https://status.kucoin.com/

**Escalation Path:**
1. Check audit logs
2. Run emergency rollback
3. Contact system owner
4. Investigate issue
5. Fix and redeploy

---

## Additional Resources

- **Quick Start:** `QUICK_START_CHECKLIST.md`
- **Code Review:** `CODEX_CONTINUATION_ANALYSIS.md`
- **Technical Spec:** `MINIATURE_ENIGMA_TECHNICAL_SPECIFICATION.md`
- **Audit Report:** `MINIATURE_ENIGMA_AGI_AUDIT_REPORT.md`
- **Bot Reference:** `BOT_PRODUCTION_REFERENCE_GUIDE.md`

---

## Summary

This phased deployment strategy emphasizes:

1. **Safety First:** Paper trading validation before live deployment
2. **Gradual Risk Escalation:** Conservative settings initially, normal after validation
3. **Fail-Safe Mechanisms:** Circuit breakers, symbol policies, idempotency
4. **Monitoring & Alerting:** Real-time dashboards, daily health checks
5. **Emergency Procedures:** Tested rollback procedures, clear escalation path

**Timeline to Production:** 2-3 weeks from code complete to full live deployment

**Key Success Factors:**
- Zero tolerance for system errors
- All safety systems must be validated in paper trading
- Manual approval for first live trades
- Gradual ramp-up over 1-2 weeks
- Continuous monitoring and optimization

Follow this framework to deploy trading bots safely and confidently.
