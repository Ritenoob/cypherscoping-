import { BaseAgent, AgentMemory } from "./base-agent";
import {
  AgentContext,
  AgentResult,
  CompositeSignal,
  AIAnalysis,
  OHLCV,
  OHLCVWithIndex,
} from "../types";
import { SignalGenerator } from "../core/SignalGenerator";
import { SignalNormalizer } from "../core/SignalNormalizer";
import { AuditLogger } from "../core/audit-logger";
import { WilliamsRIndicator } from "../indicators/WilliamsRIndicator";
import { RSIIndicator } from "../indicators/RSIIndicator";
import { MACDIndicator } from "../indicators/MACDIndicator";
import { BollingerBandsIndicator } from "../indicators/BollingerBandsIndicator";
import { StochasticIndicator } from "../indicators/StochasticIndicator";
import { ATRIndicator } from "../indicators/ATRIndicator";
import { ADXIndicator } from "../indicators/ADXIndicator";
import { EMATrendIndicator } from "../indicators/EMATrendIndicator";
import { AOIndicator } from "../indicators/AOIndicator";
import { OBVIndicator } from "../indicators/OBVIndicator";
import { KDJIndicator } from "../indicators/KDJIndicator";
import { CMFIndicator } from "../indicators/CMFIndicator";
import { KlingerIndicator } from "../indicators/KlingerIndicator";
import { StochasticRSIIndicator } from "../indicators/StochasticRSIIndicator";

export interface SignalContext {
  candleIndex: number;
  prevScore: number;
  atrPercent: number | null;
  isChoppy: boolean;
  conflictingSignals: number;
  mtfAligned?: boolean;
  higherTimeframeTrend?: "up" | "down" | "neutral";
}

export class SignalAnalysisAgent extends BaseAgent {
  private signalGenerator: SignalGenerator;
  private signalNormalizer: SignalNormalizer;
  private auditLogger: AuditLogger;
  private williamsR: WilliamsRIndicator;
  private readonly rsiIndicator: RSIIndicator;
  private readonly macdIndicator: MACDIndicator;
  private readonly bollingerBandsIndicator: BollingerBandsIndicator;
  private readonly stochasticIndicator: StochasticIndicator;
  private readonly atrIndicator: ATRIndicator;
  private readonly adxIndicator: ADXIndicator;
  private readonly emaTrendIndicator: EMATrendIndicator;
  private readonly aoIndicator: AOIndicator;
  private readonly obvIndicator: OBVIndicator;
  private readonly kdjIndicator: KDJIndicator;
  private readonly cmfIndicator: CMFIndicator;
  private readonly klingerIndicator: KlingerIndicator;
  private readonly stochasticRSIIndicator: StochasticRSIIndicator;
  private mlEngine: MLEngine;
  private signalHistory: Map<string, number[]> = new Map();
  private symbolCooldownUntil: Map<string, number> = new Map();
  private readonly qualityConfig = {
    minConfidence: Number(process.env.MIN_QUALITY_CONFIDENCE || 72),
    maxAtrPercent: Number(process.env.MAX_SIGNAL_ATR_PERCENT || 8),
    minVolume: Number(process.env.MIN_SIGNAL_VOLUME || 1000),
    maxSpreadBps: Number(process.env.MAX_SPREAD_BPS || 25),
    lossCooldownMs: Number(process.env.LOSS_COOLDOWN_MS || 30 * 60 * 1000),
  };
  private prevK: number = 50;
  private prevD: number = 50;

  constructor() {
    super({
      id: "signal-analysis-agent",
      name: "Signal Analysis Agent",
      role: "Technical Analysis",
      capabilities: [
        "signal-generation",
        "indicator-analysis",
        "pattern-recognition",
      ],
      maxConcurrentTasks: 10,
      priority: 1,
    });
    this.signalGenerator = new SignalGenerator();
    this.signalNormalizer = new SignalNormalizer();
    this.auditLogger = new AuditLogger();
    this.williamsR = new WilliamsRIndicator({
      period: 10,
      oversold: -80,
      overbought: -20,
    });
    this.rsiIndicator = new RSIIndicator();
    this.macdIndicator = new MACDIndicator();
    this.bollingerBandsIndicator = new BollingerBandsIndicator();
    this.stochasticIndicator = new StochasticIndicator();
    this.atrIndicator = new ATRIndicator();
    this.adxIndicator = new ADXIndicator();
    this.emaTrendIndicator = new EMATrendIndicator();
    this.aoIndicator = new AOIndicator();
    this.obvIndicator = new OBVIndicator();
    this.kdjIndicator = new KDJIndicator();
    this.cmfIndicator = new CMFIndicator();
    this.klingerIndicator = new KlingerIndicator();
    this.stochasticRSIIndicator = new StochasticRSIIndicator();
    this.mlEngine = new MLEngine();
  }

