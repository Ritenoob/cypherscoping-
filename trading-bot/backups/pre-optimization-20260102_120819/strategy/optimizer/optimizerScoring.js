/**
 * OPTIMIZER SCORING
 * Scoring logic for strategy evaluation
 */

class OptimizerScoring {
  /**
   * Calculate composite score for a strategy
   * @param {Object} metrics - Performance metrics
   * @param {Object} config - Optimizer configuration
   * @returns {number} Composite score (0-1)
   */
  static calculateScore(metrics, config) {
    let totalScore = 0;
    let totalWeight = 0;

    for (const [metricName, metricConfig] of Object.entries(config.metrics)) {
      const value = metrics[metricName];
      if (value === undefined) continue;

      const weight = metricConfig.weight;
      const target = metricConfig.target;
      const minimize = metricConfig.minimize || false;

      let score;
      if (minimize) {
        // Lower is better (e.g., drawdown)
        score = Math.max(0, 1 - (value / target));
      } else {
        // Higher is better
        score = Math.min(1, value / target);
      }

      totalScore += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Calculate confidence based on sample size
   * @param {number} trades - Number of trades
   * @param {number} minTrades - Minimum required trades
   * @returns {number} Confidence (0-1)
   */
  static calculateConfidence(trades, minTrades) {
    if (trades < minTrades) {
      return trades / minTrades;
    }
    
    // Logarithmic growth after minimum
    return Math.min(1, 0.7 + 0.3 * Math.log10(trades / minTrades + 1));
  }

  /**
   * Gate a decision based on confidence
   * @param {number} confidence - Confidence score
   * @param {number} threshold - Minimum confidence threshold
   * @returns {boolean} Should proceed
   */
  static gateDecision(confidence, threshold) {
    return confidence >= threshold;
  }
}

module.exports = OptimizerScoring;
