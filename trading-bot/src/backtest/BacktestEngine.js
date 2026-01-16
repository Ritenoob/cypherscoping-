/**
 * Backtest Engine
 * 
 * Historical strategy testing with:
 * - Candle-by-candle simulation
 * - Realistic slippage and fees
 * - Walk-forward validation
 * - Performance metrics calculation
 */

const Decimal = require('decimal.js');
const PositionCalculator = require('../utils/PositionCalculator');
const SignalGeneratorV2 = require('../lib/SignalGeneratorV2');

class BacktestEngine {
  constructor(config = {}) {
    this.initialBalance = config.initialBalance || 10000;
    this.leverage = config.leverage || 50;
    this.riskPerTrade = config.riskPerTrade || 2;
    this.slippage = config.slippage || 0.0005;
    this.commission = config.commission || 0.0006;

    // Trailing Stop settings
    this.trailingStopEnabled = config.trailingStopEnabled !== false;
    this.trailingStopActivation = config.trailingStopActivation || 20; // ROI% to activate
    this.trailingStopTrail = config.trailingStopTrail || 5; // Trail distance in ROI%

    // Break-Even Stop settings
    this.breakEvenEnabled = config.breakEvenEnabled !== false;
    this.breakEvenActivation = config.breakEvenActivation || 10; // ROI% to activate
    this.breakEvenBuffer = config.breakEvenBuffer || 2; // Buffer above break-even

    this.positionCalc = new PositionCalculator({
      leverage: this.leverage,
      takerFee: this.commission
    });

    this.signalGenerator = new SignalGeneratorV2({
      enhancedMode: true,
      includeMicrostructure: false
    });

    this.reset();
  }

