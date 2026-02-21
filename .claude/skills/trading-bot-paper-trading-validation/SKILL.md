# Paper Trading Validation & Backtesting Patterns

**Extracted from:** LumiBot backtesting architecture and production bot reference guides

**Use this skill when:** Validating trading strategies before live deployment, setting up paper trading environments, implementing backtesting systems, or transitioning from development to production.

---

## Overview

Paper trading and backtesting are critical validation steps that prevent costly errors in live trading. This skill provides proven patterns from production trading bots for:

- Paper trading validation workflows
- Backtesting data source integration
- Mock data generation for testing
- Safety checks before going live

---

## When to Use Paper Trading vs Live Trading

### Decision Matrix

| Condition | Mode | Rationale |
|-----------|------|-----------|
| New strategy (never tested) | Backtest → Paper → Live | Validate logic without risk |
| Strategy changes (indicators, weights) | Backtest → Paper → Live | Verify impact before real money |
| Bug fixes (critical logic) | Backtest → Paper → Live | Ensure fix doesn't break system |
| Minor UI changes | Live (after code review) | No trading logic affected |
| Configuration adjustments | Paper (1-7 days) → Live | Verify behavior in real market |
| Exchange API changes | Paper (24-48h) → Live | Test API compatibility |
| Production deployment | **ALWAYS paper first** | Final validation in production environment |

### Environment Variable Pattern

```bash
# Environment-driven mode switching (CypherScoping pattern)
TRADING_MODE=paper  # Options: paper, live, demo
```

```typescript
// Code pattern for mode enforcement
export class TradingExecutorAgent extends BaseAgent {
  async execute(context: AgentContext): Promise<AgentResult> {
    const mode = process.env.TRADING_MODE || 'paper';

    if (mode !== 'paper') {
      console.warn('[SAFETY] TRADING_MODE not set to paper - forcing paper mode');
      process.env.TRADING_MODE = 'paper';
    }

    // Execute with mode awareness
    const order = await this.executeOrder(context.signal, mode);
  }
}
```

---

## Paper Trading Validation Workflow

### Phase 1: Backtesting (Historical Data)

**Duration:** Until strategy shows consistent profitability (minimum 100+ trades across multiple market conditions)

**Data Sources:**
- **Yahoo Finance:** Free, split-adjusted, daily/minute data (best for stocks)
- **ThetaData:** Options, futures, bid/ask spreads (requires subscription)
- **Polygon:** Real-time + historical, minute-level (paid)
- **Exchange APIs:** KuCoin, Binance, etc. (rate-limited)

**Implementation Pattern (LumiBot):**

```python
# Environment-driven data source selection
BACKTESTING_DATA_SOURCE=thetadata  # Options: yahoo, thetadata, polygon

# Override explicit datasource_class in code
strategy.backtest(
    datasource_class=None,  # Use env var instead
    start_date="2020-01-01",
    end_date="2025-12-01"
)
```

**Key Metrics to Track:**

| Metric | Target | Red Flag |
|--------|--------|----------|
| Win Rate | ≥ 50% | < 40% |
| Sharpe Ratio | ≥ 1.5 | < 1.0 |
| Max Drawdown | ≤ 20% | > 30% |
| Profit Factor | ≥ 1.5 | < 1.2 |
| Total Trades | ≥ 100 | < 50 (insufficient data) |

**Critical Validation Tests (From LumiBot Acceptance Suite):**

1. **Split Handling Test**
   - Run backtest across stock split dates
   - Verify no "cliff" in portfolio value at split
   - Expected: Smooth equity curve across split

2. **Option MTM Stability Test**
   - Check for "sawtooth" pattern (sharp up/down flips)
   - Daily returns should not show ≥20% swings on adjacent days
   - Expected: Smooth option valuation

3. **Data Source Parity Test**
   - Run same strategy on multiple data sources (Yahoo vs ThetaData)
   - Results should be within 5-10% of each other
   - Expected: "Close-ish" parity

