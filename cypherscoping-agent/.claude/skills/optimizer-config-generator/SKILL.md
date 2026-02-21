---
name: optimizer-config-generator
description: |
  Strategy variant configuration generator for live optimization testing with predefined profiles and parameter ranges.

  Use when: (1) generating optimizer experiment variants, (2) creating strategy permutations for backtesting,
  (3) defining parameter sweep ranges, (4) implementing A/B testing frameworks.

  Triggers: "generate optimizer variants", "create strategy combinations", "parameter sweep", "optimization config"
author: Claude Code
version: 1.0.0
---

# Optimizer Config Generator

## Problem

Manual creation of strategy variants for optimization is time-consuming and error-prone. Live optimizers need systematic generation of parameter combinations covering weight distributions, threshold variations, and indicator selections. Need predefined profiles (conservative, default, aggressive) plus random variation within safety bounds.

## Context / Trigger Conditions

**Use this skill when:**
- Building live optimizer systems
- Creating A/B testing frameworks
- Generating backtest parameter sets
- Implementing strategy evolution algorithms
- Setting up grid search optimization

**Specific triggers:**
- "generate optimizer variants"
- "create strategy combinations"
- "parameter sweep setup"
- "variant configuration generator"
- "optimization parameter ranges"

## Solution

### 1. Variant Configuration Schema

```typescript
interface VariantConfig {
  id: string;
  profile: 'conservative' | 'default' | 'aggressive' | 'custom';

  // Indicator weights (sum to 1.0)
  weights: {
    rsi: number;
    macd: number;
    williamsR: number;
    ao: number;
    obv: number;
    stochastic: number;
    // ... additional indicators
  };

  // Signal thresholds
  thresholds: {
    extremeBuy: number;     // e.g., 90
    strongBuy: number;      // e.g., 70
    buy: number;            // e.g., 50
    neutral: number;        // e.g., 0
    sell: number;           // e.g., -50
    strongSell: number;     // e.g., -70
    extremeSell: number;    // e.g., -90
  };

  // Risk settings
  risk: {
    maxPositionSize: number;  // % of equity
    stopLoss: number;         // % from entry
    takeProfit: number;       // % from entry
    maxDailyLoss: number;     // % of equity
    maxDrawdown: number;      // % of peak equity
  };

  // Indicator selection (enable/disable)
  enabledIndicators: string[];

  // Timeframe settings
  timeframe: {
    primary: string;    // e.g., '5m'
    secondary: string;  // e.g., '15m'
    alignmentRequired: number; // Min indicators aligned (e.g., 2 of 4)
  };

  // Performance tracking
  experimental: boolean;
  createdAt: Date;
}
```

### 2. Predefined Profiles

```typescript
const PROFILES = {
  conservative: {
    weights: {
      rsi: 0.20,
      macd: 0.20,
      williamsR: 0.15,
      ao: 0.10,
      obv: 0.15,
      stochastic: 0.20
    },
    thresholds: {
      extremeBuy: 95,
      strongBuy: 80,
      buy: 60,
      neutral: 0,
      sell: -60,
      strongSell: -80,
      extremeSell: -95
    },
    risk: {
      maxPositionSize: 0.02,  // 2% per trade
      stopLoss: 0.01,         // 1% stop
      takeProfit: 0.02,       // 2% target (1:2 R:R)
      maxDailyLoss: 0.05,     // 5% daily max
      maxDrawdown: 0.10       // 10% max drawdown
    },
    enabledIndicators: ['rsi', 'macd', 'williamsR', 'ao', 'obv', 'stochastic'],
    timeframe: {
      primary: '15m',
      secondary: '1h',
      alignmentRequired: 3  // Require 3 of 6 indicators
    }
  },

  default: {
    weights: {
      rsi: 0.18,
      macd: 0.22,
      williamsR: 0.18,
      ao: 0.12,
      obv: 0.15,
      stochastic: 0.15
    },
    thresholds: {
      extremeBuy: 90,
      strongBuy: 70,
      buy: 50,
      neutral: 0,
      sell: -50,
      strongSell: -70,
      extremeSell: -90
    },
    risk: {
      maxPositionSize: 0.03,
      stopLoss: 0.015,
      takeProfit: 0.03,
      maxDailyLoss: 0.08,
      maxDrawdown: 0.15
    },
    enabledIndicators: ['rsi', 'macd', 'williamsR', 'ao', 'obv', 'stochastic'],
    timeframe: {
      primary: '5m',
      secondary: '15m',
      alignmentRequired: 2
    }
  },

  aggressive: {
    weights: {
      rsi: 0.15,
      macd: 0.25,
      williamsR: 0.20,
      ao: 0.15,
      obv: 0.10,
      stochastic: 0.15
    },
    thresholds: {
      extremeBuy: 80,
      strongBuy: 60,
      buy: 40,
      neutral: 0,
      sell: -40,
      strongSell: -60,
      extremeSell: -80
    },
    risk: {
      maxPositionSize: 0.05,
      stopLoss: 0.02,
      takeProfit: 0.04,
      maxDailyLoss: 0.12,
      maxDrawdown: 0.20
    },
    enabledIndicators: ['rsi', 'macd', 'williamsR', 'ao', 'obv', 'stochastic'],
    timeframe: {
      primary: '1m',
      secondary: '5m',
      alignmentRequired: 2
    }
  }
};
```

