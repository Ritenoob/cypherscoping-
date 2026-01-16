#!/bin/bash
# =============================================================================
# Miniature Enigma - Full Repository Build Script
# =============================================================================
# This script builds the complete trading bot infrastructure from scratch.
# Run with: bash scripts/build-repo.sh
# =============================================================================

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[BUILD]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# STEP 1: Directory Structure
# =============================================================================
log "Creating directory structure..."

mkdir -p agents
mkdir -p skills
mkdir -p knowledge-bank/{historical-data/{candles,orderbook-snapshots,trades},backtest-results/{runs,comparisons,walk-forward},model-weights/{indicator-weights,regime-classifiers,signal-models},metrics-history/{daily,trades,system},truth-docs/{api-specs},cache/{indicators,signals,orderbook}}
mkdir -p scripts
mkdir -p src/{indicators,microstructure,lib,utils,optimizer,backtest}
mkdir -p config
mkdir -p switches/signalProfiles
mkdir -p tests
mkdir -p logs

log "Directory structure created"

# =============================================================================
# STEP 2: Install Dependencies
# =============================================================================
log "Installing dependencies..."

if [ -f "package.json" ]; then
    npm install
else
    npm init -y
    npm install decimal.js ws axios
fi

log "Dependencies installed"

# =============================================================================
# STEP 3: Create Configuration Files
# =============================================================================
log "Creating configuration files..."

# Create .env if not exists
if [ ! -f ".env" ]; then
    if [ -f "_env.example" ]; then
        cp _env.example .env.example
    fi
    cat > .env << 'EOF'
# =============================================================================
# Miniature Enigma - Trading Bot Configuration
# =============================================================================

# Mode: paper or live
BOT_MODE=paper

# API Credentials (required for live mode)
KUCOIN_API_KEY=
KUCOIN_API_SECRET=
KUCOIN_API_PASSPHRASE=
KUCOIN_API_VERSION=2

# Strategy Profile
STRATEGY_PROFILE=neutral

# Risk Management
STOP_LOSS_ROI=0.5
TAKE_PROFIT_ROI=2.0
TRAILING_STOP_ENABLED=true
TRAILING_STOP_ACTIVATION=1.0

# Position Sizing
POSITION_SIZE_DEFAULT=0.5
MAX_OPEN_POSITIONS=5

# Leverage
LEVERAGE_DEFAULT=50
LEVERAGE_VOLATILITY_BASED=true

# Timeframes
PRIMARY_TIMEFRAME=15min
SECONDARY_TIMEFRAME=1hour

# Signal Thresholds
SIGNAL_MIN_SCORE=50
SIGNAL_MIN_CONFIDENCE=40
SIGNAL_MIN_INDICATORS=3

# Dashboard
DASHBOARD_PORT=3000
EOF
    log "Created .env file"
fi

# =============================================================================
# STEP 4: Create package.json scripts
# =============================================================================
log "Updating package.json..."

