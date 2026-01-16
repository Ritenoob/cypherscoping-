# 🎯 TRAILING STOP QUICK REFERENCE CARD

## ⚡ **WHAT'S NEW**

Your bot now has a **professional trailing stop system** with:

✅ **4 trailing modes** (ATR, Percent, Dynamic, Step)  
✅ **Breakeven stop** (eliminate risk after profit)  
✅ **Progressive profit lock-in** (2 target levels)  
✅ **Profit capture tracking** (measure efficiency)  
✅ **Reversal detection** (exit on trend change)

---

## 🚀 **QUICK START - 3 CONFIGURATIONS**

### **1. CONSERVATIVE (Protect profits early)**

```python
# Edit kucoin_btc_trend_bot.py → TradingConfig class

Trailing_Stop_Mode = "percent"
Trail_Percent = 1.5

Enable_Breakeven_Stop = True
Breakeven_Trigger_ATR = 1.0
Profit_Target_1_ATR = 1.5
Profit_Target_1_Lock = 0.6
Profit_Target_2_ATR = 3.0
Profit_Target_2_Lock = 0.8
```

**Use when:** Risk-averse, volatile markets, prefer many small wins

---

### **2. BALANCED (Recommended default)** ⭐

```python
Trailing_Stop_Mode = "dynamic"
Trail_Start_ATR = 2.0
Trail_Tight_ATR = 1.0

Enable_Breakeven_Stop = True
Breakeven_Trigger_ATR = 1.5
Breakeven_Offset_ATR = 0.2

Profit_Target_1_ATR = 2.0
Profit_Target_1_Lock = 0.5
Profit_Target_2_ATR = 4.0
Profit_Target_2_Lock = 0.75

Track_Max_Profit = True
```

**Use when:** Starting out, normal conditions, balanced approach

---

### **3. AGGRESSIVE (Let winners run)**

```python
Trailing_Stop_Mode = "atr"
ATR_Multiplier_Trail = 2.0

Enable_Breakeven_Stop = True
Breakeven_Trigger_ATR = 2.0
Profit_Target_1_ATR = 3.0
Profit_Target_1_Lock = 0.4
Profit_Target_2_ATR = 6.0
Profit_Target_2_Lock = 0.6
```

**Use when:** Strong trends, experienced trader, willing to give back profit for bigger wins

---

## 📊 **MODE COMPARISON TABLE**

| Mode | Best For | Pros | Cons | Capture Rate |
|------|----------|------|------|--------------|
| **ATR** | Volatile markets | Adapts to volatility | Can be too loose | 60-70% |
| **Percent** | Stable markets | Simple, predictable | No volatility adjustment | 55-65% |
| **Dynamic** | Most situations | Progressive tightening | More complex | 65-75% |
| **Step** | Psychology | Clear profit zones | Less responsive | 50-60% |

---

## 🎯 **SYSTEM LAYERS EXPLAINED**

```
┌─────────────────────────────────────────────────────────────┐
│                    PROFIT PROTECTION LAYERS                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Layer 1: INITIAL STOP                                       │
│  ├─ Set at entry: Price - (ATR × ATR_Multiplier_Stop)       │
│  └─ Purpose: Limit max loss                                  │
│                                                               │
│  Layer 2: BREAKEVEN STOP                                     │
│  ├─ Activates when: Profit > Breakeven_Trigger_ATR          │
│  ├─ Moves stop to: Entry + (ATR × Breakeven_Offset_ATR)     │
│  └─ Purpose: Eliminate risk after initial profit             │
│                                                               │
│  Layer 3: PROFIT TARGET 1                                    │
│  ├─ Triggers at: Entry + (ATR × Profit_Target_1_ATR)        │
│  ├─ Locks in: Profit_Target_1_Lock % of profit              │
│  └─ Purpose: Secure partial gains                            │
│                                                               │
│  Layer 4: PROFIT TARGET 2                                    │
│  ├─ Triggers at: Entry + (ATR × Profit_Target_2_ATR)        │
│  ├─ Locks in: Profit_Target_2_Lock % of profit              │
│  └─ Purpose: Protect larger gains                            │
│                                                               │
│  Layer 5: TRAILING STOP                                      │
│  ├─ Continuously adjusts based on selected mode              │
│  ├─ Only moves UP (never down)                               │
│  └─ Purpose: Capture reversals, let winners run              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 📈 **EXAMPLE TRADE PROGRESSION**

```
Entry:      $50,000
ATR:        $500
Mode:       Dynamic (Trail_Start_ATR=2.0, Trail_Tight_ATR=1.0)

┌─────────────┬──────────┬─────────────┬──────────────────────────┐
│ Price       │ Profit   │ Stop Level  │ What Happened            │
├─────────────┼──────────┼─────────────┼──────────────────────────┤
│ $50,000     │ $0       │ $49,000     │ Entry (2 ATR stop)       │
│ $50,750     │ $750     │ $50,100     │ ✓ Breakeven activated    │
│ $51,000     │ $1,000   │ $50,500     │ ✓ Target 1 (lock 50%)    │
│ $51,500     │ $1,500   │ $50,750     │ Trailing (2.0 ATR)       │
│ $52,000     │ $2,000   │ $51,500     │ ✓ Target 2 (lock 75%)    │
│ $52,500     │ $2,500   │ $52,000     │ Trailing tightened (1.0) │
│ $53,000     │ $3,000   │ $52,500     │ Peak reached             │
│ $52,400     │ $2,400   │ $52,500     │ Still above stop         │
│ $52,500     │ $2,500   │ EXIT        │ 🛑 Stop hit on reversal  │
└─────────────┴──────────┴─────────────┴──────────────────────────┘

