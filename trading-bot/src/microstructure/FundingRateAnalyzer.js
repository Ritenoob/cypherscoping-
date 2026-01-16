/**
 * Funding Rate Analyzer
 * 
 * Analyzes funding rates to detect:
 * - Extreme funding (crowded trades)
 * - Funding rate changes (momentum shifts)
 * - Predicted funding (next period estimate)
 * - Funding rate divergence across timeframes
 * 
 * ⚠️ LIVE-ONLY: Requires real-time funding data
 */

const Decimal = require('decimal.js');

class FundingRateAnalyzer {
  constructor(config = {}) {
    // OPTIMIZED: Stricter thresholds for high-quality signals
    // Only signal on truly extreme funding (crowded trades)
    this.extremeThreshold = config.extremeThreshold || 0.02;   // 2% (was 1%) - truly extreme
    this.highThreshold = config.highThreshold || 0.01;         // 1% (was 0.5%) - doubled
    this.changeThreshold = config.changeThreshold || 0.005;    // 0.5% (was 0.3%) - bigger change required
    this.fundingInterval = config.fundingInterval || 8 * 60 * 60 * 1000;
    this.maxWeight = config.maxWeight || 15;
    
    this.currentFundingRate = null;
    this.predictedFundingRate = null;
    this.lastFundingTime = null;
    this.nextFundingTime = null;
    
    this.fundingHistory = [];
    this.maxHistory = config.maxHistory || 100;
    
    this.liveOnlyValidation = true;
    this.isLiveMode = false;
  }

  enableLiveMode() {
    this.isLiveMode = true;
    console.log('[FundingRate] Live mode enabled');
  }

  disableLiveMode() {
    this.isLiveMode = false;
    console.log('[FundingRate] Live mode disabled');
  }

  update(fundingData) {
    if (!this.isLiveMode) return this.getResult();
    
    const prevRate = this.currentFundingRate;
    
    this.currentFundingRate = fundingData.currentRate !== undefined 
      ? new Decimal(fundingData.currentRate).mul(100).toNumber()
      : this.currentFundingRate;
    
    this.predictedFundingRate = fundingData.predictedRate !== undefined
      ? new Decimal(fundingData.predictedRate).mul(100).toNumber()
      : this.predictedFundingRate;
    
    this.lastFundingTime = fundingData.lastFundingTime || this.lastFundingTime;
    this.nextFundingTime = fundingData.nextFundingTime || this.nextFundingTime;
    
    if (this.currentFundingRate !== null) {
      this.fundingHistory.push({
        ts: Date.now(),
        rate: this.currentFundingRate,
        predicted: this.predictedFundingRate,
        change: prevRate !== null ? this.currentFundingRate - prevRate : 0
      });
      
      if (this.fundingHistory.length > this.maxHistory) {
        this.fundingHistory.shift();
      }
    }
    
    return this.getResult();
  }

  getTimeUntilFunding() {
    if (!this.nextFundingTime) return null;
    return Math.max(0, this.nextFundingTime - Date.now());
  }

  isFundingImminent() {
    const timeUntil = this.getTimeUntilFunding();
    return timeUntil !== null && timeUntil < 60 * 60 * 1000;
  }

  getExtremeRateSignal() {
    if (!this.isLiveMode || this.currentFundingRate === null) return null;
    
    if (this.currentFundingRate >= this.extremeThreshold) {
      return {
        type: 'extreme_positive_funding',
        direction: 'bearish',
        strength: 'very_strong',
        message: `EXTREME positive funding: ${this.currentFundingRate.toFixed(4)}% (longs pay shorts)`,
        metadata: { rate: this.currentFundingRate, predicted: this.predictedFundingRate, liveOnly: true }
      };
    }
    
    if (this.currentFundingRate <= -this.extremeThreshold) {
      return {
        type: 'extreme_negative_funding',
        direction: 'bullish',
        strength: 'very_strong',
        message: `EXTREME negative funding: ${this.currentFundingRate.toFixed(4)}% (shorts pay longs)`,
        metadata: { rate: this.currentFundingRate, predicted: this.predictedFundingRate, liveOnly: true }
      };
    }
    
    if (this.currentFundingRate >= this.highThreshold) {
      return {
        type: 'high_positive_funding',
        direction: 'bearish',
        strength: 'strong',
        message: `High positive funding: ${this.currentFundingRate.toFixed(4)}%`,
        metadata: { rate: this.currentFundingRate, liveOnly: true }
      };
    }
    
    if (this.currentFundingRate <= -this.highThreshold) {
      return {
        type: 'high_negative_funding',
        direction: 'bullish',
        strength: 'strong',
        message: `High negative funding: ${this.currentFundingRate.toFixed(4)}%`,
        metadata: { rate: this.currentFundingRate, liveOnly: true }
      };
    }
    
    return null;
  }

