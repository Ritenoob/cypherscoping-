/**
 * Signal Weights Configuration V4 - OPTIMIZED 2026-01-15
 *
 * TOP 5 INDICATORS (from multi-timeframe optimization):
 * 1. OBV (1hour): 72.5% WR, 4.34% ROI - SlopeWindow=7, Smoothing=3
 * 2. Bollinger (15min): 86.1% WR, 2.88% ROI - Period=15, StdDev=2
 * 3. Williams %R (30min): 62.9% WR, 2.99% ROI - Period=10, OS=-90, OB=-10
 * 4. AO (15min): 70.0% WR, 2.91% ROI - Fast=3, Slow=34
 * 5. MACD (1hour): 36.5% WR, 3.25% ROI - Fast=5, Slow=17, Signal=5
 *
 * MTF Alignment: DISABLED (single timeframe mode)
 * ATR Enhancements: ENABLED (dynamic SL/TP)
 * 9th Level Entry: ENABLED (order book precision)
 *
 * Total indicator weight: 180 (capped at ±120)
 * Total microstructure weight: 60 (capped at ±30)
 * Final score range: -150 to +150
 */

// Helper to read boolean from env
const envBool = (key, defaultVal = true) => {
  const val = process.env[key];
  if (val === undefined) return defaultVal;
  return val.toLowerCase() === 'true';
};

