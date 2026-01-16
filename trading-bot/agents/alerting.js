/**
 * Alerting System - Production Monitoring & Notifications
 *
 * Monitors system health and triggers alerts for:
 * - Consecutive losses
 * - Drawdown thresholds
 * - API failures
 * - Circuit breaker trips
 * - System errors
 */

const EventEmitter = require('events');

// Alert severity levels
const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
  EMERGENCY: 'emergency'
};

// Alert types
const ALERT_TYPE = {
  CONSECUTIVE_LOSSES: 'consecutive_losses',
  DRAWDOWN_WARNING: 'drawdown_warning',
  DRAWDOWN_CRITICAL: 'drawdown_critical',
  API_FAILURE: 'api_failure',
  CIRCUIT_TRIP: 'circuit_trip',
  CONNECTION_LOST: 'connection_lost',
  POSITION_STUCK: 'position_stuck',
  HIGH_SLIPPAGE: 'high_slippage',
  LOW_BALANCE: 'low_balance',
  SYSTEM_ERROR: 'system_error'
};

class AlertManager extends EventEmitter {
  constructor(config = {}) {
    super();

    // Thresholds
    this.consecutiveLossesWarning = config.consecutiveLossesWarning || 3;
    this.consecutiveLossesCritical = config.consecutiveLossesCritical || 5;
    this.drawdownWarningPct = config.drawdownWarningPct || 3;
    this.drawdownCriticalPct = config.drawdownCriticalPct || 5;
    this.drawdownEmergencyPct = config.drawdownEmergencyPct || 10;
    this.lowBalancePct = config.lowBalancePct || 20;

    // State
    this.alerts = [];
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.consecutiveLosses = 0;
    this.currentDrawdown = 0;
    this.peakBalance = config.initialBalance || 10000;
    this.currentBalance = config.initialBalance || 10000;

    // Cooldowns (prevent alert spam)
    this.cooldowns = new Map();
    this.defaultCooldown = config.defaultCooldown || 300000; // 5 minutes

    // Callbacks
    this.onAlert = config.onAlert || (() => {});
  }

  /**
   * Record a trade result
   */
  recordTrade(trade) {
    // Track consecutive losses
    if (trade.pnl < 0) {
      this.consecutiveLosses++;
      this._checkConsecutiveLosses();
    } else {
      this.consecutiveLosses = 0;
    }

    // Update balance and drawdown
    this.currentBalance += trade.pnl;
    if (this.currentBalance > this.peakBalance) {
      this.peakBalance = this.currentBalance;
    }

    this.currentDrawdown = ((this.peakBalance - this.currentBalance) / this.peakBalance) * 100;
    this._checkDrawdown();
    this._checkLowBalance();
  }

  /**
   * Check consecutive losses threshold
   */
  _checkConsecutiveLosses() {
    if (this.consecutiveLosses >= this.consecutiveLossesCritical) {
      this.trigger({
        type: ALERT_TYPE.CONSECUTIVE_LOSSES,
        severity: SEVERITY.CRITICAL,
        message: `${this.consecutiveLosses} consecutive losses`,
        data: { losses: this.consecutiveLosses }
      });
    } else if (this.consecutiveLosses >= this.consecutiveLossesWarning) {
      this.trigger({
        type: ALERT_TYPE.CONSECUTIVE_LOSSES,
        severity: SEVERITY.WARNING,
        message: `${this.consecutiveLosses} consecutive losses`,
        data: { losses: this.consecutiveLosses }
      });
    }
  }

  /**
   * Check drawdown threshold
   */
  _checkDrawdown() {
    if (this.currentDrawdown >= this.drawdownEmergencyPct) {
      this.trigger({
        type: ALERT_TYPE.DRAWDOWN_CRITICAL,
        severity: SEVERITY.EMERGENCY,
        message: `EMERGENCY: Drawdown at ${this.currentDrawdown.toFixed(2)}%`,
        data: { drawdown: this.currentDrawdown },
        action: 'STOP_TRADING'
      });
    } else if (this.currentDrawdown >= this.drawdownCriticalPct) {
      this.trigger({
        type: ALERT_TYPE.DRAWDOWN_CRITICAL,
        severity: SEVERITY.CRITICAL,
        message: `Critical drawdown: ${this.currentDrawdown.toFixed(2)}%`,
        data: { drawdown: this.currentDrawdown }
      });
    } else if (this.currentDrawdown >= this.drawdownWarningPct) {
      this.trigger({
        type: ALERT_TYPE.DRAWDOWN_WARNING,
        severity: SEVERITY.WARNING,
        message: `Drawdown warning: ${this.currentDrawdown.toFixed(2)}%`,
        data: { drawdown: this.currentDrawdown }
      });
    }
  }

