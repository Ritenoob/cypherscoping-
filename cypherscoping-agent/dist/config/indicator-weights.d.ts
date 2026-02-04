export declare const V6_OPTIMIZED_WEIGHTS: {
    RSI: {
        weight: number;
        period: number;
        oversold: number;
        overbought: number;
        enabled: boolean;
    };
    Stochastic: {
        weight: number;
        kPeriod: number;
        dPeriod: number;
        smoothK: number;
        oversold: number;
        overbought: number;
        enabled: boolean;
    };
    KDJ: {
        weight: number;
        period: number;
        kSmooth: number;
        dSmooth: number;
        jOversold: number;
        jOverbought: number;
        enabled: boolean;
    };
    WilliamsR: {
        weight: number;
        period: number;
        oversold: number;
        overbought: number;
        enabled: boolean;
    };
    Bollinger: {
        weight: number;
        period: number;
        multiplier: number;
        enabled: boolean;
    };
    EMATrend: {
        weight: number;
        shortPeriod: number;
        mediumPeriod: number;
        longPeriod: number;
        enabled: boolean;
    };
    Klinger: {
        weight: number;
        fastPeriod: number;
        slowPeriod: number;
        signalPeriod: number;
        enabled: boolean;
    };
    AO: {
        weight: number;
        fastPeriod: number;
        slowPeriod: number;
        enabled: boolean;
    };
    ADX: {
        weight: number;
        period: number;
        trendThreshold: number;
        strongTrendThreshold: number;
        enabled: boolean;
    };
    MACD: {
        weight: number;
        fastPeriod: number;
        slowPeriod: number;
        signalPeriod: number;
        enabled: boolean;
    };
    OBV: {
        weight: number;
        smoothing: number;
        enabled: boolean;
    };
    StochRSI: {
        weight: number;
        rsiPeriod: number;
        stochPeriod: number;
        kPeriod: number;
        dPeriod: number;
        oversold: number;
        overbought: number;
        enabled: boolean;
    };
    CMF: {
        weight: number;
        period: number;
        enabled: boolean;
    };
};
export declare const SIGNAL_STRENGTH_MULTIPLIERS: {
    veryStrong: number;
    strong: number;
    moderate: number;
    weak: number;
    extreme: number;
};
export declare const SIGNAL_TYPE_MULTIPLIERS: {
    divergence: number;
    crossover: number;
    squeeze: number;
    goldenDeathCross: number;
    zone: number;
    momentum: number;
    oversold: number;
    overbought: number;
};
export declare const SCORE_CAPS: {
    indicatorScore: number;
    microstructureScore: number;
    totalScore: number;
};
export declare const SIGNAL_CLASSIFICATIONS: {
    EXTREME_BUY: {
        min: number;
        max: number;
        action: string;
    };
    STRONG_BUY: {
        min: number;
        max: number;
        action: string;
    };
    BUY: {
        min: number;
        max: number;
        action: string;
    };
    BUY_WEAK: {
        min: number;
        max: number;
        action: string;
    };
    NEUTRAL: {
        min: number;
        max: number;
        action: string;
    };
    SELL_WEAK: {
        min: number;
        max: number;
        action: string;
    };
    SELL: {
        min: number;
        max: number;
        action: string;
    };
    STRONG_SELL: {
        min: number;
        max: number;
        action: string;
    };
    EXTREME_SELL: {
        min: number;
        max: number;
        action: string;
    };
};
export declare const getSignalClassification: (score: number) => {
    min: number;
    max: number;
    action: string;
} | [string, {
    min: number;
    max: number;
    action: string;
} | {
    min: number;
    max: number;
    action: string;
} | {
    min: number;
    max: number;
    action: string;
} | {
    min: number;
    max: number;
    action: string;
} | {
    min: number;
    max: number;
    action: string;
} | {
    min: number;
    max: number;
    action: string;
} | {
    min: number;
    max: number;
    action: string;
} | {
    min: number;
    max: number;
    action: string;
} | {
    min: number;
    max: number;
    action: string;
}];
export declare const getRecommendedLeverage: (score: number, confidence: number) => number;
//# sourceMappingURL=indicator-weights.d.ts.map