4. **Zero-Price Data Test**
   - Verify filtering of corrupt data (all-zero OHLC)
   - Expected: No `ZeroDivisionError` crashes

### Phase 2: Forward Testing (Paper Trading)

**Duration:** Minimum 7-14 days in real market conditions

**Implementation Pattern:**

```typescript
// Paper trading execution (CypherScoping pattern)
export class TradingExecutorAgent {
  async executePaperOrder(signal: Signal): Promise<PaperOrder> {
    // Simulate order execution with real market data
    const marketPrice = await this.getRealtimePrice(signal.symbol);

    const order: PaperOrder = {
      id: this.generateOrderId(),
      symbol: signal.symbol,
      side: signal.side,
      quantity: this.calculateQuantity(signal),
      price: marketPrice,
      timestamp: new Date(),
      mode: 'paper',
      status: 'filled'  // Paper orders fill instantly at market
    };

    // Log to paper trading journal
    await this.logPaperTrade(order);

    // Track in memory (not sent to exchange)
    this.paperPositions.set(signal.symbol, order);

    return order;
  }
}
```

**Paper Trading Safety Checks:**

```typescript
// Idempotency protection (prevent duplicate orders)
export class IdempotencyStore {
  private store: Map<string, { timestamp: number, result: any }> = new Map();

  async executeOnce(key: string, fn: () => Promise<any>, ttlMs: number = 300000): Promise<any> {
    const hash = this.hashKey(key);
    const existing = this.store.get(hash);

    if (existing && Date.now() - existing.timestamp < ttlMs) {
      console.log(`[Idempotency] Skipping duplicate: ${key}`);
      return existing.result;
    }

    const result = await fn();
    this.store.set(hash, { timestamp: Date.now(), result });
    return result;
  }

  private hashKey(key: string): string {
    return require('crypto').createHash('sha256').update(key).digest('hex');
  }
}
```

**Audit Logging Pattern:**

```typescript
// JSONL format with correlation IDs
export class AuditLogger {
  log(event: string, data: any, correlationId?: string) {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      correlationId: correlationId || this.generateCorrelationId(),
      mode: process.env.TRADING_MODE,
      data
    };

    // Append to JSONL file
    fs.appendFileSync(
      'runtime/audit.log',
      JSON.stringify(entry) + '\n'
    );
  }
}
```

### Phase 3: Limited Live Trading

**Duration:** 1-2 weeks with restricted capital

**Implementation:**

```typescript
// Position size limits for limited live
const LIVE_LIMITS = {
  maxPositionSize: 0.05,  // 5% of portfolio per position
  maxTotalExposure: 0.30,  // 30% max total exposure
  maxDailyTrades: 10,
  maxLossPerDay: 0.02  // 2% daily loss limit
};

export class RiskManagementAgent {
  async validateLiveTrade(signal: Signal): Promise<boolean> {
    if (process.env.TRADING_MODE !== 'live') return true;

    const currentExposure = await this.calculateExposure();
    const positionSize = this.calculatePositionSize(signal);

    if (positionSize > LIVE_LIMITS.maxPositionSize) {
      console.warn('[Risk] Position size exceeds limit');
      return false;
    }

    if (currentExposure + positionSize > LIVE_LIMITS.maxTotalExposure) {
      console.warn('[Risk] Total exposure exceeds limit');
      return false;
    }

    const dailyLoss = await this.getDailyLoss();
    if (dailyLoss < -LIVE_LIMITS.maxLossPerDay) {
      console.warn('[Risk] Daily loss limit exceeded');
      return false;
    }

    return true;
  }
}
```

### Phase 4: Full Production

**Only after:**
- Backtest shows consistent profitability (100+ trades)
- Paper trading validates strategy in real conditions (7-14 days)
- Limited live proves system stability (1-2 weeks)
- All safety checks pass

---

## Backtesting Data Source Integration Patterns

