# Trading Bot Truth Documents - Mathematical Invariants & Formulas

## SECTION 1: ABSOLUTE INVARIANTS (NEVER VIOLATE)

These invariants are NON-NEGOTIABLE. Violation triggers EMERGENCY_STOP.

### 1.1 Financial Safety Invariants

```typescript
// I-001: Position size must never exceed max allocation
ASSERT: positionNotional <= balance * MAX_POSITION_PERCENT / 100

// I-002: Total exposure must never exceed balance
ASSERT: totalExposure <= balance * MAX_TOTAL_EXPOSURE / 100

// I-003: Leverage must be within bounds
ASSERT: leverage >= MIN_LEVERAGE && leverage <= MAX_LEVERAGE

// I-004: Stop loss must exist for every position
ASSERT: position.stopLossOrderId !== null

// I-005: Liquidation buffer must be maintained
ASSERT: |currentPrice - liquidationPrice| / currentPrice >= MIN_LIQUIDATION_BUFFER

// I-006: Daily drawdown limit
ASSERT: dailyPnL / startOfDayBalance >= -MAX_DAILY_DRAWDOWN

// I-007: Never use withdrawal permissions
ASSERT: !apiPermissions.includes('withdrawal')
```

### 1.2 System Safety Invariants

```typescript
// I-008: WebSocket must be connected for live trading
ASSERT: mode === 'paper' || wsConnected === true

// I-009: Heartbeat must be recent
ASSERT: Date.now() - lastHeartbeat < HEARTBEAT_TIMEOUT_MS

// I-010: Rate limits must be respected
ASSERT: requestsInWindow <= MAX_REQUESTS_PER_WINDOW

// I-011: Order book data must be fresh
ASSERT: Date.now() - orderBookTimestamp < MAX_ORDERBOOK_AGE_MS

// I-012: Candle data must be sufficient
ASSERT: candleBuffer.length >= MIN_CANDLES_FOR_INDICATORS
```

---

## SECTION 2: CORE FORMULAS (Decimal.js Required)

All financial calculations MUST use Decimal.js to avoid floating-point errors.

### 2.1 Position Sizing

```javascript
// F-001: Position Size Calculation
function calculatePositionSize(balance, positionPercent, price, leverage, multiplier, lotSize) {
  const D = Decimal;
  const notional = new D(balance).mul(positionPercent).div(100);
  const rawSize = notional.mul(leverage).div(price).div(multiplier);
  const size = rawSize.div(lotSize).floor().mul(lotSize);
  return size.toNumber();
}

// F-002: Notional Value
function calculateNotional(size, price, multiplier) {
  return new Decimal(size).mul(price).mul(multiplier);
}

// F-003: Margin Required
function calculateMargin(notional, leverage) {
  return new Decimal(notional).div(leverage);
}
```

### 2.2 ROI Calculations

```javascript
// F-004: Current ROI (Long Position)
function calculateROI_Long(entryPrice, currentPrice, leverage) {
  const D = Decimal;
  const priceDelta = new D(currentPrice).sub(entryPrice);
  const percentChange = priceDelta.div(entryPrice).mul(100);
  return percentChange.mul(leverage).toNumber();
}

// F-005: Current ROI (Short Position)
function calculateROI_Short(entryPrice, currentPrice, leverage) {
  const D = Decimal;
  const priceDelta = new D(entryPrice).sub(currentPrice);
  const percentChange = priceDelta.div(entryPrice).mul(100);
  return percentChange.mul(leverage).toNumber();
}

// F-006: Break-Even ROI (Fee-Adjusted)
// Accounts for: entry taker fee + exit taker fee + buffer
function calculateBreakEvenROI(leverage, takerFee = 0.0006, buffer = 0.05) {
  const D = Decimal;
  const totalFees = new D(takerFee).mul(2);  // Entry + Exit
  const feeImpact = totalFees.mul(leverage).mul(100);
  return feeImpact.add(buffer).toNumber();
}

// Example at 50x leverage:
// BE_ROI = (0.0006 * 2) * 50 * 100 + 0.05 = 6.05%
```

### 2.3 Stop Loss & Take Profit

