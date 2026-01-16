/**
 * Indicator Enhancement System
 * 
 * Automatically tunes indicator parameters based on:
 * - Market volatility regime detection
 * - Historical performance analysis
 * - Adaptive threshold adjustment
 */

const Decimal = require('decimal.js');

class IndicatorEnhancer {
  constructor(config = {}) {
    this.volatilityWindow = config.volatilityWindow || 20;
    this.performanceWindow = config.performanceWindow || 100;
    this.adaptationRate = config.adaptationRate || 0.1;
    
    this.volatilityHistory = [];
    this.performanceHistory = [];
    this.currentRegime = 'normal';
    
    this.baseParams = {
      rsi: { period: 14, oversold: 30, overbought: 70 },
      macd: { fast: 12, slow: 26, signal: 9 },
      bollinger: { period: 20, stdDev: 2 },
      stochastic: { k: 14, d: 3, smooth: 3 }
    };
    
    this.adaptedParams = JSON.parse(JSON.stringify(this.baseParams));
  }

  detectVolatilityRegime(candles) {
    if (candles.length < this.volatilityWindow) {
      return 'normal';
    }
    
    const returns = [];
    for (let i = 1; i < candles.length; i++) {
      returns.push((candles[i].close - candles[i-1].close) / candles[i-1].close);
    }
    
    const recentReturns = returns.slice(-this.volatilityWindow);
    const mean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
    const variance = recentReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentReturns.length;
    const currentVol = Math.sqrt(variance) * Math.sqrt(252) * 100;
    
    this.volatilityHistory.push(currentVol);
    if (this.volatilityHistory.length > 100) {
      this.volatilityHistory.shift();
    }
    
    const avgVol = this.volatilityHistory.reduce((a, b) => a + b, 0) / this.volatilityHistory.length;
    
    if (currentVol > avgVol * 1.5) {
      this.currentRegime = 'high';
    } else if (currentVol < avgVol * 0.5) {
      this.currentRegime = 'low';
    } else {
      this.currentRegime = 'normal';
    }
    
    return this.currentRegime;
  }

  adaptParameters(regime) {
    switch (regime) {
      case 'high':
        this.adaptedParams.rsi.oversold = 25;
        this.adaptedParams.rsi.overbought = 75;
        this.adaptedParams.bollinger.stdDev = 2.5;
        this.adaptedParams.stochastic.smooth = 5;
        break;
        
      case 'low':
        this.adaptedParams.rsi.oversold = 35;
        this.adaptedParams.rsi.overbought = 65;
        this.adaptedParams.bollinger.stdDev = 1.5;
        this.adaptedParams.stochastic.smooth = 2;
        break;
        
      default:
        this.adaptedParams = JSON.parse(JSON.stringify(this.baseParams));
    }
    
    return this.adaptedParams;
  }

  recordSignalPerformance(signal, outcome) {
    this.performanceHistory.push({
      signal,
      outcome,
      regime: this.currentRegime,
      ts: Date.now()
    });
    
    if (this.performanceHistory.length > this.performanceWindow) {
      this.performanceHistory.shift();
    }
    
    this._adjustThresholds();
  }

  _adjustThresholds() {
    const recentPerformance = this.performanceHistory.slice(-50);
    if (recentPerformance.length < 20) return;
    
    const byIndicator = {};
    
    for (const record of recentPerformance) {
      for (const [indicator, data] of Object.entries(record.signal.indicators || {})) {
        if (!byIndicator[indicator]) {
          byIndicator[indicator] = { wins: 0, losses: 0, signals: [] };
        }
        
        if (record.outcome > 0) {
          byIndicator[indicator].wins++;
        } else {
          byIndicator[indicator].losses++;
        }
        
        byIndicator[indicator].signals.push({
          value: data.value,
          outcome: record.outcome
        });
      }
    }
    
    for (const [indicator, stats] of Object.entries(byIndicator)) {
      const winRate = stats.wins / (stats.wins + stats.losses);
      
      if (winRate < 0.4) {
        this._tightenThresholds(indicator);
      } else if (winRate > 0.6) {
        this._loosenThresholds(indicator);
      }
    }
  }

  _tightenThresholds(indicator) {
    const rate = this.adaptationRate;
    
    switch (indicator) {
      case 'rsi':
        this.adaptedParams.rsi.oversold = Math.max(20, this.adaptedParams.rsi.oversold - 2 * rate);
        this.adaptedParams.rsi.overbought = Math.min(80, this.adaptedParams.rsi.overbought + 2 * rate);
        break;
        
      case 'stochastic':
        this.adaptedParams.stochastic.smooth = Math.min(5, this.adaptedParams.stochastic.smooth + 1);
        break;
    }
  }

  _loosenThresholds(indicator) {
    const rate = this.adaptationRate;
    
    switch (indicator) {
      case 'rsi':
        this.adaptedParams.rsi.oversold = Math.min(40, this.adaptedParams.rsi.oversold + 2 * rate);
        this.adaptedParams.rsi.overbought = Math.max(60, this.adaptedParams.rsi.overbought - 2 * rate);
        break;
        
      case 'stochastic':
        this.adaptedParams.stochastic.smooth = Math.max(2, this.adaptedParams.stochastic.smooth - 1);
        break;
    }
  }

  getAdaptedParams() {
    return {
      params: this.adaptedParams,
      regime: this.currentRegime,
      performance: this._getPerformanceSummary()
    };
  }

  _getPerformanceSummary() {
    if (this.performanceHistory.length === 0) {
      return { winRate: 0, totalSignals: 0 };
    }
    
    const wins = this.performanceHistory.filter(p => p.outcome > 0).length;
    return {
      winRate: (wins / this.performanceHistory.length * 100).toFixed(2),
      totalSignals: this.performanceHistory.length
    };
  }

  reset() {
    this.volatilityHistory = [];
    this.performanceHistory = [];
    this.currentRegime = 'normal';
    this.adaptedParams = JSON.parse(JSON.stringify(this.baseParams));
  }
}

module.exports = IndicatorEnhancer;
