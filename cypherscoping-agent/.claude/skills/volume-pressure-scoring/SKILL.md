---
name: volume-pressure-scoring
description: |
  Multi-component volume pressure analysis for detecting buying/selling pressure and market manipulation.

  Use when: (1) analyzing volume imbalances, (2) detecting pump and dump patterns, (3) identifying order book manipulation,
  (4) calculating support/resistance strength, (5) assessing market sentiment via volume.

  Triggers: "volume pressure", "buy sell imbalance", "pump dump detection", "order flow analysis", "volume ratio"
author: Claude Code
version: 1.0.0
---

# Volume Pressure Scoring

## Problem

Volume analysis is critical for trading but simple volume indicators miss the directional flow of orders. Traders need to quantify buying vs selling pressure, detect manipulation (pump/dumps), identify fake walls, and normalize strength across different market conditions.

## Context / Trigger Conditions

**Use this skill when:**
- Implementing volume-based trading signals
- Building pump/dump detection systems
- Creating order book analysis tools
- Normalizing support/resistance strength by volatility (ATR)
- Detecting fake walls and spoofing in order books

**Specific triggers:**
- "analyze volume pressure"
- "detect buying/selling imbalance"
- "pump and dump detection"
- "order book clustering"
- "ATR-normalized volume strength"

## Solution

### 1. Volume Ratio Calculation

```javascript
// Core formula
volume_ratio = buy_volume / (sell_volume + epsilon)

// Where:
// buy_volume = sum(volume where close > open)
// sell_volume = sum(volume where close < open)
// epsilon = small constant to prevent division by zero

// Thresholds:
// VR > 1.5  = Strong buy pressure
// VR < 0.67 = Strong sell pressure (inverse of 1.5)
// VR > 2.5  = Extreme buy pressure
// VR < 0.4  = Extreme sell pressure
```

### 2. Multi-Component Scoring System

Combine multiple volume dimensions for robust signal:

```javascript
// Weighted components
const volumePressureScore =
  (volumeRatioScore * 0.40) +     // 40% weight
  (mtfAlignmentScore * 0.30) +    // 30% weight
  (momentumScore * 0.30);          // 30% weight

// Volume Ratio Score (0-100)
function calculateVRScore(vr) {
  if (vr >= 2.5) return 100;          // Extreme buy
  if (vr >= 1.5) return 70;           // Strong buy
  if (vr <= 0.4) return 0;            // Extreme sell
  if (vr <= 0.67) return 30;          // Strong sell
  return 50;                          // Neutral
}

// MTF Alignment Score
// How many timeframes show same direction (M5, M15, H1, H2)
const mtfAlignmentScore = (alignedTimeframes / totalTimeframes) * 100;

// Momentum Score
// Difference between fast (M5) and slow (H2) timeframes
const momentumScore = Math.abs(fastTF_VR - slowTF_VR) * scalingFactor;
```

### 3. Order Book Clustering

Detect support/resistance levels from order book:

```javascript
/**
 * Cluster Detection Algorithm
 * - Groups nearby orders into clusters
 * - Minimum cluster size: 3 orders
 * - Cluster tolerance: 0.05% price distance
 */
function detectClusters(orderBook, atr, price) {
  const clusters = [];
  const clusterTolerance = 0.0005; // 0.05% of price

  // Sort orders by price
  const sortedOrders = [...orderBook].sort((a, b) => a.price - b.price);

  // Group nearby orders
  for (const order of sortedOrders) {
    let addedToCluster = false;

    for (const cluster of clusters) {
      const priceDiff = Math.abs(order.price - cluster.centerPrice) / cluster.centerPrice;

      if (priceDiff < clusterTolerance) {
        cluster.orders.push(order);
        cluster.totalVolume += order.volume;
        cluster.centerPrice = weightedAverage(cluster.orders);
        addedToCluster = true;
        break;
      }
    }

    if (!addedToCluster) {
      clusters.push({
        centerPrice: order.price,
        orders: [order],
        totalVolume: order.volume
      });
    }
  }

  // Filter weak clusters (< 3 orders)
  const strongClusters = clusters.filter(c => c.orders.length >= 3);

  // Calculate ATR-normalized strength
  return strongClusters.map(cluster => ({
    ...cluster,
    strength: calculateATRNormalizedStrength(cluster.totalVolume, atr, price)
  }));
}

/**
 * ATR Normalization
 * Makes volume strength comparable across different volatility regimes
 */
function calculateATRNormalizedStrength(volume, atr14, price) {
  return volume / (atr14 * price);
}
```

