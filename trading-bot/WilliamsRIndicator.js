/**
 * Williams %R Indicator - Optimized Entry Logic v2.0
 * 
 * Based on visual analysis of live KuCoin trading charts (XRPUSDT, VIRTUALUSDT, BTC),
 * this implementation uses a "rise from oversold" entry strategy.
 * 
 * KEY INSIGHT FROM CHART ANALYSIS:
 * The signal is NOT "price is oversold" - that's just a setup.
 * The signal IS "price WAS oversold and is NOW emerging" - the crossover.
 * 
 * Entry Logic (derived from chart study):
 * - LONG: %R must reach deep oversold (<-85), then rise and cross ABOVE -80
 * - SHORT: %R must reach deep overbought (>-15), then fall and cross BELOW -20
 * 
 * The strength of the rise/fall from the extreme determines signal confidence.
 * 
 * @version 2.0.0 - Optimized based on live chart analysis
 */

class WilliamsRIndicator {
  constructor(config = {}) {
    // Core parameters
    this.period = config.period || 14;
    this.oversoldLevel = config.oversold || -80;
    this.overboughtLevel = config.overbought || -20;
    
    // Optimized thresholds from chart analysis
    this.deepOversold = config.deepOversold || -85;      // Must reach this for valid long setup
    this.deepOverbought = config.deepOverbought || -15;  // Must reach this for valid short setup
    this.minRiseStrength = config.minRiseStrength || 10; // Minimum points rise for signal
    this.minFallStrength = config.minFallStrength || 10; // Minimum points fall for signal
    this.lookbackBars = config.lookbackBars || 5;        // Bars to check for recent extreme
    
    // State arrays
    this.highs = [];
    this.lows = [];
    this.closes = [];
    
    // Current and previous values for crossover detection
    this.currentValue = null;
    this.prevValue = null;
    
    // History for analysis
    this.wrHistory = [];
    this.priceHistory = [];
    this.maxHistory = config.historyLength || 50;
    
    // Track setup conditions
    this.wasDeepOversold = false;
    this.wasDeepOverbought = false;
    this.deepOversoldValue = null;
    this.deepOverboughtValue = null;
    this.barsInSetup = 0;
  }

  /**
   * Update indicator with new candle
   */
  update(candle) {
    const { high, low, close } = candle;
    
    this.prevValue = this.currentValue;
    
    // Update price arrays
    this.highs.push(high);
    this.lows.push(low);
    this.closes.push(close);
    
    if (this.highs.length > this.period) {
      this.highs.shift();
      this.lows.shift();
      this.closes.shift();
    }
    
    // Not enough data yet
    if (this.highs.length < this.period) {
      return this.getResult();
    }
    
    // Calculate Williams %R
    const highestHigh = Math.max(...this.highs);
    const lowestLow = Math.min(...this.lows);
    const range = highestHigh - lowestLow;
    
    this.currentValue = range === 0 ? -50 : ((highestHigh - close) / range) * -100;
    
    // Update history
    this.wrHistory.push(this.currentValue);
    this.priceHistory.push(close);
    
    if (this.wrHistory.length > this.maxHistory) {
      this.wrHistory.shift();
      this.priceHistory.shift();
    }
    
    // Update setup tracking
    this.updateSetupTracking();
    
    return this.getResult();
  }

  /**
   * Track when price enters deep oversold/overbought for setup detection
   * This is critical: we need to know if price WAS in extreme territory
   */
  updateSetupTracking() {
    if (this.currentValue === null) return;
    
    // Track deep oversold setup
    if (this.currentValue <= this.deepOversold) {
      this.wasDeepOversold = true;
      this.deepOversoldValue = Math.min(
        this.deepOversoldValue ?? this.currentValue, 
        this.currentValue
      );
      this.barsInSetup = 0;
    } else if (this.wasDeepOversold) {
      this.barsInSetup++;
      // Reset setup if too many bars pass without signal
      if (this.barsInSetup > 10 || this.currentValue > -50) {
        this.wasDeepOversold = false;
        this.deepOversoldValue = null;
        this.barsInSetup = 0;
      }
    }
    
    // Track deep overbought setup
    if (this.currentValue >= this.deepOverbought) {
      this.wasDeepOverbought = true;
      this.deepOverboughtValue = Math.max(
        this.deepOverboughtValue ?? this.currentValue,
        this.currentValue
      );
      this.barsInSetup = 0;
    } else if (this.wasDeepOverbought) {
      this.barsInSetup++;
      // Reset setup if too many bars pass without signal
      if (this.barsInSetup > 10 || this.currentValue < -50) {
        this.wasDeepOverbought = false;
        this.deepOverboughtValue = null;
        this.barsInSetup = 0;
      }
    }
  }

