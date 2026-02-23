import { RSIIndicator } from '../src/indicators/RSIIndicator';
import { MACDIndicator } from '../src/indicators/MACDIndicator';
import { BollingerBandsIndicator } from '../src/indicators/BollingerBandsIndicator';
import { StochasticIndicator } from '../src/indicators/StochasticIndicator';
import { ATRIndicator } from '../src/indicators/ATRIndicator';
import { ADXIndicator } from '../src/indicators/ADXIndicator';
import { EMATrendIndicator } from '../src/indicators/EMATrendIndicator';
import { AOIndicator } from '../src/indicators/AOIndicator';
import { OBVIndicator } from '../src/indicators/OBVIndicator';
import { KDJIndicator } from '../src/indicators/KDJIndicator';
import { CMFIndicator } from '../src/indicators/CMFIndicator';
import { KlingerIndicator } from '../src/indicators/KlingerIndicator';
import { StochasticRSIIndicator } from '../src/indicators/StochasticRSIIndicator';
import { CCIIndicator } from '../src/indicators/CCIIndicator';
import { VolumeRatioIndicator } from '../src/indicators/VolumeRatioIndicator';
import { PumpAlertIndicator } from '../src/indicators/PumpAlertIndicator';
import { DOMAnalyzerIndicator } from '../src/indicators/DOMAnalyzerIndicator';

function trendCandles(length: number, start: number, step: number): number[] {
  return Array.from({ length }, (_, i) => start + i * step);
}

