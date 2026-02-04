"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfidenceCalculator = void 0;
class ConfidenceCalculator {
    constructor(config = {}) {
        this.config = {
            enabled: config.enabled ?? false,
            chopPenalty: config.chopPenalty ?? 5,
            volPenaltyHigh: config.volPenaltyHigh ?? 6,
            volPenaltyMedium: config.volPenaltyMedium ?? 3,
            conflictPenaltyPerSignal: config.conflictPenaltyPerSignal ?? 2,
            volHighThreshold: config.volHighThreshold ?? 6,
            volMediumThreshold: config.volMediumThreshold ?? 4
        };
    }
    adjust(baseConfidence, context) {
        if (!this.config.enabled)
            return baseConfidence;
        let confidence = Number(baseConfidence || 0);
        const isChoppy = context.isChoppy === true;
        const atrPercent = context.atrPercent;
        const conflictingSignals = Number(context.conflictingSignals || 0);
        if (isChoppy) {
            confidence -= this.config.chopPenalty;
        }
        if (atrPercent !== undefined && atrPercent !== null) {
            if (atrPercent >= this.config.volHighThreshold) {
                confidence -= this.config.volPenaltyHigh;
            }
            else if (atrPercent >= this.config.volMediumThreshold) {
                confidence -= this.config.volPenaltyMedium;
            }
        }
        if (conflictingSignals > 0) {
            confidence -= conflictingSignals * this.config.conflictPenaltyPerSignal;
        }
        return Math.max(0, Math.min(100, confidence));
    }
    isMarketChoppy(atrPercent, volatility) {
        return atrPercent < 2 && volatility < 0.01;
    }
    getVolatilityRegime(atrPercent) {
        if (atrPercent < 2)
            return 'LOW';
        if (atrPercent < 4)
            return 'MEDIUM';
        return 'HIGH';
    }
}
exports.ConfidenceCalculator = ConfidenceCalculator;
//# sourceMappingURL=ConfidenceCalculator.js.map