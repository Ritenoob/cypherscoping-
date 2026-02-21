# Symbol Policy & Trading Rules

Trading universe configuration and symbol validation.

## Policy Configuration

**File:** `cypherscoping-agent/src/config/symbol-policy.ts`

```typescript
// Environment variables
TRADING_UNIVERSE=ETHUSDTM,SOLUSDTM,XRPUSDTM  // Allowed symbols (CSV)
DENYLIST_SYMBOLS=BTC/USDT,BTCUSDT,BTCUSDTM   // Blocked symbols (CSV)
DEFAULT_SYMBOL=ETHUSDTM                       // Fallback symbol
```

## BTC Denylist Policy

**Critical:** Bitcoin (BTC/XBT) is explicitly forbidden from trading.

**Blocked variants:**
- `BTC/USDT`, `BTCUSDT`, `BTCUSDTM`
- `XBT/USDT`, `XBTUSDT`, `XBTUSDTM`

**Reason:** Risk management policy - Bitcoin excluded from trading universe.

## Symbol Canonicalization

All symbols are normalized before validation:

```typescript
// Input variations → Canonical form
"btc/usdt"  → "BTCUSDT"  → DENIED
"ETH-USDT"  → "ETHUSDTM"
"eth_usdt"  → "ETHUSDTM"
"ETHUSDTM"  → "ETHUSDTM"
```

**Rules:**
1. Uppercase all input
2. Replace `-_:/` with `/`
3. Strip whitespace
4. Remove `/` for compact form
5. Map BTC/XBT aliases to `BTCUSDT`
6. Check denylist (canonicalized)
7. Check allowlist (canonicalized)

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `E_SYMBOL_DENIED` | Symbol in denylist | Reject trade |
| `E_SYMBOL_NOT_ALLOWED` | Symbol not in universe | Reject trade |
| `E_UNIVERSE_EMPTY` | No allowed symbols | Fix configuration |

## Enforcement Points

Policy checked at:
1. **Orchestrator** - `analyze()` and `directTrade()` paths
2. **Trading Executor** - `execute()` and `executeDirectTrade()`
3. **Coin Screener** - Symbol normalization during scan

**All rejections logged to audit log with correlation ID.**

## Default Trading Universe

```typescript
const DEFAULT = [
  'ETHUSDTM', 'SOLUSDTM', 'XRPUSDTM',
  'ADAUSDTM', 'DOGEUSDTM', 'MATICUSDTM',
  'LINKUSDTM', 'AVAXUSDTM', 'DOTUSDTM',
  'UNIUSDTM', 'ATOMUSDTM', 'LTCUSDTM',
  'BCHUSDTM', 'ETCUSDTM'
];
```

## Validation

```bash
# Test symbol policy
npm run policy:check

# Verify in logs
cat cypherscoping-agent/runtime/audit.log | grep policy_rejection
```