  /**
   * Check low balance
   */
  _checkLowBalance() {
    const balancePct = (this.currentBalance / this.peakBalance) * 100;
    if (balancePct <= this.lowBalancePct) {
      this.trigger({
        type: ALERT_TYPE.LOW_BALANCE,
        severity: SEVERITY.CRITICAL,
        message: `Low balance: ${balancePct.toFixed(1)}% of peak`,
        data: { balance: this.currentBalance, peak: this.peakBalance }
      });
    }
  }

  /**
   * Report API failure
   */
  apiFailure(endpoint, error) {
    this.trigger({
      type: ALERT_TYPE.API_FAILURE,
      severity: SEVERITY.WARNING,
      message: `API failure: ${endpoint}`,
      data: { endpoint, error: error.message }
    });
  }

  /**
   * Report circuit breaker trip
   */
  circuitTrip(name, reason) {
    this.trigger({
      type: ALERT_TYPE.CIRCUIT_TRIP,
      severity: SEVERITY.CRITICAL,
      message: `Circuit breaker tripped: ${name}`,
      data: { name, reason }
    });
  }

  /**
   * Report connection lost
   */
  connectionLost(service) {
    this.trigger({
      type: ALERT_TYPE.CONNECTION_LOST,
      severity: SEVERITY.CRITICAL,
      message: `Connection lost: ${service}`,
      data: { service }
    });
  }

  /**
   * Report stuck position
   */
  positionStuck(symbol, duration) {
    this.trigger({
      type: ALERT_TYPE.POSITION_STUCK,
      severity: SEVERITY.WARNING,
      message: `Position stuck: ${symbol} for ${Math.floor(duration / 60000)}m`,
      data: { symbol, durationMs: duration }
    });
  }

  /**
   * Report high slippage
   */
  highSlippage(symbol, expectedPrice, actualPrice) {
    const slippage = Math.abs(actualPrice - expectedPrice) / expectedPrice * 100;
    this.trigger({
      type: ALERT_TYPE.HIGH_SLIPPAGE,
      severity: slippage > 0.5 ? SEVERITY.WARNING : SEVERITY.INFO,
      message: `High slippage on ${symbol}: ${slippage.toFixed(3)}%`,
      data: { symbol, expected: expectedPrice, actual: actualPrice, slippagePct: slippage }
    });
  }

  /**
   * Report system error
   */
  systemError(component, error) {
    this.trigger({
      type: ALERT_TYPE.SYSTEM_ERROR,
      severity: SEVERITY.CRITICAL,
      message: `System error in ${component}`,
      data: { component, error: error.message, stack: error.stack }
    });
  }

  /**
   * Trigger an alert
   */
  trigger(alert) {
    const key = `${alert.type}:${alert.severity}`;

    // Check cooldown
    const lastAlert = this.cooldowns.get(key);
    if (lastAlert && Date.now() - lastAlert < this.defaultCooldown) {
      return; // Still in cooldown
    }

    const fullAlert = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...alert,
      timestamp: Date.now()
    };

    // Store alert
    this.alerts.push(fullAlert);
    this.activeAlerts.set(fullAlert.id, fullAlert);
    this.alertHistory.push(fullAlert);

    // Maintain history size
    if (this.alertHistory.length > 1000) {
      this.alertHistory.shift();
    }
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    // Set cooldown
    this.cooldowns.set(key, Date.now());

    // Emit and callback
    this.emit('alert', fullAlert);
    this.onAlert(fullAlert);

    // Log based on severity
    const emoji = {
      [SEVERITY.INFO]: 'ℹ️',
      [SEVERITY.WARNING]: '⚠️',
      [SEVERITY.CRITICAL]: '🚨',
      [SEVERITY.EMERGENCY]: '🆘'
    };

    console.log(`${emoji[alert.severity]} [ALERT] ${alert.severity.toUpperCase()}: ${alert.message}`);

    return fullAlert;
  }

  /**
   * Acknowledge/dismiss an alert
   */
  acknowledge(alertId) {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = Date.now();
      this.activeAlerts.delete(alertId);
      return true;
    }
    return false;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 50) {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      activeAlerts: this.activeAlerts.size,
      consecutiveLosses: this.consecutiveLosses,
      currentDrawdown: Math.round(this.currentDrawdown * 100) / 100,
      currentBalance: this.currentBalance,
      peakBalance: this.peakBalance,
      alertsToday: this.alerts.filter(a =>
        a.timestamp > Date.now() - 24 * 60 * 60 * 1000
      ).length
    };
  }

  /**
   * Reset state (for new trading day)
   */
  reset() {
    this.consecutiveLosses = 0;
    this.alerts = [];
    this.activeAlerts.clear();
    this.cooldowns.clear();
    this.emit('reset');
  }
}

module.exports = AlertManager;
module.exports.SEVERITY = SEVERITY;
module.exports.ALERT_TYPE = ALERT_TYPE;
