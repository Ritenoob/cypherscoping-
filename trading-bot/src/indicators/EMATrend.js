/**
 * EMA Trend - ENHANCED V2 with Full Signal Detection
 *
 * ENHANCEMENTS (2026-01-17):
 * - Added 100-period EMA for additional mean reversion signals
 * - Added extreme MA divergence detection (mean reversion opportunities)
 * - Price >3% from 50 EMA = mean reversion signal
 * - Price >4% from 100 EMA = stronger mean reversion signal
 * - Price >5% from 200 EMA = very strong mean reversion signal
 *
 * Signals: EMA Crosses, Golden/Death Cross, Slope Analysis, Distance, Extreme MA Divergence
 */

class EMATrend {
  constructor(config = {}) {
    this.shortPeriod = config.shortPeriod || 9;
    this.mediumPeriod = config.mediumPeriod || 21;
    this.longPeriod = config.longPeriod || 50;
    this.midTrendPeriod = config.midTrendPeriod || 100; // NEW: 100 EMA
    this.trendPeriod = config.trendPeriod || 200;

    // Extreme divergence thresholds (for mean reversion)
    this.extremeDiv50 = config.extremeDiv50 || 3.0;   // 3% from 50 EMA
    this.extremeDiv100 = config.extremeDiv100 || 4.0; // 4% from 100 EMA
    this.extremeDiv200 = config.extremeDiv200 || 5.0; // 5% from 200 EMA
    
    this.shortEMA = null;
    this.mediumEMA = null;
    this.longEMA = null;
    this.midTrendEMA = null; // NEW: 100 EMA
    this.trendEMA = null;

    this.prevShortEMA = null;
    this.prevMediumEMA = null;
    this.prevLongEMA = null;
    this.prevMidTrendEMA = null; // NEW

    this.shortMultiplier = 2 / (this.shortPeriod + 1);
    this.mediumMultiplier = 2 / (this.mediumPeriod + 1);
    this.longMultiplier = 2 / (this.longPeriod + 1);
    this.midTrendMultiplier = 2 / (this.midTrendPeriod + 1); // NEW
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
    this.prevMidTrendEMA = this.midTrendEMA; // NEW

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
      this.midTrendEMA = this.priceHistory.slice(-this.midTrendPeriod).reduce((a, b) => a + b, 0) / this.midTrendPeriod; // NEW
      this.trendEMA = this.priceHistory.reduce((a, b) => a + b, 0) / this.trendPeriod;
    } else if (this.priceCount > this.trendPeriod) {
      this.shortEMA = (close - this.shortEMA) * this.shortMultiplier + this.shortEMA;
      this.mediumEMA = (close - this.mediumEMA) * this.mediumMultiplier + this.mediumEMA;
      this.longEMA = (close - this.longEMA) * this.longMultiplier + this.longEMA;
      this.midTrendEMA = (close - this.midTrendEMA) * this.midTrendMultiplier + this.midTrendEMA; // NEW
      this.trendEMA = (close - this.trendEMA) * this.trendMultiplier + this.trendEMA;
    }

