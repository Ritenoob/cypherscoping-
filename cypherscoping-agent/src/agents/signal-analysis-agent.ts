import { BaseAgent, AgentMemory } from './base-agent';
import { AgentContext, AgentResult, CompositeSignal, AIAnalysis, OHLCV, OHLCVWithIndex } from '../types';
import { SignalGenerator } from '../core/SignalGenerator';
import { WilliamsRIndicator } from '../indicators/WilliamsRIndicator';

export interface SignalContext {
  candleIndex: number;
  prevScore: number;
  atrPercent: number | null;
  isChoppy: boolean;
  conflictingSignals: number;
}

export class SignalAnalysisAgent extends BaseAgent {
  private signalGenerator: SignalGenerator;
  private williamsR: WilliamsRIndicator;
  private mlEngine: MLEngine;
  private signalHistory: Map<string, number[]> = new Map();

  constructor() {
    super({
      id: 'signal-analysis-agent',
      name: 'Signal Analysis Agent',
      role: 'Technical Analysis',
      capabilities: ['signal-generation', 'indicator-analysis', 'pattern-recognition'],
      maxConcurrentTasks: 10,
      priority: 1
    });
    this.signalGenerator = new SignalGenerator();
    this.williamsR = new WilliamsRIndicator({
      period: 10,
      oversold: -80,
      overbought: -20
    });
    this.mlEngine = new MLEngine();
  }

  async initialize(): Promise<void> {
    await this.mlEngine.loadModel();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { ohlcv } = context.marketData;
    
    if (!ohlcv || ohlcv.length < 50) {
      return { success: false, error: 'Insufficient market data' };
    }

    const indexedOHLCV = this.addIndexesToOHLCV(ohlcv);
    const signalContext = await this.buildSignalContext(context, indexedOHLCV);
    const signal = await this.generateSignal(context, indexedOHLCV, signalContext);
    const aiAnalysis = await this.mlEngine.analyzeContext(context, signal, signalContext);

    this.recordSignalHistory(symbol, signal);

    return {
      success: true,
      signal,
      aiAnalysis
    };
  }

  private async buildSignalContext(context: AgentContext, indexedOHLCV: OHLCVWithIndex[]): Promise<SignalContext> {
    const { ohlcv } = context.marketData;
    const latest = indexedOHLCV[indexedOHLCV.length - 1];

    const prevScore = this.getPreviousScore(context.symbol, context.symbol);
    const atrPercent = this.calculateATRPercent(ohlcv);
    const isChoppy = this.detectChoppyMarket(ohlcv);
    const conflictingSignals = this.countConflictingSignals(indexedOHLCV);

    return {
      candleIndex: indexedOHLCV.length - 1,
      prevScore,
      atrPercent,
      isChoppy,
      conflictingSignals
    };
  }