describe('indicator migration batch (RSI, MACD, Bollinger)', () => {
  test('RSIIndicator returns bounded numeric output', () => {
    const indicator = new RSIIndicator();
    const closes = trendCandles(60, 100, 0.5);
    const out = indicator.calculate(closes, 21);

    expect(Number.isFinite(out.value)).toBe(true);
    expect(out.value).toBeGreaterThanOrEqual(0);
    expect(out.value).toBeLessThanOrEqual(100);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
  });

  test('MACDIndicator returns line/histogram without NaN', () => {
    const indicator = new MACDIndicator();
    const closes = trendCandles(80, 200, -0.2);
    const out = indicator.calculate(closes, 12, 26, 9);

    expect(Number.isFinite(out.value)).toBe(true);
    expect(Number.isFinite(out.histogram)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
  });

  test('BollingerBandsIndicator calculates valid percentB and bands', () => {
    const indicator = new BollingerBandsIndicator();
    const closes = trendCandles(60, 50, 0.1);
    const out = indicator.calculate(closes, 20, 2);

    expect(Number.isFinite(out.upper)).toBe(true);
    expect(Number.isFinite(out.middle)).toBe(true);
    expect(Number.isFinite(out.lower)).toBe(true);
    expect(Number.isFinite(out.percentB)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
  });

  test('StochasticIndicator computes bounded K/D values', () => {
    const indicator = new StochasticIndicator();
    const highs = trendCandles(80, 100, 0.3);
    const lows = highs.map((h) => h - 2);
    const closes = highs.map((h) => h - 1);
    const out = indicator.calculate(highs, lows, closes, 14, 3);

    expect(Number.isFinite(out.k)).toBe(true);
    expect(Number.isFinite(out.d)).toBe(true);
    expect(out.k).toBeGreaterThanOrEqual(0);
    expect(out.k).toBeLessThanOrEqual(100);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
  });

  test('ATRIndicator computes numeric ATR and ATR percent', () => {
    const indicator = new ATRIndicator();
    const highs = trendCandles(80, 120, 0.2);
    const lows = highs.map((h) => h - 3);
    const closes = highs.map((h, i) => h - (i % 2 === 0 ? 1.5 : 1.0));
    const out = indicator.calculate(highs, lows, closes, 14);

    expect(Number.isFinite(out.value)).toBe(true);
    expect(Number.isFinite(out.atrPercent)).toBe(true);
    expect(out.value).toBeGreaterThanOrEqual(0);
  });

  test('ADXIndicator computes trend metadata and score', () => {
    const indicator = new ADXIndicator();
    const highs = trendCandles(90, 220, 0.4);
    const lows = highs.map((h, i) => h - (2 + (i % 3) * 0.2));
    const closes = highs.map((h, i) => h - (i % 2 === 0 ? 1.2 : 0.8));
    const out = indicator.calculate(highs, lows, closes, 14);

    expect(Number.isFinite(out.value)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
    expect(['trending', 'ranging', 'neutral']).toContain(out.trend);
    expect(Number.isFinite(out.score)).toBe(true);
  });

  test('EMATrendIndicator computes EMA trend state', () => {
    const indicator = new EMATrendIndicator();
    const closes = trendCandles(120, 80, 0.25);
    const out = indicator.calculate(closes, 9, 25, 50);

    expect(Number.isFinite(out.shortEMA)).toBe(true);
    expect(Number.isFinite(out.mediumEMA)).toBe(true);
    expect(Number.isFinite(out.longEMA)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
    expect(['up', 'down', 'neutral']).toContain(out.trend);
  });

  test('AOIndicator computes AO value and histogram', () => {
    const indicator = new AOIndicator();
    const highs = trendCandles(100, 140, 0.3);
    const lows = highs.map((h) => h - 1.8);
    const out = indicator.calculate(highs, lows, 5, 34);

    expect(Number.isFinite(out.ao)).toBe(true);
    expect(Number.isFinite(out.histogram)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
  });

  test('OBVIndicator computes directional score from close/volume', () => {
    const indicator = new OBVIndicator();
    const closes = trendCandles(90, 30, 0.08);
    const volumes = Array.from({ length: 90 }, (_, i) => 1000 + i * 10);
    const out = indicator.calculate(closes, volumes);

    expect(Number.isFinite(out.value)).toBe(true);
    expect(Number.isFinite(out.score)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
  });

  test('KDJIndicator computes K/D/J and signal', () => {
    const indicator = new KDJIndicator();
    const highs = trendCandles(100, 180, 0.35);
    const lows = highs.map((h, i) => h - (2 + (i % 4) * 0.1));
    const closes = highs.map((h, i) => h - (i % 2 === 0 ? 0.9 : 1.4));
    const out = indicator.calculate(highs, lows, closes, 9, 3, 3);

    expect(Number.isFinite(out.k)).toBe(true);
    expect(Number.isFinite(out.d)).toBe(true);
    expect(Number.isFinite(out.j)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
  });

  test('CMFIndicator computes bounded money flow signal', () => {
    const indicator = new CMFIndicator();
    const highs = trendCandles(100, 90, 0.12);
    const lows = highs.map((h) => h - 2.2);
    const closes = highs.map((h, i) => h - (i % 3 === 0 ? 1.6 : 0.8));
    const volumes = Array.from({ length: 100 }, (_, i) => 5000 + i * 50);
    const out = indicator.calculate(highs, lows, closes, volumes, 20);

    expect(Number.isFinite(out.value)).toBe(true);
    expect(Number.isFinite(out.score)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
  });

  test('KlingerIndicator computes oscillator output', () => {
    const indicator = new KlingerIndicator();
    const highs = trendCandles(110, 260, 0.22);
    const lows = highs.map((h, i) => h - (1.8 + (i % 5) * 0.1));
    const closes = highs.map((h, i) => h - (i % 2 === 0 ? 0.7 : 1.1));
    const volumes = Array.from({ length: 110 }, (_, i) => 12000 + i * 70);
    const out = indicator.calculate(highs, lows, closes, volumes, 34, 55, 13);

    expect(Number.isFinite(out.value)).toBe(true);
    expect(Number.isFinite(out.score)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
  });

  test('StochasticRSIIndicator computes K/D based momentum signal', () => {
    const indicator = new StochasticRSIIndicator();
    const closes = trendCandles(120, 45, 0.12);
    const out = indicator.calculate(closes, 14, 14, 3, 3);

    expect(Number.isFinite(out.k)).toBe(true);
    expect(Number.isFinite(out.d)).toBe(true);
    expect(out.k).toBeGreaterThanOrEqual(0);
    expect(out.k).toBeLessThanOrEqual(100);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
  });

  test('CCIIndicator computes bounded CCI classification', () => {
    const indicator = new CCIIndicator();
    const highs = trendCandles(120, 90, 0.11);
    const lows = highs.map((h, i) => h - (1.5 + (i % 3) * 0.2));
    const closes = highs.map((h, i) => h - (i % 2 === 0 ? 0.8 : 1.1));
    const out = indicator.calculate(highs, lows, closes, 20);

    expect(Number.isFinite(out.value)).toBe(true);
    expect(Number.isFinite(out.score)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
  });

  test('VolumeRatioIndicator computes buy/sell pressure ratio', () => {
    const indicator = new VolumeRatioIndicator();
    const candles = Array.from({ length: 80 }, (_, i) => ({
      open: 100 + i * 0.05,
      close: 100 + i * 0.05 + (i % 2 === 0 ? 0.2 : -0.1),
      volume: 2000 + i * 20
    }));
    const out = indicator.calculate(candles, 30);

    expect(Number.isFinite(out.value)).toBe(true);
    expect(Number.isFinite(out.buyVolume)).toBe(true);
    expect(Number.isFinite(out.sellVolume)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
  });

  test('PumpAlertIndicator computes multi-condition momentum risk', () => {
    const indicator = new PumpAlertIndicator();
    const candles = Array.from({ length: 80 }, (_, i) => {
      const base = 100 + i * 0.2;
      return {
        timestamp: i,
        open: base,
        high: base + 1.2,
        low: base - 1.1,
        close: base + (i % 7 === 0 ? 1.5 : 0.3),
        volume: 1500 + i * 40
      };
    });
    const out = indicator.calculate(candles, 20, 14, 5);

    expect(Number.isFinite(out.value)).toBe(true);
    expect(Number.isFinite(out.score)).toBe(true);
    expect(Number.isFinite(out.conditionsMet)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(out.signal);
  });

  test('DOMAnalyzerIndicator computes imbalance only in live mode', () => {
    const indicator = new DOMAnalyzerIndicator();
    const snapshot = {
      bids: Array.from({ length: 10 }, (_, i) => ({ price: 100 - i * 0.1, size: 50 + i * 2 })),
      asks: Array.from({ length: 10 }, (_, i) => ({ price: 100 + i * 0.1, size: 30 + i }))
    };

    const liveOut = indicator.calculate(snapshot, 10, true);
    const nonLiveOut = indicator.calculate(snapshot, 10, false);

    expect(Number.isFinite(liveOut.imbalance)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(liveOut.signal);
    expect(nonLiveOut.signal).toBe('neutral');
  });
});