  /**
   * Detect crossover from oversold - PRIMARY LONG SIGNAL
   * 
   * Logic from chart analysis:
   * 1. %R must have been below -85 (deep oversold)
   * 2. Previous %R must be below -80
   * 3. Current %R must cross above -80
   * 4. Rise strength must exceed minimum threshold
   */
  getCrossover() {
    if (this.prevValue === null || this.currentValue === null) return null;
    
    const momentum = this.currentValue - this.prevValue;
    
    // ========================================
    // BULLISH CROSSOVER (Long Entry Signal)
    // ========================================
    const crossedAboveOversold = this.prevValue <= this.oversoldLevel && 
                                  this.currentValue > this.oversoldLevel;
    
    if (crossedAboveOversold && this.wasDeepOversold) {
      const riseStrength = this.currentValue - (this.deepOversoldValue || this.oversoldLevel);
      
      if (riseStrength >= this.minRiseStrength) {
        // Clear setup after signal
        const setupValue = this.deepOversoldValue;
        this.wasDeepOversold = false;
        this.deepOversoldValue = null;
        
        return {
          type: 'bullish_crossover',
          direction: 'bullish',
          strength: riseStrength >= 15 ? 'very_strong' : 'strong',
          message: `LONG SIGNAL: %R crossed above -80 from deep oversold (${setupValue?.toFixed(1)})`,
          metadata: {
            from: this.prevValue,
            to: this.currentValue,
            deepValue: setupValue,
            riseStrength,
            momentum,
            signalQuality: this.calculateSignalQuality('long', riseStrength, momentum)
          }
        };
      }
    }
    
    // Early bullish signal - rising toward crossover
    if (this.wasDeepOversold && momentum > 0 && this.currentValue < this.oversoldLevel) {
      const riseStrength = this.currentValue - (this.deepOversoldValue || -100);
      if (riseStrength >= this.minRiseStrength * 0.6) {
        return {
          type: 'bullish_emerging',
          direction: 'bullish',
          strength: 'moderate',
          message: `LONG SETUP: %R rising from deep oversold, approaching crossover`,
          metadata: {
            from: this.prevValue,
            to: this.currentValue,
            deepValue: this.deepOversoldValue,
            riseStrength,
            momentum,
            distanceToCrossover: this.oversoldLevel - this.currentValue
          }
        };
      }
    }
    
    // ========================================
    // BEARISH CROSSOVER (Short Entry Signal)
    // ========================================
    const crossedBelowOverbought = this.prevValue >= this.overboughtLevel && 
                                    this.currentValue < this.overboughtLevel;
    
    if (crossedBelowOverbought && this.wasDeepOverbought) {
      const fallStrength = (this.deepOverboughtValue || this.overboughtLevel) - this.currentValue;
      
      if (fallStrength >= this.minFallStrength) {
        // Clear setup after signal
        const setupValue = this.deepOverboughtValue;
        this.wasDeepOverbought = false;
        this.deepOverboughtValue = null;
        
        return {
          type: 'bearish_crossover',
          direction: 'bearish',
          strength: fallStrength >= 15 ? 'very_strong' : 'strong',
          message: `SHORT SIGNAL: %R crossed below -20 from deep overbought (${setupValue?.toFixed(1)})`,
          metadata: {
            from: this.prevValue,
            to: this.currentValue,
            deepValue: setupValue,
            fallStrength,
            momentum,
            signalQuality: this.calculateSignalQuality('short', fallStrength, momentum)
          }
        };
      }
    }
    
    // Early bearish signal - falling toward crossover
    if (this.wasDeepOverbought && momentum < 0 && this.currentValue > this.overboughtLevel) {
      const fallStrength = (this.deepOverboughtValue || 0) - this.currentValue;
      if (fallStrength >= this.minFallStrength * 0.6) {
        return {
          type: 'bearish_emerging',
          direction: 'bearish',
          strength: 'moderate',
          message: `SHORT SETUP: %R falling from deep overbought, approaching crossover`,
          metadata: {
            from: this.prevValue,
            to: this.currentValue,
            deepValue: this.deepOverboughtValue,
            fallStrength,
            momentum,
            distanceToCrossover: this.currentValue - this.overboughtLevel
          }
        };
      }
    }
    
    return null;
  }

