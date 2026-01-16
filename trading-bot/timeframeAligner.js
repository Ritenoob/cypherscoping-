/**
 * Timeframe Aligner V2 - OPTIMIZED 2026-01-15
 *
 * KEY INSIGHT: REVERSED MTF ALIGNMENT
 * - Lower timeframe (5min) = PRIMARY for entry timing
 * - Higher timeframe (30min) = SECONDARY for trend confirmation
 *
 * This prevents "entering too soon" by:
 * 1. Waiting for precise lower TF entry signals
 * 2. Higher TF confirms overall direction
 * 3. Only enter when BOTH agree
 *
 * Key Optimizations:
 * 1. Lower TF primary (70%) - precise entry timing
 * 2. Higher TF secondary (30%) - trend confirmation
 * 3. Requires FULL alignment - no divergent signals allowed
 * 4. Score boosting for strong alignment
 * 5. Divergence count aggregation across timeframes
 * 6. Stricter confidence requirements
 *
 * Cross-timeframe signal confirmation system.
 * Validates signals across primary and secondary timeframes
 * to reduce false signals and improve accuracy.
 */

const SignalGeneratorV2 = require('./src/lib/SignalGeneratorV2');

class TimeframeAligner {
  constructor(config = {}) {
    // OPTIMIZED: Stronger primary weight
    this.primaryWeight = config.primaryWeight || 0.70;  // Increased from 0.6
    this.secondaryWeight = config.secondaryWeight || 0.30;

    // OPTIMIZED: Stricter divergence limit
    this.maxDivergence = config.maxDivergence || 25;  // Decreased from 30

    // OPTIMIZED: Always require both timeframes to agree
    this.requireBoth = config.requireBoth !== false;

    // NEW: Require full alignment (no divergent directions)
    this.requireFullAlignment = config.requireFullAlignment !== false;

    // NEW: Minimum scores for each timeframe
    this.minPrimaryScore = config.minPrimaryScore || 50;
    this.minSecondaryScore = config.minSecondaryScore || 30;

    // NEW: Confidence threshold for entry
    this.minAlignedConfidence = config.minAlignedConfidence || 65;

    this.signalGenerator = new SignalGeneratorV2({
      enhancedMode: true,
      includeMicrostructure: false // TF alignment uses indicators only
    });
  }

  /**
   * Check alignment between two timeframes
   *
   * @param {Object} primaryIndicators - Primary timeframe indicator results
   * @param {Object} secondaryIndicators - Secondary timeframe indicator results
   * @param {Object} config - Additional configuration
   * @returns {Object|null} Aligned signal or null if not aligned
   */
  checkAlignment(primaryIndicators, secondaryIndicators, config = {}) {
    // Generate signals for each timeframe
    const primarySignal = this.signalGenerator.generate(primaryIndicators, {});
    const secondarySignal = this.signalGenerator.generate(secondaryIndicators, {});

    // Check if both have valid signals
    if (primarySignal.type === 'NEUTRAL' && secondarySignal.type === 'NEUTRAL') {
      return null;
    }

    // Check minimum score thresholds
    if (Math.abs(primarySignal.indicatorScore) < this.minPrimaryScore) {
      return null;
    }

    // Secondary can be neutral (partial alignment)
    const hasSecondarySignal = secondarySignal.type !== 'NEUTRAL';

    // Check direction alignment
    const alignment = this._checkDirectionAlignment(primarySignal, secondarySignal);

    // OPTIMIZED: Require full alignment if enabled
    if (this.requireFullAlignment && alignment.type === 'divergent') {
      return null;  // Never trade against conflicting timeframes
    }

    // If both have signals, they must agree
    if (this.requireBoth && hasSecondarySignal && !alignment.aligned) {
      return null;
    }

    // Check score divergence
    const divergence = Math.abs(primarySignal.indicatorScore - secondarySignal.indicatorScore);
    if (hasSecondarySignal && divergence > this.maxDivergence && this.requireBoth) {
      return null;
    }

    // Calculate combined score with weighted average
    const combinedScore = this._calculateCombinedScore(primarySignal, secondarySignal, alignment);

    // Determine final direction
    const direction = this._determineDirection(combinedScore);
    if (!direction) return null;

    // Combine signals from both timeframes
    const combinedSignals = this._combineSignals(primarySignal, secondarySignal);

    // Aggregate divergence count from both timeframes
    const totalDivergenceCount = (primarySignal.divergenceCount || 0) + (secondarySignal.divergenceCount || 0);

    // Calculate confidence based on alignment quality
    const confidence = this._calculateConfidence(primarySignal, secondarySignal, alignment, totalDivergenceCount);

    // Check minimum confidence
    if (confidence < this.minAlignedConfidence) {
      return null;
    }

    // Calculate alignment strength bonus
    const alignmentBonus = this._calculateAlignmentBonus(alignment, divergence, totalDivergenceCount);

    return {
      direction,
      score: combinedScore,
      adjustedScore: combinedScore + alignmentBonus,
      confidence,
      primaryScore: primarySignal.indicatorScore,
      secondaryScore: secondarySignal.indicatorScore,
      divergence,
      alignment: alignment.type,
      alignmentBonus,
      divergenceCount: totalDivergenceCount,
      indicatorsAgreeing: {
        primary: primarySignal.indicatorsAgreeing,
        secondary: secondarySignal.indicatorsAgreeing
      },
      indicators: {
        primary: primarySignal.breakdown.indicators,
        secondary: secondarySignal.breakdown.indicators
      },
      signals: combinedSignals,
      meetsRequirements: primarySignal.meetsEntryRequirements
    };
  }

