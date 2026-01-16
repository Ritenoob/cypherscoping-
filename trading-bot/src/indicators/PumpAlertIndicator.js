/**
 * Pump Alert Indicator - Multi-Condition Pump/Dump Detection
 * Based on MQL5 Pump Alert System concepts
 *
 * Detects:
 * - Volume Spikes (abnormal volume increase)
 * - ATR Expansion (volatility spike)
 * - Price Momentum (rapid price movement)
 * - Multi-Timeframe Divergence
 *
 * Signals: Pump Warning, Dump Warning, Extreme Conditions
 */

class PumpAlertIndicator {
  constructor(config = {}) {
    // Volume spike detection
    this.volumeLookback = config.volumeLookback || 20;
    this.volumeSpikeThreshold = config.volumeSpikeThreshold || 2.5;
    this.volumeExtremeThreshold = config.volumeExtremeThreshold || 4.0;

    // ATR expansion detection
    this.atrPeriod = config.atrPeriod || 14;
    this.atrLookback = config.atrLookback || 20;
    this.atrExpansionThreshold = config.atrExpansionThreshold || 1.5;

    // Price momentum detection
    this.momentumPeriod = config.momentumPeriod || 5;
    this.momentumThreshold = config.momentumThreshold || 1.5; // 1.5% move

    // Minimum conditions for alert
    this.minConditions = config.minConditions || 2;

    // History buffers
    this.candleHistory = [];
    this.volumeHistory = [];
    this.atrHistory = [];
    this.priceHistory = [];
    this.maxHistory = config.historyLength || 100;

    // Condition tracking
    this.conditions = {
      volumeSpike: false,
      atrExpansion: false,
      priceMomentum: false,
      volumeExtreme: false
    };

    // Current values
    this.currentATR = 0;
    this.currentVolumeRatio = 0;
    this.currentMomentum = 0;
  }

  update(candle) {
    const { open, high, low, close, volume } = candle;

    // Store candle data
    this.candleHistory.push({ open, high, low, close, volume });
    this.volumeHistory.push(volume);
    this.priceHistory.push(close);

    // Calculate ATR
    if (this.candleHistory.length >= 2) {
      const prevCandle = this.candleHistory[this.candleHistory.length - 2];
      const tr = Math.max(
        high - low,
        Math.abs(high - prevCandle.close),
        Math.abs(low - prevCandle.close)
      );
      this.atrHistory.push(tr);
    }

    // Trim histories
    if (this.candleHistory.length > this.maxHistory) this.candleHistory.shift();
    if (this.volumeHistory.length > this.maxHistory) this.volumeHistory.shift();
    if (this.priceHistory.length > this.maxHistory) this.priceHistory.shift();
    if (this.atrHistory.length > this.maxHistory) this.atrHistory.shift();

    // Reset conditions
    this.conditions = {
      volumeSpike: false,
      atrExpansion: false,
      priceMomentum: false,
      volumeExtreme: false
    };

    // Check all conditions
    this.checkVolumeSpike();
    this.checkATRExpansion();
    this.checkPriceMomentum();

    return this.getResult();
  }

  checkVolumeSpike() {
    if (this.volumeHistory.length < this.volumeLookback + 1) return;

    const recentVolumes = this.volumeHistory.slice(-this.volumeLookback - 1, -1);
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const currentVolume = this.volumeHistory[this.volumeHistory.length - 1];

    if (avgVolume > 0) {
      this.currentVolumeRatio = currentVolume / avgVolume;

      if (this.currentVolumeRatio >= this.volumeExtremeThreshold) {
        this.conditions.volumeExtreme = true;
        this.conditions.volumeSpike = true;
      } else if (this.currentVolumeRatio >= this.volumeSpikeThreshold) {
        this.conditions.volumeSpike = true;
      }
    }
  }

  checkATRExpansion() {
    if (this.atrHistory.length < this.atrLookback + 1) return;

    // Calculate current ATR (SMA of true ranges)
    const recentTR = this.atrHistory.slice(-this.atrPeriod);
    this.currentATR = recentTR.reduce((a, b) => a + b, 0) / recentTR.length;

    // Calculate average ATR over lookback period
    const lookbackTR = this.atrHistory.slice(-this.atrLookback - 1, -1);
    const avgATR = lookbackTR.reduce((a, b) => a + b, 0) / lookbackTR.length;

    if (avgATR > 0) {
      const atrRatio = this.currentATR / avgATR;
      if (atrRatio >= this.atrExpansionThreshold) {
        this.conditions.atrExpansion = true;
      }
    }
  }

  checkPriceMomentum() {
    if (this.priceHistory.length < this.momentumPeriod + 1) return;

    const currentPrice = this.priceHistory[this.priceHistory.length - 1];
    const pastPrice = this.priceHistory[this.priceHistory.length - 1 - this.momentumPeriod];

    if (pastPrice > 0) {
      this.currentMomentum = ((currentPrice - pastPrice) / pastPrice) * 100;

      if (Math.abs(this.currentMomentum) >= this.momentumThreshold) {
        this.conditions.priceMomentum = true;
      }
    }
  }

  countConditionsMet() {
    let count = 0;
    if (this.conditions.volumeSpike) count++;
    if (this.conditions.atrExpansion) count++;
    if (this.conditions.priceMomentum) count++;
    if (this.conditions.volumeExtreme) count++; // Extra weight for extreme volume
    return count;
  }