```javascript
// F-007: Stop Loss Price (Long)
function calculateStopLossPrice_Long(entryPrice, stopLossROI, leverage) {
  const D = Decimal;
  const priceMovement = new D(stopLossROI).div(leverage).div(100);
  return new D(entryPrice).mul(new D(1).sub(priceMovement)).toNumber();
}

// F-008: Stop Loss Price (Short)
function calculateStopLossPrice_Short(entryPrice, stopLossROI, leverage) {
  const D = Decimal;
  const priceMovement = new D(stopLossROI).div(leverage).div(100);
  return new D(entryPrice).mul(new D(1).add(priceMovement)).toNumber();
}

// F-009: Take Profit Price (Long)
function calculateTakeProfitPrice_Long(entryPrice, takeProfitROI, leverage) {
  const D = Decimal;
  const priceMovement = new D(takeProfitROI).div(leverage).div(100);
  return new D(entryPrice).mul(new D(1).add(priceMovement)).toNumber();
}

// F-010: Take Profit Price (Short)
function calculateTakeProfitPrice_Short(entryPrice, takeProfitROI, leverage) {
  const D = Decimal;
  const priceMovement = new D(takeProfitROI).div(leverage).div(100);
  return new D(entryPrice).mul(new D(1).sub(priceMovement)).toNumber();
}
```

### 2.4 Liquidation Price

```javascript
// F-011: Liquidation Price (Long, Isolated Margin)
function calculateLiquidationPrice_Long(entryPrice, leverage, maintMarginRate = 0.005) {
  const D = Decimal;
  const factor = new D(1).div(leverage).mul(new D(1).sub(maintMarginRate));
  return new D(entryPrice).mul(new D(1).sub(factor)).toNumber();
}

// F-012: Liquidation Price (Short, Isolated Margin)
function calculateLiquidationPrice_Short(entryPrice, leverage, maintMarginRate = 0.005) {
  const D = Decimal;
  const factor = new D(1).div(leverage).mul(new D(1).sub(maintMarginRate));
  return new D(entryPrice).mul(new D(1).add(factor)).toNumber();
}

// F-013: Liquidation Buffer (Safety Check)
function calculateLiquidationBuffer(currentPrice, liquidationPrice, direction) {
  const D = Decimal;
  if (direction === 'long') {
    return new D(currentPrice).sub(liquidationPrice).div(currentPrice).mul(100).toNumber();
  } else {
    return new D(liquidationPrice).sub(currentPrice).div(currentPrice).mul(100).toNumber();
  }
}
```

### 2.5 Trailing Stop (Staircase Logic)

```javascript
// F-014: Trailing Stop Update (NEVER UNTRAIL)
function updateTrailingStop(params) {
  const { entryPrice, currentPrice, currentStopPrice, leverage, direction,
          activationROI, trailDistance, stepSize } = params;
  const D = Decimal;
  
  // Calculate current ROI
  const currentROI = direction === 'long'
    ? calculateROI_Long(entryPrice, currentPrice, leverage)
    : calculateROI_Short(entryPrice, currentPrice, leverage);
  
  // Not activated yet
  if (currentROI < activationROI) {
    return { updated: false, stopPrice: currentStopPrice };
  }
  
  // Calculate staircase level
  const level = new D(currentROI).div(stepSize).floor().mul(stepSize);
  const trailROI = level.sub(trailDistance);
  
  // Calculate new stop price
  let newStopPrice;
  if (direction === 'long') {
    const movement = trailROI.div(leverage).div(100);
    newStopPrice = new D(entryPrice).mul(new D(1).add(movement)).toNumber();
  } else {
    const movement = trailROI.div(leverage).div(100);
    newStopPrice = new D(entryPrice).mul(new D(1).sub(movement)).toNumber();
  }
  
  // CRITICAL: Never untrail - only move stop in favorable direction
  if (direction === 'long' && newStopPrice <= currentStopPrice) {
    return { updated: false, stopPrice: currentStopPrice };
  }
  if (direction === 'short' && newStopPrice >= currentStopPrice) {
    return { updated: false, stopPrice: currentStopPrice };
  }
  
  return { updated: true, stopPrice: newStopPrice, level: level.toNumber() };
}
```

### 2.6 Volatility-Aware Leverage