  private async generateSignal(context: AgentContext, indexedOHLCV: OHLCVWithIndex[], signalContext: SignalContext): Promise<CompositeSignal> {
    const candles = indexedOHLCV.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));
    const highs = indexedOHLCV.map(c => c.high);
    const lows = indexedOHLCV.map(c => c.low);
    const closes = indexedOHLCV.map(c => c.close);
    const volumes = indexedOHLCV.map(c => c.volume);

    const indicatorResults = {
      williamsR: this.williamsR.getResult(),
      rsi: this.calculateRSI(closes, 21),
      stochRSI: this.calculateStochRSI(closes, 14, 14, 3, 3),
      macd: this.calculateMACD(closes, 12, 26, 9),
      bollinger: this.calculateBollingerBands(closes, 20, 2.0),
      stochastic: this.calculateStochastic(highs, lows, closes, 14, 3),
      kdj: this.calculateKDJ(highs, lows, closes, 9, 3, 3),
      emaTrend: this.calculateEMATrend(closes, 9, 25, 50),
      ao: this.calculateAO(highs, lows, 5, 34),
      obv: this.calculateOBV(closes, volumes),
      cmf: this.calculateCMF(highs, lows, closes, volumes, 20),
      klinger: this.calculateKlinger(highs, lows, closes, volumes, 34, 55, 13),
      adx: this.calculateADX(highs, lows, closes, 14),
      atr: this.calculateATR(highs, lows, closes, 14)
    };

    const microstructure = context.marketData.microstructure || {
      buySellRatio: null,
      domImbalance: null,
      fundingRate: null
    };

    return this.signalGenerator.generate(indicatorResults, microstructure, signalContext);
  }

  private calculateRSI(closes: number[], period: number): { value: number; signal: 'bullish' | 'bearish' | 'neutral'; score: number } {
    const changes = closes.slice(1).map((c, i) => c - closes[i]);
    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? Math.abs(c) : 0);

    let avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    const rs = avgGain / avgLoss || 1;
    const rsi = 100 - 100 / (1 + rs);
    const value = rsi;

    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let score = 0;

    if (rsi <= 30) {
      signal = 'bullish';
      score = 40;
    } else if (rsi >= 70) {
      signal = 'bearish';
      score = -40;
    }

    return { value, signal, score };
  }

  private calculateStochRSI(closes: number[], rsiPeriod: number, stochPeriod: number, kPeriod: number, dPeriod: number): { value: number; signal: 'bullish' | 'bearish' | 'neutral'; score: number } {
    const rsi = this.calculateRSI(closes, rsiPeriod);
    const rsiValues = [];

    for (let i = 0; i < rsiPeriod - 1; i++) {
      rsiValues.push(rsi.value);
    }

    const latestRSI = rsi.value;

    const lowestRSI = Math.min(...rsiValues);
    const highestRSI = Math.max(...rsiValues);

    const stochRSI = ((latestRSI - lowestRSI) / (highestRSI - lowestRSI || 1)) * 100;
    const k = this.calculateStochasticK(stochRSI, kPeriod);

    const dValues: number[] = [];
    for (let i = 0; i < rsiPeriod - 1; i++) {
      dValues.push(k[i]);
    }
    const d = this.calculateStochasticD(dValues.slice(-dPeriod), dPeriod);

    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let score = 0;

    const kOversold = k < 20 && d < 20;
    const kOverbought = k > 80 && d > 80;

    if (kOversold) {
      signal = 'bullish';
      score = 20;
    } else if (kOverbought) {
      signal = 'bearish';
      score = -20;
    } else if (k > d && k > 50 && latestRSI > 50) {
      signal = 'bullish';
      score = 18;
    } else if (k < d && k < 50 && latestRSI < 50) {
      signal = 'bearish';
      score = -18;
    }

    return { value: k, signal, score };
  }

  private calculateStochasticK(stochRSI: number, kPeriod: number): number[] {
    const kValues: number[] = [];
    for (let i = 0; i < kPeriod; i++) {
      kValues.push(stochRSI);
    }
    return kValues;
  }

  private calculateStochasticD(kValues: number[], dPeriod: number): number {
    const values = kValues.slice(-dPeriod);
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / dPeriod;
  }

  private calculateMACD(closes: number[], fastPeriod: number, slowPeriod: number, signalPeriod: number): { macd: number; signal: number; histogram: number; } {
    const emaFast = this.calculateEMA(closes, fastPeriod);
    const emaSlow = this.calculateEMA(closes, slowPeriod);
    const macdLine = emaFast - emaSlow;

    const macdValues: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      macdValues.push(emaFast[i] - emaSlow[i]);
    }

    const signalValues = macdValues.slice(-signalPeriod);
    const signal = this.calculateEMA(signalValues, signalPeriod);

    const histogram = macdLine - signal;

    return {
      macd: macdLine,
      signal: histogram > 0 ? 18 : histogram < 0 ? -18 : 0,
      histogram
    };
  }

  private calculateBollingerBands(closes: number[], period: number, multiplier: number): { upper: number; middle: number; lower: number; percentB: number; signal: 'bullish' | 'bearish' | 'neutral'; score: number } {
    const sma = this.calculateSMA(closes, period);
    const slice = closes.slice(-period);
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = sma + (multiplier * stdDev);
    const lower = sma - (multiplier * stdDev);
    const percentB = (closes[closes.length - 1] - lower) / (upper - lower);

    const latest = closes[closes.length - 1];

    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let score = 0;

    if (latest < lower) {
      signal = 'bullish';
      score = 20;
    } else if (latest > upper) {
      signal = 'bearish';
      score = -20;
    }

    return { upper, middle: sma, lower, percentB, signal, score };
  }

  private calculateStochastic(highs: number[], lows: number[], closes: number[], kPeriod: number, dPeriod: number): { k: number; d: number; signal: 'bullish' | 'bearish' | 'neutral'; score: number } {
    const period = kPeriod + dPeriod + 2;
    const sliceHighs = highs.slice(-period);
    const sliceLows = lows.slice(-period);
    const sliceCloses = closes.slice(-period);

    const lowestLow = Math.min(...sliceLows);
    const highestHigh = Math.max(...sliceHighs);

    const k = ((closes[closes.length - 1] - lowestLow) / (highestHigh - lowestLow)) * 100;
    const kValues: number[] = [];

    for (let i = 0; i < kPeriod; i++) {
      kValues.push(k);
    }

    const d = this.calculateStochasticD(kValues, dPeriod);

    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let score = 0;

    const kOversold = k < 20 && d < 20;
    const kOverbought = k > 80 && d > 80;

    if (kOversold) {
      signal = 'bullish';
      score = 18;
    } else if (kOverbought) {
      signal = 'bearish';
      score = -18;
    }

    return { k, d, signal, score };
  }

  private calculateStochasticD(kValues: number[], dPeriod: number): number {
    const values = kValues.slice(-dPeriod);
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / dPeriod;
  }

  private calculateKDJ(highs: number[], lows: number[], closes: number[], period: number, kSmooth: number, dSmooth: number): { k: number; d: number; j: number; signal: 'bullish' | 'bearish' | 'neutral'; score: number } {
    const sliceHighs = highs.slice(-period);
    const sliceLows = lows.slice(-period);
    const sliceCloses = closes.slice(-period);

    const highestHigh = Math.max(...sliceHighs);
    const lowestLow = Math.min(...sliceLows);
    const latestClose = sliceCloses[sliceCloses.length - 1];

    const rsv = highestHigh === lowestLow ? 50 : ((latestClose - lowestLow) / (highestHigh - lowestLow)) * 100;

    let k = (2 / 3) * prevK + (1 / 3) * rsv;
    let d = (2 / 3) * prevD + (1 / 3) * k;
    let j = 3 * k - 2 * d;

    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let score = 0;

    if (j < 0 && rsv < 20) {
      signal = 'bullish';
      score = 17;
    } else if (j > 100 && rsv > 80) {
      signal = 'bearish';
      score = -17;
    }

    return { k, d, j, signal, score };
  }

  private calculateEMATrend(closes: number[], shortPeriod: number, mediumPeriod: number, longPeriod: number): { shortEMA: number; mediumEMA: number; longEMA: number; trend: 'up' | 'down' | 'neutral'; score: number } {
    const shortEMA = this.calculateEMA(closes, shortPeriod);
    const mediumEMA = this.calculateEMA(closes, mediumPeriod);
    const longEMA = this.calculateEMA(closes, longPeriod);

    let trend: 'up' | 'down' | 'neutral' = 'neutral';
    let score = 0;

    if (shortEMA > mediumEMA && mediumEMA > longEMA) {
      trend = 'up';
      score = 25;
    } else if (shortEMA < mediumEMA && mediumEMA < longEMA) {
      trend = 'down';
      score = -25;
    }

    return { shortEMA, mediumEMA, longEMA, trend, score };
  }

  private calculateAO(highs: number[], lows: number[], fastPeriod: number, slowPeriod: number): { ao: number; histogram: number; } {
    const medianPrices = highs.map((h, i) => (h + lows[i]) / 2);
    const smaFast = this.calculateSMA(medianPrices, fastPeriod);
    const smaSlow = this.calculateSMA(medianPrices, slowPeriod);

    const ao = smaFast - smaSlow;
    const prevAO = this.getSMA(medianPrices.slice(0, -2), slowPeriod);

    const histogram = ao > 0 && ao > prevAO ? 17 : ao < 0 && ao < prevAO ? 17 : 0;

    return { ao, histogram };
  }

  private calculateEMA(data: number[], period: number): number[] {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    let prevEma = data[0];

    for (let i = 0; i < data.length; i++) {
      const currentEma = data[i] * multiplier + prevEma * (1 - multiplier);
      ema.push(currentEma);
      prevEma = currentEma;
    }

    return ema;
  }

  private calculateSMA(data: number[], period: number): number {
    if (data.length < period) {
      return data.reduce((a, b) => a + b, 0) / data.length;
    }
    return data.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  private calculateOBV(closes: number[], volumes: number[]): { obv: number; trend: 'bullish' | 'bearish' | 'neutral'; score: number } {
    let obv = 0;

    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) {
        obv += volumes[i];
      } else if (closes[i] < closes[i - 1]) {
        obv -= volumes[i];
      }
    }

    const smaOBV = obv / 20;

    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let score = 0;

    const obvTrend = obv > smaOBV ? 1 : -1;

    if (obvTrend > 0) {
      signal = 'bullish';
      score = 18;
    } else if (obvTrend < 0) {
      signal = 'bearish';
      score = -18;
    }

    return { obv, signal, score };
  }

  private calculateCMF(highs: number[], lows: number[], closes: number[], volumes: number[], period: number): { cmf: number; signal: 'bullish' | 'bearish' | 'neutral'; score: number } {
    let mfmSum = 0;
    let volSum = 0;

    for (let i = -period; i < 0; i++) {
      const high = highs[highs.length + i];
      const low = lows[lows.length + i];
      const close = closes[closes.length + i];
      const volume = volumes[volumes.length + i];

      const mfm = ((close - low) - (high - close)) / (high - low);
      const mfVolume = mfm * volume;

      mfmSum += mfVolume;
      volSum += volume;
    }

    const cmf = mfmSum / volSum;

    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let score = 0;

    if (cmf > 0.1) {
      signal = 'bullish';
      score = 19;
    } else if (cmf < -0.1) {
      signal = 'bearish';
      score = -19;
    }

    return { cmf, signal, score };
  }

  private calculateKlinger(highs: number[], lows: number[], closes: number[], volumes: number[], fastPeriod: number, slowPeriod: number, signalPeriod: number): { kvo: number; signal: number; } {
    let vfHistory: number[] = [];
    let fastEMA: number[] = [];
    let slowEMA: number[] = [];

    for (let i = 0; i < closes.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const close = closes[i];
      const volume = volumes[i];

      const hlc = (high + low + close) / 3;
      const dm = high - low;

      let prevTrend = 0;
      if (i > 0) {
        const prevHLC = (highs[i - 1] + lows[i - 1] + closes[i - 1]) / 3;
        prevTrend = hlc > prevHLC ? 1 : (hlc < prevHLC ? -1 : prevTrend);
      }

      const cm = (prevTrend === 0 ? dm : prevTrend + dm);

      const vf = volume * (2 * (cm / Math.abs(dm) - 1) - 1) * prevTrend * 100;

      vfHistory.push(vf);
      fastEMA.push(this.calculateEMA(vfHistory.slice(-fastPeriod), fastPeriod));
      slowEMA.push(this.calculateEMA(vfHistory.slice(-slowPeriod), slowPeriod));
    }

    const fastValue = fastEMA[fastEMA.length - 1];
    const slowValue = slowEMA[slowEMA.length - 1];
    const signal = fastValue - slowValue;

    return { kvo: signal, signal };
  }

  private calculateADX(highs: number[], lows: number[], closes: number[], period: number): { adx: number; plusDI: number; minusDI: number; trend: 'trending' | 'ranging' | 'neutral' } {
    const trValues = [];

    for (let i = 1; i < closes.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const close = closes[i];

      const tr = Math.max(high - low, Math.abs(high - closes[i - 1]), Math.abs(closes[i] - lows[i - 1]));
      const plusDM = high > closes[i - 1] ? tr : 0;
      const minusDM = high < closes[i - 1] ? tr : 0;

      trValues.push({ tr, plusDM, minusDM });
    }

    const smoothPlus = this.calculateEMA(trValues.map(v => v.plusDM), period);
    const smoothMinus = this.calculateEMA(trValues.map(v => v.minusDM), period);

    let adxSum = 0;
    for (let i = period; i < trValues.length; i++) {
      adxSum += Math.abs(trValues[i].tr);
    }

    const adx = adxSum / (trValues.length - period);
    const plusDI = smoothPlus[smoothPlus.length - 1];
    const minusDI = smoothMinus[smoothMinus.length - 1];

    let trend: 'ranging' | 'trending' | 'neutral' = 'ranging';

    if (adx > 25) {
      trend = 'trending';
    } else if (adx < 20) {
      trend = 'ranging';
    }

    return { adx, plusDI, minusDI, trend };
  }


  private calculateATR(highs: number[], lows: number[], closes: number[], period: number): { atr: number; atrPercent: number } {
    let trValues = [];

    for (let i = 1; i < closes.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];

      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(closes[i] - lows[i - 1]));
      trValues.push(tr);
    }

    const atr = this.calculateSMA(trValues, period);
    const latestClose = closes[closes.length - 1];
    const atrPercent = atr / latestClose * 100;

    return { atr, atrPercent };
  }

  private calculateATRPercent(ohlcv: OHLCV[]): number {
    if (ohlcv.length < 20) return 2;

    const { atrPercent } = this.calculateATR(ohlcv.map(c => c.high), ohlcv.map(c => c.low), ohlcv.map(c => c.close), 14);
    return atrPercent;
  }

  private detectChoppyMarket(ohlcv: OHLCV[]): boolean {
    if (ohlcv.length < 50) return false;

    const closes = ohlcv.map(c => c.close);
    const firstClose = closes[0];
    const lastClose = closes[closes.length - 1];
    const totalChange = Math.abs(lastClose - firstClose);
    const averageVolatility = totalChange / firstClose;

    const sumSquares = closes.reduce((acc, close) => acc + Math.pow(close - firstClose, 2), 0);
    const stdDev = Math.sqrt(sumSquares / closes.length - 1);

    return stdDev < averageVolatility * 0.3;
  }

  private countConflictingSignals(ohlcv: OHLCV[]): number {
    let rsiSignals = 0;
    let macdSignals = 0;

    const rsi = this.calculateRSI(ohlcv.map(c => c.close), 21);
    const macd = this.calculateMACD(ohlcv.map(c => c.close), 12, 26, 9);

    if (rsi.signal === 'bullish') rsiSignals++;
    else if (rsi.signal === 'bearish') rsiSignals++;

    if (macd.signal > 0) macdSignals++;
    else if (macd.signal < 0) macdSignals++;

    return Math.abs(rsiSignals - macdSignals) + Math.abs(rsiSignals - macdSignals);
  }

  private getPreviousScore(symbol: string, coin: string): number {
    const history = this.signalHistory.get(`${symbol}_${coin}`);
    if (!history || history.length === 0) return 0;
    return history[history.length - 1];
  }

  private recordSignalHistory(symbol: string, signal: CompositeSignal): void {
    const key = `${symbol}_${symbol}`;
    const history = this.signalHistory.get(key) || [];

    history.push(signal.compositeScore);

    if (history.length > 50) history.shift();

    this.signalHistory.set(key, history);
  }

  private addIndexesToOHLCV(ohlcv: OHLCV[]): OHLCVWithIndex[] {
    return ohlcv.map((candle, index) => ({
      ...candle,
      index
    }));
  }

  async shutdown(): Promise<void> {
    await this.mlEngine.saveModel();
  }
}