  getRiskLevel() {
    const count = this.countConditionsMet();
    if (count >= 4) return 5; // Extreme
    if (count >= 3) return 4; // High
    if (count >= 2) return 3; // Medium
    if (count >= 1) return 2; // Low
    return 1; // Minimal
  }

  getAlertType() {
    const conditionsMet = this.countConditionsMet();
    if (conditionsMet < this.minConditions) return null;

    const isBullish = this.currentMomentum > 0;

    if (this.conditions.volumeExtreme && conditionsMet >= 3) {
      return isBullish ? 'EXTREME_PUMP' : 'EXTREME_DUMP';
    }

    if (conditionsMet >= 3) {
      return isBullish ? 'STRONG_PUMP' : 'STRONG_DUMP';
    }

    return isBullish ? 'PUMP_WARNING' : 'DUMP_WARNING';
  }

  getPumpSignal() {
    const alertType = this.getAlertType();
    if (!alertType) return null;

    const riskLevel = this.getRiskLevel();
    const conditionsMet = this.countConditionsMet();
    const isBullish = this.currentMomentum > 0;

    let recommendation = '';
    if (alertType.includes('EXTREME')) {
      recommendation = isBullish
        ? 'CAUTION: Avoid chasing - High pump risk'
        : 'CAUTION: Avoid panic selling - High dump risk';
    } else if (alertType.includes('STRONG')) {
      recommendation = isBullish
        ? 'Consider taking profits or tightening stops'
        : 'Consider waiting for reversal confirmation';
    } else {
      recommendation = 'Monitor closely - Potential manipulation';
    }

    const direction = isBullish ? 'bullish' : 'bearish';
    const strength = riskLevel >= 4 ? 'very_strong' : riskLevel >= 3 ? 'strong' : 'moderate';

    return {
      type: alertType.toLowerCase(),
      direction: direction,
      strength: strength,
      message: `${alertType} detected: ${conditionsMet} conditions met, Risk Level ${riskLevel}/5`,
      metadata: {
        alertType,
        conditionsMet,
        riskLevel,
        volumeSpike: this.conditions.volumeSpike,
        volumeRatio: this.currentVolumeRatio,
        atrExpansion: this.conditions.atrExpansion,
        atr: this.currentATR,
        priceMomentum: this.conditions.priceMomentum,
        momentum: this.currentMomentum,
        recommendation
      }
    };
  }

  getVolumeSpikeSignal() {
    if (!this.conditions.volumeSpike) return null;

    const strength = this.conditions.volumeExtreme ? 'very_strong' : 'strong';
    const type = this.conditions.volumeExtreme ? 'extreme_volume_spike' : 'volume_spike';

    return {
      type: type,
      direction: this.currentMomentum > 0 ? 'bullish' : 'bearish',
      strength: strength,
      message: `Volume spike detected (${this.currentVolumeRatio.toFixed(1)}x average)`,
      metadata: {
        volumeRatio: this.currentVolumeRatio,
        threshold: this.volumeSpikeThreshold
      }
    };
  }

  getATRExpansionSignal() {
    if (!this.conditions.atrExpansion) return null;

    return {
      type: 'atr_expansion',
      direction: 'neutral',
      strength: 'moderate',
      message: `Volatility expansion detected (ATR: ${this.currentATR.toFixed(2)})`,
      metadata: {
        atr: this.currentATR,
        threshold: this.atrExpansionThreshold
      }
    };
  }

  getMomentumSignal() {
    if (!this.conditions.priceMomentum) return null;

    const direction = this.currentMomentum > 0 ? 'bullish' : 'bearish';
    const type = this.currentMomentum > 0 ? 'bullish_momentum' : 'bearish_momentum';

    return {
      type: type,
      direction: direction,
      strength: Math.abs(this.currentMomentum) >= 3 ? 'strong' : 'moderate',
      message: `Strong ${direction} momentum (${this.currentMomentum.toFixed(2)}%)`,
      metadata: {
        momentum: this.currentMomentum,
        period: this.momentumPeriod
      }
    };
  }

  getSignals() {
    const signals = [];

    // Primary pump/dump alert
    const pumpSignal = this.getPumpSignal();
    if (pumpSignal) signals.push(pumpSignal);

    // Individual condition signals
    const volumeSignal = this.getVolumeSpikeSignal();
    if (volumeSignal) signals.push(volumeSignal);

    const atrSignal = this.getATRExpansionSignal();
    if (atrSignal) signals.push(atrSignal);

    const momentumSignal = this.getMomentumSignal();
    if (momentumSignal) signals.push(momentumSignal);

    return signals;
  }

  getResult() {
    const alertType = this.getAlertType();
    const riskLevel = this.getRiskLevel();
    const conditionsMet = this.countConditionsMet();

    return {
      value: {
        alertType: alertType || 'NONE',
        riskLevel: riskLevel,
        conditionsMet: conditionsMet,
        volumeRatio: this.currentVolumeRatio,
        atr: this.currentATR,
        momentum: this.currentMomentum,
        conditions: { ...this.conditions }
      },
      signals: this.candleHistory.length >= this.volumeLookback ? this.getSignals() : []
    };
  }

  reset() {
    this.candleHistory = [];
    this.volumeHistory = [];
    this.atrHistory = [];
    this.priceHistory = [];
    this.conditions = {
      volumeSpike: false,
      atrExpansion: false,
      priceMomentum: false,
      volumeExtreme: false
    };
    this.currentATR = 0;
    this.currentVolumeRatio = 0;
    this.currentMomentum = 0;
  }
}

module.exports = PumpAlertIndicator;