```javascript
// F-015: Auto Leverage Based on ATR%
function calculateAutoLeverage(atrPercent, config) {
  const { ATR_LOW, ATR_MEDIUM, ATR_HIGH, ATR_EXTREME } = config;
  
  // Conservative tiering - higher volatility = lower leverage
  if (atrPercent <= 0.3) return 100;      // Very low vol
  if (atrPercent <= ATR_LOW) return 75;   // Low vol
  if (atrPercent <= ATR_MEDIUM) return 50;// Normal vol
  if (atrPercent <= ATR_HIGH) return 25;  // High vol
  if (atrPercent <= ATR_EXTREME) return 10;// Very high vol
  return 5;                                // Extreme vol
}

// F-016: Inverse Leverage Risk Scaling
function calculateInverseScaledRisk(baseRisk, leverage) {
  const D = Decimal;
  // At higher leverage, reduce risk proportionally
  return new D(baseRisk).mul(100).div(leverage).toNumber();
}
```

---

## SECTION 3: INDICATOR FORMULAS

### 3.1 RSI (Wilder Smoothing)

```javascript
// F-017: RSI Calculation
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  
  const D = Decimal;
  let gains = new D(0);
  let losses = new D(0);
  
  // Initial average
  for (let i = 1; i <= period; i++) {
    const change = new D(closes[i]).sub(closes[i - 1]);
    if (change.gt(0)) gains = gains.add(change);
    else losses = losses.add(change.abs());
  }
  
  let avgGain = gains.div(period);
  let avgLoss = losses.div(period);
  
  // Wilder smoothing for remaining periods
  for (let i = period + 1; i < closes.length; i++) {
    const change = new D(closes[i]).sub(closes[i - 1]);
    const gain = change.gt(0) ? change : new D(0);
    const loss = change.lt(0) ? change.abs() : new D(0);
    
    avgGain = avgGain.mul(period - 1).add(gain).div(period);
    avgLoss = avgLoss.mul(period - 1).add(loss).div(period);
  }
  
  if (avgLoss.eq(0)) return 100;
  
  const rs = avgGain.div(avgLoss);
  return new D(100).sub(new D(100).div(new D(1).add(rs))).toNumber();
}
```

### 3.2 MACD

```javascript
// F-018: EMA Calculation
function calculateEMA(values, period) {
  const D = Decimal;
  const multiplier = new D(2).div(period + 1);
  
  // Start with SMA for first value
  let ema = values.slice(0, period).reduce((a, b) => a.add(b), new D(0)).div(period);
  
  for (let i = period; i < values.length; i++) {
    ema = new D(values[i]).sub(ema).mul(multiplier).add(ema);
  }
  
  return ema.toNumber();
}

// F-019: MACD Line, Signal, Histogram
function calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);
  const macdLine = new Decimal(fastEMA).sub(slowEMA).toNumber();
  
  // Calculate signal line (EMA of MACD line - requires MACD history)
  // For real implementation, maintain MACD line history
  
  return { macdLine, signalLine: 0, histogram: 0 };
}
```

### 3.3 Bollinger Bands

```javascript
// F-020: Bollinger Bands
function calculateBollingerBands(closes, period = 20, stdDevMultiplier = 2) {
  const D = Decimal;
  const slice = closes.slice(-period);
  
  // Middle band (SMA)
  const sum = slice.reduce((a, b) => new D(a).add(b), new D(0));
  const middle = sum.div(period);
  
  // Standard deviation
  const squaredDiffs = slice.map(v => new D(v).sub(middle).pow(2));
  const variance = squaredDiffs.reduce((a, b) => a.add(b), new D(0)).div(period);
  const stdDev = variance.sqrt();
  
  const upper = middle.add(stdDev.mul(stdDevMultiplier));
  const lower = middle.sub(stdDev.mul(stdDevMultiplier));
  
  return {
    upper: upper.toNumber(),
    middle: middle.toNumber(),
    lower: lower.toNumber(),
    bandwidth: upper.sub(lower).div(middle).mul(100).toNumber()
  };
}
```

---

## SECTION 4: PERFORMANCE METRICS

