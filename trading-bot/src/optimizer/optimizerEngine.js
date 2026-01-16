/**
 * OPTIMIZER ENGINE
 * Live strategy optimizer (placeholder implementation)
 */

const config = require('./optimizerConfig');
const OptimizerScoring = require('./optimizerScoring');
const StrategyRouter = require('../strategyRouter');

class OptimizerEngine {
  constructor(customConfig = {}) {
    this.config = { ...config, ...customConfig };
    this.router = new StrategyRouter();
    this.metrics = new Map();
    this.lastSwitch = null;
  }

  /**
   * Start optimizer
   */
  start() {
    if (!this.config.enabled) {
      console.log('[Optimizer] Optimizer is disabled');
      return;
    }

    console.log('[Optimizer] Starting live optimizer...');
    
    // Set up periodic evaluation
    this.evaluationInterval = setInterval(() => {
      this.evaluateProfiles();
    }, this.config.logInterval);
  }

  /**
   * Stop optimizer
   */
  stop() {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
    }
    console.log('[Optimizer] Stopped');
  }

  /**
   * Record trade result
   * @param {string} profile - Profile name
   * @param {Object} trade - Trade result
   */
  recordTrade(profile, trade) {
    if (!this.metrics.has(profile)) {
      this.metrics.set(profile, {
        trades: [],
        wins: 0,
        losses: 0,
        totalProfit: 0,
        totalLoss: 0
      });
    }

    const profileMetrics = this.metrics.get(profile);
    profileMetrics.trades.push(trade);

    if (trade.profit > 0) {
      profileMetrics.wins++;
      profileMetrics.totalProfit += trade.profit;
    } else {
      profileMetrics.losses++;
      profileMetrics.totalLoss += Math.abs(trade.profit);
    }
  }

  /**
   * Evaluate all profiles
   */
  evaluateProfiles() {
    console.log('[Optimizer] Evaluating profiles...');
    
    const scores = [];
    for (const profileName of this.router.listProfiles()) {
      const score = this.evaluateProfile(profileName);
      if (score !== null) {
        scores.push({ profile: profileName, score });
      }
    }

    if (scores.length > 0) {
      scores.sort((a, b) => b.score - a.score);
      
      console.log('[Optimizer] Profile scores:');
      for (const { profile, score } of scores) {
        console.log(`  ${profile}: ${(score * 100).toFixed(2)}%`);
      }

      // Auto-switch if enabled
      if (this.config.autoSwitch && this.canSwitch()) {
        const best = scores[0];
        if (best.profile !== this.router.activeProfile) {
          this.router.switchProfile(best.profile);
          this.lastSwitch = Date.now();
        }
      }
    }
  }

  /**
   * Evaluate a single profile
   * @param {string} profileName - Profile name
   * @returns {number|null} Score or null
   */
  evaluateProfile(profileName) {
    const profileMetrics = this.metrics.get(profileName);
    if (!profileMetrics || profileMetrics.trades.length < this.config.minTradesForEvaluation) {
      return null;
    }

    // Calculate metrics
    const winRate = profileMetrics.wins / profileMetrics.trades.length;
    const profitFactor = profileMetrics.totalLoss > 0 
      ? profileMetrics.totalProfit / profileMetrics.totalLoss 
      : 0;

    const metrics = {
      winRate,
      profitFactor,
      sharpeRatio: 0,  // Placeholder
      maxDrawdown: 0   // Placeholder
    };

    const score = OptimizerScoring.calculateScore(metrics, this.config);
    const confidence = OptimizerScoring.calculateConfidence(
      profileMetrics.trades.length,
      this.config.minTradesForEvaluation
    );

    return OptimizerScoring.gateDecision(confidence, this.config.minConfidenceScore) 
      ? score 
      : null;
  }

  /**
   * Check if profile switch is allowed
   * @returns {boolean}
   */
  canSwitch() {
    if (!this.lastSwitch) return true;
    return Date.now() - this.lastSwitch >= this.config.switchCooldown;
  }
}

module.exports = OptimizerEngine;
