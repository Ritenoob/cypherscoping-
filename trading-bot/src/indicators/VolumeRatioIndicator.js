/**
 * Volume Ratio Indicator - Buy/Sell Pressure Analysis
 * Based on MQL5 Volume Ratio Dashboard concepts
 *
 * Signals: Volume Imbalance, Pressure Shift, Extreme Pressure
 *
 * Formula:
 * - If close > open: Add volume to buyVolume
 * - If close < open: Add volume to sellVolume
 * - If close = open: Split volume 50/50 (doji)
 * - volumeRatio = buyVolume / sellVolume
 */

class VolumeRatioIndicator {
  constructor(config = {}) {
    // Lookback period for volume calculation
    this.lookback = config.lookback || 30;

    // Thresholds for signal generation
    this.buyThreshold = config.buyThreshold || 1.5;      // Strong buy pressure
    this.sellThreshold = config.sellThreshold || 0.67;   // Strong sell pressure (1/1.5)
    this.extremeThreshold = config.extremeThreshold || 2.5; // Extreme pressure

    // Strength weight configuration
    this.weightRatio = config.weightRatio || 40;      // % weight for ratio
    this.weightMomentum = config.weightMomentum || 30; // % weight for momentum
    this.weightAlignment = config.weightAlignment || 30; // % weight for alignment

    // History buffers
    this.candleHistory = [];
    this.ratioHistory = [];
    this.signalHistory = [];
    this.maxHistory = config.historyLength || 100;

    // Tracking
    this.currentBuyVolume = 0;
    this.currentSellVolume = 0;
    this.currentRatio = 1.0;
  }

  update(candle) {
    const { open, close, volume } = candle;

    // Store candle
    this.candleHistory.push({ open, close, volume });

    // Trim history
    if (this.candleHistory.length > this.maxHistory) {
      this.candleHistory.shift();
    }

    // Calculate volume ratio over lookback period
    this.calculateVolumeRatio();

    // Store ratio history
    this.ratioHistory.push(this.currentRatio);
    if (this.ratioHistory.length > this.maxHistory) {
      this.ratioHistory.shift();
    }

    return this.getResult();
  }

  calculateVolumeRatio() {
    const lookbackCandles = this.candleHistory.slice(-this.lookback);

    let buyVol = 0;
    let sellVol = 0;

    for (const candle of lookbackCandles) {
      if (candle.close > candle.open) {
        // Bullish candle - add to buy volume
        buyVol += candle.volume;
      } else if (candle.close < candle.open) {
        // Bearish candle - add to sell volume
        sellVol += candle.volume;
      } else {
        // Doji - split volume 50/50
        buyVol += candle.volume * 0.5;
        sellVol += candle.volume * 0.5;
      }
    }

    this.currentBuyVolume = buyVol;
    this.currentSellVolume = sellVol;

    // Calculate ratio with safety for division by zero
    const epsilon = 1e-9;
    this.currentRatio = buyVol / (sellVol + epsilon);
  }

  getSignalStrength() {
    // Calculate base strength from ratio
    let baseStrength = 50; // Neutral

    if (this.currentRatio >= this.buyThreshold) {
      // Scale strength 60-100 based on ratio
      const normalizedRatio = Math.min(
        (this.currentRatio - this.buyThreshold) / (this.extremeThreshold - this.buyThreshold),
        1.0
      );
      baseStrength = 60 + 40 * normalizedRatio;
    } else if (this.currentRatio <= this.sellThreshold) {
      // Scale strength 60-100 based on inverse ratio
      const inverseRatio = 1.0 / (this.currentRatio + 1e-9);
      const normalizedRatio = Math.min(
        (inverseRatio - (1.0 / this.sellThreshold)) / (this.extremeThreshold - (1.0 / this.sellThreshold)),
        1.0
      );
      baseStrength = 60 + 40 * normalizedRatio;
    } else {
      // Neutral - strength based on distance from 1.0
      baseStrength = 50 * (1.0 - Math.abs(this.currentRatio - 1.0));
    }

    // Add momentum component
    let momentumScore = 0;
    if (this.ratioHistory.length >= 5) {
      const recentRatios = this.ratioHistory.slice(-5);
      const ratioDelta = recentRatios[recentRatios.length - 1] - recentRatios[0];
      momentumScore = Math.min(Math.abs(ratioDelta) / 0.5, 1.0) * 100;
    }

    // Weighted combination
    const ratioWeight = this.weightRatio / 100;
    const momentumWeight = this.weightMomentum / 100;

    const finalStrength = Math.min(
      baseStrength * ratioWeight + momentumScore * momentumWeight + 30,
      100
    );

    return Math.round(finalStrength);
  }

