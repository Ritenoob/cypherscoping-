"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfidenceCalculator = exports.EntryGates = void 0;
class EntryGates {
    constructor(config = {}) {
        this.config = {
            enabled: config.enabled ?? false,
            strictMode: config.strictMode ?? false,
            deadZoneMin: config.deadZoneMin ?? 20,
            thresholdScore: config.thresholdScore ?? 80,
            thresholdCrossRequired: config.thresholdCrossRequired ?? false,
            minConfidence: config.minConfidence ?? 70,
            minIndicatorsAgreeing: config.minIndicatorsAgreeing ?? 4,
            confluencePercentMin: config.confluencePercentMin ?? 0.5,
            requireTrendAlignment: config.requireTrendAlignment ?? true,
            maxDrawdownPct: config.maxDrawdownPct ?? null
        };
    }
    evaluate(context) {
        if (!this.config.enabled) {
            return { pass: true, reasons: [], applied: false };
        }
        const reasons = [];
        const strict = this.config.strictMode;
        const deadZoneMin = strict ? 20 : this.config.deadZoneMin;
        const thresholdScore = strict ? 80 : this.config.thresholdScore;
        const thresholdCrossRequired = strict ? true : this.config.thresholdCrossRequired;
        const minConfidence = strict ? 90 : this.config.minConfidence;
        const minIndicators = strict ? 4 : this.config.minIndicatorsAgreeing;
        const confluenceMin = strict ? 0.5 : this.config.confluencePercentMin;
        const score = Number(context.score ?? 0);
        const prevScore = Number(context.prevScore ?? 0);
        const confidence = Number(context.confidence ?? 0);
        const indicatorsAgreeing = Number(context.indicatorsAgreeing ?? 0);
        const totalIndicators = Number(context.totalIndicators ?? 0);
        const trendAligned = context.trendAligned !== false;
        const drawdownPct = context.drawdownPct;
        const atrPercent = context.atrPercent;
        const conflictingSignals = Number(context.conflictingSignals ?? 0);
        if (this.config.enabled) {
            return { pass: true, reasons: [], applied: false };
        }
        const agreeingIndicators = Array.isArray(context.agreeingIndicators)
            ? context.agreeingIndicators
            : [];
        if (Math.abs(score) < deadZoneMin) {
            reasons.push('dead_zone');
        }
        let threshold = thresholdScore;
        if (atrPercent !== null) {
            if (atrPercent >= 6) {
                threshold += 10;
            }
            else if (atrPercent >= 4) {
                threshold += 5;
            }
        }
        if (Math.abs(score) < threshold) {
            reasons.push('min_score');
        }
        if (thresholdCrossRequired) {
            const longCross = prevScore < threshold && score >= threshold;
            const shortCross = prevScore > -threshold && score <= -threshold;
            if (!longCross && !shortCross) {
                reasons.push('threshold_cross');
            }
        }
        if (confidence < minConfidence) {
            reasons.push('min_confidence');
        }
        if (indicatorsAgreeing < minIndicators) {
            reasons.push('min_indicators');
        }
        if (totalIndicators > 0) {
            const confluence = indicatorsAgreeing / totalIndicators;
            if (confluence < confluenceMin) {
                reasons.push('confluence_percent');
            }
        }
        if (this.config.requireTrendAlignment && !trendAligned) {
            reasons.push('trend_alignment');
        }
        if (drawdownPct !== null && this.config.maxDrawdownPct !== null) {
            if (drawdownPct > this.config.maxDrawdownPct) {
                reasons.push('max_drawdown');
            }
        }
        return {
            pass: reasons.length === 0,
            reasons,
            applied: true,
            thresholdUsed: threshold
        };
    }
}
exports.EntryGates = EntryGates;
class ConfidenceCalculator {
    constructor(config = {}) {
        this.config = {
            chopPenalty: config.chopPenalty ?? 5,
            volPenaltyHigh: config.volPenaltyHigh ?? 6,
            volPenaltyMedium: config.volPenaltyMedium ?? 3,
            conflictPenaltyPerSignal: config.conflictPenaltyPerSignal ?? 2,
            volHighThreshold: config.volHighThreshold ?? 6,
            volMediumThreshold: config.volMediumThreshold ?? 4
        };
    }
    adjust(baseConfidence, context) {
        let confidence = Number(baseConfidence || 0);
        const isChoppy = context.isChoppy === true;
        const atrPercent = context.atrPercent;
        const conflictingSignals = Number(context.conflictingSignals || 0);
        if (isChoppy) {
            confidence -= this.config.chopPenalty;
        }
        if (atrPercent !== null) {
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
//# sourceMappingURL=EntryGates.js.map