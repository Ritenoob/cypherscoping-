---
name: pump-dump-detector
description: |
  5-condition pump and dump detection system using volume spikes, order book imbalance, ATR expansion, MTF divergence, and wall manipulation.

  Use when: (1) detecting market manipulation, (2) avoiding pump and dump schemes, (3) identifying spoofing and fake walls,
  (4) assessing manipulation risk before entry, (5) building anti-manipulation filters.

  Triggers: "pump dump detection", "market manipulation", "spoofing detection", "fake walls", "manipulation risk"
author: Claude Code
version: 1.0.0
---

# Pump and Dump Detection

## Problem

Pump and dump schemes cause significant losses for traders who enter near the top. Traditional volume indicators miss the coordinated manipulation patterns. Traders need multi-condition detection that identifies:
- Sudden volume spikes without fundamental support
- Order book manipulation (fake walls, spoofing)
- Multi-timeframe divergence (pump on fast TF, no support on slow TF)
- ATR-based volatility anomalies

## Context / Trigger Conditions

**Use this skill when:**
- Building entry filters to avoid manipulation
- Creating risk scoring systems
- Implementing spoofing detection
- Analyzing order book for fake walls
- Validating signal quality before trades

**Specific triggers:**
- "detect pump and dump"
- "market manipulation detection"
- "identify spoofing"
- "fake wall detection"
- "manipulation risk score"

## Solution

### 1. Five-Condition Detection System

```javascript
// Pump detection requires minimum 3 of 5 conditions
const PUMP_CONDITIONS = {
  volumeSpike: false,    // 20%
  orderBookImbalance: false,  // 30%
  atrExpansion: false,   // 15%
  mtfDivergence: false,  // 25%
  wallManipulation: false // 10%
};

// Risk levels based on conditions met
// 5/5 = EXTREME (100% manipulation likely)
// 4/5 = HIGH (80%+)
// 3/5 = MEDIUM (60%+)
// <3  = LOW (monitor only)
```

### 2. Condition Calculations

#### Volume Spike Detection (20%)
```javascript
function detectVolumeSpike(candles, lookback = 30) {
  const avgVolume = calculateAverage(candles.slice(-lookback).map(c => c.volume));
  const currentVolume = candles[candles.length - 1].volume;

  // Thresholds
  const moderateSpike = currentVolume > avgVolume * 2.0;  // 2x average
  const extremeSpike = currentVolume > avgVolume * 3.0;   // 3x average

  return {
    detected: moderateSpike,
    severity: extremeSpike ? 'extreme' : moderateSpike ? 'moderate' : 'none',
    ratio: currentVolume / avgVolume,
    score: Math.min((currentVolume / avgVolume - 1) * 50, 100) // 0-100
  };
}
```

#### Order Book Imbalance (30%)
```javascript
function calculateOrderBookImbalance(orderBook) {
  // Aggregate bids and asks within 1% of current price
  const priceRange = 0.01; // 1%
  const currentPrice = orderBook.price;

  const nearBids = orderBook.bids
    .filter(b => b.price >= currentPrice * (1 - priceRange))
    .reduce((sum, b) => sum + b.volume, 0);

  const nearAsks = orderBook.asks
    .filter(a => a.price <= currentPrice * (1 + priceRange))
    .reduce((sum, a) => sum + a.volume, 0);

  const imbalance = nearBids / (nearAsks + epsilon);

  // Scoring
  // imbalance > 3.0 = 100 points (extreme buy pressure)
  // imbalance < 0.33 = 100 points (extreme sell pressure)
  // imbalance ~1.0 = 0 points (balanced)

  const imbalanceScore = imbalance > 1.0
    ? Math.min((imbalance - 1) * 50, 100)
    : Math.min((1 - imbalance) * 50, 100);

  return {
    imbalance,
    bidVolume: nearBids,
    askVolume: nearAsks,
    score: imbalanceScore,
    detected: imbalance > 2.5 || imbalance < 0.4
  };
}
```