    if (this.longEMA !== null) {
      this.emaHistory.push({ short: this.shortEMA, long: this.longEMA, ema100: this.midTrendEMA });
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

  // NEW SIGNAL: Extreme MA Divergence (Mean Reversion Opportunity)
  // When price extends too far from key EMAs, it tends to revert
  getExtremeDivergence() {
    if (this.longEMA === null || this.midTrendEMA === null || this.trendEMA === null) {
      return null;
    }

    const currentPrice = this.priceHistory[this.priceHistory.length - 1];
    const signals = [];

    // Check distance from 50 EMA (most sensitive)
    const dist50 = ((currentPrice - this.longEMA) / this.longEMA) * 100;

    // Check distance from 100 EMA
    const dist100 = ((currentPrice - this.midTrendEMA) / this.midTrendEMA) * 100;

    // Check distance from 200 EMA (least sensitive, strongest signal)
    const dist200 = ((currentPrice - this.trendEMA) / this.trendEMA) * 100;

    // BULLISH MEAN REVERSION: Price far BELOW MA (oversold, expect bounce)
    if (dist200 < -this.extremeDiv200) {
      signals.push({
        type: 'extreme_oversold_200',
        direction: 'bullish',
        strength: 'very_strong',
        message: `Extreme oversold: ${Math.abs(dist200).toFixed(1)}% below EMA 200 (mean reversion opportunity)`,
        metadata: { distance: dist200, ema: 200, price: currentPrice, emaValue: this.trendEMA }
      });
    } else if (dist100 < -this.extremeDiv100 && dist200 >= -this.extremeDiv200) {
      signals.push({
        type: 'extreme_oversold_100',
        direction: 'bullish',
        strength: 'strong',
        message: `Oversold: ${Math.abs(dist100).toFixed(1)}% below EMA 100 (mean reversion)`,
        metadata: { distance: dist100, ema: 100, price: currentPrice, emaValue: this.midTrendEMA }
      });
    } else if (dist50 < -this.extremeDiv50 && dist100 >= -this.extremeDiv100) {
      signals.push({
        type: 'extreme_oversold_50',
        direction: 'bullish',
        strength: 'moderate',
        message: `Extended: ${Math.abs(dist50).toFixed(1)}% below EMA 50`,
        metadata: { distance: dist50, ema: 50, price: currentPrice, emaValue: this.longEMA }
      });
    }

    // BEARISH MEAN REVERSION: Price far ABOVE MA (overbought, expect pullback)
    if (dist200 > this.extremeDiv200) {
      signals.push({
        type: 'extreme_overbought_200',
        direction: 'bearish',
        strength: 'very_strong',
        message: `Extreme overbought: ${dist200.toFixed(1)}% above EMA 200 (mean reversion opportunity)`,
        metadata: { distance: dist200, ema: 200, price: currentPrice, emaValue: this.trendEMA }
      });
    } else if (dist100 > this.extremeDiv100 && dist200 <= this.extremeDiv200) {
      signals.push({
        type: 'extreme_overbought_100',
        direction: 'bearish',
        strength: 'strong',
        message: `Overbought: ${dist100.toFixed(1)}% above EMA 100 (mean reversion)`,
        metadata: { distance: dist100, ema: 100, price: currentPrice, emaValue: this.midTrendEMA }
      });
    } else if (dist50 > this.extremeDiv50 && dist100 <= this.extremeDiv100) {
      signals.push({
        type: 'extreme_overbought_50',
        direction: 'bearish',
        strength: 'moderate',
        message: `Extended: ${dist50.toFixed(1)}% above EMA 50`,
        metadata: { distance: dist50, ema: 50, price: currentPrice, emaValue: this.longEMA }
      });
    }

    return signals.length > 0 ? signals : null;
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

    // NEW: Extreme MA divergence (mean reversion signals)
    const extremeDiv = this.getExtremeDivergence();
    if (extremeDiv) signals.push(...extremeDiv);

    return signals;
  }

  getResult() {
    const currentPrice = this.priceHistory.length > 0
      ? this.priceHistory[this.priceHistory.length - 1]
      : null;

    // Calculate distances for metadata
    const dist50 = this.longEMA && currentPrice
      ? ((currentPrice - this.longEMA) / this.longEMA) * 100
      : null;
    const dist100 = this.midTrendEMA && currentPrice
      ? ((currentPrice - this.midTrendEMA) / this.midTrendEMA) * 100
      : null;
    const dist200 = this.trendEMA && currentPrice
      ? ((currentPrice - this.trendEMA) / this.trendEMA) * 100
      : null;

    return {
      value: {
        emaShort: this.shortEMA,
        emaMedium: this.mediumEMA,
        emaLong: this.longEMA,
        ema100: this.midTrendEMA, // NEW
        emaTrend: this.trendEMA,
        // Backward compatibility
        short: this.shortEMA,
        medium: this.mediumEMA,
        long: this.longEMA,
        trend: this.trendEMA,
        // Distance from MAs (%)
        distFromEMA50: dist50,
        distFromEMA100: dist100,
        distFromEMA200: dist200
      },
      signals: this.longEMA !== null ? this.getSignals() : []
    };
  }

  reset() {
    this.shortEMA = null;
    this.mediumEMA = null;
    this.longEMA = null;
    this.midTrendEMA = null; // NEW
    this.trendEMA = null;
    this.prevShortEMA = null;
    this.prevMediumEMA = null;
    this.prevLongEMA = null;
    this.prevMidTrendEMA = null; // NEW
    this.priceCount = 0;
    this.priceHistory = [];
    this.emaHistory = [];
  }
}

module.exports = EMATrend;