### Pattern 1: Environment-Driven Selection (LumiBot)

```python
# _strategy.py (line ~1466)
def backtest(self, datasource_class=None, **kwargs):
    # Environment variable OVERRIDES explicit class
    env_source = os.getenv('BACKTESTING_DATA_SOURCE')

    if env_source and env_source != 'none':
        datasource_class = self._resolve_source(env_source)

    # Instantiate data source
    data_source = datasource_class(config=self.config)

    # Run backtest with selected source
    return self._run_backtest(data_source, **kwargs)
```

### Pattern 2: Adapter Layer (CypherScoping)

```typescript
// Abstract data source interface
export interface DataSource {
  fetchOHLCV(symbol: string, timeframe: string, start: Date, end: Date): Promise<OHLCV[]>;
  fetchRealtimePrice(symbol: string): Promise<number>;
}

// KuCoin adapter
export class KuCoinDataSource implements DataSource {
  async fetchOHLCV(symbol: string, timeframe: string, start: Date, end: Date): Promise<OHLCV[]> {
    // Implement KuCoin API calls
    const response = await this.client.getKlines(symbol, timeframe, start, end);
    return this.normalizeOHLCV(response);
  }

  private normalizeOHLCV(raw: any[]): OHLCV[] {
    return raw.map(candle => ({
      timestamp: new Date(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));
  }
}

// Yahoo Finance adapter
export class YahooDataSource implements DataSource {
  async fetchOHLCV(symbol: string, timeframe: string, start: Date, end: Date): Promise<OHLCV[]> {
    // Implement Yahoo Finance calls
    const data = await yahooFinance.historical({
      symbol,
      from: start,
      to: end,
      period: timeframe
    });

    return this.normalizeOHLCV(data);
  }
}
```

### Pattern 3: Caching Layer (Performance)

```typescript
// S3/Local cache pattern (from LumiBot)
export class BacktestCache {
  private cacheDir = path.join(os.homedir(), '.cache', 'trading-bot');

  async getCachedData(key: string): Promise<OHLCV[] | null> {
    const cacheFile = path.join(this.cacheDir, `${key}.parquet`);

    if (!fs.existsSync(cacheFile)) return null;

    // Load from cache
    const cached = await this.readParquet(cacheFile);

    // Validate cache freshness
    const cacheAge = Date.now() - fs.statSync(cacheFile).mtimeMs;
    if (cacheAge > 24 * 60 * 60 * 1000) {  // 24 hours
      console.log('[Cache] Stale data, refetching');
      return null;
    }

    return cached;
  }

  async setCachedData(key: string, data: OHLCV[]): Promise<void> {
    const cacheFile = path.join(this.cacheDir, `${key}.parquet`);
    await this.writeParquet(cacheFile, data);
  }
}
```

### Pattern 4: Split/Dividend Adjustment

```typescript
// Corporate actions handling (critical for accurate backtests)
export class CorporateActionsHandler {
  async applySplitAdjustments(data: OHLCV[], symbol: string): Promise<OHLCV[]> {
    // Fetch split history
    const splits = await this.getSplitHistory(symbol);

    // Apply adjustments in reverse chronological order
    let adjusted = [...data];
    for (const split of splits.reverse()) {
      adjusted = this.applySplit(adjusted, split);
    }

    return adjusted;
  }

  private applySplit(data: OHLCV[], split: Split): OHLCV[] {
    const ratio = split.ratio;  // e.g., 2 for 2:1 split

    return data.map(candle => {
      if (candle.timestamp < split.date) {
        // Adjust pre-split prices
        return {
          ...candle,
          open: candle.open / ratio,
          high: candle.high / ratio,
          low: candle.low / ratio,
          close: candle.close / ratio,
          volume: candle.volume * ratio
        };
      }
      return candle;
    });
  }

  async applyDividendAdjustments(data: OHLCV[], symbol: string): Promise<OHLCV[]> {
    // Note: Some sources (Yahoo) return dividend-adjusted prices
    // Others (ThetaData) return raw prices + dividend events
    // Choose ONE approach - do not double-count
    const dividends = await this.getDividendHistory(symbol);

    // For cash-dividend model: do NOT adjust prices, just credit cash
    // For total-return model: adjust prices backward from dividend dates

    return data;  // CypherScoping uses cash-dividend model
  }
}
```

