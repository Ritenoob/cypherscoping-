# Quick Start Checklist - Immediate Actions
**Created:** 2026-02-21
**Goal:** Fix 3 CRITICAL issues and complete TypeScript system production readiness
**Total Time:** 4-6 hours
**Current Status:** TypeScript system 95% complete → Target: 100% production-ready

---

## 🚨 CRITICAL FIXES (Must Complete Before Production)

### ☐ Task 1: Fix Batch Error Handling (15 minutes)
**File:** `cypherscoping-agent/src/agents/coin-screener-agent.ts`
**Line:** 191-197
**Issue:** One failed symbol scan crashes entire batch

**Current Code:**
```typescript
const batchResults = await Promise.all(
  batch.map((symbol) => this.scanSymbol(symbol))
);
for (const result of batchResults) {
  if (result) results.push(result);
}
```

**Fix:**
```typescript
const batchResults = await Promise.allSettled(
  batch.map((symbol) => this.scanSymbol(symbol))
);
for (const result of batchResults) {
  if (result.status === 'fulfilled' && result.value) {
    results.push(result.value);
  } else if (result.status === 'rejected') {
    console.error(`[CoinScreener] Batch scan failed:`, result.reason);
  }
}
```

**Verify:**
```bash
cd cypherscoping-agent
npm run build
npm test
```

**Expected:** Build succeeds, tests pass
**Status:** ☐ Not Started / ☐ In Progress / ☐ Complete

---

### ☐ Task 2: Add Credentials Validation (10 minutes)
**File:** `cypherscoping-agent/src/agents/coin-screener-agent.ts`
**Line:** 170
**Issue:** Live mode may start without valid API credentials

**Current Code:**
```typescript
if (mode === 'live') {
  if (simulationEnabled) {
    throw new Error('Invalid configuration: live mode cannot use simulated market data');
  }
  return new KucoinPerpDataProvider();  // ⚠️ No credential check
}
```

**Fix:**
```typescript
if (mode === 'live') {
  if (simulationEnabled) {
    throw new Error('Invalid configuration: live mode cannot use simulated market data');
  }
  if (!process.env.KUCOIN_API_KEY || !process.env.KUCOIN_API_SECRET) {
    throw new Error('E_MISSING_CREDENTIALS: Live mode requires KUCOIN_API_KEY and KUCOIN_API_SECRET');
  }
  return new KucoinPerpDataProvider();
}
```

**Verify:**
```bash
# Test without credentials
unset KUCOIN_API_KEY KUCOIN_API_SECRET
TRADING_MODE=live npm run cli -- --scan 2>&1 | grep E_MISSING_CREDENTIALS
# Should output error message

# Test with credentials (use testnet)
export KUCOIN_API_KEY="your-testnet-key"
export KUCOIN_API_SECRET="your-testnet-secret"
TRADING_MODE=paper npm run cli -- --scan
# Should work
```

**Expected:** Error thrown when credentials missing, works with valid credentials
**Status:** ☐ Not Started / ☐ In Progress / ☐ Complete

---

### ☐ Task 3: Implement Rate Limiting (30 minutes)
**File:** `cypherscoping-agent/src/agents/coin-screener-agent.ts`
**Line:** 487-500
**Issue:** No rate limiting will trigger KuCoin API bans (30 req/3sec limit)

**Step 3a: Install dependency**
```bash
cd cypherscoping-agent
npm install p-limit
npm install --save-dev @types/p-limit
```