  async initialize(): Promise<void> {
    await this.mlEngine.loadModel();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { ohlcv } = context.marketData;

    if (!ohlcv || ohlcv.length < 50) {
      return { success: false, error: "Insufficient market data" };
    }

    const indexedOHLCV = this.addIndexesToOHLCV(ohlcv);
    const signalContext = await this.buildSignalContext(context, indexedOHLCV);
    let signal = await this.generateSignal(
      context,
      indexedOHLCV,
      signalContext,
    );
    const aiAnalysis = await this.mlEngine.analyzeContext(
      context,
      signal,
      signalContext,
    );
    signal = this.applyQualityFilters(
      context,
      signal,
      aiAnalysis,
      signalContext,
    );

    this.recordSignalHistory(context.symbol, signal);

    return {
      success: true,
      signal,
      aiAnalysis,
    };
  }

  private async buildSignalContext(
    context: AgentContext,
    indexedOHLCV: OHLCVWithIndex[],
  ): Promise<SignalContext> {
    const { ohlcv } = context.marketData;

    const prevScore = this.getPreviousScore(context.symbol, context.symbol);
    const atrPercent = this.calculateATRPercent(ohlcv);
    const isChoppy = this.detectChoppyMarket(ohlcv);
    const conflictingSignals = this.countConflictingSignals(indexedOHLCV);
    const higherTimeframeTrend = this.calculateHigherTimeframeTrend(ohlcv);
    const lowerTimeframeTrend = this.calculateLowerTimeframeTrend(ohlcv);
    const mtfAligned =
      higherTimeframeTrend !== "neutral" &&
      lowerTimeframeTrend !== "neutral" &&
      higherTimeframeTrend === lowerTimeframeTrend;

    return {
      candleIndex: indexedOHLCV.length - 1,
      prevScore,
      atrPercent,
      isChoppy,
      conflictingSignals,
      mtfAligned,
      higherTimeframeTrend,
    };
  }

  private calculateLowerTimeframeTrend(
    ohlcv: OHLCV[],
  ): "up" | "down" | "neutral" {
    if (ohlcv.length < 60) return "neutral";
    const closes = ohlcv.map((c) => c.close);
    const fast = this.calculateEMA(closes, 12);
    const slow = this.calculateEMA(closes, 26);
    const f = fast[fast.length - 1];
    const s = slow[slow.length - 1];
    if (!Number.isFinite(f) || !Number.isFinite(s)) return "neutral";
    if (f > s) return "up";
    if (f < s) return "down";
    return "neutral";
  }

