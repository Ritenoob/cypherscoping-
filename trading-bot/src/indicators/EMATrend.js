/**
 * EMA Trend - ENHANCED with Full Signal Detection
 * Signals: EMA Crosses, Golden/Death Cross, Slope Analysis, Distance
 */

class EMATrend {
  constructor(config = {}) {
    this.shortPeriod = config.shortPeriod || 9;
    this.mediumPeriod = config.mediumPeriod || 21;
    this.longPeriod = config.longPeriod || 50;
    this.trendPeriod = config.trendPeriod || 200;
    
    this.shortEMA = null;
    this.mediumEMA = null;
    this.longEMA = null;
    this.trendEMA = null;
    
    this.prevShortEMA = null;
    this.prevMediumEMA = null;
    this.prevLongEMA = null;
    
    this.shortMultiplier = 2 / (this.shortPeriod + 1);
    this.mediumMultiplier = 2 / (this.mediumPeriod + 1);
    this.longMultiplier = 2 / (this.longPeriod + 1);
    this.trendMultiplier = 2 / (this.trendPeriod + 1);
    
    this.priceCount = 0;
    this.priceHistory = [];
    this.emaHistory = [];
    this.maxHistory = config.historyLength || 50;
  }

  update(candle) {
    const close = typeof candle === 'number' ? candle : candle.close;
    
    this.prevShortEMA = this.shortEMA;
    this.prevMediumEMA = this.mediumEMA;
    this.prevLongEMA = this.longEMA;
    
    this.priceCount++;
    this.priceHistory.push(close);
    
    if (this.priceHistory.length > this.trendPeriod) {
      this.priceHistory.shift();
    }
    
    // Initialize EMAs with SMA
    if (this.priceCount === this.trendPeriod) {
      this.shortEMA = this.priceHistory.slice(-this.shortPeriod).reduce((a, b) => a + b, 0) / this.shortPeriod;
      this.mediumEMA = this.priceHistory.slice(-this.mediumPeriod).reduce((a, b) => a + b, 0) / this.mediumPeriod;
      this.longEMA = this.priceHistory.slice(-this.longPeriod).reduce((a, b) => a + b, 0) / this.longPeriod;
      this.trendEMA = this.priceHistory.reduce((a, b) => a + b, 0) / this.trendPeriod;
    } else if (this.priceCount > this.trendPeriod) {
      this.shortEMA = (close - this.shortEMA) * this.shortMultiplier + this.shortEMA;
      this.mediumEMA = (close - this.mediumEMA) * this.mediumMultiplier + this.mediumEMA;
      this.longEMA = (close - this.longEMA) * this.longMultiplier + this.longEMA;
      this.trendEMA = (close - this.trendEMA) * this.trendMultiplier + this.trendEMA;
    }
    
    if (this.longEMA !== null) {
      this.emaHistory.push({ short: this.shortEMA, long: this.longEMA });
      if (this.emaHistory.length > this.maxHistory) {
        this.emaHistory.shift();
      }
    }
    
    return this.getResult();
  }

  getEMACross() {
    if (this.prevShortEMA === null || this.prevLongEMA === null) return null;
    
    // Bullish: Short EMA crosses ABOVE Long EMA
    if (this.prevShortEMA <= this.prevLongEMA && this.shortEMA > this.longEMA) {
      return {
        type: 'bullish_ema_cross',
        direction: 'bullish',
        strength: 'strong',
        message: `EMA ${this.shortPeriod} crossed above EMA ${this.longPeriod}`,
        metadata: { shortEMA: this.shortEMA, longEMA: this.longEMA }
      };
    }
    
    // Bearish: Short EMA crosses BELOW Long EMA
    if (this.prevShortEMA >= this.prevLongEMA && this.shortEMA < this.longEMA) {
      return {
        type: 'bearish_ema_cross',
        direction: 'bearish',
        strength: 'strong',
        message: `EMA ${this.shortPeriod} crossed below EMA ${this.longPeriod}`,
        metadata: { shortEMA: this.shortEMA, longEMA: this.longEMA }
      };
    }
    
    return null;
  }

