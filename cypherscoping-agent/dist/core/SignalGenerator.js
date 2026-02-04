"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalGenerator = void 0;
const indicator_weights_1 = require("../config/indicator-weights");
const WilliamsRIndicator_1 = require("../indicators/WilliamsRIndicator");
const EntryGates_1 = require("./EntryGates");
const ConfidenceCalculator_1 = require("./ConfidenceCalculator");
class SignalGenerator {
    constructor(config = {}) {
        this.config = {
            entryGates: {
                enabled: true,
                strictMode: false,
                deadZoneMin: 20,
                thresholdScore: 80,
                thresholdCrossRequired: false,
                minConfidence: 70,
                minIndicatorsAgreeing: 4,
                confluencePercentMin: 0.5,
                requireTrendAlignment: true
            },
            confidenceCalculator: {
                enabled: true,
                chopPenalty: 5,
                volPenaltyHigh: 6,
                volPenaltyMedium: 3,
                conflictPenaltyPerSignal: 2,
                volHighThreshold: 6,
                volMediumThreshold: 4
            },
            williamsR: {
                period: 10,
                fastPeriod: 7,
                oversold: -80,
                overbought: -20,
                historyLength: 100
            }
        };
        this.williamsR = new WilliamsRIndicator_1.WilliamsRIndicator(this.config.williamsR);
        this.entryGates = new EntryGates_1.EntryGates(this.config.entryGates);
        this.confidenceCalculator = new ConfidenceCalculator_1.ConfidenceCalculator(this.config.confidenceCalculator);
    }
    generate(indicatorResults, microstructure = {}, context = {}) {
        const results = indicatorResults;
        let indicatorScore = 0;
        let microstructureScore = 0;
        let allSignals = [];
        let divergenceCount = 0;
        let indicatorsAgreeing = {
            bullish: 0,
            bearish: 0,
            neutral: 0
        };
        let activeIndicators = 0;
        const williamsR = results.williamsR;
        if (williamsR) {
            const wrSignals = williamsR.signals || [];
            allSignals.push(...wrSignals);
            for (const signal of wrSignals) {
                const weight = indicator_weights_1.V6_OPTIMIZED_WEIGHTS.WilliamsR?.weight || 28;
                const strengthMultiplier = this.getStrengthMultiplier(signal.strength);
                if (signal.type.includes('divergence')) {
                    divergenceCount++;
                    indicatorScore += weight * 1.5 * strengthMultiplier;
                    allSignals.push({ ...signal, source: 'WilliamsR_Divergence' });
                }
                else if (signal.type.includes('crossover')) {
                    indicatorScore += weight * 1.3 * strengthMultiplier;
                    allSignals.push({ ...signal, source: 'WilliamsR_Crossover' });
                }
                else if (signal.type.includes('oversold')) {
                    indicatorScore += weight * 1.2 * strengthMultiplier;
                    allSignals.push({ ...signal, source: 'WilliamsR_Oversold' });
                }
                else if (signal.type.includes('overbought')) {
                    indicatorScore += weight * 1.2 * strengthMultiplier;
                    allSignals.push({ ...signal, source: 'WilliamsR_Overbought' });
                }
                else if (signal.type.includes('thrust')) {
                    indicatorScore += weight * 1.0 * strengthMultiplier;
                    allSignals.push({ ...signal, source: 'WilliamsR_Momentum' });
                }
                else if (signal.type.includes('zone') || signal.type.includes('hook')) {
                    indicatorScore += weight * 0.85 * strengthMultiplier;
                    allSignals.push({ ...signal, source: 'WilliamsR_Zone' });
                }
                if (signal.direction === 'bullish')
                    indicatorsAgreeing.bullish++;
                else if (signal.direction === 'bearish')
                    indicatorsAgreeing.bearish++;
            }
        }
        for (const [name, data] of Object.entries(results)) {
            if (name === 'williamsR' || !data)
                continue;
            if (!data.enabled)
                continue;
            const weight = indicator_weights_1.V6_OPTIMIZED_WEIGHTS[name.toUpperCase()]?.weight || 20;
            const contribution = (data.score || 0);
            const contributionValue = Math.sign(contribution) * weight;
            if (data.value !== null && data.value !== 0) {
                activeIndicators++;
                indicatorScore += contributionValue;
            }
            if (contributionValue > 0)
                indicatorsAgreeing.bullish++;
            else if (contributionValue < 0)
                indicatorsAgreeing.bearish++;
            allSignals.push({
                type: data.signal || 'generic',
                direction: contributionValue > 0 ? 'bullish' : contributionValue < 0 ? 'bearish' : 'neutral',
                strength: 'moderate',
                message: `${name}: ${data.signal || 'value=' + data.value}`,
                metadata: { name, value: data.value },
                source: name
            });
        }
        if (microstructure.buySellRatio) {
            const buySellWeight = indicator_weights_1.V6_OPTIMIZED_WEIGHTS.BuySellRatio?.weight || 18;
            const ratio = microstructure.buySellRatio.ratio || 0.5;
            if (ratio > 0.7) {
                microstructureScore += buySellWeight * (ratio - 0.5) * 2;
            }
            else if (ratio < 0.3) {
                microstructureScore += buySellWeight * (0.5 - ratio) * 2;
            }
        }
        if (microstructure.domImbalance) {
            const domWeight = indicator_weights_1.V6_OPTIMIZED_WEIGHTS.DOM?.weight || 18;
            const imbalance = microstructure.domImbalance.value || 0;
            microstructureScore += imbalance * domWeight;
        }
        indicatorScore = Math.max(-indicator_weights_1.SCORE_CAPS.indicatorScore, Math.min(indicator_weights_1.SCORE_CAPS.indicatorScore, indicatorScore));
        microstructureScore = Math.max(-indicator_weights_1.SCORE_CAPS.microstructureScore, Math.min(indicator_weights_1.SCORE_CAPS.microstructureScore, microstructureScore));
        const baseTotal = indicatorScore + microstructureScore;
        const totalScore = Math.max(-indicator_weights_1.SCORE_CAPS.totalScore, Math.min(indicator_weights_1.SCORE_CAPS.totalScore, baseTotal));
        const baseConfidence = this.calculateBaseConfidence(indicatorScore, microstructureScore, allSignals.length, indicatorsAgreeing);
        const confidence = this.confidenceCalculator.adjust(baseConfidence, {
            isChoppy: context.isChoppy || false,
            atrPercent: context.atrPercent || null,
            conflictingSignals: this.countConflictingSignals(allSignals)
        });
        const classification = (0, indicator_weights_1.getSignalClassification)(totalScore);
        const recommendedLeverage = (0, indicator_weights_1.getRecommendedLeverage)(totalScore, confidence);
        const gateContext = {
            score: totalScore,
            prevScore: context.prevScore || 0,
            confidence,
            indicatorsAgreeing: indicatorsAgreeing.bullish + indicatorsAgreeing.bearish,
            totalIndicators: activeIndicators,
            agreeingIndicators: allSignals.filter(s => s.direction !== 'neutral').map(s => s.source),
            trendAligned: this.checkTrendAlignment(results, totalScore),
            drawdownPct: context.drawdownPct || 0,
            atrPercent: context.atrPercent || null,
            conflictingSignals: this.countConflictingSignals(allSignals)
        };
        const gateResult = this.entryGates.evaluate(gateContext);
        let triggerCandle = null;
        let windowExpires;
        let side = null;
        if (williamsR) {
            for (const signal of williamsR.signals || []) {
                if (signal.type === 'bullish_crossover') {
                    side = 'long';
                    triggerCandle = results.williamsR?.value ? context.candleIndex || 0 : null;
                    windowExpires = Date.now() + 3600000;
                    break;
                }
                else if (signal.type === 'bearish_crossover') {
                    side = 'short';
                    triggerCandle = results.williamsR?.value ? context.candleIndex || 0 : null;
                    windowExpires = Date.now() + 3600000;
                    break;
                }
            }
        }
        const signalStrength = this.getSignalStrength(classification, allSignals, divergenceCount);
        return {
            compositeScore: totalScore,
            authorized: gateResult.pass && totalScore >= 75,
            side,
            confidence,
            triggerCandle,
            windowExpires,
            indicatorScores: new Map(Object.entries(results).map(([name, data]) => [name, data.score || 0])),
            microstructureScore,
            blockReasons: gateResult.reasons,
            confirmations: allSignals.length,
            timestamp: Date.now(),
            signalStrength,
            signalType: this.getSignalType(allSignals),
            signalSource: allSignals[0]?.source || 'SignalGenerator'
        };
    }
    calculateBaseConfidence(indicatorScore, microstructureScore, signalCount, indicatorsAgreeing) {
        let confidence = 50;
        const totalAgreement = Math.max(indicatorsAgreeing.bullish, indicatorsAgreeing.bearish);
        const agreementRatio = totalAgreement / (indicatorsAgreeing.bullish + indicatorsAgreeing.bearish + indicatorsAgreeing.neutral + 1);
        confidence += agreementRatio * 30;
        const absScore = Math.abs(indicatorScore);
        if (absScore >= 120)
            confidence += 20;
        else if (absScore >= 95)
            confidence += 15;
        else if (absScore >= 80)
            confidence += 10;
        else if (absScore >= 65)
            confidence += 5;
        const signalDensity = Math.min(1, signalCount / 10);
        confidence += signalDensity * 20;
        return confidence;
    }
    getStrengthMultiplier(strength) {
        switch (strength) {
            case 'very_strong': return 1.5;
            case 'strong': return 1.0;
            case 'moderate': return 0.6;
            case 'weak': return 0.3;
            case 'extreme': return 1.3;
            default: return 1.0;
        }
    }
    getSignalStrength(classification, signals, divergenceCount) {
        if (divergenceCount > 0)
            return 'extreme';
        if (classification.max >= 130)
            return 'extreme';
        if (classification.max >= 95)
            return 'strong';
        if (classification.max >= 65)
            return 'moderate';
        if (classification.max >= 40)
            return 'weak';
        return null;
    }
    getSignalType(signals) {
        for (const signal of signals) {
            if (signal.type.includes('divergence'))
                return 'divergence';
            if (signal.type.includes('crossover'))
                return 'crossover';
            if (signal.type.includes('squeeze'))
                return 'squeeze';
            if (signal.type.includes('golden_death') || signal.type.includes('death_cross'))
                return 'golden_death_cross';
        }
        return 'trend';
    }
    checkTrendAlignment(results, score) {
        if (results.emaTrend && results.emaTrend.trend) {
            return (score > 0 && results.emaTrend.trend === 'bullish') ||
                (score < 0 && results.emaTrend.trend === 'bearish');
        }
        return false;
    }
    countConflictingSignals(signals) {
        const bullish = signals.filter(s => s.direction === 'bullish').length;
        const bearish = signals.filter(s => s.direction === 'bearish').length;
        return Math.min(bullish, bearish);
    }
    reset() {
        this.williamsR.reset();
    }
    getWilliamsR() {
        return this.williamsR;
    }
}
exports.SignalGenerator = SignalGenerator;
//# sourceMappingURL=SignalGenerator.js.map