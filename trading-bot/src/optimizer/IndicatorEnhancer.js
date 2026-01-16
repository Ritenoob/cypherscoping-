/**
 * Indicator Enhancement System
 * 
 * Auto-tunes indicator parameters based on market conditions
 * and historical performance analysis.
 */

class IndicatorEnhancer {
  constructor(config = {}) {
    this.parameterRanges = config.parameterRanges || this._getDefaultRanges();
    this.optimizationWindow = config.optimizationWindow || 500;
    this.reoptimizeInterval = config.reoptimizeInterval || 100;
    
    this.currentParams = {};
    this.performanceHistory = [];
    this.candleCount = 0;
  }

  _getDefaultRanges() {
    return {
      rsi: {
        period: { min: 7, max: 21, step: 1 },
        oversold: { min: 20, max: 35, step: 5 },
        overbought: { min: 65, max: 80, step: 5 }
      },
      macd: {
        fastPeriod: { min: 8, max: 15, step: 1 },
        slowPeriod: { min: 20, max: 30, step: 1 },
        signalPeriod: { min: 5, max: 12, step: 1 }
      },
      williamsR: {
        period: { min: 10, max: 20, step: 1 },
        oversold: { min: -90, max: -75, step: 5 },
        overbought: { min: -25, max: -10, step: 5 }
      },
      stochastic: {
        kPeriod: { min: 10, max: 18, step: 1 },
        dPeriod: { min: 2, max: 5, step: 1 },
        oversold: { min: 15, max: 25, step: 5 },
        overbought: { min: 75, max: 85, step: 5 }
      },
      kdj: {
        kPeriod: { min: 7, max: 14, step: 1 },
        jOversold: { min: 10, max: 25, step: 5 },
        jOverbought: { min: 75, max: 90, step: 5 }
      },
      bollinger: {
        period: { min: 15, max: 25, step: 1 },
        stdDev: { min: 1.5, max: 2.5, step: 0.5 }
      }
    };
  }

  generateParameterCombinations(indicator) {
    const ranges = this.parameterRanges[indicator];
    if (!ranges) return [{}];
    
    const combinations = [];
    const params = Object.keys(ranges);
    
    const generate = (index, current) => {
      if (index === params.length) {
        combinations.push({ ...current });
        return;
      }
      
      const param = params[index];
      const { min, max, step } = ranges[param];
      
      for (let value = min; value <= max; value += step) {
        current[param] = value;
        generate(index + 1, current);
      }
    };
    
    generate(0, {});
    
    if (combinations.length > 100) {
      const sampled = [];
      for (let i = 0; i < 100; i++) {
        const idx = Math.floor(Math.random() * combinations.length);
        sampled.push(combinations[idx]);
      }
      return sampled;
    }
    
    return combinations;
  }

  evaluateParameters(indicator, params, historicalData) {
    const IndicatorClass = this._getIndicatorClass(indicator);
    if (!IndicatorClass) return { score: 0, accuracy: 0, timing: 0 };
    
    const ind = new IndicatorClass(params);
    
    let signals = [];
    let prices = [];
    
    for (const candle of historicalData) {
      const result = ind.update(candle);
      
      if (result.signals && result.signals.length > 0) {
        signals.push({
          ts: candle.ts,
          price: candle.close,
          signals: result.signals
        });
      }
      
      prices.push(candle.close);
    }
    
    return this._calculateSignalQuality(signals, prices);
  }

  _calculateSignalQuality(signals, prices) {
    if (signals.length === 0) {
      return { score: 0, accuracy: 0, timing: 0 };
    }
    
    let correctSignals = 0;
    let totalTimingScore = 0;
    
    for (let i = 0; i < signals.length; i++) {
      const signal = signals[i];
      const priceIndex = prices.length - (signals.length - i);
      
      const lookAhead = Math.min(20, prices.length - priceIndex - 1);
      
      if (lookAhead < 5) continue;
      
      const entryPrice = prices[priceIndex];
      const futurePrices = prices.slice(priceIndex + 1, priceIndex + lookAhead + 1);
      
      const maxPrice = Math.max(...futurePrices);
      const minPrice = Math.min(...futurePrices);
      
      const isBullish = signal.signals.some(s => s.direction === 'bullish');
      const isBearish = signal.signals.some(s => s.direction === 'bearish');
      
      if (isBullish) {
        const upMove = (maxPrice - entryPrice) / entryPrice * 100;
        const downMove = (entryPrice - minPrice) / entryPrice * 100;
        
        if (upMove > downMove && upMove > 0.5) {
          correctSignals++;
          totalTimingScore += Math.min(1, upMove / 2);
        }
      } else if (isBearish) {
        const downMove = (entryPrice - minPrice) / entryPrice * 100;
        const upMove = (maxPrice - entryPrice) / entryPrice * 100;
        
        if (downMove > upMove && downMove > 0.5) {
          correctSignals++;
          totalTimingScore += Math.min(1, downMove / 2);
        }
      }
    }
    
    const accuracy = signals.length > 0 ? correctSignals / signals.length : 0;
    const timing = signals.length > 0 ? totalTimingScore / signals.length : 0;
    
    const score = accuracy * 0.6 + timing * 0.4;
    
    return { score, accuracy, timing, signalCount: signals.length };
  }

  _getIndicatorClass(indicator) {
    try {
      const indicators = {
        rsi: require('../indicators/RSIIndicator'),
        macd: require('../indicators/MACDIndicator'),
        williamsR: require('../indicators/WilliamsRIndicator'),
        ao: require('../indicators/AwesomeOscillator'),
        stochastic: require('../indicators/StochasticIndicator'),
        bollinger: require('../indicators/BollingerBands'),
        kdj: require('../indicators/KDJIndicator'),
        obv: require('../indicators/OBVIndicator')
      };
      
      return indicators[indicator];
    } catch (err) {
      console.error(`[Enhancer] Failed to load indicator ${indicator}:`, err.message);
      return null;
    }
  }

  async optimizeIndicator(indicator, historicalData) {
    const combinations = this.generateParameterCombinations(indicator);
    
    let bestParams = null;
    let bestScore = -Infinity;
    
    for (const params of combinations) {
      const result = this.evaluateParameters(indicator, params, historicalData);
      
      if (result.score > bestScore) {
        bestScore = result.score;
        bestParams = { ...params, metrics: result };
      }
    }
    
    return bestParams;
  }

  async enhanceAll(historicalData) {
    const enhanced = {};
    
    const indicators = ['rsi', 'macd', 'williamsR', 'stochastic', 'kdj', 'bollinger'];
    
    for (const ind of indicators) {
      console.log(`[Enhancer] Optimizing ${ind}...`);
      const optimal = await this.optimizeIndicator(ind, historicalData);
      enhanced[ind] = optimal;
      console.log(`[Enhancer] ${ind} optimal params:`, optimal);
    }
    
    return enhanced;
  }
}

module.exports = IndicatorEnhancer;
