# Claude AI Cloud Integration Guide

## Overview

This document provides a comprehensive guide to the Claude AI cloud integration for the KuCoin Futures Trading Bot. The integration adds AI-powered capabilities for signal analysis, strategy optimization, risk intelligence, and natural language interfaces while maintaining 100% backward compatibility.

**Key Features:**
- 🤖 AI-enhanced signal analysis with confluence detection
- ⚙️ Adaptive strategy optimization recommendations
- 🛡️ Risk intelligence and market regime classification
- 💬 Natural language interface for bot queries
- 🎯 Decision support for trade validation
- 🔒 Enterprise-grade security and cost controls
- ♻️ Graceful degradation when unavailable

**All features are disabled by default** and must be explicitly enabled via environment variables.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup Instructions](#setup-instructions)
3. [Configuration](#configuration)
4. [Feature Flags Reference](#feature-flags-reference)
5. [API Endpoints](#api-endpoints)
6. [Usage Examples](#usage-examples)
7. [Cost Management](#cost-management)
8. [Troubleshooting](#troubleshooting)
9. [Performance Impact](#performance-impact)
10. [Security Considerations](#security-considerations)

---

## Prerequisites

### 1. Claude API Key

Obtain an API key from [Anthropic](https://console.anthropic.com/):
1. Sign up for an Anthropic account
2. Navigate to API Keys section
3. Create a new API key
4. Copy the key (starts with `sk-ant-`)

### 2. Node.js Dependencies

The integration requires two new dependencies (automatically installed):
```bash
npm install @anthropic-ai/sdk node-cache
```

---

## Setup Instructions

### Step 1: Configure Environment Variables

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` and add your Claude API key:
```bash
# Enable Claude Cloud Integration
ENABLE_CLAUDE_CLOUD=true
CLAUDE_API_KEY=sk-ant-your-api-key-here

# Enable specific features (all optional)
ENABLE_CLAUDE_SIGNAL_ANALYSIS=true
ENABLE_CLAUDE_OPTIMIZER=false
ENABLE_CLAUDE_RISK_INTEL=false
ENABLE_CLAUDE_CHAT=false
ENABLE_CLAUDE_DECISION_SUPPORT=false

# Cost management (optional)
CLAUDE_MAX_DAILY_COST=10.00
```

### Step 2: Verify Configuration

Run the configuration test:
```bash
node test/unit/cloudConfig.test.js
```

Expected output: `Success Rate: 100.0%`

### Step 3: Test Integration

Run the regression tests to ensure backward compatibility:
```bash
npm run test:regression
```

All tests should pass.

### Step 4: Start the Bot

Start the bot normally:
```bash
npm start
```

You should see:
```
[Bot] Initializing cloud AI services...
[Bot] Cloud AI services enabled
```

---

## Configuration

### cloudConfig.js

The main configuration file is located at `config/cloudConfig.js`. Default settings:

```javascript
{
  enabled: false,                    // Master switch (controlled by ENV)
  features: {
    signalAnalysis: false,           // AI signal enhancement
    strategyOptimizer: false,        // Strategy recommendations
    riskIntelligence: false,         // Risk analysis
    nlInterface: false,              // Natural language queries
    decisionSupport: false           // Trade validation
  },
  claude: {
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4096,
    temperature: 0.3,
    rateLimit: {
      requests: 45,                  // 45 req/min (safety margin)
      window: 60000                  // 1 minute
    },
    timeout: 30000,                  // 30 seconds
    retries: 3                       // Retry failed requests
  },
  cache: {
    enabled: true,
    ttl: 300000                      // 5 minutes
  },
  quotas: {
    maxDailyRequests: 5000,
    maxCostPerDay: 10.00             // USD
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,             // Open after 5 failures
    resetTimeout: 60000              // 1 minute
  }
}
```

---

## Feature Flags Reference

### 1. Signal Analysis (`ENABLE_CLAUDE_SIGNAL_ANALYSIS`)

**Purpose:** Analyzes indicator signals for confluence and anomalies

**When to Enable:**
- You want AI-enhanced confidence scoring
- You need anomaly detection in signals
- You want detailed reasoning for signal quality

**Usage:**
- Automatically called after signal generation
- Results attached to signal object as `aiAnalysis`
- Non-blocking (doesn't slow down trading)

**Example Output:**
```javascript
{
  analysis: "Strong bullish confluence with 4 indicators agreeing",
  confluenceScore: 85,
  anomalyDetected: false,
  confidenceAdjustment: +5,
  reasoning: "RSI, Williams %R, and KDJ show strong oversold conditions..."
}
```

### 2. Strategy Optimizer (`ENABLE_CLAUDE_OPTIMIZER`)

**Purpose:** Suggests indicator weight adjustments based on performance

**When to Enable:**
- After collecting trade history
- When win rate decreases
- For periodic optimization reviews

**API Endpoint:** `POST /api/cloud/optimize`

**Example Request:**
```javascript
{
  performanceData: {
    winRate: 0.65,
    profitFactor: 1.8,
    totalTrades: 100
  },
  currentWeights: { /* indicator weights */ },
  recentTrades: [ /* last 10 trades */ ]
}
```

### 3. Risk Intelligence (`ENABLE_CLAUDE_RISK_INTEL`)

**Purpose:** AI-powered risk assessment and position sizing

**When to Enable:**
- In volatile market conditions
- For high-value trades
- When managing multiple positions

**Features:**
- Market regime classification
- Volatility forecasting
- Position size recommendations
- Risk warnings

### 4. Natural Language Interface (`ENABLE_CLAUDE_CHAT`)

**Purpose:** Chat-based interaction with the bot

**When to Enable:**
- You want to query trading history
- You need plain-English reports
- You want to ask "why did you take this trade?" questions

**API Endpoint:** `POST /api/cloud/chat`

**Example Queries:**
- "What are my open positions?"
- "Why did you take that SOL trade?"
- "What's my performance today?"
- "Show me my losing trades"

### 5. Decision Support (`ENABLE_CLAUDE_DECISION_SUPPORT`)

**Purpose:** Pre-trade validation and exit timing

**When to Enable:**
- For manual trade review
- When testing new strategies
- For high-confidence decisions only

**Features:**
- Trade validation before execution
- Exit timing suggestions
- Risk/reward analysis

---

## API Endpoints

### GET /api/cloud/status

Check cloud service status.

**Response:**
```javascript
{
  initialized: true,
  healthy: true,
  features: {
    signalAnalysis: true,
    strategyOptimizer: false,
    // ...
  },
  usage: {
    requestsToday: 234,
    costToday: 1.45
  },
  metrics: {
    totalRequests: 234,
    successRate: 98.5,
    averageLatency: 1200
  }
}
```

### POST /api/cloud/analyze

Analyze a signal ad-hoc.

**Request:**
```javascript
{
  symbol: "BTCUSDTM",
  score: 85,
  signals: { /* indicator data */ },
  confidence: 80
}
```

**Response:**
```javascript
{
  success: true,
  analysis: "Strong bullish signal",
  confluenceScore: 90,
  anomalyDetected: false,
  confidenceAdjustment: +5,
  reasoning: "..."
}
```

### POST /api/cloud/chat

Send a natural language query.

**Request:**
```javascript
{
  query: "What are my open positions?",
  context: {
    openPositions: [ /* positions */ ],
    performance: { /* metrics */ }
  }
}
```

**Response:**
```javascript
{
  success: true,
  response: "You currently have 3 open positions..."
}
```

### GET /api/cloud/quota

Check API usage and quotas.

**Response:**
```javascript
{
  usage: {
    requestsToday: 234,
    costToday: 1.45,
    lastReset: 1705467890000
  },
  metrics: {
    totalRequests: 234,
    successfulRequests: 230,
    failedRequests: 4,
    averageLatency: 1200,
    successRate: 98.29
  }
}
```

### POST /api/cloud/optimize

Request strategy optimization.

**Request:**
```javascript
{
  performanceData: { /* metrics */ },
  currentWeights: { /* weights */ },
  recentTrades: [ /* trades */ ]
}
```

**Response:**
```javascript
{
  success: true,
  recommendations: [
    "Increase RSI weight to 40 (currently 35)",
    "Reduce MACD weight to 5 (currently 8)"
  ],
  weightAdjustments: { /* suggested changes */ },
  marketRegime: "trending",
  reasoning: "...",
  priority: "medium"
}
```

---

## Usage Examples

### Example 1: Signal Analysis

With signal analysis enabled, signals automatically include AI insights:

```javascript
const generator = new SignalGeneratorV2({
  cloudOrchestrator: orchestrator // Pass orchestrator
});

const result = generator.generate(indicators, microstructure);

console.log(result.score);        // 85
console.log(result.confidence);   // 80 (or adjusted by AI)

// AI analysis available after processing
setTimeout(() => {
  // Check logs or dashboard for AI analysis
}, 2000);
```

### Example 2: Strategy Optimization

```javascript
// Via API
const response = await fetch('http://localhost:3000/api/cloud/optimize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    performanceData: {
      winRate: 0.65,
      profitFactor: 1.8,
      totalTrades: 100,
      avgReturn: 0.015
    },
    currentWeights: {
      rsi: { max: 35, enabled: true },
      macd: { max: 8, enabled: false }
    },
    recentTrades: trades
  })
});

const recommendations = await response.json();
console.log(recommendations.recommendations);
```

### Example 3: Natural Language Queries

```javascript
// Via API
const response = await fetch('http://localhost:3000/api/cloud/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: "What's my performance today?",
    context: {
      openPositions: positions,
      performance: metrics
    }
  })
});

const answer = await response.json();
console.log(answer.response);
// "Your performance today shows a win rate of 70%..."
```

---

## Cost Management

### Understanding Costs

Claude 3.5 Sonnet pricing (as of January 2024):
- Input: $3 per million tokens
- Output: $15 per million tokens

**Typical costs per operation:**
- Signal analysis: ~$0.001-0.003 per analysis
- Strategy optimization: ~$0.005-0.010 per request
- Chat query: ~$0.002-0.008 per query

### Cost Controls

1. **Daily Cost Limit**
   ```bash
   CLAUDE_MAX_DAILY_COST=10.00  # Stop after $10/day
   ```

2. **Request Quotas**
   - Default: 5000 requests/day
   - Configurable in `cloudConfig.js`

3. **Caching**
   - 5-minute TTL reduces repeat costs
   - Automatic for identical queries

4. **Rate Limiting**
   - 45 requests/minute (safety margin)
   - Prevents accidental overuse

### Monitoring Costs

Check current usage:
```bash
curl http://localhost:3000/api/cloud/quota
```

Response includes:
- `requestsToday`: Number of API calls
- `costToday`: Estimated cost in USD
- `lastReset`: Last daily reset time

### Cost Optimization Tips

1. **Enable selective features** - Only use what you need
2. **Use caching** - Keep cache enabled
3. **Batch requests** - Group similar operations
4. **Monitor usage** - Check quotas regularly
5. **Disable in testing** - Use cloud features only in production

---

## Troubleshooting

### Issue: "Claude API key is required"

**Cause:** API key not set or empty

**Solution:**
```bash
# Check .env file
echo $CLAUDE_API_KEY

# Set correctly
CLAUDE_API_KEY=sk-ant-your-actual-key
```

### Issue: "Circuit breaker is open"

**Cause:** Too many consecutive API failures

**Solution:**
1. Check API key validity
2. Verify network connectivity
3. Wait 60 seconds for circuit to reset
4. Check Anthropic status page

### Issue: "Daily cost quota exceeded"

**Cause:** Hit the daily cost limit

**Solution:**
1. Increase limit: `CLAUDE_MAX_DAILY_COST=20.00`
2. Wait for daily reset (midnight UTC)
3. Review usage: `GET /api/cloud/quota`

### Issue: Bot runs but cloud features don't work

**Cause:** Features not enabled

**Solution:**
```bash
# Enable master switch AND specific features
ENABLE_CLAUDE_CLOUD=true
ENABLE_CLAUDE_SIGNAL_ANALYSIS=true
```

### Issue: Slow signal generation

**Cause:** Signal analysis is synchronous

**Solution:** This shouldn't happen - signal analysis is non-blocking. If you experience slowness:
1. Check `averageLatency` in metrics
2. Verify network latency to Anthropic API
3. Consider disabling if latency > 5000ms

---

## Performance Impact

### With Cloud Features Disabled (Default)

- **Zero impact** on performance
- Bot operates identically to pre-integration
- No additional dependencies loaded
- All tests verify this

### With Cloud Features Enabled

**Signal Analysis:**
- Non-blocking (fire-and-forget)
- No impact on signal generation speed
- Results available asynchronously

**Strategy Optimization:**
- On-demand only (API endpoint)
- Typical latency: 2-5 seconds
- Not in hot path

**Risk Intelligence:**
- On-demand only
- Typical latency: 1-3 seconds

**Natural Language Interface:**
- On-demand only
- Typical latency: 2-8 seconds

**Decision Support:**
- Optional pre-trade validation
- Typical latency: 1-3 seconds

**Overall Impact:**
- Memory: +10-15MB when enabled
- CPU: Minimal (async I/O only)
- Network: 1-50 KB per request

---

## Security Considerations

### API Key Security

**DO:**
- ✅ Store in `.env` file (not committed)
- ✅ Use environment variables
- ✅ Restrict file permissions (`chmod 600 .env`)
- ✅ Rotate keys periodically

**DON'T:**
- ❌ Commit keys to git
- ❌ Share keys in logs
- ❌ Use keys in client-side code
- ❌ Store in plain text files

### Network Security

- All API calls use HTTPS
- Timeout protection (30 seconds)
- Rate limiting prevents abuse
- Circuit breaker stops runaway calls

### Data Privacy

**What is sent to Claude:**
- Signal scores and indicators (numbers only)
- Performance metrics (aggregated)
- No personal information
- No API keys or credentials
- No account balances (optional in context)

**What is NOT sent:**
- KuCoin API credentials
- Private keys
- User personal data
- Trade execution details (unless explicitly included)

### Cost Protection

- Daily cost limits enforced
- Request quotas enforced
- Circuit breaker prevents runaway costs
- Automatic retry backoff

---

## Advanced Configuration

### Custom Model Selection

```javascript
// config/cloudConfig.js
claude: {
  model: 'claude-3-opus-20240229'  // For higher quality
  // or
  model: 'claude-3-haiku-20240307' // For lower cost
}
```

### Adjusting Rate Limits

```javascript
claude: {
  rateLimit: {
    requests: 30,  // More conservative
    window: 60000
  }
}
```

### Cache Configuration

```javascript
cache: {
  enabled: true,
  ttl: 600000  // 10 minutes instead of 5
}
```

### Circuit Breaker Tuning

```javascript
circuitBreaker: {
  enabled: true,
  failureThreshold: 3,   // More sensitive
  resetTimeout: 120000   // 2 minutes
}
```

---

## Support and Resources

- **GitHub Issues:** Report bugs or request features
- **Documentation:** This file
- **Test Suite:** `test/unit/`, `test/regression/`
- **Anthropic Docs:** https://docs.anthropic.com/

---

## Changelog Integration

See `CHANGELOG.md` for version history and updates.

---

## License

Same as the main trading bot project.