  getRateChangeSignal() {
    // OPTIMIZED: Require more history for reliable change detection (was 5)
    if (!this.isLiveMode || this.fundingHistory.length < 10) return null;

    const recent = this.fundingHistory.slice(-10);
    const oldRate = recent[0].rate;
    const newRate = recent[recent.length - 1].rate;
    const change = newRate - oldRate;
    
    if (change > this.changeThreshold) {
      return {
        type: 'funding_increasing',
        direction: 'bearish',
        strength: 'moderate',
        message: `Funding rate increasing: ${oldRate.toFixed(4)}% → ${newRate.toFixed(4)}%`,
        metadata: { change, oldRate, newRate, liveOnly: true }
      };
    }
    
    if (change < -this.changeThreshold) {
      return {
        type: 'funding_decreasing',
        direction: 'bullish',
        strength: 'moderate',
        message: `Funding rate decreasing: ${oldRate.toFixed(4)}% → ${newRate.toFixed(4)}%`,
        metadata: { change, oldRate, newRate, liveOnly: true }
      };
    }
    
    return null;
  }

  getFundingTimingSignal() {
    if (!this.isLiveMode) return null;
    
    const timeUntil = this.getTimeUntilFunding();
    if (timeUntil === null) return null;
    
    if (timeUntil < 30 * 60 * 1000 && Math.abs(this.currentFundingRate) >= this.highThreshold) {
      const direction = this.currentFundingRate > 0 ? 'bearish' : 'bullish';
      return {
        type: 'funding_imminent_extreme',
        direction: direction,
        strength: 'strong',
        message: `Funding in ${Math.round(timeUntil / 60000)} min with ${this.currentFundingRate > 0 ? 'positive' : 'negative'} ${Math.abs(this.currentFundingRate).toFixed(4)}%`,
        metadata: { timeUntilMs: timeUntil, rate: this.currentFundingRate, liveOnly: true }
      };
    }
    
    return null;
  }

  getSignals() {
    if (!this.isLiveMode) return [];
    
    const signals = [];
    
    const extreme = this.getExtremeRateSignal();
    if (extreme) signals.push(extreme);
    
    const change = this.getRateChangeSignal();
    if (change) signals.push(change);
    
    const timing = this.getFundingTimingSignal();
    if (timing) signals.push(timing);
    
    return signals;
  }

  getResult() {
    const timeUntil = this.getTimeUntilFunding();
    
    return {
      value: {
        currentRate: this.currentFundingRate,
        predictedRate: this.predictedFundingRate,
        lastFundingTime: this.lastFundingTime,
        nextFundingTime: this.nextFundingTime,
        timeUntilFundingMs: timeUntil,
        timeUntilFundingMin: timeUntil ? Math.round(timeUntil / 60000) : null,
        isImminent: this.isFundingImminent(),
        isLive: this.isLiveMode
      },
      signals: this.getSignals(),
      warning: this.isLiveMode ? null : 'Funding rate signals disabled (not live mode)'
    };
  }

  getRateString() {
    if (this.currentFundingRate === null) return 'N/A';
    const sign = this.currentFundingRate >= 0 ? '+' : '';
    return `${sign}${this.currentFundingRate.toFixed(4)}%`;
  }

  getAnnualizedRate() {
    if (this.currentFundingRate === null) return null;
    return this.currentFundingRate * 3 * 365;
  }

  reset() {
    this.currentFundingRate = null;
    this.predictedFundingRate = null;
    this.lastFundingTime = null;
    this.nextFundingTime = null;
    this.fundingHistory = [];
  }
}

module.exports = FundingRateAnalyzer;
