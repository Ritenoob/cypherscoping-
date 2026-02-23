export interface DOMLevel {
  price: number;
  size: number;
}

export interface DOMSnapshot {
  bids: DOMLevel[];
  asks: DOMLevel[];
}

export interface DOMAnalyzerResult {
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
  imbalance: number;
}

export class DOMAnalyzerIndicator {
  calculate(snapshot: DOMSnapshot | null, depth: number = 10, liveMode: boolean = false): DOMAnalyzerResult {
    if (!liveMode || !snapshot || !Array.isArray(snapshot.bids) || !Array.isArray(snapshot.asks)) {
      return { value: 0, signal: 'neutral', score: 0, imbalance: 0.5 };
    }

    const bids = snapshot.bids.slice(0, Math.max(1, depth));
    const asks = snapshot.asks.slice(0, Math.max(1, depth));
    const bidVolume = bids.reduce((sum, level) => sum + (Number.isFinite(level.size) ? level.size : 0), 0);
    const askVolume = asks.reduce((sum, level) => sum + (Number.isFinite(level.size) ? level.size : 0), 0);
    const total = bidVolume + askVolume;
    const imbalance = total > 0 ? bidVolume / total : 0.5;

    if (imbalance > 0.6) {
      return { value: imbalance, signal: 'bullish', score: 15, imbalance };
    }
    if (imbalance < 0.4) {
      return { value: imbalance, signal: 'bearish', score: -15, imbalance };
    }
    return { value: imbalance, signal: 'neutral', score: 0, imbalance };
  }
}
