# Claude Code Trading Bot - Quick Start

## 1. Initial Setup
```bash
cp .env.example .env
# Edit .env with your credentials
claude-code auth login
```

## 2. Start Bot
```bash
./scripts/run-bot.sh
```

## 3. Use Claude Code
```bash
# Interactive session
claude-code

# Analyze file
claude-code analyze src/strategies/main-strategy.ts

# Debug issue
claude-code debug --logs logs/error.log --context "describe issue"
```

## 4. Test Changes
```bash
./scripts/test-bot.sh critical    # Fast
./scripts/test-bot.sh all        # Full suite
```

## 5. Safe Patching
```bash
./scripts/patch-bot.sh
# Follow prompts to use Claude Code
# Auto-tests and rollback on failure
```

## 6. Monitor
```bash
pm2 logs trading-bot    # View logs
pm2 monit              # Resource usage
curl localhost:9090/health | jq   # Health check
```

## Common Claude Code Prompts

### Fix Bug
"Analyze error in logs/error.log. The bot stops updating positions after reconnect. Fix while preserving all invariants in docs/INVARIANTS.md. Include regression test."

### Add Feature
"Add Bollinger Bands indicator to src/strategies/indicators/. Must use Result<T,E> pattern, include property-based tests, and integrate with existing scoring system without breaking changes."

### Optimize
"Profile and optimize order book processing in src/core/orderbook.ts. Target <10ms p99 latency. Maintain <512MB memory. Include benchmarks."