---

## Mock Data Generation for Testing

### Pattern 1: Deterministic Random Data

```typescript
// Reproducible test data with seed
export class MockDataGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 12345) {
    this.rng = new SeededRandom(seed);
  }

  generateOHLCV(
    basePrice: number,
    count: number,
    volatility: number = 0.02
  ): OHLCV[] {
    const data: OHLCV[] = [];
    let currentPrice = basePrice;

    for (let i = 0; i < count; i++) {
      const change = this.rng.nextGaussian() * volatility;
      const open = currentPrice;
      const close = open * (1 + change);
      const high = Math.max(open, close) * (1 + Math.abs(this.rng.next()) * 0.01);
      const low = Math.min(open, close) * (1 - Math.abs(this.rng.next()) * 0.01);
      const volume = 1000000 + this.rng.next() * 500000;

      data.push({
        timestamp: new Date(Date.now() + i * 60000),  // 1-minute bars
        open,
        high,
        low,
        close,
        volume
      });

      currentPrice = close;
    }

    return data;
  }
}

// Seeded RNG for reproducibility
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }

  nextGaussian(): number {
    // Box-Muller transform
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}
```

### Pattern 2: Scenario-Based Testing

```typescript
// Generate specific market conditions for testing
export class ScenarioGenerator {
  generateTrendingMarket(direction: 'up' | 'down', days: number): OHLCV[] {
    const basePrice = 100;
    const dailyChange = direction === 'up' ? 0.01 : -0.01;

    const data: OHLCV[] = [];
    let currentPrice = basePrice;

    for (let i = 0; i < days; i++) {
      // Add some noise to the trend
      const noise = (Math.random() - 0.5) * 0.005;
      const change = dailyChange + noise;

      data.push({
        timestamp: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
        open: currentPrice,
        high: currentPrice * (1 + Math.abs(change) * 1.5),
        low: currentPrice * (1 - Math.abs(change) * 1.5),
        close: currentPrice * (1 + change),
        volume: 1000000
      });

      currentPrice *= (1 + change);
    }

    return data;
  }

  generateVolatileMarket(days: number, volatility: number = 0.05): OHLCV[] {
    const basePrice = 100;
    const data: OHLCV[] = [];
    let currentPrice = basePrice;

    for (let i = 0; i < days; i++) {
      const change = (Math.random() - 0.5) * 2 * volatility;

      data.push({
        timestamp: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
        open: currentPrice,
        high: currentPrice * (1 + Math.abs(change) * 1.2),
        low: currentPrice * (1 - Math.abs(change) * 1.2),
        close: currentPrice * (1 + change),
        volume: 1000000
      });

      currentPrice *= (1 + change);
    }

    return data;
  }

  generateRangeMarket(days: number, rangePercent: number = 0.10): OHLCV[] {
    const basePrice = 100;
    const upperBound = basePrice * (1 + rangePercent);
    const lowerBound = basePrice * (1 - rangePercent);

    const data: OHLCV[] = [];
    let currentPrice = basePrice;

    for (let i = 0; i < days; i++) {
      // Bounce between range bounds
      let targetPrice: number;
      if (currentPrice >= upperBound) {
        targetPrice = currentPrice * (1 - Math.random() * rangePercent);
      } else if (currentPrice <= lowerBound) {
        targetPrice = currentPrice * (1 + Math.random() * rangePercent);
      } else {
        targetPrice = currentPrice * (1 + (Math.random() - 0.5) * rangePercent);
      }

      data.push({
        timestamp: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
        open: currentPrice,
        high: Math.max(currentPrice, targetPrice) * 1.01,
        low: Math.min(currentPrice, targetPrice) * 0.99,
        close: targetPrice,
        volume: 1000000
      });

      currentPrice = targetPrice;
    }

    return data;
  }
}
```