```javascript
// F-021: Win Rate
function calculateWinRate(trades) {
  if (trades.length === 0) return 0;
  const wins = trades.filter(t => t.pnl > 0).length;
  return (wins / trades.length) * 100;
}

// F-022: Profit Factor
function calculateProfitFactor(trades) {
  const grossProfit = trades.filter(t => t.pnl > 0).reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((a, t) => a + t.pnl, 0));
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return grossProfit / grossLoss;
}

// F-023: Sharpe Ratio (Annualized)
function calculateSharpeRatio(returns, riskFreeRate = 0) {
  if (returns.length < 2) return 0;
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return ((avgReturn - riskFreeRate) / stdDev) * Math.sqrt(252);
}

// F-024: Maximum Drawdown
function calculateMaxDrawdown(equityCurve) {
  let peak = equityCurve[0];
  let maxDrawdown = 0;
  
  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    const drawdown = (peak - equity) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  return maxDrawdown * 100;
}

// F-025: Expected Value Per Trade
function calculateExpectedValue(winRate, avgWin, avgLoss) {
  const winRateDecimal = winRate / 100;
  return (winRateDecimal * avgWin) - ((1 - winRateDecimal) * Math.abs(avgLoss));
}
```

---

## SECTION 5: SIGNAL SCORING

```javascript
// F-026: Composite Signal Score
function calculateCompositeScore(indicatorScores, weights, caps) {
  const D = Decimal;
  let totalScore = new D(0);
  
  for (const [indicator, score] of Object.entries(indicatorScores)) {
    const weight = weights[indicator] || 1;
    totalScore = totalScore.add(new D(score).mul(weight));
  }
  
  // Apply caps
  const indicatorCap = caps.indicatorScore || 110;
  const microCap = caps.microstructureScore || 20;
  const totalCap = caps.totalScore || 130;
  
  // Clamp to range
  let finalScore = totalScore.toNumber();
  finalScore = Math.max(-totalCap, Math.min(totalCap, finalScore));
  
  return finalScore;
}

// F-027: Signal Classification
function classifySignal(score) {
  if (score >= 90) return 'EXTREME_BUY';
  if (score >= 70) return 'STRONG_BUY';
  if (score >= 50) return 'BUY';
  if (score >= 30) return 'BUY_WEAK';
  if (score > -30) return 'NEUTRAL';
  if (score > -50) return 'SELL_WEAK';
  if (score > -70) return 'SELL';
  if (score > -90) return 'STRONG_SELL';
  return 'EXTREME_SELL';
}
```

---

## SECTION 6: RESULT PATTERN (No Throwing in Hot Path)

```typescript
// All hot-path functions MUST return Result type
type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

// Example usage
function placeOrder(params: OrderParams): Result<Order, OrderError> {
  // Validation
  if (!params.symbol) {
    return { ok: false, error: { code: 'INVALID_SYMBOL', message: 'Symbol required' } };
  }
  
  // ... order logic ...
  
  return { ok: true, value: order };
}

// Throwing is ONLY allowed at startup for misconfig
function validateConfig(config: Config): void {
  if (!config.apiKey && config.mode === 'live') {
    throw new Error('STARTUP_ERROR: API key required for live mode');
  }
}
```

---

## SECTION 7: FAILURE MODES & MITIGATIONS

| Failure Mode | Detection | Mitigation |
|--------------|-----------|------------|
| WebSocket Disconnect | Heartbeat timeout | Auto-reconnect with exponential backoff |
| API Rate Limit | 429 response | Token bucket + circuit breaker |
| Stale Data | Timestamp check | Pause trading, alert |
| Invalid API Key | 401 response | EMERGENCY_STOP |
| Position Limit Exceeded | Pre-trade check | Reject order |
| Liquidation Risk | Buffer check | Reduce position or close |
| Memory Leak | Heap monitoring | Graceful restart |
| Indicator NaN | isNaN check | Skip signal, log error |
| Order Rejection | API error code | Retry with backoff or alert |
| Network Partition | Multiple failures | Circuit breaker open |

---

## APPENDIX: Constants Reference

```javascript
const CONSTANTS = {
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
  MIN_LIQUIDATION_BUFFER: 0.05,  // 5%
  
  // System Limits
  MAX_OPEN_POSITIONS: 5,
  MAX_DAILY_DRAWDOWN: 5.0,
  MAX_CONSECUTIVE_LOSSES: 5,
  MAX_REQUESTS_PER_SECOND: 10,
  HEARTBEAT_TIMEOUT_MS: 30_000,
  MAX_ORDERBOOK_AGE_MS: 5_000,
  MIN_CANDLES_FOR_INDICATORS: 200
};
```
