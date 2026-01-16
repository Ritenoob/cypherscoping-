/**
 * Strategy Router
 * 
 * Routes signals to appropriate strategy handlers.
 * Supports multiple concurrent strategies with priority-based execution.
 */

const EventEmitter = require('events');

class StrategyRouter extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.strategies = new Map();
    this.activeStrategy = config.defaultStrategy || 'neutral';
    this.conflictResolution = config.conflictResolution || 'priority';
    
    this._loadDefaultStrategies();
  }

  _loadDefaultStrategies() {
    try {
      this.registerStrategy('conservative', require('./signalProfiles/conservative'));
      this.registerStrategy('aggressive', require('./signalProfiles/aggressive'));
      this.registerStrategy('neutral', require('./signalProfiles/neutral'));
    } catch (error) {
      console.warn('[StrategyRouter] Could not load default profiles:', error.message);
    }
  }

  registerStrategy(name, strategy) {
    this.strategies.set(name, {
      ...strategy,
      enabled: true,
      priority: strategy.priority || 1
    });
    console.log(`[StrategyRouter] Registered strategy: ${name}`);
  }

  setActiveStrategy(name) {
    if (!this.strategies.has(name)) {
      throw new Error(`Strategy '${name}' not found`);
    }
    this.activeStrategy = name;
    console.log(`[StrategyRouter] Active strategy set to: ${name}`);
    this.emit('strategyChanged', { strategy: name });
  }

  getActiveStrategy() {
    return this.strategies.get(this.activeStrategy);
  }

  getStrategyConfig(name = null) {
    const strategyName = name || this.activeStrategy;
    return this.strategies.get(strategyName);
  }

  routeSignal(signal, indicators) {
    const strategy = this.getActiveStrategy();
    if (!strategy) {
      console.warn('[StrategyRouter] No active strategy configured');
      return null;
    }

    const passesFilters = this._checkFilters(signal, indicators, strategy.filters);
    if (!passesFilters) {
      return null;
    }

    const meetsThresholds = this._checkThresholds(signal, strategy.thresholds);
    if (!meetsThresholds) {
      return null;
    }

    const routedSignal = {
      ...signal,
      strategy: strategy.name,
      riskManagement: strategy.riskManagement,
      leverage: this._calculateLeverage(signal, strategy.leverage),
      positionSize: this._calculatePositionSize(signal, strategy.riskManagement)
    };

    this.emit('signalRouted', routedSignal);
    return routedSignal;
  }

  _checkFilters(signal, indicators, filters) {
    if (!filters) return true;

    if (filters.requireTrendAlignment && indicators.emaTrend) {
      const trendSignals = indicators.emaTrend.signals || [];
      const hasTrendAlignment = trendSignals.some(s => 
        s.direction === (signal.direction === 'long' ? 'bullish' : 'bearish')
      );
      if (!hasTrendAlignment) return false;
    }

    if (filters.requireVolumeConfirmation && indicators.obv) {
      const obvSignals = indicators.obv.signals || [];
      const hasVolumeConfirmation = obvSignals.some(s => 
        s.direction === (signal.direction === 'long' ? 'bullish' : 'bearish')
      );
      if (!hasVolumeConfirmation) return false;
    }

    return true;
  }

  _checkThresholds(signal, thresholds) {
    if (!thresholds) return true;

    if (Math.abs(signal.score) < thresholds.minScoreForEntry) {
      return false;
    }

    if (signal.confidence < thresholds.minConfidence) {
      return false;
    }

    if (signal.indicatorsAgreeing < thresholds.minIndicatorsAgreeing) {
      return false;
    }

    return true;
  }

  _calculateLeverage(signal, leverageConfig) {
    if (!leverageConfig) return 50;

    let leverage = leverageConfig.defaultLeverage;

    if (signal.volatility && leverageConfig.volatilityReduction) {
      const reduction = signal.volatility * leverageConfig.volatilityReduction;
      leverage = Math.max(1, leverage - Math.round(reduction * leverage));
    }

    return Math.min(leverage, leverageConfig.maxLeverage);
  }

  _calculatePositionSize(signal, riskConfig) {
    if (!riskConfig) return 1.0;

    let sizePercent = riskConfig.maxPositionPercent || 2.0;

    if (signal.confidence < 50) {
      sizePercent *= 0.5;
    } else if (signal.confidence > 80) {
      sizePercent *= 1.2;
    }

    return Math.min(sizePercent, riskConfig.maxPositionPercent);
  }

  listStrategies() {
    return Array.from(this.strategies.entries()).map(([name, strategy]) => ({
      name,
      description: strategy.description,
      enabled: strategy.enabled,
      priority: strategy.priority
    }));
  }
}

module.exports = StrategyRouter;
