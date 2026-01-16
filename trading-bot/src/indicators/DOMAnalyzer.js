/**
 * Depth of Market (DOM) Analyzer - LIVE TRADING ONLY
 * 
 * ⚠️ CRITICAL: This indicator is for LIVE trading validation ONLY
 *    NEVER claim backtest-optimized results for DOM signals
 *    DOM data is not available in historical backtests
 * 
 * Signals: Imbalance, Wall Detection, Microprice Bias
 */

class DOMAnalyzer {
  constructor(config = {}) {
    this.depthLevels = config.depthLevels || [5, 10, 25];
    this.imbalanceThresholdLong = config.imbalanceThresholdLong || 0.60;
    this.imbalanceThresholdShort = config.imbalanceThresholdShort || 0.40;
    this.spreadMaxPercent = config.spreadMaxPercent || 0.05;
    this.wallDetectionEnabled = config.wallDetectionEnabled || false;
    this.micropriceBias = config.micropriceBias !== false;
    
    // CRITICAL FLAG
    this.liveOnlyValidation = true;
    this.isLiveMode = false;
    
    this.lastOrderBook = null;
    this.imbalanceHistory = [];
    this.maxHistory = config.historyLength || 50;
  }

  /**
   * MUST call this to enable DOM signals
   * Without this, DOM returns no signals (safe for backtests)
   */
  enableLiveMode() {
    this.isLiveMode = true;
    console.log('[DOM] Live mode enabled - DOM signals active');
  }

  disableLiveMode() {
    this.isLiveMode = false;
    console.log('[DOM] Live mode disabled - DOM signals inactive');
  }

  update(orderBook) {
    if (!this.isLiveMode) {
      return this.getResult(); // Return empty signals if not live
    }
    
    if (!orderBook || !orderBook.bids || !orderBook.asks) {
      return this.getResult();
    }
    
    this.lastOrderBook = orderBook;
    
    // Calculate imbalance at each depth level
    const imbalances = this.depthLevels.map(level => {
      return this.calculateImbalance(orderBook, level);
    });
    
    const avgImbalance = imbalances.reduce((a, b) => a + b, 0) / imbalances.length;
    
    this.imbalanceHistory.push(avgImbalance);
    if (this.imbalanceHistory.length > this.maxHistory) {
      this.imbalanceHistory.shift();
    }
    
    return this.getResult();
  }

  calculateImbalance(orderBook, levels) {
    const bids = orderBook.bids.slice(0, levels);
    const asks = orderBook.asks.slice(0, levels);
    
    // Handle both array format [price, size] and object format { price, size }
    const bidVolume = bids.reduce((sum, item) => {
      const size = Array.isArray(item) ? parseFloat(item[1]) : parseFloat(item.size);
      return sum + (isNaN(size) ? 0 : size);
    }, 0);
    
    const askVolume = asks.reduce((sum, item) => {
      const size = Array.isArray(item) ? parseFloat(item[1]) : parseFloat(item.size);
      return sum + (isNaN(size) ? 0 : size);
    }, 0);
    
    const totalVolume = bidVolume + askVolume;
    
    return totalVolume > 0 ? bidVolume / totalVolume : 0.5;
  }

  getImbalanceSignal() {
    if (!this.isLiveMode || this.imbalanceHistory.length < 5) return null;
    
    const currentImbalance = this.imbalanceHistory[this.imbalanceHistory.length - 1];
    
    // Strong bid imbalance (bullish)
    if (currentImbalance > this.imbalanceThresholdLong) {
      return {
        type: 'bullish_dom_imbalance',
        direction: 'bullish',
        strength: currentImbalance > 0.70 ? 'strong' : 'moderate',
        message: `DOM bid imbalance: ${(currentImbalance * 100).toFixed(1)}% bid volume`,
        metadata: { imbalance: currentImbalance, liveOnly: true }
      };
    }
    
    // Strong ask imbalance (bearish)
    if (currentImbalance < this.imbalanceThresholdShort) {
      return {
        type: 'bearish_dom_imbalance',
        direction: 'bearish',
        strength: currentImbalance < 0.30 ? 'strong' : 'moderate',
        message: `DOM ask imbalance: ${((1 - currentImbalance) * 100).toFixed(1)}% ask volume`,
        metadata: { imbalance: currentImbalance, liveOnly: true }
      };
    }
    
    return null;
  }

