/**
 * LEVERAGE CALCULATOR
 * Calculates appropriate leverage based on volatility and account balance
 */

const DecimalMath = require('../src/lib/DecimalMath');

/**
 * Calculate optimal leverage based on ATR percentage
 * @param {number} atrPercent - ATR as percentage of price (e.g., 2.5 for 2.5%)
 * @param {Array} tiers - Leverage tiers from config
 * @returns {number} Recommended leverage
 */
function calculateAutoLeverage(atrPercent, tiers) {
  if (!tiers || !Array.isArray(tiers)) {
    throw new Error('Invalid leverage tiers configuration');
  }

  for (const tier of tiers) {
    if (atrPercent <= tier.maxVolatility) {
      return tier.leverage;
    }
  }

  // Return most conservative if no tier matches
  return tiers[tiers.length - 1].leverage;
}

/**
 * Calculate position size with leverage constraints
 * @param {number} accountBalance - Total account balance
 * @param {number} leverage - Leverage to use
 * @param {number} positionSizePercent - Percentage of balance to risk
 * @param {number} entryPrice - Entry price for position
 * @param {number} makerFee - Maker fee rate (e.g., 0.0002 for 0.02%)
 * @returns {Object} { notionalValue, quantity, marginUsed }
 */
function calculateLeveragePosition(accountBalance, leverage, positionSizePercent, entryPrice, makerFee = 0.0002) {
  // Calculate notional value we can control
  const riskAmount = DecimalMath.multiply(accountBalance, positionSizePercent);
  const notionalValue = DecimalMath.multiply(riskAmount, leverage);
  
  // Calculate quantity
  const quantity = DecimalMath.divide(notionalValue, entryPrice);
  
  // Calculate actual margin used (notional / leverage)
  const marginUsed = DecimalMath.divide(notionalValue, leverage);
  
  // Account for entry fee
  const entryFee = DecimalMath.multiply(notionalValue, makerFee);
  const totalMarginRequired = DecimalMath.add(marginUsed, entryFee);
  
  return {
    notionalValue,
    quantity,
    marginUsed,
    entryFee,
    totalMarginRequired,
    leverage
  };
}

/**
 * Calculate liquidation price with maintenance margin
 * @param {string} side - 'long' or 'short'
 * @param {number} entryPrice - Entry price
 * @param {number} leverage - Leverage used
 * @param {number} maintenanceMarginPercent - Maintenance margin rate
 * @returns {number} Liquidation price
 */
function calculateLiquidationPrice(side, entryPrice, leverage, maintenanceMarginPercent = 0.5) {
  return DecimalMath.calculateLiquidationPrice(
    side,
    entryPrice,
    leverage,
    maintenanceMarginPercent
  );
}

/**
 * Validate leverage is within acceptable range
 * @param {number} leverage - Proposed leverage
 * @param {number} minLeverage - Minimum allowed (default: 1)
 * @param {number} maxLeverage - Maximum allowed (default: 100)
 * @returns {boolean} True if valid
 */
function validateLeverage(leverage, minLeverage = 1, maxLeverage = 100) {
  return leverage >= minLeverage && leverage <= maxLeverage;
}

/**
 * Calculate risk-adjusted leverage
 * Reduces leverage based on current exposure and drawdown
 * @param {number} baseLeverage - Base leverage from volatility calc
 * @param {number} currentExposure - Current total exposure as % of balance
 * @param {number} accountDrawdown - Current drawdown %
 * @param {number} maxExposure - Maximum allowed exposure (default: 5.0 = 500%)
 * @param {number} maxDrawdown - Maximum acceptable drawdown (default: 20%)
 * @returns {number} Risk-adjusted leverage
 */
function calculateRiskAdjustedLeverage(
  baseLeverage, 
  currentExposure, 
  accountDrawdown,
  maxExposure = 5.0,
  maxDrawdown = 20
) {
  let adjustedLeverage = baseLeverage;
  
  // Reduce leverage if exposure is high
  if (currentExposure > maxExposure * 0.7) {
    const exposureReduction = 1 - ((currentExposure - maxExposure * 0.7) / (maxExposure * 0.3));
    adjustedLeverage = DecimalMath.multiply(adjustedLeverage, Math.max(0.5, exposureReduction));
  }
  
  // Reduce leverage if in drawdown
  if (accountDrawdown > maxDrawdown * 0.5) {
    const drawdownReduction = 1 - ((accountDrawdown - maxDrawdown * 0.5) / (maxDrawdown * 0.5));
    adjustedLeverage = DecimalMath.multiply(adjustedLeverage, Math.max(0.3, drawdownReduction));
  }
  
  return Math.max(1, Math.floor(adjustedLeverage));
}

module.exports = {
  calculateAutoLeverage,
  calculateLeveragePosition,
  calculateLiquidationPrice,
  validateLeverage,
  calculateRiskAdjustedLeverage
};
