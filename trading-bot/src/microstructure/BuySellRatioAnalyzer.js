/**
 * Buy:Sell Ratio Analyzer
 * 
 * Analyzes real-time trade flow to detect:
 * - Order flow imbalance (aggressive buyers vs sellers)
 * - Absorption patterns (large orders absorbed by opposing flow)
 * - Exhaustion signals (extreme ratios followed by reversal)
 * 
 * Data Source: KuCoin trade execution stream
 * 
 * ⚠️ LIVE-ONLY: This analyzer requires real-time trade data
 *    Cannot be backtested with historical OHLCV data
 */

const EventEmitter = require('events');
const Decimal = require('decimal.js');

class BuySellRatioAnalyzer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Configuration
    this.windowMs = config.windowMs || 60000;           // 1 minute rolling window
    this.shortWindowMs = config.shortWindowMs || 5000;  // 5 second short-term
    this.longWindowMs = config.longWindowMs || 300000;  // 5 minute long-term
    
    // OPTIMIZED: Stricter thresholds for high-quality signals only
    this.imbalanceThresholdStrong = config.imbalanceThresholdStrong || 0.80;  // 80% one-sided (was 70%)
    this.imbalanceThresholdExtreme = config.imbalanceThresholdExtreme || 0.90; // 90% extreme (was 80%)
    this.exhaustionReversal = config.exhaustionReversal || 0.20;               // 20% reversal from extreme (was 15%)

    // Require more trades to confirm signal
    this.minTradesForSignal = config.minTradesForSignal || 100; // (was 50)
    this.maxWeight = config.maxWeight || 15;
    
    // Trade storage
    this.trades = [];
    this.shortTrades = [];
    this.longTrades = [];
    
    // Current metrics
    this.currentRatio = null;           // Buy volume / Total volume (0-1)
    this.shortRatio = null;             // Short-term ratio
    this.longRatio = null;              // Long-term ratio
    this.ratioDelta = null;             // Change in ratio
    
    this.buyVolume = new Decimal(0);
    this.sellVolume = new Decimal(0);
    this.totalTrades = 0;
    
    // History for pattern detection
    this.ratioHistory = [];
    this.maxHistory = config.maxHistory || 100;
    
    // Live mode flag
    this.liveOnlyValidation = true;
    this.isLiveMode = false;
  }

  /**
   * Enable live mode - required for signals
   */
  enableLiveMode() {
    this.isLiveMode = true;
    console.log('[BuySellRatio] Live mode enabled');
  }

  disableLiveMode() {
    this.isLiveMode = false;
    console.log('[BuySellRatio] Live mode disabled');
  }

  /**
   * Process incoming trade from WebSocket
   * 
   * Trade format (KuCoin):
   * {
   *   symbol: 'BTCUSDTM',
   *   side: 'buy' | 'sell',
   *   size: number,
   *   price: number,
   *   ts: number (timestamp)
   * }
   */
  processTrade(trade) {
    if (!this.isLiveMode) return this.getResult();
    
    const now = Date.now();
    const tradeData = {
      ts: trade.ts || now,
      side: trade.side,
      size: new Decimal(trade.size),
      price: new Decimal(trade.price),
      value: new Decimal(trade.size).mul(trade.price)
    };
    
    // Add to all windows
    this.trades.push(tradeData);
    this.shortTrades.push(tradeData);
    this.longTrades.push(tradeData);
    
    // Cleanup expired trades
    this._cleanupWindow(this.trades, now, this.windowMs);
    this._cleanupWindow(this.shortTrades, now, this.shortWindowMs);
    this._cleanupWindow(this.longTrades, now, this.longWindowMs);
    
    // Recalculate ratios
    this._calculateRatios();
    
    return this.getResult();
  }

  /**
   * Batch process multiple trades
   */
  processTrades(trades) {
    for (const trade of trades) {
      this.processTrade(trade);
    }
    return this.getResult();
  }

  _cleanupWindow(window, now, maxAge) {
    while (window.length > 0 && now - window[0].ts > maxAge) {
      window.shift();
    }
  }

  _calculateRatios() {
    // Main window ratio
    this.currentRatio = this._calculateWindowRatio(this.trades);
    this.shortRatio = this._calculateWindowRatio(this.shortTrades);
    this.longRatio = this._calculateWindowRatio(this.longTrades);
    
    // Calculate delta (short vs long)
    if (this.shortRatio !== null && this.longRatio !== null) {
      this.ratioDelta = this.shortRatio - this.longRatio;
    }
    
    // Update metrics
    this._updateVolumeMetrics();
    
    // Store in history
    if (this.currentRatio !== null) {
      this.ratioHistory.push({
        ts: Date.now(),
        ratio: this.currentRatio,
        shortRatio: this.shortRatio,
        delta: this.ratioDelta
      });
      
      if (this.ratioHistory.length > this.maxHistory) {
        this.ratioHistory.shift();
      }
    }
  }

  _calculateWindowRatio(window) {
    if (window.length < this.minTradesForSignal) return null;
    
    let buyValue = new Decimal(0);
    let sellValue = new Decimal(0);
    
    for (const trade of window) {
      if (trade.side === 'buy') {
        buyValue = buyValue.plus(trade.value);
      } else {
        sellValue = sellValue.plus(trade.value);
      }
    }
    
    const total = buyValue.plus(sellValue);
    if (total.isZero()) return 0.5;
    
    return buyValue.div(total).toNumber();
  }

  _updateVolumeMetrics() {
    this.buyVolume = new Decimal(0);
    this.sellVolume = new Decimal(0);
    this.totalTrades = this.trades.length;
    
    for (const trade of this.trades) {
      if (trade.side === 'buy') {
        this.buyVolume = this.buyVolume.plus(trade.value);
      } else {
        this.sellVolume = this.sellVolume.plus(trade.value);
      }
    }
  }

  // SIGNAL 1: Flow Imbalance
  getFlowImbalanceSignal() {
    if (!this.isLiveMode || this.currentRatio === null) return null;
    
    // Strong buying pressure
    if (this.currentRatio >= this.imbalanceThresholdStrong) {
      const isExtreme = this.currentRatio >= this.imbalanceThresholdExtreme;
      return {
        type: 'bullish_flow_imbalance',
        direction: 'bullish',
        strength: isExtreme ? 'very_strong' : 'strong',
        message: `Buy pressure: ${(this.currentRatio * 100).toFixed(1)}% of volume`,
        metadata: {
          ratio: this.currentRatio,
          buyVolume: this.buyVolume.toNumber(),
          sellVolume: this.sellVolume.toNumber(),
          tradeCount: this.totalTrades,
          liveOnly: true
        }
      };
    }
    
    // Strong selling pressure
    if (this.currentRatio <= (1 - this.imbalanceThresholdStrong)) {
      const isExtreme = this.currentRatio <= (1 - this.imbalanceThresholdExtreme);
      return {
        type: 'bearish_flow_imbalance',
        direction: 'bearish',
        strength: isExtreme ? 'very_strong' : 'strong',
        message: `Sell pressure: ${((1 - this.currentRatio) * 100).toFixed(1)}% of volume`,
        metadata: {
          ratio: this.currentRatio,
          buyVolume: this.buyVolume.toNumber(),
          sellVolume: this.sellVolume.toNumber(),
          tradeCount: this.totalTrades,
          liveOnly: true
        }
      };
    }
    
    return null;
  }

  // SIGNAL 2: Absorption Pattern
  getAbsorptionSignal() {
    if (!this.isLiveMode || this.ratioDelta === null) return null;
    if (this.ratioHistory.length < 10) return null;
    
    // Look for absorption: strong short-term imbalance being absorbed
    // (short-term extreme but long-term moderate)
    
    if (this.shortRatio !== null && this.longRatio !== null) {
      // OPTIMIZED: Stricter absorption thresholds
      // Bullish absorption: heavy selling absorbed (sellers exhausted)
      // Require short-term < 25% buy (was 35%) and long-term > 55% buy (was 45%)
      if (this.shortRatio < 0.25 && this.longRatio > 0.55) {
        return {
          type: 'bullish_absorption',
          direction: 'bullish',
          strength: 'strong',  // Upgraded from moderate
          message: 'Heavy selling being absorbed (buyers stepping in)',
          metadata: {
            shortRatio: this.shortRatio,
            longRatio: this.longRatio,
            delta: this.ratioDelta,
            liveOnly: true
          }
        };
      }

      // Bearish absorption: heavy buying absorbed (buyers exhausted)
      // Require short-term > 75% buy (was 65%) and long-term < 45% buy (was 55%)
      if (this.shortRatio > 0.75 && this.longRatio < 0.45) {
        return {
          type: 'bearish_absorption',
          direction: 'bearish',
          strength: 'strong',  // Upgraded from moderate
          message: 'Heavy buying being absorbed (sellers stepping in)',
          metadata: {
            shortRatio: this.shortRatio,
            longRatio: this.longRatio,
            delta: this.ratioDelta,
            liveOnly: true
          }
        };
      }
    }
    
    return null;
  }

  // SIGNAL 3: Exhaustion Pattern
  getExhaustionSignal() {
    if (!this.isLiveMode || this.ratioHistory.length < 20) return null;
    
    const recent = this.ratioHistory.slice(-20);
    
    // Find if we had an extreme recently and are now reversing
    let maxRatio = 0;
    let minRatio = 1;
    
    for (let i = 0; i < recent.length - 5; i++) {
      if (recent[i].ratio > maxRatio) {
        maxRatio = recent[i].ratio;
      }
      if (recent[i].ratio < minRatio) {
        minRatio = recent[i].ratio;
      }
    }
    
    const currentRatio = recent[recent.length - 1].ratio;
    
    // OPTIMIZED: Stricter exhaustion thresholds
    // Bullish exhaustion: was extreme selling (<15% buy, was 25%), now reversing
    if (minRatio < 0.15 && currentRatio > minRatio + this.exhaustionReversal) {
      return {
        type: 'bullish_exhaustion',
        direction: 'bullish',
        strength: 'very_strong',  // Upgraded
        message: `Selling exhaustion detected (reversed from ${(minRatio * 100).toFixed(1)}%)`,
        metadata: {
          extremeRatio: minRatio,
          currentRatio: currentRatio,
          reversal: currentRatio - minRatio,
          liveOnly: true
        }
      };
    }

    // Bearish exhaustion: was extreme buying (>85% buy, was 75%), now reversing
    if (maxRatio > 0.85 && currentRatio < maxRatio - this.exhaustionReversal) {
      return {
        type: 'bearish_exhaustion',
        direction: 'bearish',
        strength: 'very_strong',  // Upgraded
        message: `Buying exhaustion detected (reversed from ${(maxRatio * 100).toFixed(1)}%)`,
        metadata: {
          extremeRatio: maxRatio,
          currentRatio: currentRatio,
          reversal: maxRatio - currentRatio,
          liveOnly: true
        }
      };
    }
    
    return null;
  }

  // SIGNAL 4: Delta Momentum
  getDeltaMomentumSignal() {
    if (!this.isLiveMode || this.ratioHistory.length < 10) return null;
    
    // Calculate rate of change in ratio
    const recent = this.ratioHistory.slice(-10);
    const oldRatio = recent[0].ratio;
    const newRatio = recent[recent.length - 1].ratio;
    const change = newRatio - oldRatio;
    
    // OPTIMIZED: Require stronger momentum shift (25% vs 15%)
    // Strong bullish momentum shift
    if (change > 0.25) {
      return {
        type: 'bullish_delta_momentum',
        direction: 'bullish',
        strength: 'strong',  // Upgraded from moderate
        message: `Buy ratio surging (+${(change * 100).toFixed(1)}% in last 10 updates)`,
        metadata: { change, oldRatio, newRatio, liveOnly: true }
      };
    }

    // Strong bearish momentum shift
    if (change < -0.25) {
      return {
        type: 'bearish_delta_momentum',
        direction: 'bearish',
        strength: 'strong',  // Upgraded from moderate
        message: `Sell ratio surging (${(change * 100).toFixed(1)}% in last 10 updates)`,
        metadata: { change, oldRatio, newRatio, liveOnly: true }
      };
    }
    
    return null;
  }

  getSignals() {
    if (!this.isLiveMode) return [];
    
    const signals = [];
    
    const imbalance = this.getFlowImbalanceSignal();
    if (imbalance) signals.push(imbalance);
    
    const absorption = this.getAbsorptionSignal();
    if (absorption) signals.push(absorption);
    
    const exhaustion = this.getExhaustionSignal();
    if (exhaustion) signals.push(exhaustion);
    
    const momentum = this.getDeltaMomentumSignal();
    if (momentum) signals.push(momentum);
    
    return signals;
  }

  getResult() {
    return {
      value: {
        ratio: this.currentRatio,
        shortRatio: this.shortRatio,
        longRatio: this.longRatio,
        delta: this.ratioDelta,
        buyVolume: this.buyVolume.toNumber(),
        sellVolume: this.sellVolume.toNumber(),
        tradeCount: this.totalTrades,
        isLive: this.isLiveMode
      },
      signals: this.getSignals(),
      warning: this.isLiveMode ? null : 'Buy:Sell signals disabled (not live mode)'
    };
  }

  /**
   * Get formatted ratio string
   */
  getRatioString() {
    if (this.currentRatio === null) return 'N/A';
    const buyPct = (this.currentRatio * 100).toFixed(1);
    const sellPct = ((1 - this.currentRatio) * 100).toFixed(1);
    return `${buyPct}:${sellPct}`;
  }

  reset() {
    this.trades = [];
    this.shortTrades = [];
    this.longTrades = [];
    this.currentRatio = null;
    this.shortRatio = null;
    this.longRatio = null;
    this.ratioDelta = null;
    this.buyVolume = new Decimal(0);
    this.sellVolume = new Decimal(0);
    this.totalTrades = 0;
    this.ratioHistory = [];
  }
}

module.exports = BuySellRatioAnalyzer;