class MLEngine {
  private qTable: Map<string, number> = new Map();
  private patterns: Map<string, any> = new Map();
  private learningRate: number = 0.1;
  private explorationRate: number = 0.2;

  async loadModel(): Promise<void> {
  }

  async saveModel(): Promise<void> {
  }

  async analyzeContext(context: AgentContext, signal: CompositeSignal, signalContext: SignalContext): Promise<AIAnalysis> {
    const patterns = this.findSimilarPatterns(context);
    const marketRegime = this.detectMarketRegime(context);
    const riskLevel = this.assessRiskLevel(context, signal, signalContext);

    const reasoning: string[] = [];

    if (signal.authorized) {
      reasoning.push(`Signal authorized: ${signal.side} signal with score ${signal.compositeScore}`);
      reasoning.push(`Confidence: ${signal.confidence}%`);
    }

    if (patterns.length > 0) {
      reasoning.push(`Found ${patterns.length} similar historical patterns`);
      const successRate = patterns.filter(p => p.result?.success).length / patterns.length;
      reasoning.push(`Historical success rate: ${(successRate * 100).toFixed(1)}%`);
    }

    reasoning.push(`Market regime: ${marketRegime}`);
    reasoning.push(`Risk level: ${riskLevel}`);

    const suggestedAction = {
      type: signal.authorized ? 'entry' : 'wait',
      side: signal.side,
      size: signal.confidence > 80 ? 2 : signal.confidence > 60 ? 1.5 : 1,
      leverage: signal.confidence > 85 ? 30 : signal.confidence > 70 ? 20 : 15,
      roiTarget: signal.confidence > 80 ? 30 : signal.confidence > 70 ? 15 : 10
    };

    return {
      recommendation: signal.side === 'long' ? 'buy' : signal.side === 'short' ? 'sell' : 'hold',
      confidence: signal.confidence,
      reasoning,
      riskAssessment: riskLevel,
      marketRegime,
      suggestedAction
    };
  }