  getWallSignal() {
    if (!this.isLiveMode || !this.wallDetectionEnabled || !this.lastOrderBook) {
      return null;
    }
    
    // Wall detection logic
    const bids = this.lastOrderBook.bids.slice(0, 25);
    const asks = this.lastOrderBook.asks.slice(0, 25);
    
    // Helper to get size from either format
    const getSize = (item) => Array.isArray(item) ? parseFloat(item[1]) : parseFloat(item.size);
    const getPrice = (item) => Array.isArray(item) ? parseFloat(item[0]) : parseFloat(item.price);
    
    // Calculate average size
    const avgBidSize = bids.reduce((s, item) => s + getSize(item), 0) / bids.length;
    const avgAskSize = asks.reduce((s, item) => s + getSize(item), 0) / asks.length;
    
    // Look for walls (orders >5x average)
    const bidWalls = bids.filter(item => getSize(item) > avgBidSize * 5);
    const askWalls = asks.filter(item => getSize(item) > avgAskSize * 5);
    
    if (bidWalls.length > 0 && askWalls.length === 0) {
      return {
        type: 'bid_wall_support',
        direction: 'bullish',
        strength: 'moderate',
        message: `Bid wall detected at ${getPrice(bidWalls[0])}`,
        metadata: { wall: bidWalls[0], liveOnly: true }
      };
    }
    
    if (askWalls.length > 0 && bidWalls.length === 0) {
      return {
        type: 'ask_wall_resistance',
        direction: 'bearish',
        strength: 'moderate',
        message: `Ask wall detected at ${getPrice(askWalls[0])}`,
        metadata: { wall: askWalls[0], liveOnly: true }
      };
    }
    
    return null;
  }

  getMicropriceSignal() {
    if (!this.isLiveMode || !this.micropriceBias || !this.lastOrderBook) {
      return null;
    }
    
    if (!this.lastOrderBook.bids[0] || !this.lastOrderBook.asks[0]) {
      return null;
    }
    
    // Helper to get price/size from either format
    const getPrice = (item) => Array.isArray(item) ? parseFloat(item[0]) : parseFloat(item.price);
    const getSize = (item) => Array.isArray(item) ? parseFloat(item[1]) : parseFloat(item.size);
    
    const bestBid = getPrice(this.lastOrderBook.bids[0]);
    const bestAsk = getPrice(this.lastOrderBook.asks[0]);
    const bidSize = getSize(this.lastOrderBook.bids[0]);
    const askSize = getSize(this.lastOrderBook.asks[0]);
    
    // Microprice calculation
    const microprice = (bestBid * askSize + bestAsk * bidSize) / (bidSize + askSize);
    const midprice = (bestBid + bestAsk) / 2;
    const bias = (microprice - midprice) / midprice * 10000; // in basis points
    
    if (bias > 2) {
      return {
        type: 'bullish_microprice',
        direction: 'bullish',
        strength: 'weak',
        message: `Microprice bias: +${bias.toFixed(1)} bps`,
        metadata: { microprice, midprice, bias, liveOnly: true }
      };
    }
    
    if (bias < -2) {
      return {
        type: 'bearish_microprice',
        direction: 'bearish',
        strength: 'weak',
        message: `Microprice bias: ${bias.toFixed(1)} bps`,
        metadata: { microprice, midprice, bias, liveOnly: true }
      };
    }
    
    return null;
  }

  getSignals() {
    if (!this.isLiveMode) {
      return []; // No signals in backtest mode
    }
    
    const signals = [];
    
    const imbalance = this.getImbalanceSignal();
    if (imbalance) signals.push(imbalance);
    
    const wall = this.getWallSignal();
    if (wall) signals.push(wall);
    
    const microprice = this.getMicropriceSignal();
    if (microprice) signals.push(microprice);
    
    return signals;
  }

  getResult() {
    const imbalance = this.imbalanceHistory.length > 0 
      ? this.imbalanceHistory[this.imbalanceHistory.length - 1] 
      : null;
    
    // Calculate volumes if we have orderbook data
    let bidVolume = 0;
    let askVolume = 0;
    
    if (this.lastOrderBook) {
      const getSize = (item) => Array.isArray(item) ? parseFloat(item[1]) : parseFloat(item.size);
      bidVolume = this.lastOrderBook.bids.slice(0, 10).reduce((s, item) => s + getSize(item), 0);
      askVolume = this.lastOrderBook.asks.slice(0, 10).reduce((s, item) => s + getSize(item), 0);
    }
    
    return {
      value: {
        imbalance,
        bidVolume,
        askVolume,
        totalBidVolume: bidVolume,
        totalAskVolume: askVolume,
        isLive: this.isLiveMode
      },
      signals: this.getSignals(),
      warning: this.isLiveMode ? null : 'DOM signals disabled (not live mode)'
    };
  }

  reset() {
    this.lastOrderBook = null;
    this.imbalanceHistory = [];
  }
}

module.exports = DOMAnalyzer;