### Pattern 3: Real Market Data Sampling

```typescript
// Sample from historical data for realistic tests
export class HistoricalSampler {
  async samplePeriod(
    symbol: string,
    startDate: Date,
    endDate: Date,
    dataSource: DataSource
  ): Promise<OHLCV[]> {
    // Fetch real historical data
    const data = await dataSource.fetchOHLCV(symbol, '1d', startDate, endDate);

    // Cache for repeated use in tests
    await this.cacheTestData(symbol, data);

    return data;
  }

  async sampleVolatileEvents(symbol: string): Promise<OHLCV[]> {
    // Sample periods around known volatile events
    const events = [
      { start: new Date('2020-03-01'), end: new Date('2020-04-01') },  // COVID crash
      { start: new Date('2022-06-01'), end: new Date('2022-07-01') },  // Bear market
    ];

    const samples: OHLCV[] = [];
    for (const event of events) {
      const data = await this.samplePeriod(symbol, event.start, event.end, new YahooDataSource());
      samples.push(...data);
    }

    return samples;
  }
}
```

---

## Safety Checks Before Going Live

### Pre-Deployment Checklist

```typescript
// Automated safety validation
export class PreDeploymentValidator {
  async runAllChecks(): Promise<ValidationResult> {
    const results: ValidationResult = {
      passed: [],
      failed: [],
      warnings: []
    };

    // 1. Environment validation
    await this.validateEnvironment(results);

    // 2. API connectivity
    await this.validateAPIConnectivity(results);

    // 3. Trading mode verification
    await this.validateTradingMode(results);

    // 4. Risk limits
    await this.validateRiskLimits(results);

    // 5. Symbol policy
    await this.validateSymbolPolicy(results);

    // 6. Paper trading results
    await this.validatePaperResults(results);

    // 7. Idempotency protection
    await this.validateIdempotency(results);

    // 8. Audit logging
    await this.validateAuditLog(results);

    return results;
  }

  private async validateEnvironment(results: ValidationResult) {
    const required = [
      'KUCOIN_API_KEY',
      'KUCOIN_API_SECRET',
      'KUCOIN_API_PASSPHRASE',
      'TRADING_MODE',
      'TRADING_UNIVERSE',
      'DEFAULT_SYMBOL'
    ];

    for (const key of required) {
      if (!process.env[key]) {
        results.failed.push(`Missing required env var: ${key}`);
      } else {
        results.passed.push(`Environment variable ${key} set`);
      }
    }
  }

  private async validateAPIConnectivity(results: ValidationResult) {
    try {
      // Test API connection
      const client = new KuCoinClient();
      const account = await client.getAccountOverview();

      results.passed.push('API connectivity verified');

      // Check account balance
      if (parseFloat(account.availableBalance) < 10) {
        results.warnings.push('Low account balance (< $10)');
      }
    } catch (error) {
      results.failed.push(`API connectivity failed: ${error.message}`);
    }
  }

  private async validateTradingMode(results: ValidationResult) {
    const mode = process.env.TRADING_MODE;

    if (mode === 'live') {
      results.warnings.push('TRADING_MODE is set to LIVE - ensure this is intentional');
    } else if (mode === 'paper') {
      results.passed.push('TRADING_MODE correctly set to paper');
    } else {
      results.failed.push('TRADING_MODE must be "paper" or "live"');
    }
  }

  private async validateRiskLimits(results: ValidationResult) {
    // Verify risk management configuration
    const config = {
      maxPositionSize: process.env.MAX_POSITION_SIZE,
      maxDrawdown: process.env.MAX_DRAWDOWN,
      maxDailyLoss: process.env.MAX_DAILY_LOSS
    };

    for (const [key, value] of Object.entries(config)) {
      if (!value) {
        results.failed.push(`Missing risk limit: ${key}`);
      } else {
        results.passed.push(`Risk limit ${key} configured`);
      }
    }
  }

  private async validateSymbolPolicy(results: ValidationResult) {
    const universe = process.env.TRADING_UNIVERSE?.split(',') || [];
    const denylist = process.env.DENYLIST_SYMBOLS?.split(',') || [];

    if (universe.length === 0) {
      results.failed.push('TRADING_UNIVERSE is empty');
    } else {
      results.passed.push(`TRADING_UNIVERSE contains ${universe.length} symbols`);
    }

    // Check for BTC in universe (should be denied)
    const btcVariants = ['BTC', 'BTCUSDT', 'BTCUSDTM', 'XBT'];
    const hasBTC = universe.some(s => btcVariants.includes(s.toUpperCase()));

    if (hasBTC && !denylist.some(s => btcVariants.includes(s.toUpperCase()))) {
      results.warnings.push('BTC detected in universe but not in denylist');
    }
  }

  private async validatePaperResults(results: ValidationResult) {
    // Load paper trading results
    const auditLog = fs.readFileSync('runtime/audit.log', 'utf-8');
    const entries = auditLog.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));

    const paperTrades = entries.filter(e => e.mode === 'paper' && e.event === 'trade_executed');

    if (paperTrades.length < 10) {
      results.failed.push('Insufficient paper trades (< 10) - run more paper trading');
    } else {
      results.passed.push(`${paperTrades.length} paper trades executed`);

      // Calculate paper win rate
      const wins = paperTrades.filter(t => t.data.pnl > 0).length;
      const winRate = wins / paperTrades.length;

      if (winRate < 0.4) {
        results.failed.push(`Paper trading win rate too low: ${(winRate * 100).toFixed(1)}%`);
      } else {
        results.passed.push(`Paper trading win rate: ${(winRate * 100).toFixed(1)}%`);
      }
    }
  }

  private async validateIdempotency(results: ValidationResult) {
    // Check if idempotency store is enabled
    const storeExists = fs.existsSync('runtime/idempotency-store.json');

    if (storeExists) {
      results.passed.push('Idempotency store configured');
    } else {
      results.failed.push('Idempotency store not initialized');
    }
  }

  private async validateAuditLog(results: ValidationResult) {
    const logPath = 'runtime/audit.log';

    if (fs.existsSync(logPath)) {
      results.passed.push('Audit logging enabled');

      // Check for recent entries
      const auditLog = fs.readFileSync(logPath, 'utf-8');
      const entries = auditLog.split('\n').filter(l => l.trim());
      const lastEntry = entries[entries.length - 1];

      if (lastEntry) {
        const last = JSON.parse(lastEntry);
        const age = Date.now() - new Date(last.timestamp).getTime();

        if (age > 24 * 60 * 60 * 1000) {
          results.warnings.push('Audit log has no recent entries (> 24h)');
        }
      }
    } else {
      results.failed.push('Audit log not configured');
    }
  }
}

interface ValidationResult {
  passed: string[];
  failed: string[];
  warnings: string[];
}
```

