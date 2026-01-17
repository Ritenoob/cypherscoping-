/**
 * Claude API Client
 * 
 * Provides a robust interface to the Anthropic Claude API with:
 * - Rate limiting and quota management
 * - Retry logic with exponential backoff
 * - Response caching
 * - Token usage tracking
 * - Error handling and circuit breaker pattern
 */

const Anthropic = require('@anthropic-ai/sdk');
const NodeCache = require('node-cache');

class ClaudeClient {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.cache = null;
    
    // Rate limiting state
    this.requestQueue = [];
    this.requestTimestamps = [];
    
    // Circuit breaker state
    this.circuitState = 'closed'; // closed, open, half-open
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    
    // Usage tracking
    this.usage = {
      requestsToday: 0,
      costToday: 0,
      lastReset: Date.now()
    };
    
    this.initialized = false;
  }

  /**
   * Initialize the Claude client
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    if (!this.config.claude.apiKey) {
      throw new Error('Claude API key is required but not provided');
    }

    try {
      this.client = new Anthropic({
        apiKey: this.config.claude.apiKey,
        timeout: this.config.claude.timeout
      });

      // Initialize cache if enabled
      if (this.config.cache.enabled) {
        this.cache = new NodeCache({
          stdTTL: this.config.cache.ttl / 1000, // Convert ms to seconds
          checkperiod: 120
        });
      }

      this.initialized = true;
      this._log('info', 'Claude client initialized successfully');
    } catch (error) {
      this._log('error', 'Failed to initialize Claude client', { error: error.message });
      throw error;
    }
  }

  /**
   * Send a message to Claude
   * @param {Object} options - Message options
   * @param {string} options.system - System prompt
   * @param {Array} options.messages - Message history
   * @param {number} options.maxTokens - Max tokens to generate
   * @param {number} options.temperature - Sampling temperature
   * @param {boolean} options.stream - Whether to stream the response
   * @param {string} options.cacheKey - Optional cache key
   * @returns {Promise<Object>} Claude response
   */
  async sendMessage(options) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check circuit breaker
    if (!this._checkCircuitBreaker()) {
      throw new Error('Circuit breaker is open - too many consecutive failures');
    }

    // Check quotas
    this._checkQuotas();

    // Check cache if enabled and cache key provided
    if (this.cache && options.cacheKey) {
      const cached = this.cache.get(options.cacheKey);
      if (cached) {
        this._log('debug', 'Cache hit', { cacheKey: options.cacheKey });
        return cached;
      }
    }

    // Rate limiting
    await this._rateLimit();

    const {
      system = '',
      messages,
      maxTokens = this.config.claude.maxTokens,
      temperature = this.config.claude.temperature,
      stream = false
    } = options;

    let attempt = 0;
    let lastError = null;

    while (attempt < this.config.claude.retries) {
      try {
        this._log('debug', 'Sending request to Claude', { attempt: attempt + 1 });

        const response = await this.client.messages.create({
          model: this.config.claude.model,
          max_tokens: maxTokens,
          temperature,
          system,
          messages,
          stream
        });

        // Track usage
        this._trackUsage(response);

        // Reset circuit breaker on success
        this.consecutiveFailures = 0;
        this.circuitState = 'closed';

        // Cache response if enabled
        if (this.cache && options.cacheKey) {
          this.cache.set(options.cacheKey, response);
        }

        this._log('debug', 'Request successful', {
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens
        });

        return response;

      } catch (error) {
        lastError = error;
        attempt++;

        this._log('warn', 'Request failed', {
          attempt,
          error: error.message,
          statusCode: error.status
        });

        // Don't retry on certain errors
        if (this._isNonRetryableError(error)) {
          this._recordFailure();
          throw error;
        }

        // Exponential backoff
        if (attempt < this.config.claude.retries) {
          const delay = this.config.claude.retryDelay * Math.pow(2, attempt - 1);
          await this._sleep(delay);
        }
      }
    }

    // All retries failed
    this._recordFailure();
    throw new Error(`Failed after ${this.config.claude.retries} attempts: ${lastError.message}`);
  }

  /**
   * Send a streaming message to Claude
   * @param {Object} options - Message options
   * @returns {Promise<AsyncGenerator>} Stream of response chunks
   */
  async streamMessage(options) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check circuit breaker
    if (!this._checkCircuitBreaker()) {
      throw new Error('Circuit breaker is open - too many consecutive failures');
    }

    // Check quotas
    this._checkQuotas();

    // Rate limiting
    await this._rateLimit();

    const {
      system = '',
      messages,
      maxTokens = this.config.claude.maxTokens,
      temperature = this.config.claude.temperature
    } = options;

    try {
      const stream = await this.client.messages.create({
        model: this.config.claude.model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages,
        stream: true
      });

      // Reset circuit breaker on success
      this.consecutiveFailures = 0;
      this.circuitState = 'closed';

      return stream;

    } catch (error) {
      this._recordFailure();
      this._log('error', 'Streaming request failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get current usage statistics
   * @returns {Object} Usage stats
   */
  getUsage() {
    this._resetDailyUsageIfNeeded();
    return { ...this.usage };
  }

  /**
   * Clear the cache
   */
  clearCache() {
    if (this.cache) {
      this.cache.flushAll();
      this._log('info', 'Cache cleared');
    }
  }

  /**
   * Check if client is healthy
   * @returns {boolean} Health status
   */
  isHealthy() {
    return this.initialized && this.circuitState !== 'open';
  }

  /**
   * Rate limiting implementation
   * @private
   */
  async _rateLimit() {
    const now = Date.now();
    const windowStart = now - this.config.claude.rateLimit.window;

    // Remove old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart);

    // Check if we're at the limit
    if (this.requestTimestamps.length >= this.config.claude.rateLimit.requests) {
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = oldestRequest + this.config.claude.rateLimit.window - now;
      
      if (waitTime > 0) {
        this._log('debug', 'Rate limit reached, waiting', { waitTime });
        await this._sleep(waitTime);
      }
    }

    // Add current timestamp
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Check quotas
   * @private
   */
  _checkQuotas() {
    this._resetDailyUsageIfNeeded();

    if (this.usage.requestsToday >= this.config.quotas.maxDailyRequests) {
      throw new Error(`Daily request quota exceeded: ${this.config.quotas.maxDailyRequests}`);
    }

    if (this.usage.costToday >= this.config.quotas.maxCostPerDay) {
      throw new Error(`Daily cost quota exceeded: $${this.config.quotas.maxCostPerDay}`);
    }
  }

  /**
   * Track usage from response
   * @private
   */
  _trackUsage(response) {
    this.usage.requestsToday++;

    if (response.usage) {
      // Approximate cost calculation (Claude Sonnet 3.5 pricing as of 2024)
      // Input: $3 per million tokens, Output: $15 per million tokens
      const inputCost = (response.usage.input_tokens / 1000000) * 3;
      const outputCost = (response.usage.output_tokens / 1000000) * 15;
      this.usage.costToday += inputCost + outputCost;
    }
  }

  /**
   * Reset daily usage if needed
   * @private
   */
  _resetDailyUsageIfNeeded() {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    if (now - this.usage.lastReset > dayInMs) {
      this.usage = {
        requestsToday: 0,
        costToday: 0,
        lastReset: now
      };
      this._log('info', 'Daily usage reset');
    }
  }

  /**
   * Check circuit breaker state
   * @private
   */
  _checkCircuitBreaker() {
    if (!this.config.circuitBreaker.enabled) {
      return true;
    }

    const now = Date.now();

    if (this.circuitState === 'open') {
      // Check if we should try again
      if (now - this.lastFailureTime > this.config.circuitBreaker.resetTimeout) {
        this.circuitState = 'half-open';
        this._log('info', 'Circuit breaker entering half-open state');
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Record a failure
   * @private
   */
  _recordFailure() {
    if (!this.config.circuitBreaker.enabled) {
      return;
    }

    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.consecutiveFailures >= this.config.circuitBreaker.failureThreshold) {
      this.circuitState = 'open';
      this._log('error', 'Circuit breaker opened', {
        consecutiveFailures: this.consecutiveFailures
      });
    }
  }

  /**
   * Check if error is non-retryable
   * @private
   */
  _isNonRetryableError(error) {
    // Don't retry on authentication, permission, or invalid request errors
    if (error.status) {
      return error.status === 401 || error.status === 403 || error.status === 400;
    }
    return false;
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Logging utility
   * @private
   */
  _log(level, message, meta = {}) {
    if (this.config.logging.level === 'debug' || level !== 'debug') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [ClaudeClient] [${level.toUpperCase()}] ${message}`, 
        Object.keys(meta).length > 0 ? meta : '');
    }
  }
}

module.exports = ClaudeClient;
