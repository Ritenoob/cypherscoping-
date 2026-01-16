/**
 * Price Ratio Analyzer
 * 
 * Analyzes relationships between:
 * - Bid Price (best buy order)
 * - Ask Price (best sell order)
 * - Index Price (spot price aggregated from exchanges)
 * - Mark Price (fair price for funding/liquidation)
 * - Last Price (most recent trade)
 * 
 * ⚠️ LIVE-ONLY: Requires real-time price feeds
 */

const Decimal = require('decimal.js');

class PriceRatioAnalyzer {
  constructor(config = {}) {
    // OPTIMIZED: Stricter thresholds for high-quality signals
    this.spreadThresholdWarn = config.spreadThresholdWarn || 0.03;     // (was 0.02) - higher tolerance
    this.spreadThresholdCritical = config.spreadThresholdCritical || 0.08;  // (was 0.05) - only warn on extreme spreads
    this.basisThresholdModerate = config.basisThresholdModerate || 0.10;    // (was 0.05) - doubled
    this.basisThresholdExtreme = config.basisThresholdExtreme || 0.25;      // (was 0.15) - only extreme basis
    this.convergenceThreshold = config.convergenceThreshold || 0.05;        // (was 0.02) - stronger convergence
    this.divergenceThreshold = config.divergenceThreshold || 0.15;          // (was 0.08) - stronger divergence
    this.maxWeight = config.maxWeight || 15;
    
    this.bidPrice = null;
    this.askPrice = null;
    this.indexPrice = null;
    this.markPrice = null;
    this.lastPrice = null;
    
    this.spread = null;
    this.spreadBps = null;
    this.basis = null;
    this.basisBps = null;
    this.markVsLast = null;
    this.bidAskImbalance = null;
    
    this.basisHistory = [];
    this.spreadHistory = [];
    this.maxHistory = config.maxHistory || 100;
    
    this.liveOnlyValidation = true;
    this.isLiveMode = false;
  }

  enableLiveMode() {
    this.isLiveMode = true;
    console.log('[PriceRatio] Live mode enabled');
  }

  disableLiveMode() {
    this.isLiveMode = false;
    console.log('[PriceRatio] Live mode disabled');
  }

  update(prices) {
    if (!this.isLiveMode) return this.getResult();
    
    this.bidPrice = prices.bid ? new Decimal(prices.bid) : this.bidPrice;
    this.askPrice = prices.ask ? new Decimal(prices.ask) : this.askPrice;
    this.indexPrice = prices.index ? new Decimal(prices.index) : this.indexPrice;
    this.markPrice = prices.mark ? new Decimal(prices.mark) : this.markPrice;
    this.lastPrice = prices.last ? new Decimal(prices.last) : this.lastPrice;
    
    this._calculateMetrics();
    
    return this.getResult();
  }

  _calculateMetrics() {
    if (this.bidPrice && this.askPrice && !this.bidPrice.isZero()) {
      const mid = this.bidPrice.plus(this.askPrice).div(2);
      this.spread = this.askPrice.minus(this.bidPrice).div(mid).mul(100).toNumber();
      this.spreadBps = this.spread * 100;
      
      this.spreadHistory.push({ ts: Date.now(), spread: this.spread });
      if (this.spreadHistory.length > this.maxHistory) {
        this.spreadHistory.shift();
      }
    }
    
    if (this.markPrice && this.indexPrice && !this.indexPrice.isZero()) {
      this.basis = this.markPrice.minus(this.indexPrice).div(this.indexPrice).mul(100).toNumber();
      this.basisBps = this.basis * 100;
      
      this.basisHistory.push({ ts: Date.now(), basis: this.basis });
      if (this.basisHistory.length > this.maxHistory) {
        this.basisHistory.shift();
      }
    }
    
    if (this.markPrice && this.lastPrice && !this.lastPrice.isZero()) {
      this.markVsLast = this.markPrice.minus(this.lastPrice).div(this.lastPrice).mul(100).toNumber();
    }
    
    if (this.bidPrice && this.askPrice && this.lastPrice) {
      const range = this.askPrice.minus(this.bidPrice);
      if (!range.isZero()) {
        this.bidAskImbalance = this.lastPrice.minus(this.bidPrice).div(range).toNumber();
      }
    }
  }

  getBasisSignal() {
    if (!this.isLiveMode || this.basis === null) return null;
    
    if (this.basis > this.basisThresholdExtreme) {
      return {
        type: 'extreme_premium',
        direction: 'bearish',
        strength: 'strong',
        message: `Extreme futures premium: +${this.basis.toFixed(3)}% above index`,
        metadata: { basis: this.basis, basisBps: this.basisBps, liveOnly: true }
      };
    }
    
    if (this.basis < -this.basisThresholdExtreme) {
      return {
        type: 'extreme_discount',
        direction: 'bullish',
        strength: 'strong',
        message: `Extreme futures discount: ${this.basis.toFixed(3)}% below index`,
        metadata: { basis: this.basis, basisBps: this.basisBps, liveOnly: true }
      };
    }
    
    if (this.basis > this.basisThresholdModerate) {
      return {
        type: 'moderate_premium',
        direction: 'bearish',
        strength: 'weak',
        message: `Futures premium: +${this.basis.toFixed(3)}% above index`,
        metadata: { basis: this.basis, liveOnly: true }
      };
    }
    
    if (this.basis < -this.basisThresholdModerate) {
      return {
        type: 'moderate_discount',
        direction: 'bullish',
        strength: 'weak',
        message: `Futures discount: ${this.basis.toFixed(3)}% below index`,
        metadata: { basis: this.basis, liveOnly: true }
      };
    }
    
    return null;
  }