  /**
   * Calculate signal quality score (0-100)
   */
  calculateSignalQuality(direction, strength, momentum) {
    let score = 50; // Base score
    
    // Strength contribution (0-30 points)
    const strengthScore = Math.min(30, (strength / 20) * 30);
    score += strengthScore;
    
    // Momentum contribution (0-20 points)
    const momScore = Math.min(20, (Math.abs(momentum) / 10) * 20);
    score += momScore;
    
    return Math.min(100, Math.round(score));
  }

  /**
   * Detect divergence patterns
   */
  getDivergence() {
    if (this.wrHistory.length < 20) return null;
    
    const recentWR = this.wrHistory.slice(-14);
    const recentPrices = this.priceHistory.slice(-14);
    
    // Find swing lows for bullish divergence
    const priceLows = this.findSwingLows(recentPrices);
    const wrLows = this.findSwingLows(recentWR);
    
    if (priceLows.length >= 2 && wrLows.length >= 2) {
      const lastPriceIdx = priceLows[priceLows.length - 1];
      const prevPriceIdx = priceLows[priceLows.length - 2];
      const lastWRIdx = wrLows[wrLows.length - 1];
      const prevWRIdx = wrLows[wrLows.length - 2];
      
      const lastPrice = recentPrices[lastPriceIdx];
      const prevPrice = recentPrices[prevPriceIdx];
      const lastWR = recentWR[lastWRIdx];
      const prevWR = recentWR[prevWRIdx];
      
      // Bullish divergence: price lower low, %R higher low (in oversold)
      if (lastPrice < prevPrice && lastWR > prevWR && lastWR < this.oversoldLevel) {
        return {
          type: 'bullish_divergence',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'Bullish divergence: price making lower lows, %R making higher lows',
          metadata: { 
            priceDelta: lastPrice - prevPrice,
            wrDelta: lastWR - prevWR,
            lastWR,
            inOversold: true
          }
        };
      }
    }
    
    // Find swing highs for bearish divergence
    const priceHighs = this.findSwingHighs(recentPrices);
    const wrHighs = this.findSwingHighs(recentWR);
    
    if (priceHighs.length >= 2 && wrHighs.length >= 2) {
      const lastPriceIdx = priceHighs[priceHighs.length - 1];
      const prevPriceIdx = priceHighs[priceHighs.length - 2];
      const lastWRIdx = wrHighs[wrHighs.length - 1];
      const prevWRIdx = wrHighs[wrHighs.length - 2];
      
      const lastPrice = recentPrices[lastPriceIdx];
      const prevPrice = recentPrices[prevPriceIdx];
      const lastWR = recentWR[lastWRIdx];
      const prevWR = recentWR[prevWRIdx];
      
      // Bearish divergence: price higher high, %R lower high (in overbought)
      if (lastPrice > prevPrice && lastWR < prevWR && lastWR > this.overboughtLevel) {
        return {
          type: 'bearish_divergence',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'Bearish divergence: price making higher highs, %R making lower highs',
          metadata: { 
            priceDelta: lastPrice - prevPrice,
            wrDelta: lastWR - prevWR,
            lastWR,
            inOverbought: true
          }
        };
      }
    }
    
    return null;
  }

