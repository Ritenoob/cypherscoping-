# Signal Logic - What We Consider a Valid Entry Signal

## A VALID ENTRY SIGNAL REQUIRES ALL OF THE FOLLOWING:

### 1. Score >= 80 (or <= -80 for short)
The combined indicator score must reach at least 80 points.

### 2. Confidence >= 70%
Signal quality confidence must be 70% or higher.

### 3. At Least 4 Indicators Agreeing
A minimum of 4 different indicators must agree on direction.

### 4. Trend Alignment (EMA Confirmation)
The signal direction must align with the EMA trend direction.

### 5. MTF Alignment (Both Timeframes Agree)
- **5min (Primary):** Must show entry signal
- **30min (Secondary):** Must confirm same direction
- If they disagree = NO TRADE

### 6. No AVOID_ENTRY Warnings
No microstructure warnings blocking entry.

---

## WHAT COUNTS AS A SIGNAL (By Priority)

### HIGH PRIORITY SIGNALS (These Drive Entries)

| Signal Type | Multiplier | Description |
|-------------|------------|-------------|
| **Divergence** | 1.5x | Price making new high/low but indicator doesn't confirm. MOST RELIABLE. |
| **Golden/Death Cross** | 1.4x | EMA 50 crossing EMA 200. Major trend change. |
| **Squeeze** | 1.3x | Bollinger Band squeeze followed by breakout. |
| **Crossover** | 1.2x | Indicator crossing key levels (RSI crossing 30/70, etc.) |

### MEDIUM PRIORITY SIGNALS (Confirmation)

| Signal Type | Multiplier | Description |
|-------------|------------|-------------|
| **Momentum** | 0.8x | Accelerating price movement in one direction. |

### LOW PRIORITY SIGNALS (Do NOT Trade Alone)

| Signal Type | Multiplier | Description |
|-------------|------------|-------------|
| **Zone** | 0.6x | Just being in overbought/oversold zone. WEAK BY ITSELF. |

---

## INDICATOR SIGNAL DEFINITIONS

### RSI (Relative Strength Index)
- **Bullish Divergence:** Price lower low + RSI higher low = BUY
- **Bearish Divergence:** Price higher high + RSI lower high = SELL
- **Crossover Up:** RSI crosses above 30 from below = BUY
- **Crossover Down:** RSI crosses below 70 from above = SELL
- **Zone Only:** RSI < 30 or > 70 = WEAK (needs confirmation)

### EMA Trend
- **Bullish EMA Cross:** Fast EMA (9) crosses above Slow EMA (50) = BUY
- **Bearish EMA Cross:** Fast EMA (9) crosses below Slow EMA (50) = SELL
- **Golden Cross:** EMA 50 crosses above EMA 200 = STRONG BUY
- **Death Cross:** EMA 50 crosses below EMA 200 = STRONG SELL

### Williams %R
- **Bullish Divergence:** Price lower low + %R higher low = BUY
- **Bearish Divergence:** Price higher high + %R lower high = SELL
- **Crossover:** Crossing -80 (up) or -20 (down)

### KDJ
- **J-Line Extreme:** J < 15 = BUY, J > 85 = SELL
- **KD Crossover:** K crossing D from below = BUY, from above = SELL
- **Divergence:** Same as RSI divergence pattern

### Bollinger Bands
- **Squeeze Breakout:** Bands tighten then price breaks out = Trade breakout direction
- **Band Touch:** Price touching outer band = WEAK (needs confirmation)

### OBV (On Balance Volume)
- **Bullish Divergence:** Price down but OBV up = BUY
- **Bearish Divergence:** Price up but OBV down = SELL
- **Slope:** Sustained positive/negative slope confirms trend

### Stochastic RSI
- **Crossover:** K crossing D in oversold/overbought zones
- **Zone:** Below 20 = Oversold, Above 80 = Overbought

### Awesome Oscillator
- **Zero Cross:** Crossing zero line
- **Twin Peaks:** Divergence pattern
- **Saucer:** Momentum shift

---

## COMBINATION BONUSES (Extra Points When Combined)

| Combination | Bonus | Condition |
|-------------|-------|-----------|
| EMA Cross + RSI Confirmation | +15 | EMA bullish cross AND RSI > 50 (or bearish + RSI < 50) |
| Divergence + Trend | +20 | Divergence signal aligns with ADX trend direction |
| Pullback Entry | +12 | Price > EMA (uptrend) AND RSI < 30 (oversold pullback) |
| Strong ADX Trend | +10 | ADX > 40 (very strong trend) |
| MTF Full Alignment | +18 | Both timeframes fully agree |

---

## WHAT IS NOT A SIGNAL (DO NOT TRADE ON THESE ALONE)

1. **RSI in zone** (just oversold/overbought) - NEEDS crossover or divergence
2. **Single indicator** showing anything - NEEDS 4+ agreeing
3. **Low confidence** (< 70%) - Wait for better setup
4. **Low score** (< 80) - Not enough conviction
5. **Timeframe disagreement** - 5min and 30min must agree
6. **Against EMA trend** - Don't fight the trend

---

## ENTRY DECISION FLOWCHART

```
START
  │
  ▼
Score >= 80? ──NO──► DO NOT ENTER
  │
 YES
  ▼
Confidence >= 70%? ──NO──► DO NOT ENTER
  │
 YES
  ▼
4+ Indicators Agree? ──NO──► DO NOT ENTER
  │
 YES
  ▼
5min & 30min Aligned? ──NO──► DO NOT ENTER
  │
 YES
  ▼
EMA Trend Confirms? ──NO──► DO NOT ENTER
  │
 YES
  ▼
Any AVOID_ENTRY Warning? ──YES──► DO NOT ENTER
  │
  NO
  ▼
═══════════════════
    ENTER TRADE
═══════════════════
```

---

## MICROSTRUCTURE SIGNALS (Live Mode Only)

### Buy/Sell Ratio
- **Extreme Buy Pressure:** Ratio > 0.85 with flow imbalance = Confirms BUY
- **Extreme Sell Pressure:** Ratio < 0.15 with flow imbalance = Confirms SELL
- **Exhaustion:** Opposite direction warning = AVOID ENTRY

### Funding Rate
- **Extreme Positive:** > 2.5% = Crowded long, consider SHORT
- **Extreme Negative:** < -2.5% = Crowded short, consider LONG

### Price Ratio (Basis)
- **High Spread:** > 0.03% = Poor liquidity, AVOID ENTRY
- **Basis Deviation:** Shows futures premium/discount

---

## SUMMARY: VALID SIGNAL CHECKLIST

Before entering ANY trade, ALL must be TRUE:

- [ ] Score >= 80 (absolute value)
- [ ] Confidence >= 70%
- [ ] 4+ indicators agreeing on direction
- [ ] 5min timeframe shows signal
- [ ] 30min timeframe confirms direction
- [ ] EMA trend aligns with signal
- [ ] No AVOID_ENTRY microstructure warnings
- [ ] Signal type is crossover, divergence, or squeeze (NOT zone-only)

**If ANY checkbox is FALSE = DO NOT ENTER**
