/**
 * KuCoin Futures API Client
 * 
 * Handles all authenticated API interactions with KuCoin Futures.
 * Supports account management, order placement, and position tracking.
 */

const axios = require('axios');
const { getCredentials } = require('./apiCredentials');

const BASE_URL = 'https://api-futures.kucoin.com';

class KuCoinFuturesClient {
  constructor() {
    this.credentials = getCredentials();
    this.rateLimiter = {
      lastRequest: 0,
      minInterval: 100 // ms between requests
    };
  }

  async _request(method, endpoint, data = null) {
    // Rate limiting
    const now = Date.now();
    const elapsed = now - this.rateLimiter.lastRequest;
    if (elapsed < this.rateLimiter.minInterval) {
      await new Promise(r => setTimeout(r, this.rateLimiter.minInterval - elapsed));
    }
    this.rateLimiter.lastRequest = Date.now();

    const body = data ? JSON.stringify(data) : '';
    const headers = this.credentials.getAuthHeaders(method, endpoint, body);

    try {
      const config = {
        method,
        url: `${BASE_URL}${endpoint}`,
        headers
      };

      if (data && (method === 'POST' || method === 'DELETE')) {
        config.data = data;
      }

      const response = await axios(config);
      
      if (response.data.code !== '200000') {
        throw new Error(`API Error: ${response.data.msg} (${response.data.code})`);
      }

      return response.data.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`API Error: ${error.response.data?.msg || error.message}`);
      }
      throw error;
    }
  }

  // ============================================
  // ACCOUNT ENDPOINTS
  // ============================================

  /**
   * Get account overview including balance and margin info
   * @param {string} currency - Currency code (default: USDT)
   */
  async getAccountOverview(currency = 'USDT') {
    return this._request('GET', `/api/v1/account-overview?currency=${currency}`);
  }

  /**
   * Get available balance for trading
   */
  async getAvailableBalance() {
    const overview = await this.getAccountOverview();
    return {
      availableBalance: parseFloat(overview.availableBalance),
      marginBalance: parseFloat(overview.marginBalance),
      positionMargin: parseFloat(overview.positionMargin),
      orderMargin: parseFloat(overview.orderMargin),
      frozenFunds: parseFloat(overview.frozenFunds),
      unrealisedPNL: parseFloat(overview.unrealisedPNL)
    };
  }

  // ============================================
  // POSITION ENDPOINTS
  // ============================================

  /**
   * Get current position for a symbol
   * @param {string} symbol - Trading symbol (e.g., BTCUSDTM)
   */
  async getPosition(symbol) {
    return this._request('GET', `/api/v1/position?symbol=${symbol}`);
  }

  /**
   * Get all open positions
   */
  async getAllPositions() {
    return this._request('GET', '/api/v1/positions');
  }

  /**
   * Change leverage for a symbol
   * @param {string} symbol - Trading symbol
   * @param {number} leverage - New leverage value
   */
  async setLeverage(symbol, leverage) {
    return this._request('POST', '/api/v1/position/margin/auto-deposit-status', {
      symbol,
      leverage: leverage.toString()
    });
  }

  // ============================================
  // ORDER ENDPOINTS
  // ============================================

  /**
   * Place a market order
   * @param {object} params - Order parameters
   */
  async placeMarketOrder(params) {
    const {
      symbol,
      side,        // 'buy' or 'sell'
      size,        // Number of contracts
      leverage,    // Optional: set leverage
      clientOid,   // Optional: client order ID
      reduceOnly,  // Optional: reduce only flag
      stopPrice,   // Optional: stop trigger price
      stopPriceType // Optional: 'TP' (trade price), 'IP' (index price), 'MP' (mark price)
    } = params;

    const orderData = {
      clientOid: clientOid || `bot_${Date.now()}`,
      symbol,
      side,
      type: 'market',
      size: size.toString(),
      leverage: leverage ? leverage.toString() : undefined,
      reduceOnly: reduceOnly || false
    };

    if (stopPrice) {
      orderData.stop = side === 'buy' ? 'up' : 'down';
      orderData.stopPrice = stopPrice.toString();
      orderData.stopPriceType = stopPriceType || 'TP';
    }

    // Remove undefined fields
    Object.keys(orderData).forEach(key => 
      orderData[key] === undefined && delete orderData[key]
    );

    return this._request('POST', '/api/v1/orders', orderData);
  }

  /**
   * Place a limit order
   * @param {object} params - Order parameters
   */
  async placeLimitOrder(params) {
    const {
      symbol,
      side,
      price,
      size,
      leverage,
      clientOid,
      postOnly,
      hidden,
      timeInForce, // 'GTC', 'IOC'
      reduceOnly
    } = params;

    const orderData = {
      clientOid: clientOid || `bot_${Date.now()}`,
      symbol,
      side,
      type: 'limit',
      price: price.toString(),
      size: size.toString(),
      leverage: leverage ? leverage.toString() : undefined,
      postOnly: postOnly || false,
      hidden: hidden || false,
      timeInForce: timeInForce || 'GTC',
      reduceOnly: reduceOnly || false
    };

    Object.keys(orderData).forEach(key => 
      orderData[key] === undefined && delete orderData[key]
    );

    return this._request('POST', '/api/v1/orders', orderData);
  }

  /**
   * Place a stop order (stop loss or take profit)
   * @param {object} params - Stop order parameters
   */
  async placeStopOrder(params) {
    const {
      symbol,
      side,
      size,
      stopPrice,
      stopPriceType, // 'TP', 'IP', 'MP'
      type,          // 'market' or 'limit'
      price,         // Required for limit orders
      clientOid,
      reduceOnly
    } = params;

    const orderData = {
      clientOid: clientOid || `stop_${Date.now()}`,
      symbol,
      side,
      type: type || 'market',
      size: size.toString(),
      stop: side === 'buy' ? 'up' : 'down',
      stopPrice: stopPrice.toString(),
      stopPriceType: stopPriceType || 'TP',
      reduceOnly: reduceOnly !== false
    };

    if (type === 'limit' && price) {
      orderData.price = price.toString();
    }

    return this._request('POST', '/api/v1/orders', orderData);
  }

  /**
   * Cancel an order by ID
   * @param {string} orderId - Order ID to cancel
   */
  async cancelOrder(orderId) {
    return this._request('DELETE', `/api/v1/orders/${orderId}`);
  }

  /**
   * Cancel all open orders for a symbol
   * @param {string} symbol - Trading symbol
   */
  async cancelAllOrders(symbol = null) {
    const endpoint = symbol 
      ? `/api/v1/orders?symbol=${symbol}`
      : '/api/v1/orders';
    return this._request('DELETE', endpoint);
  }

  /**
   * Get order details by ID
   * @param {string} orderId - Order ID
   */
  async getOrder(orderId) {
    return this._request('GET', `/api/v1/orders/${orderId}`);
  }

  /**
   * Get list of active orders
   * @param {string} symbol - Optional: filter by symbol
   */
  async getActiveOrders(symbol = null) {
    const endpoint = symbol
      ? `/api/v1/orders?status=active&symbol=${symbol}`
      : '/api/v1/orders?status=active';
    return this._request('GET', endpoint);
  }

  /**
   * Get list of completed orders
   * @param {string} symbol - Optional: filter by symbol
   */
  async getCompletedOrders(symbol = null) {
    const endpoint = symbol
      ? `/api/v1/orders?status=done&symbol=${symbol}`
      : '/api/v1/orders?status=done';
    return this._request('GET', endpoint);
  }

  // ============================================
  // TRADE EXECUTION HELPERS
  // ============================================

  /**
   * Open a long position with stop loss and take profit
   * @param {object} params - Trade parameters
   */
  async openLong(params) {
    const {
      symbol,
      size,
      leverage,
      stopLossPrice,
      takeProfitPrice
    } = params;

    // Place entry order
    const entryOrder = await this.placeMarketOrder({
      symbol,
      side: 'buy',
      size,
      leverage
    });

    const orders = { entry: entryOrder };

    // Place stop loss if provided
    if (stopLossPrice) {
      orders.stopLoss = await this.placeStopOrder({
        symbol,
        side: 'sell',
        size,
        stopPrice: stopLossPrice,
        reduceOnly: true
      });
    }

    // Place take profit if provided
    if (takeProfitPrice) {
      orders.takeProfit = await this.placeStopOrder({
        symbol,
        side: 'sell',
        size,
        stopPrice: takeProfitPrice,
        reduceOnly: true
      });
    }

    return orders;
  }

  /**
   * Open a short position with stop loss and take profit
   * @param {object} params - Trade parameters
   */
  async openShort(params) {
    const {
      symbol,
      size,
      leverage,
      stopLossPrice,
      takeProfitPrice
    } = params;

    // Place entry order
    const entryOrder = await this.placeMarketOrder({
      symbol,
      side: 'sell',
      size,
      leverage
    });

    const orders = { entry: entryOrder };

    // Place stop loss if provided
    if (stopLossPrice) {
      orders.stopLoss = await this.placeStopOrder({
        symbol,
        side: 'buy',
        size,
        stopPrice: stopLossPrice,
        reduceOnly: true
      });
    }

    // Place take profit if provided
    if (takeProfitPrice) {
      orders.takeProfit = await this.placeStopOrder({
        symbol,
        side: 'buy',
        size,
        stopPrice: takeProfitPrice,
        reduceOnly: true
      });
    }

    return orders;
  }

  /**
   * Close an existing position
   * @param {string} symbol - Trading symbol
   */
  async closePosition(symbol) {
    const position = await this.getPosition(symbol);
    
    if (!position || position.currentQty === 0) {
      return { message: 'No position to close' };
    }

    const side = position.currentQty > 0 ? 'sell' : 'buy';
    const size = Math.abs(position.currentQty);

    return this.placeMarketOrder({
      symbol,
      side,
      size,
      reduceOnly: true
    });
  }

  // ============================================
  // MARKET DATA (PUBLIC)
  // ============================================

  /**
   * Get contract details
   * @param {string} symbol - Trading symbol
   */
  async getContractDetails(symbol) {
    const response = await axios.get(`${BASE_URL}/api/v1/contracts/${symbol}`);
    if (response.data.code === '200000') {
      return response.data.data;
    }
    throw new Error(`Failed to get contract: ${response.data.msg}`);
  }

  /**
   * Get current ticker
   * @param {string} symbol - Trading symbol
   */
  async getTicker(symbol) {
    const response = await axios.get(`${BASE_URL}/api/v1/ticker?symbol=${symbol}`);
    if (response.data.code === '200000') {
      return response.data.data;
    }
    throw new Error(`Failed to get ticker: ${response.data.msg}`);
  }

  /**
   * Get current funding rate
   * @param {string} symbol - Trading symbol
   */
  async getFundingRate(symbol) {
    const response = await axios.get(`${BASE_URL}/api/v1/funding-rate/${symbol}/current`);
    if (response.data.code === '200000') {
      return response.data.data;
    }
    throw new Error(`Failed to get funding rate: ${response.data.msg}`);
  }
}

// Singleton instance
let clientInstance = null;

function getClient() {
  if (!clientInstance) {
    clientInstance = new KuCoinFuturesClient();
  }
  return clientInstance;
}

module.exports = { KuCoinFuturesClient, getClient };