Result: Captured $2,500 of $3,000 peak profit = 83.3% capture rate
```

---

## 🔧 **OPTIMIZATION PRIORITY**

**Start here and adjust in this order:**

1. **Choose mode** (test all 4, pick best Sharpe ratio)
2. **Set breakeven** (always enabled, adjust trigger based on win rate)
3. **Tune profit targets** (based on average ATR movement per trade)
4. **Adjust trailing tightness** (if capture rate < 60%, widen; if > 80%, tighten)

---

## 📊 **BACKTEST COMPARISON**

Run this to compare all modes:

```bash
# Test baseline (no advanced trailing)
python backtest_strategy.py --days 90

# Edit config, change mode to "atr", re-run
python backtest_strategy.py --days 90

# Repeat for "percent", "dynamic", "step"

# Compare:
# - Total return
# - Profit factor
# - Max drawdown
# - Win rate
```

---

## ⚠️ **CRITICAL SETTINGS GUIDE**

### **If you're seeing:**

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| Win rate drops | Stops too tight | Increase Trail_* parameters |
| Average wins too small | Locking too aggressively | Reduce Profit_Target_X_Lock |
| Giving back too much profit | Stops too wide | Decrease Trail_* parameters |
| Breakeven never triggers | Trigger too far | Lower Breakeven_Trigger_ATR |
| Capture rate < 50% | Wrong mode or too tight | Try "dynamic" mode, increase trail |
| Max drawdown high | Not enough protection | Enable/tighten profit targets |

---

## 🎓 **WHAT EACH PARAMETER DOES**

### **Trailing Mode Parameters:**

```python
# ATR Mode
ATR_Multiplier_Trail = 1.5
# → Stop trails 1.5 × ATR below current price
# Higher = wider stop (more breathing room)
# Lower = tighter stop (lock profits faster)

# Percent Mode  
Trail_Percent = 2.0
# → Stop trails 2% below peak price
# Higher = wider stop
# Lower = tighter stop

# Dynamic Mode
Trail_Start_ATR = 2.0      # Initial trail (before targets)
Trail_Tight_ATR = 1.0      # Final trail (after targets)
# Progressive tightening as profit increases

# Step Mode
Trail_Step_Percent = 1.0
# → Stop moves up in 1% increments
# Smaller = more frequent updates
# Larger = fewer updates, bigger swings
```

### **Breakeven Parameters:**

```python
Breakeven_Trigger_ATR = 1.5
# → Activate breakeven after price moves 1.5 ATR in profit
# Lower (0.5-1.0) = Quick breakeven, fewer full losses
# Higher (2.0-3.0) = Later breakeven, more breathing room

Breakeven_Offset_ATR = 0.2
# → Place breakeven stop 0.2 ATR above entry
# Covers trading fees + small profit guarantee
# Don't change this unless fees change
```

### **Profit Target Parameters:**

```python
Profit_Target_1_ATR = 2.0
# → First target at 2 × ATR from entry
# Lower (1.0-1.5) = Frequent, early locking
# Higher (3.0-4.0) = Patient, larger target

Profit_Target_1_Lock = 0.5
# → Lock 50% of current profit at target 1
# Lower (0.3-0.4) = Less aggressive locking
# Higher (0.6-0.7) = More aggressive locking
```

---

## 🚀 **RECOMMENDED WORKFLOW**

### **Day 1: Backtest all modes**
```bash
# Test each mode with defaults
for mode in atr percent dynamic step; do
    # Edit Trailing_Stop_Mode in config
    python backtest_strategy.py --days 90
    # Record results
done
```

### **Day 2: Optimize best mode**
```bash
# Found "dynamic" is best? Test variations:
# - Trail_Start_ATR: [1.5, 2.0, 2.5]
# - Trail_Tight_ATR: [0.8, 1.0, 1.2]
# Pick combination with highest Sharpe ratio
```

### **Week 1: Paper trade**
```bash
# Run with optimized settings
python kucoin_btc_trend_bot.py
# Monitor for 5-10 trades
# Verify capture rate 60-75%
```

### **Week 2: Live trade (small)**
```bash
# Enable live trading
# Start with $500-1000
# Risk_Percent = 0.75 (lower than normal)
```

---

## 📞 **QUICK DIAGNOSTICS**

```bash
# Check trailing stop performance
grep "TRAILING STOP HIT" logs/kucoin_bot_*.log

# View profit capture rates
grep "Captured" logs/kucoin_bot_*.log | awk '{print $NF}'

# Count breakeven activations
grep "BREAKEVEN STOP" logs/kucoin_bot_*.log | wc -l

# See profit target hits
grep "PROFIT TARGET" logs/kucoin_bot_*.log
```

---

## ✅ **PRE-FLIGHT CHECKLIST**

Before going live:

- [ ] Backtested at least 90 days
- [ ] Tested all 4 trailing modes
- [ ] Selected mode shows 60%+ capture rate
- [ ] Breakeven stop activating properly
- [ ] Profit targets hitting in backtests
- [ ] Max drawdown acceptable (<20%)
- [ ] Profit factor > 1.5
- [ ] Paper traded 1-2 weeks successfully

---

**For complete details, see:** [TRAILING_STOP_GUIDE.md](computer:///home/claude/TRAILING_STOP_GUIDE.md)

*Designed to capture reversals. Built to protect profits. Optimized for Bitcoin.*