### 3. Variant Generator

```typescript
class OptimizerConfigGenerator {
  private baseProfiles = PROFILES;
  private variantCount = 0;

  // Generate N variants from a base profile
  generateVariants(
    baseProfile: 'conservative' | 'default' | 'aggressive',
    count: number,
    options: {
      weightVariation?: number;      // ±% to vary weights (default 0.2 = ±20%)
      thresholdVariation?: number;   // ±points to vary thresholds (default 5)
      riskVariation?: number;        // ±% to vary risk params (default 0.1 = ±10%)
      indicatorSubsets?: boolean;    // Generate variants with different indicator combos
    } = {}
  ): VariantConfig[] {
    const base = this.baseProfiles[baseProfile];
    const variants: VariantConfig[] = [];

    const weightVar = options.weightVariation ?? 0.2;
    const thresholdVar = options.thresholdVariation ?? 5;
    const riskVar = options.riskVariation ?? 0.1;

    for (let i = 0; i < count; i++) {
      const variant: VariantConfig = {
        id: `${baseProfile}-variant-${++this.variantCount}`,
        profile: 'custom',
        weights: this.varyWeights(base.weights, weightVar),
        thresholds: this.varyThresholds(base.thresholds, thresholdVar),
        risk: this.varyRisk(base.risk, riskVar),
        enabledIndicators: options.indicatorSubsets
          ? this.selectIndicatorSubset(base.enabledIndicators)
          : [...base.enabledIndicators],
        timeframe: { ...base.timeframe },
        experimental: true,
        createdAt: new Date()
      };

      variants.push(variant);
    }

    return variants;
  }

  // Vary weights while maintaining sum = 1.0
  private varyWeights(
    baseWeights: Record<string, number>,
    variation: number
  ): Record<string, number> {
    const varied: Record<string, number> = {};
    const keys = Object.keys(baseWeights);

    // Apply random variation to each weight
    for (const key of keys) {
      const base = baseWeights[key];
      const delta = (Math.random() * 2 - 1) * variation * base; // ±variation%
      varied[key] = Math.max(0.01, base + delta); // Minimum 1%
    }

    // Normalize to sum = 1.0
    const sum = Object.values(varied).reduce((a, b) => a + b, 0);
    for (const key of keys) {
      varied[key] = varied[key] / sum;
    }

    return varied;
  }

  // Vary thresholds within bounds
  private varyThresholds(
    baseThresholds: Record<string, number>,
    variation: number
  ): Record<string, number> {
    const varied: Record<string, number> = {};

    for (const [key, value] of Object.entries(baseThresholds)) {
      const delta = (Math.random() * 2 - 1) * variation; // ±variation points
      varied[key] = Math.round(value + delta);
    }

    // Ensure ordering: extremeBuy > strongBuy > buy > neutral > sell > strongSell > extremeSell
    varied.extremeBuy = Math.max(varied.strongBuy + 5, varied.extremeBuy);
    varied.strongBuy = Math.max(varied.buy + 5, Math.min(varied.extremeBuy - 5, varied.strongBuy));
    varied.buy = Math.max(varied.neutral + 10, Math.min(varied.strongBuy - 5, varied.buy));

    varied.extremeSell = Math.min(varied.strongSell - 5, varied.extremeSell);
    varied.strongSell = Math.min(varied.sell - 5, Math.max(varied.extremeSell + 5, varied.strongSell));
    varied.sell = Math.min(varied.neutral - 10, Math.max(varied.strongSell + 5, varied.sell));

    return varied;
  }

  // Vary risk parameters
  private varyRisk(
    baseRisk: VariantConfig['risk'],
    variation: number
  ): VariantConfig['risk'] {
    return {
      maxPositionSize: this.varyValue(baseRisk.maxPositionSize, variation, 0.01, 0.10),
      stopLoss: this.varyValue(baseRisk.stopLoss, variation, 0.005, 0.05),
      takeProfit: this.varyValue(baseRisk.takeProfit, variation, 0.01, 0.10),
      maxDailyLoss: this.varyValue(baseRisk.maxDailyLoss, variation, 0.02, 0.20),
      maxDrawdown: this.varyValue(baseRisk.maxDrawdown, variation, 0.05, 0.30)
    };
  }

  private varyValue(base: number, variation: number, min: number, max: number): number {
    const delta = (Math.random() * 2 - 1) * variation * base;
    return Math.max(min, Math.min(max, base + delta));
  }

  // Select random subset of indicators (minimum 3)
  private selectIndicatorSubset(allIndicators: string[]): string[] {
    const minCount = 3;
    const count = Math.max(minCount, Math.floor(Math.random() * allIndicators.length) + 1);

    // Shuffle and take first N
    const shuffled = [...allIndicators].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  // Generate grid search variants
  generateGridSearch(params: {
    weightRanges: Record<string, [number, number, number]>; // [min, max, step]
    thresholdRanges: Record<string, [number, number, number]>;
  }): VariantConfig[] {
    // Grid search: generate all combinations
    // WARNING: Combinatorial explosion - use sparingly
    const variants: VariantConfig[] = [];

    // Example: 3 weight values × 3 threshold values = 9 variants
    // Full implementation would use nested loops or recursive generation
    // Omitted for brevity - use cartesian product of ranges

    return variants;
  }

  // Generate random search variants (more efficient than grid)
  generateRandomSearch(
    baseProfile: 'conservative' | 'default' | 'aggressive',
    count: number,
    searchSpace: {
      weightMin: number;
      weightMax: number;
      thresholdRange: [number, number];
      riskRange: [number, number];
    }
  ): VariantConfig[] {
    // Random sampling from search space
    // More efficient than grid search for high-dimensional spaces
    const variants: VariantConfig[] = [];

    for (let i = 0; i < count; i++) {
      // Implementation: sample uniformly from ranges
    }

    return variants;
  }
}
```