  private aggregateCandles(ohlcv: OHLCV[], groupSize: number): OHLCV[] {
    const out: OHLCV[] = [];
    for (let i = 0; i < ohlcv.length; i += groupSize) {
      const chunk = ohlcv.slice(i, i + groupSize);
      if (chunk.length < groupSize) break;
      out.push({
        timestamp: chunk[chunk.length - 1].timestamp,
        open: chunk[0].open,
        high: Math.max(...chunk.map((c) => c.high)),
        low: Math.min(...chunk.map((c) => c.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((sum, c) => sum + c.volume, 0),
      });
    }
    return out;
  }

  private calculateHigherTimeframeTrend(
    ohlcv: OHLCV[],
  ): "up" | "down" | "neutral" {
    const htf = this.aggregateCandles(ohlcv, 4);
    if (htf.length < 30) return "neutral";
    const closes = htf.map((c) => c.close);
    const fast = this.calculateEMA(closes, 9);
    const slow = this.calculateEMA(closes, 21);
    const f = fast[fast.length - 1];
    const s = slow[slow.length - 1];
    if (!Number.isFinite(f) || !Number.isFinite(s)) return "neutral";
    if (f > s) return "up";
    if (f < s) return "down";
    return "neutral";
  }

  private async generateSignal(
    context: AgentContext,
    indexedOHLCV: OHLCVWithIndex[],
    signalContext: SignalContext,
  ): Promise<CompositeSignal> {
    const candles = indexedOHLCV.map((c) => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const highs = indexedOHLCV.map((c) => c.high);
    const lows = indexedOHLCV.map((c) => c.low);
    const closes = indexedOHLCV.map((c) => c.close);
    const volumes = indexedOHLCV.map((c) => c.volume);

    this.williamsR.reset();

    for (const candle of candles) {
      this.williamsR.update(candle);
    }

    const wrResult = this.williamsR.getResult();

    const indicatorResults = {
      williamsR: wrResult,
      rsi: this.rsiIndicator.calculate(closes, 21),
      stochRSI: this.stochasticRSIIndicator.calculate(closes, 14, 14, 3, 3),
      macd: this.macdIndicator.calculate(closes, 12, 26, 9),
      bollinger: this.bollingerBandsIndicator.calculate(closes, 20, 2.0),
      stochastic: this.stochasticIndicator.calculate(
        highs,
        lows,
        closes,
        14,
        3,
      ),
      kdj: this.kdjIndicator.calculate(highs, lows, closes, 9, 3, 3),
      emaTrend: this.emaTrendIndicator.calculate(closes, 9, 25, 50),
      ao: this.aoIndicator.calculate(highs, lows, 5, 34),
      obv: this.obvIndicator.calculate(closes, volumes),
      cmf: this.cmfIndicator.calculate(highs, lows, closes, volumes, 20),
      klinger: this.klingerIndicator.calculate(
        highs,
        lows,
        closes,
        volumes,
        34,
        55,
        13,
      ),
      adx: this.adxIndicator.calculate(highs, lows, closes, 14),
      atr: this.atrIndicator.calculate(highs, lows, closes, 14),
    };

    const microstructure = context.marketData.microstructure || {
      buySellRatio: null,
      domImbalance: null,
      fundingRate: null,
    };

    const signal = this.signalGenerator.generate(
      indicatorResults,
      microstructure,
      signalContext,
    );

    const enableNormalizer = process.env.ENABLE_SIGNAL_NORMALIZER !== "false";
    if (enableNormalizer) {
      try {
        const normalizedResult = this.signalNormalizer.generateComposite(
          indicatorResults,
          microstructure,
        );
        signal.normalizedResult = normalizedResult;

        const currentTier = this.getScoreTier(signal.compositeScore);
        const agreement =
          (signal.compositeScore > 0 && normalizedResult.normalizedScore > 0) ||
          (signal.compositeScore < 0 && normalizedResult.normalizedScore < 0) ||
          (Math.abs(signal.compositeScore) < 20 &&
            Math.abs(normalizedResult.normalizedScore) < 20);

        await this.auditLogger.log({
          timestamp: Date.now(),
          eventType: "parallel_score_comparison",
          correlationId: context.correlationId || "unknown",
          component: "signal-analysis-agent",
          severity: "info",
          payload: {
            currentScore: signal.compositeScore,
            normalizedScore: normalizedResult.normalizedScore,
            currentTier,
            normalizedTier: normalizedResult.normalizedTier,
            agreement,
          },
        });
      } catch (error) {
        const err = error as Error;
        await this.auditLogger.log({
          timestamp: Date.now(),
          eventType: "normalizer_error",
          correlationId: context.correlationId || "unknown",
          component: "signal-analysis-agent",
          severity: "error",
          payload: {
            error: err.message,
            stack: err.stack,
          },
        });
        signal.normalizedResult = undefined;
      }
    }

    return signal;
  }

  private getScoreTier(score: number): string {
    if (score >= 90) return "EXTREME_BUY";
    if (score >= 70) return "STRONG_BUY";
    if (score >= 20) return "BUY";
    if (score > -20) return "NEUTRAL";
    if (score >= -69) return "SELL";
    if (score >= -89) return "STRONG_SELL";
    return "EXTREME_SELL";
  }

  private calculateRSI(
    closes: number[],
    period: number,
  ): {
    value: number;
    signal: "bullish" | "bearish" | "neutral";
    score: number;
  } {
    const changes = closes.slice(1).map((c, i) => c - closes[i]);
    const gains = changes.map((c) => (c > 0 ? c : 0));
    const losses = changes.map((c) => (c < 0 ? Math.abs(c) : 0));

    let avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    const rs = avgGain / avgLoss || 1;
    const rsi = 100 - 100 / (1 + rs);
    const value = rsi;

    let signal: "bullish" | "bearish" | "neutral" = "neutral";
    let score = 0;

    if (rsi <= 30) {
      signal = "bullish";
      score = 40;
    } else if (rsi >= 70) {
      signal = "bearish";
      score = -40;
    }

    return { value, signal, score };
  }

  private calculateStochRSI(
    closes: number[],
    rsiPeriod: number,
    stochPeriod: number,
    kPeriod: number,
    dPeriod: number,
  ): {
    value: number;
    signal: "bullish" | "bearish" | "neutral";
    score: number;
  } {
    const rsiSeries = this.calculateRSISeries(closes, rsiPeriod);
    if (rsiSeries.length < stochPeriod + Math.max(kPeriod, dPeriod)) {
      return { value: 50, signal: "neutral", score: 0 };
    }

    const stochRsiSeries: number[] = [];
    for (let i = stochPeriod - 1; i < rsiSeries.length; i++) {
      const window = rsiSeries.slice(i - stochPeriod + 1, i + 1);
      const minRsi = Math.min(...window);
      const maxRsi = Math.max(...window);
      const denom = maxRsi - minRsi;
      const normalized =
        denom === 0 ? 50 : ((rsiSeries[i] - minRsi) / denom) * 100;
      stochRsiSeries.push(normalized);
    }

    const kSeries = this.smaSeries(stochRsiSeries, kPeriod);
    const dSeries = this.smaSeries(kSeries, dPeriod);
    const kValue = kSeries[kSeries.length - 1];
    const d = dSeries[dSeries.length - 1];
    const latestRSI = rsiSeries[rsiSeries.length - 1];

    let signal: "bullish" | "bearish" | "neutral" = "neutral";
    let score = 0;

    const kOversold = kValue < 20 && d < 20;
    const kOverbought = kValue > 80 && d > 80;

    if (kOversold) {
      signal = "bullish";
      score = 20;
    } else if (kOverbought) {
      signal = "bearish";
      score = -20;
    } else if (kValue > d && kValue > 50 && latestRSI > 50) {
      signal = "bullish";
      score = 18;
    } else if (kValue < d && kValue < 50 && latestRSI < 50) {
      signal = "bearish";
      score = -18;
    }

    return { value: kValue, signal, score };
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

  private calculateRSISeries(closes: number[], period: number): number[] {
    if (closes.length <= period) return [];
    const series: number[] = [];
    for (let i = period; i < closes.length; i++) {
      const window = closes.slice(i - period, i + 1);
      series.push(this.calculateRSI(window, period).value);
    }
    return series;
  }

  private smaSeries(values: number[], period: number): number[] {
    if (values.length < period) return [];
    const out: number[] = [];
    for (let i = period - 1; i < values.length; i++) {
      const window = values.slice(i - period + 1, i + 1);
      out.push(window.reduce((a, b) => a + b, 0) / period);
    }
    return out;
  }

  private calculateMACD(
    closes: number[],
    fastPeriod: number,
    slowPeriod: number,
    signalPeriod: number,
  ): {
    value: number;
    signal: "bullish" | "bearish" | "neutral";
    score: number;
    histogram: number;
  } {
    const emaFast = this.calculateEMA(closes, fastPeriod);
    const emaSlow = this.calculateEMA(closes, slowPeriod);
    const macdLine = emaFast[emaFast.length - 1] - emaSlow[emaSlow.length - 1];

    const macdValues: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      macdValues.push(emaFast[i] - emaSlow[i]);
    }

    const signalValues = macdValues.slice(-signalPeriod);
    const signal = this.calculateEMA(signalValues, signalPeriod);

    const histogram = macdLine - signal[signal.length - 1];

    return {
      value: macdLine,
      signal: histogram > 0 ? "bullish" : histogram < 0 ? "bearish" : "neutral",
      score: histogram > 0 ? 18 : histogram < 0 ? -18 : 0,
      histogram,
    };
  }

  private calculateBollingerBands(
    closes: number[],
    period: number,
    multiplier: number,
  ): {
    value: number;
    upper: number;
    middle: number;
    lower: number;
    percentB: number;
    signal: "bullish" | "bearish" | "neutral";
    score: number;
  } {
    const sma = this.calculateSMA(closes, period);
    const slice = closes.slice(-period);
    const variance =
      slice.reduce((acc, val) => acc + Math.pow(val - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = sma + multiplier * stdDev;
    const lower = sma - multiplier * stdDev;
    const percentB = (closes[closes.length - 1] - lower) / (upper - lower);

    const latest = closes[closes.length - 1];

    let signal: "bullish" | "bearish" | "neutral" = "neutral";
    let score = 0;

    if (latest < lower) {
      signal = "bullish";
      score = 20;
    } else if (latest > upper) {
      signal = "bearish";
      score = -20;
    }

    return {
      value: percentB,
      upper,
      middle: sma,
      lower,
      percentB,
      signal,
      score,
    };
  }

  private calculateStochastic(
    highs: number[],
    lows: number[],
    closes: number[],
    kPeriod: number,
    dPeriod: number,
  ): {
    value: number;
    k: number;
    d: number;
    signal: "bullish" | "bearish" | "neutral";
    score: number;
  } {
    const period = kPeriod + dPeriod + 2;
    const sliceHighs = highs.slice(-period);
    const sliceLows = lows.slice(-period);
    const sliceCloses = closes.slice(-period);

    const lowestLow = Math.min(...sliceLows);
    const highestHigh = Math.max(...sliceHighs);

    const k =
      ((closes[closes.length - 1] - lowestLow) / (highestHigh - lowestLow)) *
      100;
    const kValues: number[] = [];

    for (let i = 0; i < kPeriod; i++) {
      kValues.push(k);
    }

    const d = this.calculateStochasticD(kValues, dPeriod);

    let signal: "bullish" | "bearish" | "neutral" = "neutral";
    let score = 0;

    const kOversold = k < 20 && d < 20;
    const kOverbought = k > 80 && d > 80;

    if (kOversold) {
      signal = "bullish";
      score = 18;
    } else if (kOverbought) {
      signal = "bearish";
      score = -18;
    }

    return { value: k, k, d, signal, score };
  }

  private calculateKDJ(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number,
    kSmooth: number,
    dSmooth: number,
  ): {
    value: number;
    k: number;
    d: number;
    j: number;
    signal: "bullish" | "bearish" | "neutral";
    score: number;
  } {
    const sliceHighs = highs.slice(-period);
    const sliceLows = lows.slice(-period);
    const sliceCloses = closes.slice(-period);

    const highestHigh = Math.max(...sliceHighs);
    const lowestLow = Math.min(...sliceLows);
    const latestClose = sliceCloses[sliceCloses.length - 1];

    const rsv =
      highestHigh === lowestLow
        ? 50
        : ((latestClose - lowestLow) / (highestHigh - lowestLow)) * 100;

    let prevK = this.prevK || 50;
    let prevD = this.prevD || 50;
    let k = (2 / 3) * prevK + (1 / 3) * rsv;
    let d = (2 / 3) * prevD + (1 / 3) * k;
    let j = 3 * k - 2 * d;

    this.prevK = k;
    this.prevD = d;

    let signal: "bullish" | "bearish" | "neutral" = "neutral";
    let score = 0;

    if (j < 0 && rsv < 20) {
      signal = "bullish";
      score = 17;
    } else if (j > 100 && rsv > 80) {
      signal = "bearish";
      score = -17;
    }

    return { value: j, k, d, j, signal, score };
  }

  private calculateEMATrend(
    closes: number[],
    shortPeriod: number,
    mediumPeriod: number,
    longPeriod: number,
  ): {
    value: number;
    shortEMA: number;
    mediumEMA: number;
    longEMA: number;
    signal: "bullish" | "bearish" | "neutral";
    trend: "up" | "down" | "neutral";
    score: number;
  } {
    const shortEMA = this.calculateEMA(closes, shortPeriod);
    const mediumEMA = this.calculateEMA(closes, mediumPeriod);
    const longEMA = this.calculateEMA(closes, longPeriod);

    let trend: "up" | "down" | "neutral" = "neutral";
    let signal: "bullish" | "bearish" | "neutral" = "neutral";
    let score = 0;

    if (
      shortEMA[shortEMA.length - 1] > mediumEMA[mediumEMA.length - 1] &&
      mediumEMA[mediumEMA.length - 1] > longEMA[longEMA.length - 1]
    ) {
      trend = "up";
      signal = "bullish";
      score = 25;
    } else if (
      shortEMA[shortEMA.length - 1] < mediumEMA[mediumEMA.length - 1] &&
      mediumEMA[mediumEMA.length - 1] < longEMA[longEMA.length - 1]
    ) {
      trend = "down";
      signal = "bearish";
      score = -25;
    } else {
      signal = "neutral";
    }

    return {
      value: shortEMA[shortEMA.length - 1] - longEMA[longEMA.length - 1],
      shortEMA: shortEMA[shortEMA.length - 1],
      mediumEMA: mediumEMA[mediumEMA.length - 1],
      longEMA: longEMA[longEMA.length - 1],
      signal,
      trend,
      score,
    };
  }

  private calculateAO(
    highs: number[],
    lows: number[],
    fastPeriod: number,
    slowPeriod: number,
  ): {
    value: number;
    ao: number;
    histogram: number;
    signal: "bullish" | "bearish" | "neutral";
    score: number;
  } {
    const medianPrices = highs.map((h, i) => (h + lows[i]) / 2);
    const smaFast = this.calculateSMA(medianPrices, fastPeriod);
    const smaSlow = this.calculateSMA(medianPrices, slowPeriod);

    const ao = smaFast - smaSlow;
    const prevAO = this.calculateSMA(medianPrices.slice(0, -2), slowPeriod);

    const histogram =
      ao > 0 && ao > prevAO ? 17 : ao < 0 && ao < prevAO ? 17 : 0;

    const signal = ao > 0 ? "bullish" : ao < 0 ? "bearish" : "neutral";
    const score = ao > 0 ? 17 : ao < 0 ? -17 : 0;

    return { value: ao, ao, histogram, signal, score };
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

  private calculateOBV(
    closes: number[],
    volumes: number[],
  ): { value: number; signal: string; score: number } {
    let obv = 0;

    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) {
        obv += volumes[i];
      } else if (closes[i] < closes[i - 1]) {
        obv -= volumes[i];
      }
    }

    const smaOBV = obv / 20;

    let signal: string = "neutral";
    let score = 0;

    const obvTrend = obv > smaOBV ? 1 : -1;

    if (obvTrend > 0) {
      signal = "bullish";
      score = 18;
    } else if (obvTrend < 0) {
      signal = "bearish";
      score = -18;
    }

    return { value: obv, signal, score };
  }

  private calculateCMF(
    highs: number[],
    lows: number[],
    closes: number[],
    volumes: number[],
    period: number,
  ): { value: number; signal: string; score: number } {
    let mfmSum = 0;
    let volSum = 0;

    for (let i = -period; i < 0; i++) {
      const high = highs[highs.length + i];
      const low = lows[lows.length + i];
      const close = closes[closes.length + i];
      const volume = volumes[volumes.length + i];

      const mfm = (close - low - (high - close)) / (high - low);
      const mfVolume = mfm * volume;

      mfmSum += mfVolume;
      volSum += volume;
    }

    const cmf = mfmSum / volSum;

    let signal: string = "neutral";
    let score = 0;

    if (cmf > 0.1) {
      signal = "bullish";
      score = 19;
    } else if (cmf < -0.1) {
      signal = "bearish";
      score = -19;
    }

    return { value: cmf, signal, score };
  }

  private calculateKlinger(
    highs: number[],
    lows: number[],
    closes: number[],
    volumes: number[],
    fastPeriod: number,
    slowPeriod: number,
    signalPeriod: number,
  ): { value: number; signal: string; score: number } {
    let vfHistory: number[] = [];
    let fastEMA: number[][] = [];
    let slowEMA: number[][] = [];

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
        prevTrend = hlc > prevHLC ? 1 : hlc < prevHLC ? -1 : prevTrend;
      }

      const cm = prevTrend === 0 ? dm : prevTrend + dm;

      const vf = volume * (2 * (cm / Math.abs(dm) - 1) - 1) * prevTrend * 100;

      vfHistory.push(vf);
      fastEMA.push(this.calculateEMA(vfHistory.slice(-fastPeriod), fastPeriod));
      slowEMA.push(this.calculateEMA(vfHistory.slice(-slowPeriod), slowPeriod));
    }

    const fastValue =
      fastEMA[fastEMA.length - 1][fastEMA[fastEMA.length - 1].length - 1];
    const slowValue =
      slowEMA[slowEMA.length - 1][slowEMA[slowEMA.length - 1].length - 1];
    const signal = fastValue - slowValue;

    return {
      value: signal,
      signal: signal > 0 ? "bullish" : signal < 0 ? "bearish" : "neutral",
      score: Math.abs(signal) * 10,
    };
  }

  private calculateADX(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number,
  ): {
    value: number;
    signal: string;
    score: number;
    trend: "trending" | "ranging" | "neutral";
  } {
    const trValues = [];

    for (let i = 1; i < closes.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const close = closes[i];

      const tr = Math.max(
        high - low,
        Math.abs(high - closes[i - 1]),
        Math.abs(closes[i] - lows[i - 1]),
      );
      const plusDM = high > closes[i - 1] ? tr : 0;
      const minusDM = high < closes[i - 1] ? tr : 0;

      trValues.push({ tr, plusDM, minusDM });
    }

    const smoothPlus = this.calculateEMA(
      trValues.map((v) => v.plusDM),
      period,
    );
    const smoothMinus = this.calculateEMA(
      trValues.map((v) => v.minusDM),
      period,
    );

    let adxSum = 0;
    for (let i = period; i < trValues.length; i++) {
      adxSum += Math.abs(trValues[i].tr);
    }

    const adx = adxSum / (trValues.length - period);
    const plusDI = smoothPlus[smoothPlus.length - 1];
    const minusDI = smoothMinus[smoothMinus.length - 1];

    let trend: "ranging" | "trending" | "neutral" = "ranging";
    let signal: string = "neutral";
    let score = 0;

    if (adx > 25) {
      trend = "trending";
      signal = plusDI > minusDI ? "bullish" : "bearish";
      score = plusDI > minusDI ? 20 : -20;
    } else if (adx < 20) {
      trend = "ranging";
    }

    return { value: adx, signal, score, trend };
  }

  private calculateATR(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number,
  ): { value: number; signal: string; score: number; atrPercent: number } {
    let trValues = [];

    for (let i = 1; i < closes.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(closes[i] - lows[i - 1]),
      );
      trValues.push(tr);
    }

    const atr = this.calculateSMA(trValues, period);
    const latestClose = closes[closes.length - 1];
    const atrPercent = (atr / latestClose) * 100;

    return { value: atr, signal: "neutral", score: 0, atrPercent };
  }

  private calculateATRPercent(ohlcv: OHLCV[]): number {
    if (ohlcv.length < 20) return 2;

    const { atrPercent } = this.atrIndicator.calculate(
      ohlcv.map((c) => c.high),
      ohlcv.map((c) => c.low),
      ohlcv.map((c) => c.close),
      14,
    );
    return atrPercent;
  }

  private detectChoppyMarket(ohlcv: OHLCV[]): boolean {
    if (ohlcv.length < 50) return false;

    const closes = ohlcv.map((c) => c.close);
    const firstClose = closes[0];
    const lastClose = closes[closes.length - 1];
    const totalChange = Math.abs(lastClose - firstClose);
    const averageVolatility = totalChange / firstClose;

    const mean = closes.reduce((acc, close) => acc + close, 0) / closes.length;
    const sumSquares = closes.reduce(
      (acc, close) => acc + Math.pow(close - mean, 2),
      0,
    );
    const variance = sumSquares / Math.max(1, closes.length - 1);
    const stdDev = Math.sqrt(variance);

    return stdDev < averageVolatility * 0.3;
  }

  private countConflictingSignals(ohlcv: OHLCV[]): number {
    let rsiSignals = 0;
    let macdSignals = 0;

    const closes = ohlcv.map((c) => c.close);
    const rsi = this.rsiIndicator.calculate(closes, 21);
    const macd = this.macdIndicator.calculate(closes, 12, 26, 9);

    if (rsi.signal === "bullish") rsiSignals++;
    else if (rsi.signal === "bearish") rsiSignals--;

    if (macd.signal === "bullish") macdSignals++;
    else if (macd.signal === "bearish") macdSignals--;

    return Math.abs(rsiSignals - macdSignals);
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
      index,
    }));
  }

  private applyQualityFilters(
    context: AgentContext,
    signal: CompositeSignal,
    aiAnalysis: AIAnalysis,
    signalContext: SignalContext,
  ): CompositeSignal {
    const reasons = new Set(signal.blockReasons || []);
    const latestCandle =
      context.marketData.ohlcv[context.marketData.ohlcv.length - 1];
    const now = Date.now();

    if (signal.confidence < this.qualityConfig.minConfidence) {
      reasons.add("low_quality_confidence");
    }

    if (
      signalContext.atrPercent !== null &&
      signalContext.atrPercent > this.qualityConfig.maxAtrPercent
    ) {
      reasons.add("volatility_too_high");
    }

    if (latestCandle && latestCandle.volume < this.qualityConfig.minVolume) {
      reasons.add("low_liquidity");
    }

    const spreadBps = this.estimateSpreadBps(context);
    if (spreadBps !== null && spreadBps > this.qualityConfig.maxSpreadBps) {
      reasons.add("spread_too_wide");
    }

    if (
      aiAnalysis.marketRegime === "ranging" &&
      Math.abs(signal.compositeScore) < 95
    ) {
      reasons.add("regime_mismatch");
    }

    const hasRecentLoss = context.positions.some(
      (p) => p.symbol === context.symbol && p.pnlPercent < 0,
    );
    if (hasRecentLoss) {
      this.symbolCooldownUntil.set(
        context.symbol,
        now + this.qualityConfig.lossCooldownMs,
      );
    }

    const cooldownUntil = this.symbolCooldownUntil.get(context.symbol) || 0;
    if (cooldownUntil > now) {
      reasons.add("cooldown_after_losses");
    }

    if (reasons.size === 0) {
      return signal;
    }

    return {
      ...signal,
      authorized: false,
      side: null,
      blockReasons: Array.from(reasons),
    };
  }

  private estimateSpreadBps(context: AgentContext): number | null {
    const orderBook = context.marketData.orderBook;
    if (
      !orderBook ||
      !Array.isArray(orderBook.bids) ||
      !Array.isArray(orderBook.asks)
    )
      return null;
    const bestBid = orderBook.bids[0]?.[0];
    const bestAsk = orderBook.asks[0]?.[0];
    if (
      !bestBid ||
      !bestAsk ||
      bestBid <= 0 ||
      bestAsk <= 0 ||
      bestAsk <= bestBid
    )
      return null;
    const mid = (bestBid + bestAsk) / 2;
    return ((bestAsk - bestBid) / mid) * 10000;
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

  async loadModel(): Promise<void> {}

  async saveModel(): Promise<void> {}

  async analyzeContext(
    context: AgentContext,
    signal: CompositeSignal,
    signalContext: SignalContext,
  ): Promise<AIAnalysis> {
    const patterns = this.findSimilarPatterns(context);
    const marketRegime = this.detectMarketRegime(context);
    const riskLevel = this.assessRiskLevel(context, signal, signalContext);

    const reasoning: string[] = [];

    if (signal.authorized) {
      reasoning.push(
        `Signal authorized: ${signal.side} signal with score ${signal.compositeScore}`,
      );
      reasoning.push(`Confidence: ${signal.confidence}%`);
    }

    if (patterns.length > 0) {
      reasoning.push(`Found ${patterns.length} similar historical patterns`);
      const successRate =
        patterns.filter((p) => p.result?.success).length / patterns.length;
      reasoning.push(
        `Historical success rate: ${(successRate * 100).toFixed(1)}%`,
      );
    }

    reasoning.push(`Market regime: ${marketRegime}`);
    reasoning.push(`Risk level: ${riskLevel}`);

    const suggestedAction = {
      type: signal.authorized ? ("entry" as const) : ("wait" as const),
      side: signal.side || undefined,
      size: signal.confidence > 80 ? 2 : signal.confidence > 60 ? 1.5 : 1,
      leverage: signal.confidence > 85 ? 30 : signal.confidence > 70 ? 20 : 15,
      roiTarget: signal.confidence > 80 ? 30 : signal.confidence > 70 ? 15 : 10,
    };

    return {
      recommendation:
        signal.side === "long"
          ? "buy"
          : signal.side === "short"
            ? "sell"
            : "hold",
      confidence: signal.confidence,
      reasoning,
      riskAssessment: riskLevel,
      marketRegime,
      suggestedAction,
    };
  }

  private findSimilarPatterns(context: AgentContext): any[] {
    return [];
  }

  private detectMarketRegime(
    context: AgentContext,
  ): "trending" | "ranging" | "volatile" {
    const { ohlcv } = context.marketData;

    if (!ohlcv || ohlcv.length < 50) return "ranging";

    const closes = ohlcv.map((c) => c.close);
    const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);

    const sumSquares =
      returns.reduce((acc, r) => acc + r * r, 0) / (returns.length - 1);
    const stdDev = Math.sqrt(sumSquares);
    const volatility = stdDev;

    if (volatility < 0.01) return "ranging";
    if (volatility > 0.03) return "volatile";
    return "trending";
  }

  private assessRiskLevel(
    context: AgentContext,
    signal: CompositeSignal,
    signalContext: SignalContext,
  ): "low" | "medium" | "high" {
    const openPositions = context.positions.length;

    if (signalContext.conflictingSignals > 3) return "high";
    if (signalContext.isChoppy) return "high";

    if (signalContext.atrPercent !== null && signalContext.atrPercent > 6)
      return "high";
    if (signalContext.atrPercent !== null && signalContext.atrPercent > 4)
      return "medium";

    if (openPositions >= 5) return "high";
    if (openPositions >= 3) return "medium";

    return "low";
  }
}