### Critical Safety Rules

**From LumiBot Production Experience:**

1. **Never Skip Backtesting**
   - Minimum 100+ trades across multiple market conditions
   - Test split handling, option MTM, dividend events
   - Validate against multiple data sources

2. **Paper Trade for Minimum 7 Days**
   - Real market conditions expose edge cases
   - Verify order execution, risk limits, position sizing
   - Monitor for duplicate orders, API errors

3. **Start Live with Limited Capital**
   - Use 5-10% of total capital initially
   - Monitor for 1-2 weeks before increasing
   - Set strict daily loss limits (2% max)

4. **Implement Circuit Breakers**
   - Max daily loss (2%)
   - Max drawdown (20%)
   - Max position size (5% per symbol)
   - Max total exposure (30%)

5. **Audit Everything**
   - Log all trades with correlation IDs
   - Track mode (paper/live) in every log entry
   - Monitor for idempotency violations

6. **Symbol Policy Enforcement**
   - Maintain allowed/denied symbol lists
   - Canonicalize symbols before validation
   - Reject trades outside approved universe

7. **Idempotency Protection**
   - Hash order parameters to detect duplicates
   - 5-minute TTL for duplicate detection
   - Never retry failed orders without investigation

---

## Success Criteria

### Backtest Phase
- [ ] 100+ trades executed
- [ ] Win rate ≥ 50%
- [ ] Sharpe ratio ≥ 1.5
- [ ] Max drawdown ≤ 20%
- [ ] Profit factor ≥ 1.5
- [ ] No split-handling errors
- [ ] Smooth equity curve (no sawtooth)
- [ ] Multi-source parity within 10%

