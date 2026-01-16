/**
 * TIMEFRAME ALIGNER
 * Aligns signals from multiple timeframes
 */

class TimeframeAligner {
  constructor() {
    this.primarySignals = new Map();
    this.secondarySignals = new Map();
  }

  /**
   * Add a signal from primary timeframe
   * @param {string} pair - Trading pair
   * @param {Object} signal - Signal data
   */
  addPrimarySignal(pair, signal) {
    this.primarySignals.set(pair, {
      ...signal,
      receivedAt: Date.now()
    });
  }

  /**
   * Add a signal from secondary timeframe
   * @param {string} pair - Trading pair
   * @param {Object} signal - Signal data
   */
  addSecondarySignal(pair, signal) {
    this.secondarySignals.set(pair, {
      ...signal,
      receivedAt: Date.now()
    });
  }

  /**
   * Check if timeframes are aligned for a pair
   * @param {string} pair - Trading pair
   * @param {number} maxAge - Maximum age of signals in ms
   * @returns {Object|null} Aligned signal or null
   */
  checkAlignment(pair, maxAge = 60000) {
    const primary = this.primarySignals.get(pair);
    const secondary = this.secondarySignals.get(pair);

    if (!primary || !secondary) {
      return null;
    }

    const now = Date.now();
    const primaryAge = now - primary.receivedAt;
    const secondaryAge = now - secondary.receivedAt;

    // Check if signals are recent
    if (primaryAge > maxAge || secondaryAge > maxAge) {
      return null;
    }

    // Check if signals are aligned
    const primaryDirection = this.getSignalDirection(primary.signal);
    const secondaryDirection = this.getSignalDirection(secondary.signal);

    if (primaryDirection === secondaryDirection && primaryDirection !== 'NEUTRAL') {
      // Signals are aligned
      return {
        pair,
        direction: primaryDirection,
        primary,
        secondary,
        confidence: this.calculateConfidence(primary, secondary),
        alignedAt: now
      };
    }

    return null;
  }

  /**
   * Get signal direction
   * @param {string} signal - Signal type
   * @returns {string} 'BUY', 'SELL', or 'NEUTRAL'
   */
  getSignalDirection(signal) {
    if (signal.includes('BUY')) return 'BUY';
    if (signal.includes('SELL')) return 'SELL';
    return 'NEUTRAL';
  }

  /**
   * Calculate confidence based on both timeframes
   * @param {Object} primary - Primary signal
   * @param {Object} secondary - Secondary signal
   * @returns {number} Confidence score (0-100)
   */
  calculateConfidence(primary, secondary) {
    // Weight primary timeframe more heavily
    const primaryWeight = 0.6;
    const secondaryWeight = 0.4;

    // Normalize scores to 0-100 range
    const primaryScore = Math.abs(primary.score);
    const secondaryScore = Math.abs(secondary.score);

    const confidence = 
      (primaryScore * primaryWeight) + 
      (secondaryScore * secondaryWeight);

    return Math.min(100, confidence);
  }

  /**
   * Get all aligned signals
   * @param {number} maxAge - Maximum age of signals in ms
   * @returns {Array} Array of aligned signals
   */
  getAllAligned(maxAge = 60000) {
    const aligned = [];

    for (const pair of this.primarySignals.keys()) {
      const alignedSignal = this.checkAlignment(pair, maxAge);
      if (alignedSignal) {
        aligned.push(alignedSignal);
      }
    }

    return aligned;
  }

  /**
   * Clean up old signals
   * @param {number} maxAge - Maximum age to keep in ms
   */
  cleanup(maxAge = 300000) {
    const now = Date.now();

    for (const [pair, signal] of this.primarySignals.entries()) {
      if (now - signal.receivedAt > maxAge) {
        this.primarySignals.delete(pair);
      }
    }

    for (const [pair, signal] of this.secondarySignals.entries()) {
      if (now - signal.receivedAt > maxAge) {
        this.secondarySignals.delete(pair);
      }
    }
  }
}

module.exports = TimeframeAligner;