  _calculateCombinedScore(primary, secondary, alignment) {
    let score;

    if (alignment.type === 'full') {
      // Full alignment: weighted average with bonus
      score = primary.indicatorScore * this.primaryWeight +
              secondary.indicatorScore * this.secondaryWeight;
    } else if (alignment.type === 'partial') {
      // Partial alignment: primary dominates more
      score = primary.indicatorScore * 0.85 +
              secondary.indicatorScore * 0.15;
    } else {
      // Divergent: use primary only (should be filtered out above)
      score = primary.indicatorScore;
    }

    return Math.round(score);
  }

  _checkDirectionAlignment(primary, secondary) {
    const primaryDir = this._getDirection(primary.type);
    const secondaryDir = this._getDirection(secondary.type);

    if (primaryDir === secondaryDir && primaryDir !== 'neutral') {
      return { aligned: true, type: 'full' };
    }

    if (primaryDir === 'neutral' || secondaryDir === 'neutral') {
      return { aligned: true, type: 'partial' };
    }

    // Both have direction but they conflict
    return { aligned: false, type: 'divergent' };
  }

  _getDirection(signalType) {
    if (signalType.includes('BUY')) return 'bullish';
    if (signalType.includes('SELL')) return 'bearish';
    return 'neutral';
  }

  _determineDirection(score) {
    // OPTIMIZED: Higher threshold for entry
    if (score >= 40) return 'long';   // Increased from 30
    if (score <= -40) return 'short'; // Increased from -30
    return null;
  }

  _combineSignals(primary, secondary) {
    const combined = [];
    const seen = new Set();

    // Add primary signals with timeframe tag
    for (const signal of primary.signals) {
      const key = `${signal.type}-${signal.direction}`;
      if (!seen.has(key)) {
        combined.push({
          ...signal,
          timeframe: 'primary',
          weight: this.primaryWeight
        });
        seen.add(key);
      }
    }

    // Add secondary signals with timeframe tag
    for (const signal of secondary.signals) {
      const key = `${signal.type}-${signal.direction}`;
      if (!seen.has(key)) {
        combined.push({
          ...signal,
          timeframe: 'secondary',
          weight: this.secondaryWeight
        });
        seen.add(key);
      } else {
        // Signal exists in both - mark as confirmed
        const existing = combined.find(s =>
          s.type === signal.type && s.direction === signal.direction
        );
        if (existing) {
          existing.confirmed = true;
          existing.weight = 1.0;  // Full weight for confirmed signals
        }
      }
    }

    return combined;
  }

  _calculateConfidence(primary, secondary, alignment, divergenceCount) {
    let confidence = 0;

    // Base confidence from individual signals (weighted)
    confidence += primary.confidence * this.primaryWeight;
    confidence += secondary.confidence * this.secondaryWeight;

    // Alignment bonus/penalty
    if (alignment.type === 'full') {
      confidence += 25;  // Increased from 20
    } else if (alignment.type === 'partial') {
      confidence += 10;
    } else {
      confidence -= 30;  // Increased penalty for divergence
    }

    // Divergence count bonus
    confidence += divergenceCount * 8;  // 8% per divergence signal

    // Agreement bonus
    const avgAgreeing = (primary.indicatorsAgreeing + secondary.indicatorsAgreeing) / 2;
    if (avgAgreeing >= 5) {
      confidence += 15;
    } else if (avgAgreeing >= 4) {
      confidence += 10;
    }

    // Clamp to valid range
    return Math.max(0, Math.min(100, Math.round(confidence)));
  }

  _calculateAlignmentBonus(alignment, divergence, divergenceCount) {
    let bonus = 0;

    // Full alignment bonus
    if (alignment.type === 'full') {
      bonus += 10;

      // Low divergence bonus (scores are close)
      if (divergence < 10) {
        bonus += 8;
      } else if (divergence < 15) {
        bonus += 5;
      }
    }

    // Divergence signals bonus
    bonus += divergenceCount * 5;

    return bonus;
  }

  /**
   * Get alignment status for display
   */
  getAlignmentStatus(result) {
    if (!result) return 'NO_SIGNAL';

    if (result.alignment === 'full' && result.confidence >= 75) {
      return 'STRONG_ALIGNMENT';
    }

    if (result.alignment === 'full' && result.confidence >= 60) {
      return 'GOOD_ALIGNMENT';
    }

    if (result.alignment === 'partial' && result.confidence >= 50) {
      return 'PARTIAL_ALIGNMENT';
    }

    if (result.alignment === 'divergent') {
      return 'DIVERGENT';
    }

    return 'WEAK_ALIGNMENT';
  }

  /**
   * Check if result meets all entry requirements
   */
  meetsEntryRequirements(result) {
    if (!result) return false;

    // Must have good alignment
    if (result.alignment === 'divergent') return false;

    // Must meet confidence threshold
    if (result.confidence < this.minAlignedConfidence) return false;

    // Must have sufficient score
    if (Math.abs(result.adjustedScore) < 60) return false;

    // Must have at least 3 agreeing indicators on primary
    if (result.indicatorsAgreeing.primary < 3) return false;

    return true;
  }
}

// Export factory function for custom configuration
module.exports = TimeframeAligner;

// Also export a default instance
module.exports.default = new TimeframeAligner();