### Paper Trading Phase
- [ ] 7+ days of continuous operation
- [ ] 20+ trades executed
- [ ] Win rate matches backtest ± 10%
- [ ] No duplicate orders
- [ ] No API errors
- [ ] Risk limits respected
- [ ] Audit log complete

### Limited Live Phase
- [ ] 1-2 weeks of operation
- [ ] Position sizes ≤ 5% of portfolio
- [ ] Total exposure ≤ 30%
- [ ] Daily loss ≤ 2%
- [ ] All circuit breakers functional
- [ ] Monitoring/alerting operational

### Full Production
- [ ] All previous phases completed successfully
- [ ] Pre-deployment validation passes
- [ ] Monitoring dashboard operational
- [ ] Alerting configured (email/SMS)
- [ ] Runbook documented
- [ ] Incident response plan ready

---

## Common Pitfalls

### 1. Split/Dividend Handling
**Symptom:** Impossible returns (e.g., 81% vs expected 56%)
**Cause:** Multiple application of split adjustments
**Fix:** Add idempotency marker (`_split_adjusted` column)

### 2. Option MTM Sawtooth
**Symptom:** Sharp up/down flips in portfolio value
**Cause:** Intermittent missing bid/ask data
**Fix:** Preserve quote columns across session gaps, forward-fill when unpriceable

### 3. Zero-Price Data
**Symptom:** `ZeroDivisionError` crashes
**Cause:** Corrupt data with all-zero OHLC
**Fix:** Filter rows where all OHLC == 0

### 4. Lookahead Bias
**Symptom:** Unrealistic backtest performance
**Cause:** Daily bars timestamped before market close
**Fix:** Align daily bars to market close time (16:00 ET)

### 5. Duplicate Orders
**Symptom:** Same order executed multiple times
**Cause:** Retries without idempotency
**Fix:** Hash order parameters, track for 5-minute TTL

### 6. Data Source Mismatch
**Symptom:** Large performance variance between backtest and live
**Cause:** Different data sources (Yahoo vs exchange API)
**Fix:** Paper trade with same data source as live

---

## References

**Extracted from:**
- `/home/nygmaee/Desktop/algo_ai_trading_docs_20260218/BACKTESTING_ARCHITECTURE_1.md`
- `/home/nygmaee/Desktop/valuable_crypto_bot_docs_20260218/BOT_PRODUCTION_REFERENCE_GUIDE.md`

**Related CypherScoping Files:**
- `cypherscoping-agent/src/agents/trading-executor-agent.ts` - Paper/live mode switching
- `cypherscoping-agent/src/core/idempotency-store.ts` - Duplicate prevention
- `cypherscoping-agent/src/core/audit-logger.ts` - Audit logging
- `cypherscoping-agent/test/trading-executor.safety.test.ts` - Safety validation tests

**Key Patterns:**
- Environment-driven data source selection
- Idempotency protection via hash-based deduplication
- Audit logging with correlation IDs
- Pre-deployment validation checklist
- Scenario-based mock data generation