module.exports = {
  // Technical Indicators (10 total) - OPTIMIZED 2026-01-14
  indicators: {
    // RSI: BEST performer - 71.1% win rate
    // Divergence is king, crossovers are gold
    rsi: {
      maxWeight: 35,  // Increased from 30
      enabled: envBool('INDICATOR_RSI_ENABLED', true),
      signals: {
        crossover: { weight: 1.4, priority: 2 },     // Increased
        divergence: { weight: 1.8, priority: 1 },    // HIGHEST - divergence is most predictive
        momentum: { weight: 0.6, priority: 4 },      // Decreased - less reliable
        zone: { weight: 0.5, priority: 5 }           // Decreased - zones alone are weak
      }
    },

    // MACD: TOP 5 on 1hour (3.25% ROI) - Fast=5, Slow=17, Signal=5
    macd: {
      maxWeight: 20,  // Increased - good on 1hour TF
      enabled: envBool('INDICATOR_MACD_ENABLED', true),  // ENABLED
      signals: {
        signal_crossover: { weight: 1.0, priority: 2 },
        zero_crossover: { weight: 0.8, priority: 3 },
        histogram: { weight: 0.6, priority: 4 },
        divergence: { weight: 1.4, priority: 1 }
      }
    },

    // Williams %R: Strong performer - 61.9% win rate
    williamsR: {
      maxWeight: 28,  // Increased from 25
      enabled: envBool('INDICATOR_WILLIAMS_ENABLED', true),
      signals: {
        crossover: { weight: 1.3, priority: 2 },
        failure_swing: { weight: 1.0, priority: 3 },
        divergence: { weight: 1.7, priority: 1 },     // High value
        zone: { weight: 0.5, priority: 5 }            // Decreased
      }
    },

    // AO: TOP 5 on 15min (70% WR, 2.91% ROI) - Fast=3, Slow=34
    ao: {
      maxWeight: 25,  // Increased - strong performer
      enabled: envBool('INDICATOR_AO_ENABLED', true),
      signals: {
        zero_cross: { weight: 1.2, priority: 2 },
        saucer: { weight: 0.8, priority: 4 },
        twin_peaks: { weight: 1.1, priority: 3 },
        divergence: { weight: 1.5, priority: 1 }
      }
    },

    // EMA Trend: High win rate when triggered, but fewer signals
    emaTrend: {
      maxWeight: 18,  // Increased
      enabled: envBool('INDICATOR_EMA_ENABLED', true),
      signals: {
        ema_cross: { weight: 1.2, priority: 2 },
        golden_death_cross: { weight: 1.5, priority: 1 },  // Very reliable
        trend_direction: { weight: 0.8, priority: 3 },
        slope: { weight: 0.6, priority: 4 }
      }
    },

    // Stochastic RSI: KuCoin style
    stochRSI: {
      maxWeight: 18,  // Increased from 15
      enabled: envBool('INDICATOR_STOCHRSI_ENABLED', true),
      signals: {
        kd_crossover: { weight: 1.2, priority: 2 },
        zone: { weight: 0.5, priority: 4 },           // Decreased
        divergence: { weight: 1.6, priority: 1 }      // Increased
      }
    },

    // Bollinger: TOP 5 on 15min (86.1% WR, 2.88% ROI) - Period=15, StdDev=2
    bollinger: {
      maxWeight: 30,  // HIGHEST - best win rate
      enabled: envBool('INDICATOR_BOLLINGER_ENABLED', true),
      signals: {
        band_touch: { weight: 0.6, priority: 4 },
        squeeze: { weight: 1.6, priority: 1 },        // Squeeze is KEY signal
        breakout: { weight: 1.4, priority: 2 },
        percentB: { weight: 0.5, priority: 5 }
      }
    },

    // KDJ: Good - 63.9% win rate (2nd best)
    kdj: {
      maxWeight: 25,  // Increased from 18
      enabled: envBool('INDICATOR_KDJ_ENABLED', true),
      signals: {
        j_line: { weight: 1.3, priority: 2 },
        kd_cross: { weight: 1.0, priority: 3 },
        divergence: { weight: 1.6, priority: 1 }      // Increased
      }
    },

    // OBV: TOP 5 #1 on 1hour (72.5% WR, 4.34% ROI) - SlopeWindow=7, Smoothing=3
    obv: {
      maxWeight: 35,  // HIGHEST ROI performer
      enabled: envBool('INDICATOR_OBV_ENABLED', true),
      signals: {
        slope: { weight: 1.2, priority: 2 },
        breakout: { weight: 1.4, priority: 2 },
        divergence: { weight: 1.8, priority: 1 }  // OBV divergence is powerful
      }
    },

    // DOM: Live mode only, real-time order book
    dom: {
      maxWeight: 18,  // Increased from 15
      enabled: envBool('INDICATOR_DOM_ENABLED', true),
      liveOnly: true,
      signals: {
        imbalance: { weight: 1.3, priority: 1 },      // Order book imbalance is strong
        wall: { weight: 0.8, priority: 3 },
        microprice: { weight: 0.6, priority: 4 }
      }
    },

    // ADX: Regime Detection (Trend vs Range) - KEY FOR 78% WIN RATE
    adx: {
      maxWeight: 20,
      enabled: envBool('INDICATOR_ADX_ENABLED', true),
      signals: {
        trend: { weight: 1.5, priority: 1 },           // ADX > 25 = trending
        strong_trend: { weight: 1.8, priority: 1 },    // ADX > 40 = strong trend
        bullish_adx_trend: { weight: 1.4, priority: 2 },
        bearish_adx_trend: { weight: 1.4, priority: 2 },
        adx_strengthening: { weight: 1.2, priority: 3 }
      }
    }
  },

  // Microstructure Analyzers (3 total) - LIVE ONLY
  // OPTIMIZED 2026-01-14: Higher conviction thresholds
  microstructure: {
    buySellRatio: {
      maxWeight: 25,  // Increased from 20
      enabled: envBool('MICROSTRUCTURE_BUYSELL_ENABLED', true),
      liveOnly: true,
      signals: {
        // 85%+ imbalance required (was 80%) - extreme conviction
        flow_imbalance: { weight: 1.5, priority: 1 },
        // Absorption at 20%/80% levels
        absorption: { weight: 1.3, priority: 2 },
        // Extreme exhaustion (<10% or >90%)
        exhaustion: { weight: 1.8, priority: 1 },     // Highest - rare but powerful
        // Requires 30% momentum shift (was 25%)
        delta_momentum: { weight: 1.2, priority: 2 }
      }
    },

    priceRatio: {
      maxWeight: 20,  // Increased from 18
      enabled: envBool('MICROSTRUCTURE_PRICERATIO_ENABLED', true),
      liveOnly: true,
      signals: {
        // Premium/discount > 0.3% is significant
        basis: { weight: 1.4, priority: 1 },
        // High spread = avoid entry (warning signal)
        spread: { weight: 1.0, priority: 3 },
        convergence: { weight: 1.2, priority: 2 },
        bid_ask_imbalance: { weight: 0.6, priority: 4 },
        mark_deviation: { weight: 0.6, priority: 4 }
      }
    },

    fundingRate: {
      maxWeight: 20,  // Increased from 18
      enabled: envBool('MICROSTRUCTURE_FUNDING_ENABLED', true),
      liveOnly: true,
      signals: {
        // Extreme funding (>2.5%) = crowded trade reversal
        extreme_rate: { weight: 1.7, priority: 1 },
        // Significant rate change (>0.7%)
        rate_change: { weight: 1.2, priority: 2 },
        predicted_rate: { weight: 0.8, priority: 3 },
        // Funding timing within 15 min
        funding_timing: { weight: 1.4, priority: 1 },
        cumulative: { weight: 0.8, priority: 3 }
      }
    }
  },

  // Strength multipliers - OPTIMIZED: Increase very_strong impact
  strengthMultipliers: {
    very_strong: 1.4,   // Increased from 1.2 - divergence signals get big boost
    strong: 1.0,
    moderate: 0.6,      // Decreased from 0.7
    weak: 0.3,          // Decreased from 0.5
    extreme: 1.3        // Increased from 1.1
  },

  // Score caps - OPTIMIZED: Allow higher conviction scores
  caps: {
    indicatorScore: 120,      // Increased from 110
    microstructureScore: 35,  // Increased from 30
    totalScore: 150           // Increased from 140
  },

  // Signal classifications - OPTIMIZED: Higher thresholds for entry
  classifications: {
    EXTREME_BUY: { min: 100, max: 150 },    // Raised from 90
    STRONG_BUY: { min: 80, max: 99 },       // Raised from 70
    BUY: { min: 60, max: 79 },              // Raised from 50
    BUY_WEAK: { min: 40, max: 59 },         // Raised from 30
    NEUTRAL: { min: -39, max: 39 },
    SELL_WEAK: { min: -59, max: -40 },
    SELL: { min: -79, max: -60 },
    STRONG_SELL: { min: -99, max: -80 },
    EXTREME_SELL: { min: -150, max: -100 }
  },

  // Entry requirements - OPTIMIZED 2026-01-15 for 78%+ win rate
  entryRequirements: {
    minScore: 85,                // Increased from 80 - only high conviction entries
    minConfidence: 75,           // Increased from 70 - stricter confidence
    minIndicatorsAgreeing: 4,    // At least 4 indicators must agree
    requireDivergence: true,     // ENABLED - divergence signals have highest predictive value
    requireTrendAlignment: true  // Requires EMA trend confirmation
  },

  // NEW: Regime-based entry logic (from MQL5 truth docs - 78%+ win rate)
  regimeStrategy: {
    // ADX threshold for trend vs range detection
    adxTrendThreshold: 25,
    adxStrongTrendThreshold: 40,

    // TREND MODE (ADX > 25): EMA crossover + RSI confirmation
    trendMode: {
      requireEMACrossover: true,       // Fast EMA must cross Slow EMA
      rsiConfirmationBuy: 50,          // RSI must be > 50 for buy
      rsiConfirmationSell: 50,         // RSI must be < 50 for sell
      fastEMAPeriod: 9,                // Fast EMA (short)
      slowEMAPeriod: 50                // Slow EMA (long)
    },

    // RANGE MODE (ADX <= 25): RSI extremes only
    rangeMode: {
      rsiOversoldBuy: 30,              // Buy when RSI < 30
      rsiOverboughtSell: 70            // Sell when RSI > 70
    },

    // HYBRID PULLBACK: Combined trend + oscillator
    hybridMode: {
      enabled: true,
      // Buy on pullback: Price > MA AND RSI < 30 (oversold in uptrend)
      pullbackBuyRSI: 30,
      // Sell on pullback: Price < MA AND RSI > 70 (overbought in downtrend)
      pullbackSellRSI: 70
    }
  },

  // Signal combination bonuses (when multiple conditions align)
  combinationBonuses: {
    emaCrossWithRSI: 15,           // EMA cross + RSI confirmation = +15
    divergenceWithTrend: 20,       // Divergence + trend alignment = +20
    pullbackEntry: 12,             // Valid pullback entry = +12
    multiTimeframeAlign: 18,       // Both timeframes agree = +18
    strongADXTrend: 10             // ADX > 40 trend = +10
  }
};

