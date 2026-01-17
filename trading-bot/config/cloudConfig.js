/**
 * Cloud Configuration - Claude AI Integration
 * 
 * All cloud features are disabled by default and must be explicitly enabled
 * via environment variables or configuration updates.
 */

module.exports = {
  // Master switch - controls all cloud features
  enabled: process.env.ENABLE_CLAUDE_CLOUD === 'true',
  
  // Individual feature flags
  features: {
    signalAnalysis: process.env.ENABLE_CLAUDE_SIGNAL_ANALYSIS === 'true',
    strategyOptimizer: process.env.ENABLE_CLAUDE_OPTIMIZER === 'true',
    riskIntelligence: process.env.ENABLE_CLAUDE_RISK_INTEL === 'true',
    nlInterface: process.env.ENABLE_CLAUDE_CHAT === 'true',
    decisionSupport: process.env.ENABLE_CLAUDE_DECISION_SUPPORT === 'true'
  },
  
  // Claude API configuration
  claude: {
    apiKey: process.env.CLAUDE_API_KEY || '',
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4096,
    temperature: 0.3,
    rateLimit: {
      requests: 45, // 45 req/min (safety margin below 50 req/min limit)
      window: 60000 // 1 minute in milliseconds
    },
    timeout: 30000, // 30 seconds
    retries: 3,
    retryDelay: 1000 // Initial retry delay in ms (exponential backoff)
  },
  
  // Response caching configuration
  cache: {
    enabled: true,
    ttl: 300000 // 5 minutes in milliseconds
  },
  
  // Cost and usage quotas
  quotas: {
    maxDailyRequests: 5000,
    maxCostPerDay: parseFloat(process.env.CLAUDE_MAX_DAILY_COST || '10.00') // USD
  },
  
  // Circuit breaker configuration
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5, // Number of consecutive failures before opening circuit
    resetTimeout: 60000 // Time before attempting to close circuit (1 minute)
  },
  
  // Logging configuration
  logging: {
    level: process.env.CLAUDE_LOG_LEVEL || 'info',
    logRequests: process.env.CLAUDE_LOG_REQUESTS === 'true',
    logResponses: process.env.CLAUDE_LOG_RESPONSES === 'true'
  }
};