  /**
   * Get zone information (for context, not primary signals)
   */
  getZone() {
    if (this.currentValue === null) return null;
    
    if (this.currentValue <= this.deepOversold) {
      return {
        type: 'deep_oversold_zone',
        direction: 'bullish',
        strength: 'setup',
        message: `%R in DEEP oversold (${this.currentValue.toFixed(1)}). Watching for rise.`,
        metadata: { value: this.currentValue, threshold: this.deepOversold, isSetup: true }
      };
    }
    
    if (this.currentValue < this.oversoldLevel) {
      return {
        type: 'oversold_zone',
        direction: 'bullish',
        strength: 'setup',
        message: `%R in oversold zone (${this.currentValue.toFixed(1)}). Need deeper for signal.`,
        metadata: { value: this.currentValue, threshold: this.oversoldLevel, isSetup: false }
      };
    }
    
    if (this.currentValue >= this.deepOverbought) {
      return {
        type: 'deep_overbought_zone',
        direction: 'bearish',
        strength: 'setup',
        message: `%R in DEEP overbought (${this.currentValue.toFixed(1)}). Watching for fall.`,
        metadata: { value: this.currentValue, threshold: this.deepOverbought, isSetup: true }
      };
    }
    
    if (this.currentValue > this.overboughtLevel) {
      return {
        type: 'overbought_zone',
        direction: 'bearish',
        strength: 'setup',
        message: `%R in overbought zone (${this.currentValue.toFixed(1)}). Need higher for signal.`,
        metadata: { value: this.currentValue, threshold: this.overboughtLevel, isSetup: false }
      };
    }
    
    return null;
  }

  /**
   * Find swing low indices in data array
   */
  findSwingLows(data) {
    const lows = [];
    for (let i = 2; i < data.length - 2; i++) {
      if (data[i] < data[i-1] && data[i] < data[i-2] &&
          data[i] < data[i+1] && data[i] < data[i+2]) {
        lows.push(i);
      }
    }
    return lows;
  }

  /**
   * Find swing high indices in data array
   */
  findSwingHighs(data) {
    const highs = [];
    for (let i = 2; i < data.length - 2; i++) {
      if (data[i] > data[i-1] && data[i] > data[i-2] &&
          data[i] > data[i+1] && data[i] > data[i+2]) {
        highs.push(i);
      }
    }
    return highs;
  }

  /**
   * Get all current signals
   */
  getSignals() {
    const signals = [];
    
    // Primary signal: crossover
    const crossover = this.getCrossover();
    if (crossover) signals.push(crossover);
    
    // Secondary signal: divergence
    const divergence = this.getDivergence();
    if (divergence) signals.push(divergence);
    
    // Context: zone information
    const zone = this.getZone();
    if (zone) signals.push(zone);
    
    return signals;
  }

  /**
   * Get complete result object
   */
  getResult() {
    const signals = this.currentValue !== null ? this.getSignals() : [];
    
    // Calculate aggregate signal score
    let signalScore = 0;
    for (const sig of signals) {
      if (sig.type === 'bullish_crossover') signalScore += 25;
      else if (sig.type === 'bearish_crossover') signalScore -= 25;
      else if (sig.type === 'bullish_emerging') signalScore += 12;
      else if (sig.type === 'bearish_emerging') signalScore -= 12;
      else if (sig.type === 'bullish_divergence') signalScore += 15;
      else if (sig.type === 'bearish_divergence') signalScore -= 15;
    }
    
    return {
      value: this.currentValue,
      signal: signalScore,
      signals,
      metadata: {
        wasDeepOversold: this.wasDeepOversold,
        wasDeepOverbought: this.wasDeepOverbought,
        deepOversoldValue: this.deepOversoldValue,
        deepOverboughtValue: this.deepOverboughtValue,
        momentum: this.prevValue !== null ? this.currentValue - this.prevValue : 0,
        setupActive: this.wasDeepOversold || this.wasDeepOverbought
      }
    };
  }

  /**
   * Reset indicator state
   */
  reset() {
    this.highs = [];
    this.lows = [];
    this.closes = [];
    this.currentValue = null;
    this.prevValue = null;
    this.wrHistory = [];
    this.priceHistory = [];
    this.wasDeepOversold = false;
    this.wasDeepOverbought = false;
    this.deepOversoldValue = null;
    this.deepOverboughtValue = null;
    this.barsInSetup = 0;
  }
}

module.exports = WilliamsRIndicator;
