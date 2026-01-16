/**
 * Paper Trading Engine V2 - With Microstructure Integration
 * 
 * Extends PaperTradingEngine with:
 * - Microstructure signal integration
 * - Entry filtering based on spread/funding
 * - Position sizing based on market conditions
 */

const EventEmitter = require('events');
const Decimal = require('decimal.js');
const SignalGeneratorV2 = require('../lib/SignalGeneratorV2');

class PaperTradingEngineV2 extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.strategies = new Map();
    this.results = new Map();
    
    this.initialBalance = config.initialBalance || 10000;
    this.maxConcurrentStrategies = config.maxConcurrent || 10;
    this.evaluationPeriod = config.evaluationPeriod || 7 * 24 * 60 * 60 * 1000;
    
    this.microstructureFilters = {
      maxSpread: config.maxSpread || 0.03,
      maxFundingRate: config.maxFundingRate || 0.02,
      minBuySellRatio: config.minBuySellRatio || 0.35,
      maxBuySellRatio: config.maxBuySellRatio || 0.65
    };
    
    this.signalGenerator = new SignalGeneratorV2({
      enhancedMode: true,
      includeMicrostructure: true
    });
    
    this.isRunning = false;
  }

  addStrategy(id, strategy) {
    this.strategies.set(id, {
      strategy,
      state: {
        balance: new Decimal(this.initialBalance),
        equity: [],
        positions: [],
        trades: [],
        metrics: {},
        microstructureStats: {
          filteredEntries: 0,
          microstructureBoosts: 0,
          microstructureWarnings: 0
        }
      },
      startTime: Date.now()
    });
    
    console.log(`[PaperTradingV2] Added strategy: ${id}`);
  }

  async processMarketUpdate(symbol, candle, indicators, microstructure = {}) {
    if (!this.isRunning) return;
    
    const results = [];
    
    for (const [id, { strategy, state }] of this.strategies) {
      try {
        const signal = this.signalGenerator.generate(indicators, microstructure);
        
        for (const position of state.positions) {
          if (position.symbol === symbol) {
            const exitResult = await this._checkExit(strategy, position, candle, signal, microstructure);
            if (exitResult.shouldExit) {
              this._closePosition(id, position, candle.close, exitResult.reason);
            }
          }
        }
        
        const entryAllowed = this._checkMicrostructureFilters(microstructure, state);
        
        if (entryAllowed && !this._hasPosition(state, symbol)) {
          if (signal.type !== 'NEUTRAL' && !this.signalGenerator.hasEntryWarning(signal)) {
            const sizeMod = this._calculateSizeModifier(signal, microstructure);
            this._openPosition(id, symbol, candle.close, signal, sizeMod);
          }
        }
        
        const equity = this._calculateEquity(state, symbol, candle.close);
        state.equity.push({ ts: Date.now(), value: equity.toNumber() });
        
        if (state.equity.length > 10000) {
          state.equity = state.equity.slice(-5000);
        }
        
        results.push({
          id,
          signal: this.signalGenerator.getSummary(signal),
          equity: equity.toNumber(),
          entryAllowed
        });
      } catch (error) {
        console.error(`[PaperTradingV2] Strategy ${id} error:`, error.message);
      }
    }
    
    this._evaluateStrategies();
    
    return results;
  }

  _checkMicrostructureFilters(microstructure, state) {
    if (microstructure.priceRatio?.value?.spread > this.microstructureFilters.maxSpread) {
      state.microstructureStats.filteredEntries++;
      return false;
    }
    
    const fundingRate = microstructure.fundingRate?.value?.currentRate;
    if (fundingRate && Math.abs(fundingRate) > this.microstructureFilters.maxFundingRate * 100) {
      state.microstructureStats.filteredEntries++;
      return false;
    }
    
    const ratio = microstructure.buySellRatio?.value?.ratio;
    if (ratio !== null && ratio !== undefined) {
      if (ratio < 0.2 || ratio > 0.8) {
        state.microstructureStats.filteredEntries++;
        return false;
      }
    }
    
    return true;
  }

  _calculateSizeModifier(signal, microstructure) {
    let modifier = 1.0;
    
    if (signal.hasMicrostructure && signal.confidence > 70) {
      modifier *= 1.2;
    }
    
    const spread = microstructure.priceRatio?.value?.spread;
    if (spread && spread > 0.02) {
      modifier *= 0.8;
    }
    
    if (microstructure.fundingRate?.value?.isImminent) {
      modifier *= 0.7;
    }
    
    return Math.max(0.5, Math.min(1.5, modifier));
  }

  async _checkExit(strategy, position, candle, signal, microstructure) {
    if (strategy.checkExit) {
      const strategyExit = await strategy.checkExit(position, candle, signal);
      if (strategyExit) return { shouldExit: true, reason: strategyExit.reason };
    }
    
    const ratio = microstructure.buySellRatio?.value?.ratio;
    if (ratio !== null) {
      if (position.side === 'long' && ratio < 0.25) {
        return { shouldExit: true, reason: 'Extreme sell flow detected' };
      }
      if (position.side === 'short' && ratio > 0.75) {
        return { shouldExit: true, reason: 'Extreme buy flow detected' };
      }
    }
    
    const spread = microstructure.priceRatio?.value?.spread;
    if (spread && spread > 0.05) {
      return { shouldExit: true, reason: 'Critical spread - reducing exposure' };
    }
    
    return { shouldExit: false };
  }

  _openPosition(strategyId, symbol, price, signal, sizeModifier = 1.0) {
    const { state } = this.strategies.get(strategyId);
    
    const riskPercent = 2 * sizeModifier;
    const positionSize = state.balance.mul(riskPercent / 100).div(price);
    
    const position = {
      id: `${strategyId}-${Date.now()}`,
      symbol,
      side: signal.type.includes('BUY') ? 'long' : 'short',
      entryPrice: price,
      size: positionSize.toNumber(),
      entryTime: Date.now(),
      signal: this.signalGenerator.getSummary(signal),
      sizeModifier,
      hasMicrostructure: signal.hasMicrostructure
    };
    
    state.positions.push(position);
    
    if (signal.hasMicrostructure) {
      state.microstructureStats.microstructureBoosts++;
    }
    
    this.emit('positionOpened', { strategyId, position });
  }

  _closePosition(strategyId, position, exitPrice, reason) {
    const { state } = this.strategies.get(strategyId);
    
    const pnlPercent = position.side === 'long'
      ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
    
    const pnlValue = new Decimal(position.size).mul(position.entryPrice).mul(pnlPercent / 100);
    
    state.balance = state.balance.plus(pnlValue);
    
    const trade = {
      ...position,
      exitPrice,
      exitTime: Date.now(),
      pnlPercent,
      pnlValue: pnlValue.toNumber(),
      reason
    };
    
    state.trades.push(trade);
    state.positions = state.positions.filter(p => p.id !== position.id);
    
    this.emit('positionClosed', { strategyId, trade });
  }

  _hasPosition(state, symbol) {
    return state.positions.some(p => p.symbol === symbol);
  }

  _calculateEquity(state, symbol, currentPrice) {
    let equity = state.balance;
    
    for (const position of state.positions) {
      const price = position.symbol === symbol ? currentPrice : position.entryPrice;
      const unrealized = position.side === 'long'
        ? new Decimal(price).minus(position.entryPrice).mul(position.size)
        : new Decimal(position.entryPrice).minus(price).mul(position.size);
      
      equity = equity.plus(unrealized);
    }
    
    return equity;
  }

  _evaluateStrategies() {
    const now = Date.now();
    
    for (const [id, { state, startTime }] of this.strategies) {
      if (now - startTime < this.evaluationPeriod) continue;
      
      const metrics = this._calculateMetrics(state);
      state.metrics = metrics;
      
      this.results.set(id, {
        id,
        metrics,
        trades: state.trades.length,
        finalBalance: state.balance.toNumber(),
        microstructureStats: state.microstructureStats
      });
    }
  }

  _calculateMetrics(state) {
    const trades = state.trades;
    
    if (trades.length === 0) {
      return {
        winRate: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        totalReturn: 0,
        microstructureWinRate: 0
      };
    }
    
    const winners = trades.filter(t => t.pnlValue > 0);
    const losers = trades.filter(t => t.pnlValue < 0);
    
    const winRate = (winners.length / trades.length) * 100;
    
    const totalWins = winners.reduce((s, t) => s + t.pnlValue, 0);
    const totalLosses = Math.abs(losers.reduce((s, t) => s + t.pnlValue, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins;
    
    const microTrades = trades.filter(t => t.hasMicrostructure);
    const microWinners = microTrades.filter(t => t.pnlValue > 0);
    const microstructureWinRate = microTrades.length > 0
      ? (microWinners.length / microTrades.length) * 100
      : 0;
    
    const equity = state.equity;
    const returns = [];
    for (let i = 1; i < equity.length; i++) {
      returns.push((equity[i].value - equity[i-1].value) / equity[i-1].value);
    }
    
    const avgReturn = returns.length > 0 
      ? returns.reduce((a, b) => a + b, 0) / returns.length 
      : 0;
    const stdReturn = returns.length > 0
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
      : 1;
    
    const sharpeRatio = stdReturn > 0 ? (avgReturn * Math.sqrt(252)) / (stdReturn * Math.sqrt(252)) : 0;
    
    let maxDrawdown = 0;
    let peak = equity[0]?.value || this.initialBalance;
    for (const { value } of equity) {
      if (value > peak) peak = value;
      const dd = (peak - value) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    
    const totalReturn = ((state.balance.toNumber() - this.initialBalance) / this.initialBalance) * 100;
    
    return {
      winRate: winRate.toFixed(2),
      profitFactor: profitFactor.toFixed(2),
      sharpeRatio: sharpeRatio.toFixed(2),
      maxDrawdown: (maxDrawdown * 100).toFixed(2),
      totalReturn: totalReturn.toFixed(2),
      microstructureWinRate: microstructureWinRate.toFixed(2)
    };
  }

  getBestStrategy() {
    let best = null;
    let bestScore = -Infinity;
    
    for (const [id, result] of this.results) {
      const score = parseFloat(result.metrics.sharpeRatio) * 
                   (1 - parseFloat(result.metrics.maxDrawdown) / 100) *
                   parseFloat(result.metrics.profitFactor);
      
      if (score > bestScore) {
        bestScore = score;
        best = { id, ...result, score };
      }
    }
    
    return best;
  }

  getAllResults() {
    return Array.from(this.results.values())
      .map(r => ({
        ...r,
        score: parseFloat(r.metrics.sharpeRatio) * 
               (1 - parseFloat(r.metrics.maxDrawdown) / 100) *
               parseFloat(r.metrics.profitFactor)
      }))
      .sort((a, b) => b.score - a.score);
  }

  start() {
    this.isRunning = true;
    console.log(`[PaperTradingV2] Started with ${this.strategies.size} strategies`);
  }

  stop() {
    this.isRunning = false;
    console.log('[PaperTradingV2] Stopped');
  }
}

module.exports = PaperTradingEngineV2;
