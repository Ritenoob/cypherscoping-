/**
 * STRATEGY ROUTER
 * Routes signals to appropriate strategy profile
 */

const conservative = require('./signalProfiles/conservative');
const aggressive = require('./signalProfiles/aggressive');
const balanced = require('./signalProfiles/balanced');
const scalping = require('./signalProfiles/scalping');

class StrategyRouter {
  constructor() {
    this.profiles = {
      conservative,
      aggressive,
      balanced,
      scalping
    };
    
    this.activeProfile = 'balanced';
  }

  /**
   * Switch to a different strategy profile
   * @param {string} profileName - Name of profile to switch to
   * @returns {boolean} Success
   */
  switchProfile(profileName) {
    if (this.profiles[profileName]) {
      this.activeProfile = profileName;
      console.log(`[StrategyRouter] Switched to ${profileName} profile`);
      return true;
    }
    
    console.error(`[StrategyRouter] Profile ${profileName} not found`);
    return false;
  }

  /**
   * Get active profile
   * @returns {Object} Active profile configuration
   */
  getActiveProfile() {
    return this.profiles[this.activeProfile];
  }

  /**
   * Get profile by name
   * @param {string} name - Profile name
   * @returns {Object|null} Profile configuration
   */
  getProfile(name) {
    return this.profiles[name] || null;
  }

  /**
   * List available profiles
   * @returns {Array} Array of profile names
   */
  listProfiles() {
    return Object.keys(this.profiles);
  }

  /**
   * Apply profile to signal generator
   * @param {Object} signalGenerator - SignalGenerator instance
   */
  applyProfile(signalGenerator) {
    const profile = this.getActiveProfile();
    
    // Update weights in signal generator
    signalGenerator.weightsConfig.weights = profile.weights;
    signalGenerator.weightsConfig.thresholds = profile.thresholds;
    signalGenerator.activeWeights = profile.weights;
    
    return profile;
  }
}

module.exports = StrategyRouter;