  private findSimilarPatterns(context: AgentContext): any[] {
    return [];
  }

  private detectMarketRegime(context: AgentContext): 'trending' | 'ranging' | 'volatile' {
    const { ohlcv } = context.marketData;

    if (!ohlcv || ohlcv.length < 50) return 'ranging';

    const closes = ohlcv.map(c => c.close);
    const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);

    const sumSquares = returns.reduce((acc, r) => acc + r * r, 0) / (returns.length - 1);
    const stdDev = Math.sqrt(sumSquares);
    const volatility = stdDev;

    if (volatility < 0.01) return 'ranging';
    if (volatility > 0.03) return 'volatile';
    return 'trending';
  }

  private assessRiskLevel(context: AgentContext, signal: CompositeSignal, signalContext: SignalContext): 'low' | 'medium' | 'high' {
    const openPositions = context.positions.length;

    if (signalContext.conflictingSignals > 3) return 'high';
    if (signalContext.isChoppy) return 'high';

    if (signalContext.atrPercent > 6) return 'high';
    if (signalContext.atrPercent > 4) return 'medium';

    if (openPositions >= 5) return 'high';
    if (openPositions >= 3) return 'medium';

    return 'low';
  }
}

interface OHLCVWithIndex extends OHLCV {
  index: number;
}