**Step 3b: Update KucoinPerpDataProvider**
```typescript
import pLimit from 'p-limit';

class KucoinPerpDataProvider implements MarketDataProvider {
  private readonly client: AxiosInstance;
  private readonly rateLimiter = pLimit(3);  // Max 3 concurrent requests

  constructor() {
    this.client = axios.create({
      baseURL: process.env.KUCOIN_API_BASE_URL || 'https://api-futures.kucoin.com',
      timeout: 10000
    });
  }

  async connect(): Promise<void> {
    await this.client.get('/api/v1/timestamp');
  }

  async disconnect(): Promise<void> {
    // Cleanup if needed
  }

  isMock(): boolean {
    return false;
  }

  async fetch(symbol: string, timeframe: string, limit: number): Promise<MarketData | null> {
    return this.rateLimiter(async () => {
      try {
        const granularity = this.parseTimeframe(timeframe);
        const response = await this.client.get('/api/v1/kline/query', {
          params: { symbol, granularity, limit }
        });
        return this.transformResponse(response.data);
      } catch (error) {
        console.error(`[KucoinPerp] Failed to fetch ${symbol}:`, (error as Error).message);
        return null;
      }
    });
  }

  private parseTimeframe(timeframe: string): number {
    const map: Record<string, number> = {
      '5min': 5,
      '15min': 15,
      '30min': 30,
      '1hour': 60,
      '2hour': 120,
      '4hour': 240
    };
    return map[timeframe] || 30;
  }

  private transformResponse(data: any): MarketData {
    // Transform KuCoin response to MarketData format
    const ohlcv = data.map((candle: any) => ({
      timestamp: candle[0] * 1000,
      open: parseFloat(candle[1]),
      close: parseFloat(candle[2]),
      high: parseFloat(candle[3]),
      low: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));
    return { ohlcv, orderBook: null, tradeFlow: null };
  }
}
```

**Verify:**
```bash
cd cypherscoping-agent
npm run build
npm test

# Test rate limiting with actual API calls
TRADING_MODE=paper npm run cli -- --scan
# Monitor network tab - should see max 3 concurrent requests
```

**Expected:** Build succeeds, rate limiting prevents >3 concurrent requests
**Status:** ☐ Not Started / ☐ In Progress / ☐ Complete

---

## 🔧 ADDITIONAL SETUP (Optional but Recommended)

### ☐ Task 4: Create .env File (5 minutes)
**File:** `cypherscoping-agent/.env`
**Purpose:** Configuration for testing

```bash
# Trading Mode
TRADING_MODE=paper
SIMULATION=true

# KuCoin API (Testnet)
KUCOIN_API_KEY=your-testnet-key-here
KUCOIN_API_SECRET=your-testnet-secret-here
KUCOIN_API_BASE_URL=https://api-sandbox-futures.kucoin.com

# Symbol Policy
TRADING_UNIVERSE=ETHUSDTM,SOLUSDTM,XRPUSDTM,ADAUSDTM
DENYLIST_SYMBOLS=BTC/USDT,BTCUSDT,BTCUSDTM,XBTUSDTM
DEFAULT_SYMBOL=ETHUSDTM

# Risk Parameters
MAX_EXPOSURE_RATIO=0.8
MAX_RISK_PER_TRADE=0.02
MIN_POSITION_SIZE=0.01

# Paths
AUDIT_LOG_PATH=runtime/audit.log
IDEMPOTENCY_STORE_PATH=runtime/idempotency-store.json
```

**Verify:**
```bash
cat cypherscoping-agent/.env | grep TRADING_MODE
```

**Expected:** File created with paper mode defaults
**Status:** ☐ Not Started / ☐ In Progress / ☐ Complete

---

### ☐ Task 5: Add Rate Limiting Tests (15 minutes)
**File:** `cypherscoping-agent/test/rate-limiting.test.ts`
**Purpose:** Verify rate limiter works correctly

```typescript
import pLimit from 'p-limit';

describe('Rate Limiting', () => {
  it('should limit concurrent API calls', async () => {
    const limiter = pLimit(3);
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const mockApiCall = async (id: number) => {
      return limiter(async () => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise(resolve => setTimeout(resolve, 50));
        concurrentCount--;
        return id;
      });
    };

    // Launch 10 concurrent calls
    const promises = Array.from({ length: 10 }, (_, i) => mockApiCall(i));
    await Promise.all(promises);

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });
});
```

**Verify:**
```bash
cd cypherscoping-agent
npm test -- rate-limiting
```

**Expected:** Test passes, max concurrent ≤ 3
**Status:** ☐ Not Started / ☐ In Progress / ☐ Complete

