/**
 * Signal Analysis Agent
 * 
 * Uses Claude AI to analyze trading signals and provide:
 * - Confluence pattern detection
 * - Anomaly detection (unusual indicator divergence)
 * - Enhanced confidence scoring
 * - Structured analysis with reasoning
 */

class SignalAnalysisAgent {
  constructor(claudeClient, config) {
    this.client = claudeClient;
    this.config = config;
  }

  /**
   * Analyze a trading signal
   * @param {Object} signalData - Signal data from SignalGeneratorV2
   * @param {string} signalData.symbol - Trading symbol
   * @param {number} signalData.score - Signal score (-110 to +110)
   * @param {Object} signalData.signals - Individual indicator signals
   * @param {Object} signalData.microstructure - Microstructure data
   * @param {number} signalData.confidence - Base confidence score
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeSignal(signalData) {
    try {
      const { symbol, score, signals, microstructure, confidence } = signalData;

      // Build analysis prompt
      const prompt = this._buildAnalysisPrompt(symbol, score, signals, microstructure, confidence);

      // Generate cache key
      const cacheKey = this._generateCacheKey(signalData);

      // Send to Claude
      const response = await this.client.sendMessage({
        system: this._getSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 1024,
        temperature: 0.2, // Lower temperature for consistent analysis
        cacheKey
      });

      // Parse response
      const analysis = this._parseResponse(response);

      return {
        success: true,
        analysis: analysis.analysis,
        confluenceScore: analysis.confluenceScore,
        anomalyDetected: analysis.anomalyDetected,
        confidenceAdjustment: analysis.confidenceAdjustment,
        reasoning: analysis.reasoning,
        timestamp: Date.now()
      };

    } catch (error) {
      this._log('error', 'Signal analysis failed', { error: error.message });
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Build the system prompt
   * @private
   */
  _getSystemPrompt() {
    return `You are an expert trading signal analyst specializing in cryptocurrency futures markets. Your role is to analyze technical indicators and provide objective, data-driven assessments.

Key responsibilities:
1. Evaluate confluence between multiple indicators
2. Detect anomalies or divergences that might signal false signals
3. Assess signal quality and adjust confidence scores
4. Provide clear, concise reasoning

Output format (JSON):
{
  "analysis": "Brief summary of signal quality",
  "confluenceScore": 0-100,
  "anomalyDetected": boolean,
  "confidenceAdjustment": -20 to +20,
  "reasoning": "Detailed explanation"
}

Guidelines:
- Be conservative with confidence adjustments (-20 to +20 only)
- Focus on indicator confluence and divergence
- Flag unusual patterns as anomalies
- Keep analysis concise and actionable`;
  }

  /**
   * Build the analysis prompt
   * @private
   */
  _buildAnalysisPrompt(symbol, score, signals, microstructure, confidence) {
    // Extract indicator signals
    const indicatorSummary = Object.entries(signals)
      .filter(([key]) => !['microstructure', 'timestamp'].includes(key))
      .map(([name, data]) => {
        if (!data || typeof data !== 'object') return null;
        return `${name}: ${data.signal || 'neutral'} (strength: ${data.strength || 'unknown'}, score: ${data.score || 0})`;
      })
      .filter(Boolean)
      .join('\n');

    // Extract microstructure if available
    let microSummary = 'Not available';
    if (microstructure && Object.keys(microstructure).length > 0) {
      microSummary = Object.entries(microstructure)
        .map(([name, data]) => {
          if (!data || typeof data !== 'object') return null;
          return `${name}: ${data.signal || 'neutral'} (score: ${data.score || 0})`;
        })
        .filter(Boolean)
        .join('\n');
    }

    return `Analyze this trading signal for ${symbol}:

Overall Signal Score: ${score} (range: -110 to +110)
Current Confidence: ${confidence}%

Indicator Signals:
${indicatorSummary}

Microstructure Analysis:
${microSummary}

Questions to answer:
1. How well do the indicators agree? (confluence)
2. Are there any unusual divergences or anomalies?
3. Should the confidence be adjusted? (max ±20)
4. What's the key reasoning?

Provide your analysis in JSON format.`;
  }

  /**
   * Parse Claude's response
   * @private
   */
  _parseResponse(response) {
    try {
      // Extract text content
      const content = response.content[0].text;

      // Try to parse as JSON
      // Claude might wrap JSON in markdown code blocks
      let jsonText = content;
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonText);

      // Validate and sanitize
      return {
        analysis: String(parsed.analysis || 'No analysis provided').substring(0, 500),
        confluenceScore: this._clamp(parsed.confluenceScore || 50, 0, 100),
        anomalyDetected: Boolean(parsed.anomalyDetected),
        confidenceAdjustment: this._clamp(parsed.confidenceAdjustment || 0, -20, 20),
        reasoning: String(parsed.reasoning || '').substring(0, 1000)
      };

    } catch (error) {
      this._log('warn', 'Failed to parse Claude response', { error: error.message });
      
      // Return safe defaults
      return {
        analysis: 'Analysis parsing failed',
        confluenceScore: 50,
        anomalyDetected: false,
        confidenceAdjustment: 0,
        reasoning: 'Unable to parse AI response'
      };
    }
  }

  /**
   * Generate cache key for request
   * @private
   */
  _generateCacheKey(signalData) {
    // Create a simple hash of the signal data
    const { symbol, score, signals } = signalData;
    const indicatorScores = Object.entries(signals)
      .filter(([key]) => !['microstructure', 'timestamp'].includes(key))
      .map(([name, data]) => `${name}:${data?.score || 0}`)
      .sort()
      .join(',');

    return `signal_analysis:${symbol}:${score}:${indicatorScores}`;
  }

  /**
   * Clamp a value between min and max
   * @private
   */
  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Logging utility
   * @private
   */
  _log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [SignalAnalysisAgent] [${level.toUpperCase()}] ${message}`, 
      Object.keys(meta).length > 0 ? meta : '');
  }
}

module.exports = SignalAnalysisAgent;