  getVolumeImbalanceSignal() {
    if (this.candleHistory.length < this.lookback) return null;

    const strength = this.getSignalStrength();

    if (this.currentRatio >= this.extremeThreshold) {
      return {
        type: 'extreme_buy_pressure',
        direction: 'bullish',
        strength: 'very_strong',
        message: `Extreme buy pressure detected (ratio: ${this.currentRatio.toFixed(2)})`,
        metadata: {
          ratio: this.currentRatio,
          buyVolume: this.currentBuyVolume,
          sellVolume: this.currentSellVolume,
          signalStrength: strength
        }
      };
    }

    if (this.currentRatio >= this.buyThreshold) {
      return {
        type: 'strong_buy_pressure',
        direction: 'bullish',
        strength: strength >= 80 ? 'strong' : 'moderate',
        message: `Strong buy pressure (ratio: ${this.currentRatio.toFixed(2)})`,
        metadata: {
          ratio: this.currentRatio,
          buyVolume: this.currentBuyVolume,
          sellVolume: this.currentSellVolume,
          signalStrength: strength
        }
      };
    }

    if (this.currentRatio <= 1 / this.extremeThreshold) {
      return {
        type: 'extreme_sell_pressure',
        direction: 'bearish',
        strength: 'very_strong',
        message: `Extreme sell pressure detected (ratio: ${this.currentRatio.toFixed(2)})`,
        metadata: {
          ratio: this.currentRatio,
          buyVolume: this.currentBuyVolume,
          sellVolume: this.currentSellVolume,
          signalStrength: strength
        }
      };
    }

    if (this.currentRatio <= this.sellThreshold) {
      return {
        type: 'strong_sell_pressure',
        direction: 'bearish',
        strength: strength >= 80 ? 'strong' : 'moderate',
        message: `Strong sell pressure (ratio: ${this.currentRatio.toFixed(2)})`,
        metadata: {
          ratio: this.currentRatio,
          buyVolume: this.currentBuyVolume,
          sellVolume: this.currentSellVolume,
          signalStrength: strength
        }
      };
    }

    return null;
  }

  getPressureShiftSignal() {
    if (this.ratioHistory.length < 10) return null;

    const recentRatios = this.ratioHistory.slice(-10);
    const prevAvg = recentRatios.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const currentAvg = recentRatios.slice(-5).reduce((a, b) => a + b, 0) / 5;

    const shift = currentAvg - prevAvg;

    // Significant bullish shift
    if (shift > 0.3 && currentAvg > 1.0) {
      return {
        type: 'bullish_pressure_shift',
        direction: 'bullish',
        strength: shift > 0.5 ? 'strong' : 'moderate',
        message: `Volume pressure shifting bullish (shift: +${shift.toFixed(2)})`,
        metadata: { prevAvg, currentAvg, shift }
      };
    }

    // Significant bearish shift
    if (shift < -0.3 && currentAvg < 1.0) {
      return {
        type: 'bearish_pressure_shift',
        direction: 'bearish',
        strength: shift < -0.5 ? 'strong' : 'moderate',
        message: `Volume pressure shifting bearish (shift: ${shift.toFixed(2)})`,
        metadata: { prevAvg, currentAvg, shift }
      };
    }

    return null;
  }

  getRatioDivergence() {
    if (this.candleHistory.length < 20 || this.ratioHistory.length < 20) {
      return null;
    }

    const recentCandles = this.candleHistory.slice(-14);
    const recentRatios = this.ratioHistory.slice(-14);

    const prices = recentCandles.map(c => c.close);

    // Check for bullish divergence: price making lower lows, ratio making higher lows
    const priceLows = this.findSwingLows(prices);
    const ratioLows = this.findSwingLows(recentRatios);

    if (priceLows.length >= 2 && ratioLows.length >= 2) {
      const lastPrice = prices[priceLows[priceLows.length - 1]];
      const prevPrice = prices[priceLows[priceLows.length - 2]];
      const lastRatio = recentRatios[ratioLows[ratioLows.length - 1]];
      const prevRatio = recentRatios[ratioLows[ratioLows.length - 2]];

      if (lastPrice < prevPrice && lastRatio > prevRatio) {
        return {
          type: 'bullish_ratio_divergence',
          direction: 'bullish',
          strength: 'very_strong',
          message: 'Bullish divergence: Price lower low, Volume ratio higher low',
          metadata: { lastPrice, prevPrice, lastRatio, prevRatio }
        };
      }
    }

    // Check for bearish divergence: price making higher highs, ratio making lower highs
    const priceHighs = this.findSwingHighs(prices);
    const ratioHighs = this.findSwingHighs(recentRatios);

    if (priceHighs.length >= 2 && ratioHighs.length >= 2) {
      const lastPrice = prices[priceHighs[priceHighs.length - 1]];
      const prevPrice = prices[priceHighs[priceHighs.length - 2]];
      const lastRatio = recentRatios[ratioHighs[ratioHighs.length - 1]];
      const prevRatio = recentRatios[ratioHighs[ratioHighs.length - 2]];

      if (lastPrice > prevPrice && lastRatio < prevRatio) {
        return {
          type: 'bearish_ratio_divergence',
          direction: 'bearish',
          strength: 'very_strong',
          message: 'Bearish divergence: Price higher high, Volume ratio lower high',
          metadata: { lastPrice, prevPrice, lastRatio, prevRatio }
        };
      }
    }

    return null;
  }

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

  getSignals() {
    const signals = [];

    const imbalance = this.getVolumeImbalanceSignal();
    if (imbalance) signals.push(imbalance);

    const shift = this.getPressureShiftSignal();
    if (shift) signals.push(shift);

    const divergence = this.getRatioDivergence();
    if (divergence) signals.push(divergence);

    return signals;
  }

  getResult() {
    const strength = this.getSignalStrength();

    // Determine signal direction
    let signal = 'NEUTRAL';
    if (this.currentRatio >= this.buyThreshold) {
      signal = 'BUY';
    } else if (this.currentRatio <= this.sellThreshold) {
      signal = 'SELL';
    }

    return {
      value: {
        ratio: this.currentRatio,
        buyVolume: this.currentBuyVolume,
        sellVolume: this.currentSellVolume,
        signal: signal,
        strength: strength
      },
      signals: this.candleHistory.length >= this.lookback ? this.getSignals() : []
    };
  }

  reset() {
    this.candleHistory = [];
    this.ratioHistory = [];
    this.signalHistory = [];
    this.currentBuyVolume = 0;
    this.currentSellVolume = 0;
    this.currentRatio = 1.0;
  }
}

module.exports = VolumeRatioIndicator;