cat > package.json << 'EOF'
{
  "name": "miniature-enigma",
  "version": "5.1.0",
  "description": "AI Agent-Orchestrated KuCoin Futures Trading System",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "start:paper": "BOT_MODE=paper node index.js",
    "start:live": "BOT_MODE=live node index.js",
    "dashboard": "node server.js",
    "test": "node tests/run-all.js",
    "test:agents": "node tests/agents.test.js",
    "test:indicators": "node tests/indicators.test.js",
    "test:risk": "node tests/risk.test.js",
    "backtest": "node scripts/backtest-runner.js",
    "optimize": "node scripts/optimize.js",
    "walk-forward": "node scripts/walk-forward.js",
    "build": "bash scripts/build-repo.sh",
    "health": "node scripts/health-check.js",
    "export": "node scripts/export-signals.js"
  },
  "keywords": [
    "trading",
    "bot",
    "kucoin",
    "futures",
    "ai-agents",
    "algorithmic-trading"
  ],
  "license": "ISC",
  "dependencies": {
    "axios": "^1.13.2",
    "decimal.js": "^10.6.0",
    "ws": "^8.19.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

log "package.json updated"

# =============================================================================
# STEP 5: Initialize Knowledge Bank
# =============================================================================
log "Initializing knowledge bank..."

# Create invariants.json
cat > knowledge-bank/truth-docs/invariants.json << 'EOF'
{
  "version": "1.0.0",
  "financial": [
    {
      "id": "I-001",
      "rule": "positionNotional <= balance * MAX_POSITION_PERCENT / 100",
      "severity": "CRITICAL"
    },
    {
      "id": "I-002", 
      "rule": "totalExposure <= balance * MAX_TOTAL_EXPOSURE / 100",
      "severity": "CRITICAL"
    },
    {
      "id": "I-003",
      "rule": "leverage >= MIN_LEVERAGE && leverage <= MAX_LEVERAGE",
      "severity": "HIGH"
    },
    {
      "id": "I-004",
      "rule": "position.stopLossOrderId !== null",
      "severity": "CRITICAL"
    },
    {
      "id": "I-005",
      "rule": "liquidationBuffer >= MIN_LIQUIDATION_BUFFER",
      "severity": "HIGH"
    },
    {
      "id": "I-006",
      "rule": "dailyDrawdown <= MAX_DAILY_DRAWDOWN",
      "severity": "CRITICAL"
    },
    {
      "id": "I-007",
      "rule": "!apiPermissions.includes('withdrawal')",
      "severity": "CRITICAL"
    }
  ],
  "system": [
    {
      "id": "I-008",
      "rule": "mode === 'paper' || wsConnected === true",
      "severity": "CRITICAL"
    },
    {
      "id": "I-009",
      "rule": "Date.now() - lastHeartbeat < HEARTBEAT_TIMEOUT_MS",
      "severity": "HIGH"
    },
    {
      "id": "I-010",
      "rule": "requestsInWindow <= MAX_REQUESTS_PER_WINDOW",
      "severity": "MEDIUM"
    }
  ]
}
EOF

# Create constants file
cat > config/constants.js << 'EOF'
/**
 * System Constants - DO NOT MODIFY UNLESS YOU UNDERSTAND THE IMPLICATIONS
 */
module.exports = {
  // Time
  MS_PER_SECOND: 1000,
  MS_PER_MINUTE: 60_000,
  MS_PER_HOUR: 3_600_000,
  MS_PER_DAY: 86_400_000,

  // KuCoin Futures
  KUCOIN_TAKER_FEE: 0.0006,
  KUCOIN_MAKER_FEE: 0.0002,
  KUCOIN_MAINT_MARGIN: 0.005,
  KUCOIN_MAX_LEVERAGE: 100,
  KUCOIN_MIN_LEVERAGE: 1,

  // Signal Thresholds
  SCORE_EXTREME_BUY: 90,
  SCORE_STRONG_BUY: 70,
  SCORE_BUY: 50,
  SCORE_WEAK_BUY: 30,
  SCORE_NEUTRAL: 0,
  SCORE_WEAK_SELL: -30,
  SCORE_SELL: -50,
  SCORE_STRONG_SELL: -70,
  SCORE_EXTREME_SELL: -90,

  // Risk Defaults
  DEFAULT_STOP_LOSS_ROI: 0.5,
  DEFAULT_TAKE_PROFIT_ROI: 2.0,
  DEFAULT_TRAILING_ACTIVATION: 1.0,
  DEFAULT_TRAILING_DISTANCE: 0.3,
  DEFAULT_TRAILING_STEP: 0.5,
  MIN_LIQUIDATION_BUFFER: 0.05,

  // System Limits
  MAX_OPEN_POSITIONS: 5,
  MAX_DAILY_DRAWDOWN: 5.0,
  MAX_CONSECUTIVE_LOSSES: 5,
  MAX_REQUESTS_PER_SECOND: 10,
  HEARTBEAT_TIMEOUT_MS: 30_000,
  MAX_ORDERBOOK_AGE_MS: 5_000,
  MIN_CANDLES_FOR_INDICATORS: 200
};
EOF

log "Knowledge bank initialized"

# =============================================================================
# STEP 6: Create Test Suite
# =============================================================================
log "Creating test suite..."

cat > tests/run-all.js << 'EOF'
/**
 * Test Runner - Execute all test suites
 */
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('='.repeat(60));
  console.log('MINIATURE ENIGMA - TEST SUITE');
  console.log('='.repeat(60));
  
  const testFiles = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.test.js'))
    .sort();
  
  let passed = 0;
  let failed = 0;
  
  for (const file of testFiles) {
    console.log(`\nRunning: ${file}`);
    console.log('-'.repeat(40));
    
    try {
      const testModule = require(path.join(__dirname, file));
      if (typeof testModule.run === 'function') {
        const result = await testModule.run();
        passed += result.passed || 0;
        failed += result.failed || 0;
      }
    } catch (error) {
      console.error(`FAILED: ${error.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
EOF

cat > tests/agents.test.js << 'EOF'
/**
 * Agent Tests
 */
const { AgentBase } = require('../agents/agent-base');

class TestAgent extends AgentBase {
  constructor() {
    super({ id: 'test-agent', name: 'Test Agent' });
  }
  
  async processTask(task) {
    return { ok: true, value: task };
  }
}

async function run() {
  let passed = 0;
  let failed = 0;

  // Test 1: Agent initialization
  try {
    const agent = new TestAgent();
    console.log('✓ Agent initialization');
    passed++;
  } catch (e) {
    console.log('✗ Agent initialization:', e.message);
    failed++;
  }

  // Test 2: Task queue
  try {
    const agent = new TestAgent();
    const result = agent.enqueue({ type: 'TEST' });
    if (result.ok) {
      console.log('✓ Task enqueue');
      passed++;
    } else {
      throw new Error(result.error.message);
    }
  } catch (e) {
    console.log('✗ Task enqueue:', e.message);
    failed++;
  }

  // Test 3: Message creation
  try {
    const agent = new TestAgent();
    const msg = agent.createMessage('other-agent', 'TEST_ACTION', { data: 1 });
    if (msg.from === 'test-agent' && msg.to === 'other-agent') {
      console.log('✓ Message creation');
      passed++;
    } else {
      throw new Error('Invalid message format');
    }
  } catch (e) {
    console.log('✗ Message creation:', e.message);
    failed++;
  }

  return { passed, failed };
}

module.exports = { run };
EOF

log "Test suite created"

# =============================================================================
# STEP 7: Create Health Check Script
# =============================================================================
log "Creating health check script..."

cat > scripts/health-check.js << 'EOF'
/**
 * System Health Check
 */
const fs = require('fs');
const path = require('path');

async function checkHealth() {
  console.log('='.repeat(60));
  console.log('SYSTEM HEALTH CHECK');
  console.log('='.repeat(60));

  const checks = [];

  // Check 1: Required directories exist
  const requiredDirs = [
    'agents', 'skills', 'knowledge-bank', 'config', 'src', 'tests', 'logs'
  ];
  
  for (const dir of requiredDirs) {
    const exists = fs.existsSync(path.join(process.cwd(), dir));
    checks.push({ name: `Directory: ${dir}`, status: exists ? 'OK' : 'MISSING' });
  }

  // Check 2: Required files exist
  const requiredFiles = [
    'package.json', '.env', 'agents/agent-base.js', 'agents/orchestrator.js'
  ];
  
  for (const file of requiredFiles) {
    const exists = fs.existsSync(path.join(process.cwd(), file));
    checks.push({ name: `File: ${file}`, status: exists ? 'OK' : 'MISSING' });
  }

  // Check 3: Node modules
  const hasModules = fs.existsSync(path.join(process.cwd(), 'node_modules'));
  checks.push({ name: 'Node modules', status: hasModules ? 'OK' : 'RUN npm install' });

  // Print results
  let healthy = true;
  for (const check of checks) {
    const icon = check.status === 'OK' ? '✓' : '✗';
    console.log(`${icon} ${check.name}: ${check.status}`);
    if (check.status !== 'OK') healthy = false;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`HEALTH STATUS: ${healthy ? 'HEALTHY' : 'ISSUES DETECTED'}`);
  console.log('='.repeat(60));

  return healthy;
}

checkHealth();
EOF

log "Health check script created"

# =============================================================================
# STEP 8: Create Main Entry Point
# =============================================================================
log "Creating main entry point..."

cat > index.js << 'EOF'
/**
 * Miniature Enigma - AI Agent-Orchestrated Trading System
 * Main Entry Point
 */

const Orchestrator = require('./agents/orchestrator');
const SignalAgent = require('./agents/signal-agent');
const RiskAgent = require('./agents/risk-agent');

// Load configuration
require('dotenv').config?.() || {};

const config = {
  mode: process.env.BOT_MODE || 'paper',
  symbols: (process.env.DEFAULT_SYMBOLS || 'XBTUSDTM,ETHUSDTM').split(','),
  timeframes: [
    process.env.PRIMARY_TIMEFRAME || '15min',
    process.env.SECONDARY_TIMEFRAME || '1hour'
  ],
  
  risk: {
    stopLossROI: parseFloat(process.env.STOP_LOSS_ROI) || 0.5,
    takeProfitROI: parseFloat(process.env.TAKE_PROFIT_ROI) || 2.0,
    maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS) || 5,
    maxDailyDrawdown: parseFloat(process.env.MAX_DAILY_DRAWDOWN) || 5.0,
    defaultLeverage: parseInt(process.env.LEVERAGE_DEFAULT) || 50
  },
  
  signals: {
    minScore: parseInt(process.env.SIGNAL_MIN_SCORE) || 50,
    minConfidence: parseInt(process.env.SIGNAL_MIN_CONFIDENCE) || 40
  },
  
  agentClasses: {
    SignalAgent,
    RiskAgent
  }
};

async function main() {
  console.log('='.repeat(60));
  console.log('MINIATURE ENIGMA - AI Agent Trading System v5.1');
  console.log('='.repeat(60));
  console.log(`Mode: ${config.mode.toUpperCase()}`);
  console.log(`Symbols: ${config.symbols.join(', ')}`);
  console.log(`Timeframes: ${config.timeframes.join(', ')}`);
  console.log('='.repeat(60));

  const orchestrator = new Orchestrator(config);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await orchestrator.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await orchestrator.stop();
    process.exit(0);
  });

  try {
    await orchestrator.start();
    console.log('System initialized. Starting trading...');
    
    if (config.mode === 'paper') {
      await orchestrator.startTrading();
    } else {
      console.log('Live mode - waiting for manual start via dashboard');
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

module.exports = { Orchestrator, SignalAgent, RiskAgent, config };

if (require.main === module) {
  main();
}
EOF

log "Main entry point created"

# =============================================================================
# COMPLETE
# =============================================================================

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}BUILD COMPLETE${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your configuration"
echo "  2. Run: npm test"
echo "  3. Run: npm run health"
echo "  4. Run: npm start"
echo ""
EOF