  getSpreadSignal() {
    if (!this.isLiveMode || this.spread === null) return null;
    
    if (this.spread > this.spreadThresholdCritical) {
      return {
        type: 'critical_spread',
        direction: 'neutral',
        strength: 'strong',
        message: `CRITICAL: Bid-ask spread ${this.spread.toFixed(3)}% (${this.spreadBps.toFixed(1)} bps)`,
        metadata: { spread: this.spread, spreadBps: this.spreadBps, liveOnly: true, warning: 'AVOID_ENTRY' }
      };
    }
    
    if (this.spread > this.spreadThresholdWarn) {
      return {
        type: 'elevated_spread',
        direction: 'neutral',
        strength: 'weak',
        message: `Elevated spread: ${this.spread.toFixed(3)}% (${this.spreadBps.toFixed(1)} bps)`,
        metadata: { spread: this.spread, spreadBps: this.spreadBps, liveOnly: true, warning: 'USE_LIMIT_ORDERS' }
      };
    }
    
    return null;
  }

  getConvergenceSignal() {
    // OPTIMIZED: Require more history for reliable convergence (was 10)
    if (!this.isLiveMode || this.basisHistory.length < 20) return null;

    const recent = this.basisHistory.slice(-20);
    const oldBasis = recent[0].basis;
    const newBasis = recent[recent.length - 1].basis;
    const change = newBasis - oldBasis;
    
    if (Math.abs(newBasis) < Math.abs(oldBasis) && Math.abs(change) > this.convergenceThreshold) {
      return {
        type: 'basis_converging',
        direction: newBasis > 0 ? 'bearish' : 'bullish',
        strength: 'moderate',
        message: `Basis converging: ${oldBasis.toFixed(3)}% → ${newBasis.toFixed(3)}%`,
        metadata: { oldBasis, newBasis, change, liveOnly: true }
      };
    }
    
    if (Math.abs(newBasis) > Math.abs(oldBasis) && Math.abs(change) > this.divergenceThreshold) {
      return {
        type: 'basis_diverging',
        direction: newBasis > 0 ? 'bullish' : 'bearish',
        strength: 'moderate',
        message: `Basis diverging: ${oldBasis.toFixed(3)}% → ${newBasis.toFixed(3)}%`,
        metadata: { oldBasis, newBasis, change, liveOnly: true }
      };
    }
    
    return null;
  }

  getSignals() {
    if (!this.isLiveMode) return [];
    
    const signals = [];
    
    const basis = this.getBasisSignal();
    if (basis) signals.push(basis);
    
    const spread = this.getSpreadSignal();
    if (spread) signals.push(spread);
    
    const convergence = this.getConvergenceSignal();
    if (convergence) signals.push(convergence);
    
    return signals;
  }

  getResult() {
    return {
      value: {
        bid: this.bidPrice?.toNumber(),
        ask: this.askPrice?.toNumber(),
        index: this.indexPrice?.toNumber(),
        mark: this.markPrice?.toNumber(),
        last: this.lastPrice?.toNumber(),
        spread: this.spread,
        spreadBps: this.spreadBps,
        basis: this.basis,
        basisBps: this.basisBps,
        markVsLast: this.markVsLast,
        bidAskImbalance: this.bidAskImbalance,
        isLive: this.isLiveMode
      },
      signals: this.getSignals(),
      warning: this.isLiveMode ? null : 'Price ratio signals disabled (not live mode)'
    };
  }

  getRatioStrings() {
    return {
      spread: this.spread !== null ? `${this.spread.toFixed(3)}% (${this.spreadBps?.toFixed(1)} bps)` : 'N/A',
      basis: this.basis !== null ? `${this.basis >= 0 ? '+' : ''}${this.basis.toFixed(3)}%` : 'N/A',
      markVsLast: this.markVsLast !== null ? `${this.markVsLast >= 0 ? '+' : ''}${this.markVsLast.toFixed(3)}%` : 'N/A',
      bidAskPosition: this.bidAskImbalance !== null ? `${(this.bidAskImbalance * 100).toFixed(0)}%` : 'N/A'
    };
  }

  reset() {
    this.bidPrice = null;
    this.askPrice = null;
    this.indexPrice = null;
    this.markPrice = null;
    this.lastPrice = null;
    this.spread = null;
    this.spreadBps = null;
    this.basis = null;
    this.basisBps = null;
    this.markVsLast = null;
    this.bidAskImbalance = null;
    this.basisHistory = [];
    this.spreadHistory = [];
  }
}

module.exports = PriceRatioAnalyzer;
