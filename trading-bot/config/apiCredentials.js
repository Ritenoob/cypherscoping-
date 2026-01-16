/**
 * KuCoin API Credentials Manager
 * 
 * Handles secure loading of API credentials and signature generation
 * for authenticated KuCoin Futures API requests.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class APICredentials {
  constructor() {
    this.apiKey = null;
    this.apiSecret = null;
    this.passphrase = null;
    this.apiVersion = '2';
    this.isLoaded = false;
    
    this._loadCredentials();
  }

  _loadCredentials() {
    // Try loading from environment variables first
    if (process.env.KUCOIN_API_KEY) {
      this.apiKey = process.env.KUCOIN_API_KEY;
      this.apiSecret = process.env.KUCOIN_API_SECRET;
      this.passphrase = process.env.KUCOIN_API_PASSPHRASE;
      this.apiVersion = process.env.KUCOIN_API_VERSION || '2';
      this.isLoaded = true;
      console.log('[APICredentials] Loaded from environment variables');
      return;
    }

    // Try loading from .env file
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const envVars = this._parseEnvFile(envContent);
      
      this.apiKey = envVars.KUCOIN_API_KEY;
      this.apiSecret = envVars.KUCOIN_API_SECRET;
      this.passphrase = envVars.KUCOIN_API_PASSPHRASE;
      this.apiVersion = envVars.KUCOIN_API_VERSION || '2';
      this.isLoaded = true;
      console.log('[APICredentials] Loaded from .env file');
      return;
    }

    console.warn('[APICredentials] No credentials found - running in public-only mode');
  }

  _parseEnvFile(content) {
    const vars = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          vars[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
    
    return vars;
  }

  hasCredentials() {
    return this.isLoaded && this.apiKey && this.apiSecret && this.passphrase;
  }

  /**
   * Generate signature for authenticated API requests
   * @param {string} timestamp - Unix timestamp in milliseconds
   * @param {string} method - HTTP method (GET, POST, DELETE)
   * @param {string} endpoint - API endpoint path
   * @param {string} body - Request body (empty string for GET)
   * @returns {string} Base64 encoded HMAC-SHA256 signature
   */
  generateSignature(timestamp, method, endpoint, body = '') {
    if (!this.hasCredentials()) {
      throw new Error('API credentials not loaded');
    }

    const message = timestamp + method.toUpperCase() + endpoint + body;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(message)
      .digest('base64');
    
    return signature;
  }

  /**
   * Generate encrypted passphrase for API v2
   * @param {string} timestamp - Unix timestamp in milliseconds
   * @returns {string} Encrypted passphrase for v2, plain for v1
   */
  getPassphrase(timestamp) {
    if (!this.hasCredentials()) {
      throw new Error('API credentials not loaded');
    }

    if (this.apiVersion === '2') {
      return crypto
        .createHmac('sha256', this.apiSecret)
        .update(this.passphrase)
        .digest('base64');
    }
    
    return this.passphrase;
  }

  /**
   * Generate complete headers for authenticated request
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {string} body - Request body
   * @returns {object} Headers object for axios/fetch
   */
  getAuthHeaders(method, endpoint, body = '') {
    if (!this.hasCredentials()) {
      throw new Error('API credentials not loaded');
    }

    const timestamp = Date.now().toString();
    const signature = this.generateSignature(timestamp, method, endpoint, body);
    const passphrase = this.getPassphrase(timestamp);

    return {
      'KC-API-KEY': this.apiKey,
      'KC-API-SIGN': signature,
      'KC-API-TIMESTAMP': timestamp,
      'KC-API-PASSPHRASE': passphrase,
      'KC-API-KEY-VERSION': this.apiVersion,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Validate credentials by making a test API call
   * @returns {Promise<boolean>} True if credentials are valid
   */
  async validateCredentials() {
    if (!this.hasCredentials()) {
      return false;
    }

    const axios = require('axios');
    const endpoint = '/api/v1/account-overview';
    const headers = this.getAuthHeaders('GET', endpoint);

    try {
      const response = await axios.get(
        `https://api-futures.kucoin.com${endpoint}`,
        { headers }
      );
      
      if (response.data.code === '200000') {
        console.log('[APICredentials] Credentials validated successfully');
        return true;
      }
      
      console.error('[APICredentials] Validation failed:', response.data.msg);
      return false;
    } catch (error) {
      console.error('[APICredentials] Validation error:', error.message);
      return false;
    }
  }

  /**
   * Get masked credentials for logging
   * @returns {object} Credentials with masked values
   */
  getMaskedCredentials() {
    const mask = (str) => {
      if (!str) return 'not set';
      if (str.length <= 8) return '****';
      return str.substring(0, 4) + '****' + str.substring(str.length - 4);
    };

    return {
      apiKey: mask(this.apiKey),
      apiSecret: mask(this.apiSecret),
      passphrase: mask(this.passphrase),
      apiVersion: this.apiVersion,
      isLoaded: this.isLoaded
    };
  }
}

// Singleton instance
let instance = null;

function getCredentials() {
  if (!instance) {
    instance = new APICredentials();
  }
  return instance;
}

module.exports = { APICredentials, getCredentials };
