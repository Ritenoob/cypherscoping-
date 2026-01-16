/**
 * OptimizerAgent - Backtesting & Parameter Optimization
 * 
 * Runs backtests, walk-forward validation, parameter optimization.
 * Tracks performance and recommends parameter updates.
 */

const { AgentBase, Decimal } = require('./agent-base');
const D = Decimal;

class OptimizerAgent extends AgentBase {
  constructor(config = {}) {
    super({
      id: 'optimizer-agent',
      name: 'Optimizer Agent',
      options: config
    });

    // Data sources
    this.dataAgent = config.dataAgent;
    this.signalAgent = config.signalAgent;

    // Backtest config
    this.defaultFees = {
      taker: config.takerFee || 0.0006,
      maker: config.makerFee || 0.0002
    };
    this.defaultSlippage = config.slippage || 0.0002;

    // Walk-forward config
    this.wfTrainDays = config.wfTrainDays || 60;
    this.wfTestDays = config.wfTestDays || 15;
    this.wfWindows = config.wfWindows || 5;

    // Results storage
    this.backtestResults = [];
    this.optimizationHistory = [];
    this.currentBaseline = null;

    // Trade recording
    this.liveTradeHistory = [];
  }

  async initialize() {
    this.log('Initializing Optimizer Agent');

    this.onMessage('RUN_BACKTEST', this._handleRunBacktest.bind(this));
    this.onMessage('RUN_OPTIMIZATION', this._handleRunOptimization.bind(this));
    this.onMessage('WALK_FORWARD', this._handleWalkForward.bind(this));
    this.onMessage('RECORD_TRADE', this._handleRecordTrade.bind(this));
    this.onMessage('GET_METRICS', this._handleGetMetrics.bind(this));

    return { ok: true, value: null };
  }

  // ===========================================================================
  // BACKTESTING
  // ===========================================================================

  /**
   * Run backtest on historical data
   */
  async runBacktest(params) {
    const {
      symbol,
      timeframe = '15min',
      startDate,
      endDate,
      config = {},
      candles = null
    } = params;

    // Get candles
    let candleData = candles;
    if (!candleData && this.dataAgent) {
      const result = await this.dataAgent.fetchCandles(symbol, timeframe, 1000);
      if (!result.ok) return result;
      candleData = result.value;
    }

    if (!candleData || candleData.length < 200) {
      return { ok: false, error: { code: 'INSUFFICIENT_DATA', message: 'Need at least 200 candles' } };
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      candleData = candleData.filter(c => {
        if (startDate && c.ts < startDate) return false;
        if (endDate && c.ts > endDate) return false;
        return true;
      });
    }

    // Run simulation
    const result = this._simulateTrades(candleData, config);

    // Store result
    this.backtestResults.push({
      symbol,
      timeframe,
      config,
      result,
      timestamp: Date.now()
    });

    return { ok: true, value: result };
  }