  getGoldenDeathCross() {
    if (this.prevLongEMA === null || this.trendEMA === null) return null;
    
    // Golden Cross: 50 EMA crosses above 200 EMA
    if (this.prevLongEMA <= this.trendEMA && this.longEMA > this.trendEMA) {
      return {
        type: 'golden_cross',
        direction: 'bullish',
        strength: 'very_strong',
        message: 'Golden Cross: EMA 50 crossed above EMA 200',
        metadata: { longEMA: this.longEMA, trendEMA: this.trendEMA }
      };
    }
    
    // Death Cross: 50 EMA crosses below 200 EMA
    if (this.prevLongEMA >= this.trendEMA && this.longEMA < this.trendEMA) {
      return {
        type: 'death_cross',
        direction: 'bearish',
        strength: 'very_strong',
        message: 'Death Cross: EMA 50 crossed below EMA 200',
        metadata: { longEMA: this.longEMA, trendEMA: this.trendEMA }
      };
    }
    
    return null;
  }

  getTrendDirection() {
    if (this.trendEMA === null) return null;
    
    const currentPrice = this.priceHistory[this.priceHistory.length - 1];
    const distance = ((currentPrice - this.trendEMA) / this.trendEMA) * 100;
    
    if (currentPrice > this.trendEMA && this.shortEMA > this.longEMA) {
      return {
        type: 'bullish_trend',
        direction: 'bullish',
        strength: Math.abs(distance) > 5 ? 'strong' : 'moderate',
        message: `Bullish trend (${distance.toFixed(1)}% above EMA 200)`,
        metadata: { distance, currentPrice, trendEMA: this.trendEMA }
      };
    }
    
    if (currentPrice < this.trendEMA && this.shortEMA < this.longEMA) {
      return {
        type: 'bearish_trend',
        direction: 'bearish',
        strength: Math.abs(distance) > 5 ? 'strong' : 'moderate',
        message: `Bearish trend (${Math.abs(distance).toFixed(1)}% below EMA 200)`,
        metadata: { distance, currentPrice, trendEMA: this.trendEMA }
      };
    }
    
    return null;
  }

  getSlopeSignal() {
    if (this.emaHistory.length < 5) return null;
    
    const recent = this.emaHistory.slice(-5);
    const shortSlope = (recent[4].short - recent[0].short) / recent[0].short * 100;
    const longSlope = (recent[4].long - recent[0].long) / recent[0].long * 100;
    
    // Both EMAs rising steeply
    if (shortSlope > 0.5 && longSlope > 0.3) {
      return {
        type: 'bullish_slope',
        direction: 'bullish',
        strength: 'moderate',
        message: `EMAs sloping up (short: ${shortSlope.toFixed(2)}%, long: ${longSlope.toFixed(2)}%)`,
        metadata: { shortSlope, longSlope }
      };
    }
    
    // Both EMAs falling steeply
    if (shortSlope < -0.5 && longSlope < -0.3) {
      return {
        type: 'bearish_slope',
        direction: 'bearish',
        strength: 'moderate',
        message: `EMAs sloping down (short: ${shortSlope.toFixed(2)}%, long: ${longSlope.toFixed(2)}%)`,
        metadata: { shortSlope, longSlope }
      };
    }
    
    return null;
  }

  getSignals() {
    const signals = [];
    
    const emaCross = this.getEMACross();
    if (emaCross) signals.push(emaCross);
    
    const goldenDeath = this.getGoldenDeathCross();
    if (goldenDeath) signals.push(goldenDeath);
    
    const trend = this.getTrendDirection();
    if (trend) signals.push(trend);
    
    const slope = this.getSlopeSignal();
    if (slope) signals.push(slope);
    
    return signals;
  }

  getResult() {
    return {
      value: {
        emaShort: this.shortEMA,
        emaMedium: this.mediumEMA,
        emaLong: this.longEMA,
        emaTrend: this.trendEMA,
        // Also include short names for backward compatibility
        short: this.shortEMA,
        medium: this.mediumEMA,
        long: this.longEMA,
        trend: this.trendEMA
      },
      signals: this.longEMA !== null ? this.getSignals() : []
    };
  }

  reset() {
    this.shortEMA = null;
    this.mediumEMA = null;
    this.longEMA = null;
    this.trendEMA = null;
    this.prevShortEMA = null;
    this.prevMediumEMA = null;
    this.prevLongEMA = null;
    this.priceCount = 0;
    this.priceHistory = [];
    this.emaHistory = [];
  }
}

module.exports = EMATrend;