### 4. Pump & Dump Detection

5-condition risk scoring system:

```javascript
/**
 * Pump/Dump Detection
 * Risk level based on how many conditions are met (0-5)
 */
function detectPumpDump(marketData, orderBook, indicators) {
  let conditionsMet = 0;
  const conditions = [];

  // Condition 1: Volume Spike (2-3x average)
  if (marketData.currentVolume > marketData.avgVolume * 2) {
    conditionsMet++;
    conditions.push('volume_spike');
  }

  // Condition 2: Order Book Imbalance (>70% bid or ask heavy)
  const obImbalance = calculateOBImbalance(orderBook);
  if (Math.abs(obImbalance) > 0.70) {
    conditionsMet++;
    conditions.push('ob_imbalance');
  }

  // Condition 3: ATR Expansion (volatility spike 1.5x)
  if (indicators.currentATR > indicators.avgATR * 1.5) {
    conditionsMet++;
    conditions.push('atr_expansion');
  }

  // Condition 4: MTF Divergence (fast TF pumping, slow TF neutral)
  if (indicators.fastTF_signal === 'strong' && indicators.slowTF_signal === 'neutral') {
    conditionsMet++;
    conditions.push('mtf_divergence');
  }

  // Condition 5: Wall Removal (fake wall detected)
  if (detectFakeWall(orderBook)) {
    conditionsMet++;
    conditions.push('wall_removal');
  }

  // Risk classification
  let riskLevel, riskDescription;
  if (conditionsMet === 5) {
    riskLevel = 'EXTREME';
    riskDescription = 'Very high probability of manipulation';
  } else if (conditionsMet === 4) {
    riskLevel = 'HIGH';
    riskDescription = 'Strong pump/dump signal';
  } else if (conditionsMet === 3) {
    riskLevel = 'MEDIUM';
    riskDescription = 'Warning level - monitor closely';
  } else {
    riskLevel = 'LOW';
    riskDescription = 'Normal market conditions';
  }

  return { conditionsMet, conditions, riskLevel, riskDescription };
}

/**
 * Fake Wall Detection
 * - Flash walls: walls that disappear within 30 seconds
 * - Wall pulling: 80%+ reduction in wall size
 */
function detectFakeWall(currentOrderBook, previousOrderBook) {
  const timeSinceLastUpdate = Date.now() - previousOrderBook.timestamp;

  for (const prevWall of previousOrderBook.largeWalls) {
    const currentWall = currentOrderBook.walls.find(w =>
      Math.abs(w.price - prevWall.price) / prevWall.price < 0.0001
    );

    // Flash wall: appeared and disappeared quickly
    if (!currentWall && timeSinceLastUpdate < 30000) {
      return { type: 'flash_wall', price: prevWall.price, volume: prevWall.volume };
    }

    // Wall pulling: significant reduction
    if (currentWall && (currentWall.volume / prevWall.volume) < 0.2) {
      return { type: 'wall_pulling', price: prevWall.price, reduction: 1 - (currentWall.volume / prevWall.volume) };
    }
  }

  return null;
}
```

### 5. Implementation Pattern