#### ATR Expansion Detection (15%)
```javascript
function detectATRExpansion(candles, atrPeriod = 14) {
  const atr = calculateATR(candles, atrPeriod);
  const avgATR = calculateAverage(atr.slice(-30)); // 30-period average
  const currentATR = atr[atr.length - 1];

  const expansion = currentATR / avgATR;

  return {
    detected: expansion > 1.5,  // 50% expansion
    expansion,
    currentATR,
    avgATR,
    score: Math.min((expansion - 1) * 100, 100)
  };
}
```

#### Multi-Timeframe Divergence (25%)
```javascript
function detectMTFDivergence(signals) {
  // signals = { M5: score, M15: score, H1: score, H2: score }
  const fast = signals.M5;
  const slow = signals.H2;

  // Divergence: Fast timeframe shows strong signal, slow shows opposite/neutral
  const divergence = Math.abs(fast) > 70 && Math.sign(fast) !== Math.sign(slow);

  // Additional check: M5 and M15 aligned, but H1/H2 not
  const fastAlignment = Math.sign(signals.M5) === Math.sign(signals.M15);
  const slowAlignment = Math.sign(signals.H1) === Math.sign(signals.H2);
  const crossTFDivergence = fastAlignment && !slowAlignment;

  return {
    detected: divergence || crossTFDivergence,
    fastSignal: fast,
    slowSignal: slow,
    score: divergence ? 100 : crossTFDivergence ? 70 : 0
  };
}
```

#### Wall Manipulation Detection (10%)
```javascript
function detectWallManipulation(orderBookHistory, windowSeconds = 60) {
  // Track order book changes over time
  const recentSnapshots = orderBookHistory.filter(
    s => Date.now() - s.timestamp < windowSeconds * 1000
  );

  // Flash walls: Large orders placed and removed quickly (<30s)
  const flashWalls = detectFlashWalls(recentSnapshots, 30);

  // Wall pulling: >80% reduction in large bid/ask within 1 minute
  const wallPulling = detectWallPulling(recentSnapshots, 0.8);

  return {
    detected: flashWalls.count > 0 || wallPulling.detected,
    flashWalls: flashWalls.count,
    wallPulling: wallPulling.detected,
    score: flashWalls.count * 30 + (wallPulling.detected ? 50 : 0)
  };
}

function detectFlashWalls(snapshots, maxDurationSeconds) {
  // Identify large orders (>10x median size) that appeared and disappeared
  const medianOrderSize = calculateMedian(
    snapshots.flatMap(s => [...s.bids, ...s.asks].map(o => o.volume))
  );

  const largeOrders = snapshots.flatMap(s =>
    [...s.bids, ...s.asks]
      .filter(o => o.volume > medianOrderSize * 10)
      .map(o => ({ ...o, timestamp: s.timestamp }))
  );

  // Group by price level, check lifetime
  const priceGroups = groupByPrice(largeOrders, 0.001); // 0.1% tolerance

  const flashCount = priceGroups.filter(group => {
    const lifetime = (group.lastSeen - group.firstSeen) / 1000;
    return lifetime < maxDurationSeconds && group.removed;
  }).length;

  return { count: flashCount };
}

function detectWallPulling(snapshots, threshold = 0.8) {
  if (snapshots.length < 2) return { detected: false };

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  // Find largest bid/ask in first snapshot
  const largestBid = Math.max(...first.bids.map(b => b.volume));
  const largestAsk = Math.max(...first.asks.map(a => a.volume));

  // Check if still present in last snapshot
  const bidReduction = 1 - (Math.max(...last.bids.map(b => b.volume)) / largestBid);
  const askReduction = 1 - (Math.max(...last.asks.map(a => a.volume)) / largestAsk);

  return {
    detected: bidReduction > threshold || askReduction > threshold,
    bidReduction,
    askReduction
  };
}
```

### 3. Composite Pump/Dump Score

