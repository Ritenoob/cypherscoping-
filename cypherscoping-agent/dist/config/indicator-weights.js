"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecommendedLeverage = exports.getSignalClassification = exports.SIGNAL_CLASSIFICATIONS = exports.SCORE_CAPS = exports.SIGNAL_TYPE_MULTIPLIERS = exports.SIGNAL_STRENGTH_MULTIPLIERS = exports.V6_OPTIMIZED_WEIGHTS = void 0;
exports.V6_OPTIMIZED_WEIGHTS = {
    RSI: {
        weight: 40,
        period: 21,
        oversold: 30,
        overbought: 70,
        enabled: true
    },
    Stochastic: {
        weight: 35,
        kPeriod: 14,
        dPeriod: 3,
        smoothK: 3,
        oversold: 20,
        overbought: 80,
        enabled: true
    },
    KDJ: {
        weight: 35,
        period: 9,
        kSmooth: 3,
        dSmooth: 3,
        jOversold: 0,
        jOverbought: 100,
        enabled: true
    },
    WilliamsR: {
        weight: 28,
        period: 10,
        oversold: -80,
        overbought: -20,
        enabled: true
    },
    Bollinger: {
        weight: 30,
        period: 20,
        multiplier: 2.0,
        enabled: true
    },
    EMATrend: {
        weight: 25,
        shortPeriod: 9,
        mediumPeriod: 25,
        longPeriod: 50,
        enabled: true
    },
    Klinger: {
        weight: 25,
        fastPeriod: 34,
        slowPeriod: 55,
        signalPeriod: 13,
        enabled: true
    },
    AO: {
        weight: 25,
        fastPeriod: 5,
        slowPeriod: 34,
        enabled: true
    },
    ADX: {
        weight: 20,
        period: 14,
        trendThreshold: 25,
        strongTrendThreshold: 40,
        enabled: true
    },
    MACD: {
        weight: 18,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        enabled: true
    },
    OBV: {
        weight: 18,
        smoothing: 9,
        enabled: true
    },
    StochRSI: {
        weight: 18,
        rsiPeriod: 14,
        stochPeriod: 14,
        kPeriod: 3,
        dPeriod: 3,
        oversold: 20,
        overbought: 80,
        enabled: true
    },
    CMF: {
        weight: 15,
        period: 20,
        enabled: true
    }
};
exports.SIGNAL_STRENGTH_MULTIPLIERS = {
    veryStrong: 1.4,
    strong: 1.0,
    moderate: 0.6,
    weak: 0.3,
    extreme: 1.3
};
exports.SIGNAL_TYPE_MULTIPLIERS = {
    divergence: 1.5,
    crossover: 1.3,
    squeeze: 1.3,
    goldenDeathCross: 1.4,
    zone: 0.85,
    momentum: 1.0,
    oversold: 1.2,
    overbought: 1.2
};
exports.SCORE_CAPS = {
    indicatorScore: 200,
    microstructureScore: 35,
    totalScore: 220
};
exports.SIGNAL_CLASSIFICATIONS = {
    EXTREME_BUY: { min: 130, max: 220, action: 'STRONG_LONG' },
    STRONG_BUY: { min: 95, max: 129, action: 'LONG' },
    BUY: { min: 65, max: 94, action: 'MODERATE_LONG' },
    BUY_WEAK: { min: 40, max: 64, action: 'WEAK_LONG' },
    NEUTRAL: { min: -39, max: 39, action: 'NO_ACTION' },
    SELL_WEAK: { min: -64, max: -40, action: 'WEAK_SHORT' },
    SELL: { min: -94, max: -65, action: 'MODERATE_SHORT' },
    STRONG_SELL: { min: -129, max: -95, action: 'SHORT' },
    EXTREME_SELL: { min: -220, max: -130, action: 'STRONG_SHORT' }
};
const getSignalClassification = (score) => {
    const absScore = Math.abs(score);
    if (absScore >= 130)
        return exports.SIGNAL_CLASSIFICATIONS.EXTREME_BUY;
    if (absScore >= 95)
        return exports.SIGNAL_CLASSIFICATIONS.STRONG_BUY;
    if (absScore >= 65)
        return exports.SIGNAL_CLASSIFICATIONS.BUY;
    if (absScore >= 40)
        return exports.SIGNAL_CLASSIFICATIONS.BUY_WEAK;
    if (absScore < 40)
        return exports.SIGNAL_CLASSIFICATIONS.NEUTRAL;
    const negativeClass = Object.entries(exports.SIGNAL_CLASSIFICATIONS)
        .filter(([_, config]) => score <= config.min)
        .find(([_, config]) => absScore >= Math.abs(config.min));
    return negativeClass || exports.SIGNAL_CLASSIFICATIONS.NEUTRAL;
};
exports.getSignalClassification = getSignalClassification;
const getRecommendedLeverage = (score, confidence) => {
    const absScore = Math.abs(score);
    const confMultiplier = confidence / 100;
    if (absScore < 40)
        return 0;
    if (absScore >= 130)
        return Math.round(50 * confMultiplier);
    if (absScore >= 95)
        return Math.round(30 * confMultiplier);
    if (absScore >= 65)
        return Math.round(15 * confMultiplier);
    return Math.round(10 * confMultiplier);
};
exports.getRecommendedLeverage = getRecommendedLeverage;
//# sourceMappingURL=indicator-weights.js.map