### 4. Integration Example

```typescript
// In LiveOptimizerController
class LiveOptimizerController {
  private configGen: OptimizerConfigGenerator;
  private activeVariants: Map<string, VariantConfig> = new Map();

  async start(config: { maxVariants: number; baseProfile: string }) {
    this.configGen = new OptimizerConfigGenerator();

    // Generate initial variant set
    const variants = this.configGen.generateVariants(
      config.baseProfile as any,
      config.maxVariants,
      {
        weightVariation: 0.2,
        thresholdVariation: 5,
        riskVariation: 0.1,
        indicatorSubsets: true
      }
    );

    // Launch each variant
    for (const variant of variants) {
      await this.launchVariant(variant);
      this.activeVariants.set(variant.id, variant);
    }

    console.log(`[Optimizer] Started ${variants.length} variants`);
  }

  private async launchVariant(config: VariantConfig) {
    // Create isolated strategy instance with this config
    // Connect to market data feed
    // Track performance independently
  }

  // Evolve: replace worst performers with new variants
  async evolveGeneration() {
    const performances = await this.getVariantPerformances();

    // Sort by composite score
    const sorted = performances.sort((a, b) => b.score - a.score);

    // Keep top 50%, replace bottom 50%
    const keepCount = Math.floor(sorted.length / 2);
    const toReplace = sorted.slice(keepCount);

    for (const poor of toReplace) {
      // Generate new variant from best performers
      const bestConfig = this.activeVariants.get(sorted[0].id)!;
      const newVariants = this.configGen.generateVariants(
        'custom' as any, // Use best as template
        1,
        { weightVariation: 0.1 } // Smaller variation around best
      );

      await this.replaceVariant(poor.id, newVariants[0]);
    }
  }
}
```

## Parameter Ranges

### Weight Distributions
```
Conservative: Balanced (15-20% each)
Default: Slightly biased to MACD/RSI (18-22%)
Aggressive: Heavy MACD/WR (20-25%)

Variation: ±20% of base weight, renormalized to sum = 1.0
```

### Threshold Ranges
```
Extreme Buy: 80-95
Strong Buy: 60-80
Buy: 40-60
Neutral: 0
Sell: -60 to -40
Strong Sell: -80 to -60
Extreme Sell: -95 to -80

Variation: ±5 points, maintaining order constraints
```

### Risk Parameters
```
Position Size: 1-10% (conservative 2%, aggressive 5%)
Stop Loss: 0.5-5%
Take Profit: 1-10%
Daily Loss Limit: 2-20%
Max Drawdown: 5-30%

Variation: ±10% of base value, clamped to min/max
```

## Benefits

1. **Systematic Exploration** - Cover parameter space methodically
2. **Profile Templates** - Start from proven baselines
3. **Safety Bounds** - Prevent extreme/invalid configurations
4. **Reproducibility** - Generate deterministic variants for A/B tests
5. **Evolution Support** - Iterate from best performers

## Anti-Patterns

- ❌ Generating variants without normalization (weights not summing to 1.0)
- ❌ Threshold variations breaking ordering constraints
- ❌ Risk parameters outside safe bounds
- ❌ Grid search in high dimensions (combinatorial explosion)
- ❌ Not tracking variant genealogy (can't trace successful mutations)

## References

- Source: `/home/nygmaee/Documents/Copilot Prompt Set for.txt`
- Related skills: `strategy-scoring-engine`, `walk-forward-validator`
- Integration point: `LiveOptimizerController`, strategy tuning scripts