  _simulateTrades(candles, config) {
    const {
      minScore = 50,
      stopLossROI = 0.5,
      takeProfitROI = 2.0,
      leverage = 50,
      positionSize = 1 // percent
    } = config;

    const trades = [];
    let balance = 10000;
    let position = null;
    const equityCurve = [balance];

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    // Simulate candle by candle
    for (let i = 200; i < candles.length; i++) {
      const candle = candles[i];
      const slice = candles.slice(0, i + 1);

      // Check existing position
      if (position) {
        const result = this._checkPositionExit(position, candle, leverage);
        if (result.exit) {
          const pnl = result.pnl;
          balance += pnl;
          trades.push({
            ...position,
            exitPrice: result.exitPrice,
            exitTime: candle.ts,
            pnl,
            reason: result.reason
          });
          position = null;
        }
      }

      // Generate signal if no position
      if (!position) {
        const score = this._quickScore(closes.slice(0, i + 1), highs.slice(0, i + 1), lows.slice(0, i + 1));
        
        if (Math.abs(score) >= minScore) {
          const direction = score > 0 ? 'long' : 'short';
          const entryPrice = candle.close;
          const margin = balance * positionSize / 100;
          
          // Calculate SL/TP
          const slPrice = direction === 'long'
            ? entryPrice * (1 - stopLossROI / leverage / 100)
            : entryPrice * (1 + stopLossROI / leverage / 100);
          
          const tpPrice = direction === 'long'
            ? entryPrice * (1 + takeProfitROI / leverage / 100)
            : entryPrice * (1 - takeProfitROI / leverage / 100);

          position = {
            symbol: 'BACKTEST',
            direction,
            entryPrice,
            entryTime: candle.ts,
            stopLoss: slPrice,
            takeProfit: tpPrice,
            leverage,
            margin,
            score
          };
        }
      }

      equityCurve.push(balance);
    }

    // Close any remaining position
    if (position) {
      const lastCandle = candles[candles.length - 1];
      const pnl = position.direction === 'long'
        ? (lastCandle.close - position.entryPrice) / position.entryPrice * leverage * position.margin
        : (position.entryPrice - lastCandle.close) / position.entryPrice * leverage * position.margin;
      
      pnl -= Math.abs(pnl) * this.defaultFees.taker * 2; // Fees
      balance += pnl;
      trades.push({
        ...position,
        exitPrice: lastCandle.close,
        exitTime: lastCandle.ts,
        pnl,
        reason: 'end_of_data'
      });
    }

    return this._calculateMetrics(trades, equityCurve, balance);
  }

  _checkPositionExit(position, candle, leverage) {
    const { direction, entryPrice, stopLoss, takeProfit, margin } = position;

    // Check stop loss
    if (direction === 'long' && candle.low <= stopLoss) {
      const pnl = (stopLoss - entryPrice) / entryPrice * leverage * margin;
      return { exit: true, exitPrice: stopLoss, pnl: pnl - Math.abs(pnl) * this.defaultFees.taker * 2, reason: 'stop_loss' };
    }
    if (direction === 'short' && candle.high >= stopLoss) {
      const pnl = (entryPrice - stopLoss) / entryPrice * leverage * margin;
      return { exit: true, exitPrice: stopLoss, pnl: pnl - Math.abs(pnl) * this.defaultFees.taker * 2, reason: 'stop_loss' };
    }

    // Check take profit
    if (direction === 'long' && candle.high >= takeProfit) {
      const pnl = (takeProfit - entryPrice) / entryPrice * leverage * margin;
      return { exit: true, exitPrice: takeProfit, pnl: pnl - Math.abs(pnl) * this.defaultFees.taker * 2, reason: 'take_profit' };
    }
    if (direction === 'short' && candle.low <= takeProfit) {
      const pnl = (entryPrice - takeProfit) / entryPrice * leverage * margin;
      return { exit: true, exitPrice: takeProfit, pnl: pnl - Math.abs(pnl) * this.defaultFees.taker * 2, reason: 'take_profit' };
    }

    return { exit: false };
  }

  _quickScore(closes, highs, lows) {
    const len = closes.length;
    if (len < 50) return 0;

    let score = 0;

    // RSI
    const rsi = this._rsi(closes.slice(-50), 14);
    if (rsi <= 30) score += 30;
    else if (rsi >= 70) score -= 30;

    // Williams %R
    const wr = this._williamsR(highs.slice(-20), lows.slice(-20), closes.slice(-20), 14);
    if (wr <= -80) score += 25;
    else if (wr >= -20) score -= 25;

    // EMA trend
    const ema9 = this._ema(closes, 9);
    const ema21 = this._ema(closes, 21);
    const price = closes[len - 1];
    
    if (price > ema9 && ema9 > ema21) score += 15;
    else if (price < ema9 && ema9 < ema21) score -= 15;

    return score;
  }