---

## ✅ VERIFICATION CHECKLIST

After completing Tasks 1-3, run full verification:

### ☐ Build Verification
```bash
cd cypherscoping-agent
npm run build
```
**Expected:** ✅ No compilation errors

### ☐ Test Verification
```bash
npm test
```
**Expected:** ✅ 26/26 tests passing (or more if you added tests)

### ☐ Type Check
```bash
npm run typecheck
```
**Expected:** ✅ No type errors

### ☐ Policy Check
```bash
cd ..
npm run policy:check
```
**Expected:** ✅ Symbol policy valid

### ☐ Smoke Test
```bash
cd cypherscoping-agent
TRADING_MODE=paper npm run cli -- --scan
```
**Expected:** ✅ Scans market without errors

### ☐ Code Review Issues
```bash
# Verify all 3 HIGH-priority fixes applied
grep -n "Promise.allSettled" cypherscoping-agent/src/agents/coin-screener-agent.ts
grep -n "E_MISSING_CREDENTIALS" cypherscoping-agent/src/agents/coin-screener-agent.ts
grep -n "pLimit" cypherscoping-agent/src/agents/coin-screener-agent.ts
```
**Expected:** ✅ All 3 patterns found in code

---

## 📝 COMMIT & PUSH

### ☐ Commit Changes
```bash
git add cypherscoping-agent/
git commit -m "fix: resolve 3 HIGH-priority code review issues

- Fix batch error handling with Promise.allSettled
- Add credentials validation for live mode
- Implement rate limiting (max 3 concurrent requests)

Resolves: batch crashes, silent failures, API rate limits
Tests: 26/26 passing
Status: Production-ready for paper trading"
```

### ☐ Push to Remote
```bash
git push origin debug/type-fixes
```

---

## 🎯 SUCCESS CRITERIA

**You're ready for production testing when:**

- ✅ All 3 HIGH-priority fixes completed
- ✅ TypeScript compiles without errors
- ✅ All tests passing (26+)
- ✅ Paper mode scan works
- ✅ Credentials validation prevents live mode without keys
- ✅ Rate limiting prevents API overload
- ✅ Changes committed and pushed

**Current Progress:** ☐☐☐☐☐☐ (0/6)

---

## 📞 QUICK REFERENCE

### File Locations
- **Main file to edit:** `cypherscoping-agent/src/agents/coin-screener-agent.ts`
- **Tests:** `cypherscoping-agent/test/`
- **Package.json:** `cypherscoping-agent/package.json`

### Commands
```bash
# Build
cd cypherscoping-agent && npm run build

# Test
npm test

# Type check
npm run typecheck

# Scan market
TRADING_MODE=paper npm run cli -- --scan

# Full verification
npm run build && npm test && npm run typecheck
```

### Time Estimates
- Task 1: 15 minutes
- Task 2: 10 minutes
- Task 3: 30 minutes
- Task 4: 5 minutes (optional)
- Task 5: 15 minutes (optional)
- Verification: 10 minutes
- **Total:** 1-1.5 hours (core) or 1.5-2 hours (with optional)

---

## 🚀 AFTER COMPLETION

Once all tasks complete:

1. **Update status in continuation analysis:**
   ```bash
   # Edit CODEX_CONTINUATION_ANALYSIS.md
   # Change: "3 HIGH-priority issues" → "✅ All HIGH-priority issues resolved"
   ```

2. **Run 100+ paper trades for validation:**
   ```bash
   npm run paper:forward
   ```

3. **Monitor for 24 hours** before considering live mode

4. **Share fixes with team:**
   ```bash
   # Via Team Vault
   /vault
   ```

---

**Start Time:** __________
**End Time:** __________
**Total Duration:** __________
**Status:** ☐ Not Started / ☐ In Progress / ☐ Complete

---

**Print this checklist or keep it open while working.**
**Check off each item as you complete it.**
**Estimated completion: 1-2 hours of focused work.**

✅ **You've got this!**