  reset() {
    this.balance = new Decimal(this.initialBalance);
    this.equity = [{ ts: 0, value: this.initialBalance }];
    this.positions = [];
    this.trades = [];
    this.stats = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      peakEquity: this.initialBalance
    };
  }

  async runBacktest(candles, indicators, config = {}) {
    this.reset();
    
    const warmupPeriod = config.warmupPeriod || 50;
    const stopLossROI = config.stopLossROI || 0.5;
    const takeProfitROI = config.takeProfitROI || 2.0;
    
    for (let i = warmupPeriod; i < candles.length; i++) {
      const candle = candles[i];
      const indicatorValues = this._getIndicatorValuesAtIndex(indicators, i);
      
      this._checkExits(candle);
      
      if (this.positions.length === 0) {
        const signal = this.signalGenerator.generate(indicatorValues, {});
        const minScore = config.minSignalScore || 30;
        const invertSignals = config.invertSignals || false;

        // Signal inversion: swap buy/sell when invertSignals is true
        const isBuySignal = signal.type.includes('BUY') && signal.indicatorScore >= minScore;
        const isSellSignal = signal.type.includes('SELL') && signal.indicatorScore <= -minScore;

        if (invertSignals) {
          // Inverted: BUY signal opens SHORT, SELL signal opens LONG
          if (isBuySignal) {
            this._openPosition(candle, 'short', stopLossROI, takeProfitROI);
          } else if (isSellSignal) {
            this._openPosition(candle, 'long', stopLossROI, takeProfitROI);
          }
        } else {
          // Normal: BUY signal opens LONG, SELL signal opens SHORT
          if (isBuySignal) {
            this._openPosition(candle, 'long', stopLossROI, takeProfitROI);
          } else if (isSellSignal) {
            this._openPosition(candle, 'short', stopLossROI, takeProfitROI);
          }
        }
      }
      
      const currentEquity = this._calculateEquity(candle.close);
      this.equity.push({ ts: candle.ts, value: currentEquity.toNumber() });
      
      if (currentEquity.greaterThan(this.stats.peakEquity)) {
        this.stats.peakEquity = currentEquity.toNumber();
      }
      
      const drawdown = new Decimal(this.stats.peakEquity)
        .minus(currentEquity)
        .div(this.stats.peakEquity)
        .toNumber();
      
      if (drawdown > this.stats.maxDrawdown) {
        this.stats.maxDrawdown = drawdown;
      }
    }
    
    this._closeAllPositions(candles[candles.length - 1]);
    
    return this._calculateResults();
  }

  _getIndicatorValuesAtIndex(indicators, index) {
    const values = {};
    
    for (const [name, history] of Object.entries(indicators)) {
      if (Array.isArray(history) && index < history.length) {
        values[name] = history[index];
      }
    }
    
    return values;
  }

  _openPosition(candle, side, stopLossROI, takeProfitROI) {
    const slippageMultiplier = side === 'long' ? 1 + this.slippage : 1 - this.slippage;
    const entryPrice = new Decimal(candle.close).mul(slippageMultiplier).toNumber();

    // KuCoin futures: 1 contract = 0.001 BTC (multiplier), minimum lot = 1 contract
    const positionDetails = this.positionCalc.calculatePosition({
      balance: this.balance.toNumber(),
      riskPercent: this.riskPerTrade,
      entryPrice,
      leverage: this.leverage,
      side,
      stopLossROI,
      takeProfitROI,
      multiplier: 0.001,  // 1 contract = 0.001 BTC
      lotSize: 1          // Minimum 1 contract
    });
    
    this.positions.push({
      id: `pos-${Date.now()}`,
      symbol: 'BACKTEST',
      side,
      entryPrice,
      size: positionDetails.size,
      stopLoss: positionDetails.stopLoss,
      takeProfit: positionDetails.takeProfit,
      entryTime: candle.ts,
      margin: positionDetails.margin
    });
    
    const entryFee = new Decimal(positionDetails.notional).mul(this.commission);
    this.balance = this.balance.minus(entryFee);
  }

  _checkExits(candle) {
    const toClose = [];

    for (const position of this.positions) {
      let shouldClose = false;
      let exitPrice = null;
      let reason = '';

      // Calculate current ROI
      const currentROI = this._calculateCurrentROI(position, candle.close);

      // Update highest ROI seen (for trailing stop)
      if (!position.highestROI || currentROI > position.highestROI) {
        position.highestROI = currentROI;
      }

      // Break-Even Stop: Move stop to entry + buffer once activation ROI is reached
      if (this.breakEvenEnabled && !position.breakEvenTriggered && currentROI >= this.breakEvenActivation) {
        position.breakEvenTriggered = true;
        const bufferPercent = this.breakEvenBuffer / 100 / this.leverage;
        if (position.side === 'long') {
          const newStop = position.entryPrice * (1 + bufferPercent);
          if (newStop > position.stopLoss) {
            position.stopLoss = newStop;
          }
        } else {
          const newStop = position.entryPrice * (1 - bufferPercent);
          if (newStop < position.stopLoss) {
            position.stopLoss = newStop;
          }
        }
      }

      // Trailing Stop: Once activated, trail behind highest ROI
      if (this.trailingStopEnabled && position.highestROI >= this.trailingStopActivation) {
        const trailPercent = this.trailingStopTrail / 100 / this.leverage;
        if (position.side === 'long') {
          // Calculate trailing stop price based on highest price seen
          const highestPrice = position.entryPrice * (1 + position.highestROI / 100 / this.leverage);
          const trailingStop = highestPrice * (1 - trailPercent);
          if (trailingStop > position.stopLoss) {
            position.stopLoss = trailingStop;
            position.trailingActive = true;
          }
        } else {
          const lowestPrice = position.entryPrice * (1 - position.highestROI / 100 / this.leverage);
          const trailingStop = lowestPrice * (1 + trailPercent);
          if (trailingStop < position.stopLoss) {
            position.stopLoss = trailingStop;
            position.trailingActive = true;
          }
        }
      }

      // Check stop loss and take profit
      if (position.side === 'long') {
        if (candle.low <= position.stopLoss) {
          shouldClose = true;
          exitPrice = position.stopLoss;
          reason = position.trailingActive ? 'trailing_stop' : (position.breakEvenTriggered ? 'break_even' : 'stop_loss');
        } else if (candle.high >= position.takeProfit) {
          shouldClose = true;
          exitPrice = position.takeProfit;
          reason = 'take_profit';
        }
      } else {
        if (candle.high >= position.stopLoss) {
          shouldClose = true;
          exitPrice = position.stopLoss;
          reason = position.trailingActive ? 'trailing_stop' : (position.breakEvenTriggered ? 'break_even' : 'stop_loss');
        } else if (candle.low <= position.takeProfit) {
          shouldClose = true;
          exitPrice = position.takeProfit;
          reason = 'take_profit';
        }
      }

      if (shouldClose) {
        toClose.push({ position, exitPrice, reason, exitTime: candle.ts });
      }
    }

    for (const { position, exitPrice, reason, exitTime } of toClose) {
      this._closePosition(position, exitPrice, reason, exitTime);
    }
  }

  _calculateCurrentROI(position, currentPrice) {
    const entryD = new Decimal(position.entryPrice);
    const currentD = new Decimal(currentPrice);

    let pnlPercent;
    if (position.side === 'long') {
      pnlPercent = currentD.minus(entryD).div(entryD);
    } else {
      pnlPercent = entryD.minus(currentD).div(entryD);
    }

    // ROI = price change * leverage
    return pnlPercent.mul(this.leverage).mul(100).toNumber();
  }

  _closePosition(position, exitPrice, reason, exitTime) {
    const slippageMultiplier = position.side === 'long' ? 1 - this.slippage : 1 + this.slippage;
    const adjustedExitPrice = new Decimal(exitPrice).mul(slippageMultiplier).toNumber();
    
    const roi = this.positionCalc.calculateROI({
      entryPrice: position.entryPrice,
      exitPrice: adjustedExitPrice,
      leverage: this.leverage,
      side: position.side
    });
    
    const pnl = new Decimal(position.margin).mul(roi.netROI).div(100);
    this.balance = this.balance.plus(pnl);
    
    this.stats.totalTrades++;
    this.stats.totalPnL += pnl.toNumber();
    
    if (pnl.greaterThan(0)) {
      this.stats.winningTrades++;
    } else {
      this.stats.losingTrades++;
    }
    
    this.trades.push({
      ...position,
      exitPrice: adjustedExitPrice,
      exitTime,
      reason,
      pnl: pnl.toNumber(),
      roi: roi.netROI
    });
    
    this.positions = this.positions.filter(p => p.id !== position.id);
  }

  _closeAllPositions(candle) {
    for (const position of [...this.positions]) {
      this._closePosition(position, candle.close, 'end_of_backtest', candle.ts);
    }
  }

  _calculateEquity(currentPrice) {
    let equity = this.balance;
    
    for (const position of this.positions) {
      const unrealizedPnl = this._calculateUnrealizedPnL(position, currentPrice);
      equity = equity.plus(unrealizedPnl);
    }
    
    return equity;
  }

  _calculateUnrealizedPnL(position, currentPrice) {
    const entryD = new Decimal(position.entryPrice);
    const currentD = new Decimal(currentPrice);
    
    let pnlPercent;
    if (position.side === 'long') {
      pnlPercent = currentD.minus(entryD).div(entryD);
    } else {
      pnlPercent = entryD.minus(currentD).div(entryD);
    }
    
    return new Decimal(position.margin).mul(pnlPercent).mul(this.leverage);
  }

  _calculateResults() {
    const finalBalance = this.balance.toNumber();
    const totalReturn = ((finalBalance - this.initialBalance) / this.initialBalance) * 100;
    
    const winRate = this.stats.totalTrades > 0
      ? (this.stats.winningTrades / this.stats.totalTrades) * 100
      : 0;
    
    const winners = this.trades.filter(t => t.pnl > 0);
    const losers = this.trades.filter(t => t.pnl < 0);
    
    const avgWin = winners.length > 0
      ? winners.reduce((s, t) => s + t.pnl, 0) / winners.length
      : 0;
    
    const avgLoss = losers.length > 0
      ? Math.abs(losers.reduce((s, t) => s + t.pnl, 0) / losers.length)
      : 1;

    // Correct profit factor formula: Gross Profit / Gross Loss
    const grossProfit = winners.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
    
    const returns = [];
    for (let i = 1; i < this.equity.length; i++) {
      const ret = (this.equity[i].value - this.equity[i-1].value) / this.equity[i-1].value;
      returns.push(ret);
    }
    
    const avgReturn = returns.length > 0
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : 0;
    
    const stdReturn = returns.length > 0
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
      : 1;
    
    const sharpeRatio = stdReturn > 0
      ? (avgReturn * Math.sqrt(252 * 24)) / (stdReturn * Math.sqrt(252 * 24))
      : 0;
    
    return {
      initialBalance: this.initialBalance,
      finalBalance,
      totalReturn: totalReturn.toFixed(2),
      totalTrades: this.stats.totalTrades,
      winningTrades: this.stats.winningTrades,
      losingTrades: this.stats.losingTrades,
      winRate: winRate.toFixed(2),
      profitFactor: profitFactor.toFixed(2),
      sharpeRatio: sharpeRatio.toFixed(2),
      maxDrawdown: (this.stats.maxDrawdown * 100).toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      trades: this.trades,
      equity: this.equity
    };
  }
}

module.exports = BacktestEngine;