  _rsi(closes, period) {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const change = closes[closes.length - period + i - 1] - closes[closes.length - period + i - 2];
      if (change > 0) gains += change;
      else losses -= change;
    }
    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
  }

  _williamsR(highs, lows, closes, period) {
    const hh = Math.max(...highs.slice(-period));
    const ll = Math.min(...lows.slice(-period));
    const close = closes[closes.length - 1];
    if (hh === ll) return -50;
    return ((hh - close) / (hh - ll)) * -100;
  }

  _ema(values, period) {
    if (values.length < period) return values[values.length - 1];
    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  // ===========================================================================
  // METRICS CALCULATION
  // ===========================================================================

  _calculateMetrics(trades, equityCurve, finalBalance) {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        netPnL: 0,
        avgTrade: 0,
        expectancy: 0
      };
    }

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    
    const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
    
    const winRate = (wins.length / trades.length) * 100;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    
    // Sharpe ratio
    const returns = [];
    for (let i = 1; i < equityCurve.length; i++) {
      returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((a, r) => a + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    // Max drawdown
    let peak = equityCurve[0];
    let maxDrawdown = 0;
    for (const equity of equityCurve) {
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const netPnL = finalBalance - 10000;
    const avgTrade = netPnL / trades.length;
    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const expectancy = (winRate / 100 * avgWin) - ((1 - winRate / 100) * avgLoss);

    return {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: Math.round(winRate * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      netPnL: Math.round(netPnL * 100) / 100,
      avgTrade: Math.round(avgTrade * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      expectancy: Math.round(expectancy * 100) / 100,
      finalBalance: Math.round(finalBalance * 100) / 100,
      trades
    };
  }

  // ===========================================================================
  // OPTIMIZATION
  // ===========================================================================

  async runOptimization(params) {
    const { symbol, timeframe, candles, paramRanges } = params;

    const defaultRanges = {
      minScore: [40, 50, 60, 70],
      stopLossROI: [0.3, 0.5, 0.75, 1.0],
      takeProfitROI: [1.0, 1.5, 2.0, 2.5, 3.0],
      leverage: [25, 50, 75]
    };

    const ranges = paramRanges || defaultRanges;
    const results = [];

    // Grid search
    for (const minScore of ranges.minScore) {
      for (const stopLossROI of ranges.stopLossROI) {
        for (const takeProfitROI of ranges.takeProfitROI) {
          for (const leverage of ranges.leverage) {
            const config = { minScore, stopLossROI, takeProfitROI, leverage };
            const backtest = await this.runBacktest({ symbol, timeframe, candles, config });
            
            if (backtest.ok) {
              results.push({
                config,
                metrics: backtest.value,
                fitness: this._calculateFitness(backtest.value)
              });
            }
          }
        }
      }
    }

    // Sort by fitness
    results.sort((a, b) => b.fitness - a.fitness);

    const best = results[0];
    this.optimizationHistory.push({
      symbol,
      timeframe,
      best,
      totalCombinations: results.length,
      timestamp: Date.now()
    });

    return { ok: true, value: { best, top10: results.slice(0, 10) } };
  }

  _calculateFitness(metrics) {
    // Multi-objective fitness
    const winRateScore = metrics.winRate;
    const profitFactorScore = Math.min(metrics.profitFactor * 25, 75);
    const sharpeScore = Math.min(metrics.sharpeRatio * 20, 60);
    const drawdownPenalty = metrics.maxDrawdown * 2;
    
    return winRateScore + profitFactorScore + sharpeScore - drawdownPenalty;
  }

  // ===========================================================================
  // WALK-FORWARD
  // ===========================================================================

  async runWalkForward(params) {
    const { symbol, timeframe, candles } = params;

    if (!candles || candles.length < 500) {
      return { ok: false, error: { code: 'INSUFFICIENT_DATA', message: 'Need at least 500 candles for walk-forward' } };
    }

    const windowResults = [];
    const candlesPerDay = timeframe === '15min' ? 96 : timeframe === '1hour' ? 24 : 1;
    const trainCandles = this.wfTrainDays * candlesPerDay;
    const testCandles = this.wfTestDays * candlesPerDay;

    for (let window = 0; window < this.wfWindows; window++) {
      const startIdx = window * testCandles;
      const trainEnd = startIdx + trainCandles;
      const testEnd = trainEnd + testCandles;

      if (testEnd > candles.length) break;

      // Optimize on training data
      const trainData = candles.slice(startIdx, trainEnd);
      const optResult = await this.runOptimization({ symbol, timeframe, candles: trainData });
      
      if (!optResult.ok) continue;

      // Test on out-of-sample data
      const testData = candles.slice(trainEnd, testEnd);
      const testResult = await this.runBacktest({ 
        symbol, 
        timeframe, 
        candles: testData, 
        config: optResult.value.best.config 
      });

      if (testResult.ok) {
        windowResults.push({
          window: window + 1,
          trainMetrics: optResult.value.best.metrics,
          testMetrics: testResult.value,
          config: optResult.value.best.config
        });
      }
    }

    // Analyze stability
    const stability = this._analyzeStability(windowResults);

    return { ok: true, value: { windows: windowResults, stability } };
  }

  _analyzeStability(results) {
    if (results.length === 0) return { stable: false };

    const testWinRates = results.map(r => r.testMetrics.winRate);
    const testPFs = results.map(r => r.testMetrics.profitFactor);

    const avgWinRate = testWinRates.reduce((a, b) => a + b, 0) / testWinRates.length;
    const avgPF = testPFs.reduce((a, b) => a + b, 0) / testPFs.length;

    const winRateStd = Math.sqrt(testWinRates.reduce((a, r) => a + Math.pow(r - avgWinRate, 2), 0) / testWinRates.length);
    const pfStd = Math.sqrt(testPFs.reduce((a, r) => a + Math.pow(r - avgPF, 2), 0) / testPFs.length);

    const winRateCV = winRateStd / avgWinRate;
    const pfCV = pfStd / avgPF;

    return {
      stable: winRateCV < 0.3 && pfCV < 0.5,
      avgWinRate: Math.round(avgWinRate * 100) / 100,
      avgProfitFactor: Math.round(avgPF * 100) / 100,
      winRateCV: Math.round(winRateCV * 100) / 100,
      profitFactorCV: Math.round(pfCV * 100) / 100
    };
  }

  // ===========================================================================
  // LIVE TRADE RECORDING
  // ===========================================================================

  recordTrade(trade) {
    this.liveTradeHistory.push({
      ...trade,
      recordedAt: Date.now()
    });

    // Keep last 1000
    if (this.liveTradeHistory.length > 1000) {
      this.liveTradeHistory.shift();
    }

    // Update baseline metrics
    this._updateLiveMetrics();
  }

  _updateLiveMetrics() {
    if (this.liveTradeHistory.length < 10) return;

    const equityCurve = [10000];
    let balance = 10000;
    
    for (const trade of this.liveTradeHistory) {
      balance += trade.pnl || 0;
      equityCurve.push(balance);
    }

    this.currentBaseline = this._calculateMetrics(this.liveTradeHistory, equityCurve, balance);
  }

  getLiveMetrics() {
    return this.currentBaseline || {
      totalTrades: this.liveTradeHistory.length,
      message: 'Insufficient trades for metrics'
    };
  }

  // ===========================================================================
  // MESSAGE HANDLERS
  // ===========================================================================

  async _handleRunBacktest(payload) {
    return this.runBacktest(payload);
  }

  async _handleRunOptimization(payload) {
    return this.runOptimization(payload);
  }

  async _handleWalkForward(payload) {
    return this.runWalkForward(payload);
  }

  async _handleRecordTrade(payload) {
    this.recordTrade(payload);
    return { ok: true, value: null };
  }

  async _handleGetMetrics() {
    return { ok: true, value: this.getLiveMetrics() };
  }

  async performHealthCheck() {
    return {
      status: 'HEALTHY',
      details: {
        backtestCount: this.backtestResults.length,
        optimizationCount: this.optimizationHistory.length,
        liveTradeCount: this.liveTradeHistory.length
      }
    };
  }
}

module.exports = OptimizerAgent;