```javascript
class VolumePressureAnalyzer {
  constructor(config = {}) {
    this.lookbackPeriod = config.lookbackPeriod || 30;
    this.buyThreshold = config.buyThreshold || 1.5;
    this.sellThreshold = config.sellThreshold || 0.67;
    this.extremeThreshold = config.extremeThreshold || 2.5;

    this.volumeHistory = [];
    this.priceHistory = [];
  }

  update(candle) {
    this.volumeHistory.push({
      timestamp: candle.timestamp,
      volume: candle.volume,
      direction: candle.close > candle.open ? 'buy' : 'sell'
    });

    this.priceHistory.push(candle.close);

    // Keep only lookback period
    if (this.volumeHistory.length > this.lookbackPeriod) {
      this.volumeHistory.shift();
      this.priceHistory.shift();
    }
  }

  calculate() {
    const buyVolume = this.volumeHistory
      .filter(v => v.direction === 'buy')
      .reduce((sum, v) => sum + v.volume, 0);

    const sellVolume = this.volumeHistory
      .filter(v => v.direction === 'sell')
      .reduce((sum, v) => sum + v.volume, 0);

    const volumeRatio = buyVolume / (sellVolume + 1e-10);

    return {
      volumeRatio,
      buyVolume,
      sellVolume,
      score: this.calculateScore(volumeRatio),
      signal: this.getSignal(volumeRatio)
    };
  }

  calculateScore(vr) {
    // Normalize to 0-100 scale
    if (vr >= 2.5) return 100;
    if (vr >= 1.5) return 70;
    if (vr <= 0.4) return 0;
    if (vr <= 0.67) return 30;

    // Linear interpolation for neutral zone
    if (vr > 1.0) {
      return 50 + ((vr - 1.0) / 0.5) * 20;
    } else {
      return 30 + ((vr - 0.67) / 0.33) * 20;
    }
  }

  getSignal(vr) {
    if (vr >= this.extremeThreshold) {
      return { direction: 'bullish', strength: 'extreme', message: 'Extreme buy pressure' };
    }
    if (vr >= this.buyThreshold) {
      return { direction: 'bullish', strength: 'strong', message: 'Strong buy pressure' };
    }
    if (vr <= 1 / this.extremeThreshold) {
      return { direction: 'bearish', strength: 'extreme', message: 'Extreme sell pressure' };
    }
    if (vr <= this.sellThreshold) {
      return { direction: 'bearish', strength: 'strong', message: 'Strong sell pressure' };
    }
    return { direction: 'neutral', strength: 'weak', message: 'Balanced volume' };
  }
}
```

## Verification

Test the volume pressure analyzer:

```javascript
// Create analyzer
const analyzer = new VolumePressureAnalyzer({
  lookbackPeriod: 30,
  buyThreshold: 1.5,
  sellThreshold: 0.67
});

// Feed candles
const testCandles = [
  { timestamp: 1, open: 100, close: 105, volume: 1000 }, // Buy
  { timestamp: 2, open: 105, close: 103, volume: 500 },  // Sell
  { timestamp: 3, open: 103, close: 108, volume: 1500 }, // Buy
  // ... more candles
];

testCandles.forEach(candle => analyzer.update(candle));

// Get result
const result = analyzer.calculate();
console.log('Volume Ratio:', result.volumeRatio);
console.log('Score:', result.score);
console.log('Signal:', result.signal);

// Verify:
// ✅ VR > 1.5 should produce 'strong buy pressure'
// ✅ VR < 0.67 should produce 'strong sell pressure'
// ✅ Score should be 0-100
```

## Example

### Multi-Timeframe Volume Pressure

```javascript
// Analyze across 4 timeframes
const timeframes = ['M5', 'M15', 'H1', 'H2'];
const analyzers = timeframes.map(tf => ({
  timeframe: tf,
  analyzer: new VolumePressureAnalyzer()
}));

// Update all analyzers with their respective candles
// ... feed data ...

// Calculate alignment
const results = analyzers.map(({ timeframe, analyzer }) => ({
  timeframe,
  ...analyzer.calculate()
}));

// Check how many timeframes align
const bullishCount = results.filter(r => r.signal.direction === 'bullish').length;
const alignmentScore = (bullishCount / timeframes.length) * 100;

console.log('Alignment Score:', alignmentScore);
// 100% = All 4 timeframes show buying pressure
// 75% = 3/4 timeframes align
// etc.
```

## References

- **Source:** Building a volume pressure.txt (conversation between Claude and Mirko)
- **Formula:** VR = buy_volume / (sell_volume + epsilon)
- **Thresholds:** 1.5 (strong), 0.67 (inverse), 2.5 (extreme), 0.4 (extreme inverse)
- **Multi-component:** 40% VR + 30% MTF + 30% momentum
- **ATR Normalization:** strength = volume / (ATR14 * price)
- **Order Book:** Cluster detection with 0.05% tolerance, minimum 3 orders
- **Pump/Dump:** 5-condition system (volume spike 2-3x, OB imbalance >70%, ATR expansion 1.5x, MTF divergence, wall removal)
- **Fake Walls:** Flash walls <30s lifetime, wall pulling >80% reduction