```javascript
class PumpDumpDetector {
  constructor(config = {}) {
    this.weights = {
      volumeSpike: 0.20,
      orderBookImbalance: 0.30,
      atrExpansion: 0.15,
      mtfDivergence: 0.25,
      wallManipulation: 0.10
    };
    this.minConditions = config.minConditions || 3; // Min 3/5 to flag
  }

  analyze(context) {
    const conditions = {
      volumeSpike: detectVolumeSpike(context.candles),
      orderBookImbalance: calculateOrderBookImbalance(context.orderBook),
      atrExpansion: detectATRExpansion(context.candles),
      mtfDivergence: detectMTFDivergence(context.mtfSignals),
      wallManipulation: detectWallManipulation(context.orderBookHistory)
    };

    // Count conditions met
    const conditionsMet = Object.values(conditions)
      .filter(c => c.detected).length;

    // Weighted composite score
    const compositeScore = Object.keys(conditions).reduce((sum, key) => {
      return sum + (conditions[key].score * this.weights[key]);
    }, 0);

    // Risk level
    let riskLevel = 'LOW';
    if (conditionsMet >= 5) riskLevel = 'EXTREME';
    else if (conditionsMet >= 4) riskLevel = 'HIGH';
    else if (conditionsMet >= 3) riskLevel = 'MEDIUM';

    return {
      riskLevel,
      conditionsMet,
      compositeScore,
      conditions,
      recommendation: conditionsMet >= this.minConditions
        ? 'REJECT_TRADE'
        : 'PROCEED_WITH_CAUTION'
    };
  }
}
```

### 4. Integration Example

```typescript
// In SignalAnalysisAgent
import { PumpDumpDetector } from '../core/PumpDumpDetector';

class SignalAnalysisAgent extends BaseAgent {
  private pumpDumpDetector: PumpDumpDetector;

  async execute(context: AgentContext): Promise<AgentResult> {
    // Generate base signal
    const signal = await this.generateSignal(context);

    // Check for manipulation
    const manipulationCheck = this.pumpDumpDetector.analyze({
      candles: context.candles,
      orderBook: context.orderBook,
      orderBookHistory: context.orderBookHistory,
      mtfSignals: context.mtfSignals
    });

    // Reject signal if manipulation detected
    if (manipulationCheck.riskLevel === 'EXTREME' ||
        manipulationCheck.riskLevel === 'HIGH') {
      return {
        success: true,
        action: {
          type: 'signal-rejected',
          reason: 'pump-dump-detected',
          data: manipulationCheck
        }
      };
    }

    // Reduce signal strength for MEDIUM risk
    if (manipulationCheck.riskLevel === 'MEDIUM') {
      signal.strength *= 0.5; // Halve strength
      signal.metadata.manipulationRisk = 'MEDIUM';
    }

    return {
      success: true,
      action: { type: 'signal-generated', signal }
    };
  }
}
```

## Key Formulas

```
Volume Spike Score = min((current_volume / avg_volume - 1) * 50, 100)

Order Book Imbalance = bid_volume / (ask_volume + epsilon)
  - Score: (imbalance - 1) * 50 for buy pressure
  - Score: (1 - imbalance) * 50 for sell pressure

ATR Expansion Score = min((current_ATR / avg_ATR - 1) * 100, 100)

MTF Divergence: fast_signal > 70 AND sign(fast) ≠ sign(slow)

Flash Wall: Large order lifetime < 30 seconds
Wall Pulling: Order size reduction > 80% within 60 seconds

Composite Score = Σ(condition_score × weight)
Risk Level:
  - 5/5 conditions = EXTREME
  - 4/5 conditions = HIGH
  - 3/5 conditions = MEDIUM
  - <3 conditions = LOW
```

## Benefits

1. **Multi-Dimensional Detection** - Combines 5 independent signals
2. **Order Book Analysis** - Detects spoofing and fake walls
3. **ATR Normalization** - Accounts for normal volatility
4. **MTF Confirmation** - Identifies unsupported pumps
5. **Weighted Scoring** - Prioritizes most reliable indicators

## Anti-Patterns

- ❌ Relying on volume alone (misses manipulation patterns)
- ❌ Ignoring order book history (can't detect flash walls)
- ❌ Single timeframe analysis (misses divergence)
- ❌ Fixed thresholds (doesn't adapt to volatility)

## References

- Source: `/home/nygmaee/Documents/Building a volume pressure.txt`
- Related skills: `volume-pressure-scoring`, `multiframe-aligner`
- Integration point: `SignalAnalysisAgent`, `RiskManagementAgent`
