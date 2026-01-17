/**
 * Decision Support System
 * 
 * Provides AI-powered pre-trade validation and decision support:
 * - Pre-trade validation with AI analysis
 * - Exit timing optimization
 * - Multi-factor confluence detection
 * - Reasoning explanations
 */

class DecisionSupportSystem {
  constructor(claudeClient, config) {
    this.client = claudeClient;
    this.config = config;
  }

  /**
   * Validate a trade decision before execution
   * @param {Object} tradeDecision - Proposed trade
   * @param {Object} signalData - Signal that triggered the trade
   * @param {Object} marketContext - Current market conditions
   * @returns {Promise<Object>} Validation result
   */
  async validateTrade(tradeDecision, signalData, marketContext) {
    try {
      const prompt = this._buildValidationPrompt(tradeDecision, signalData, marketContext);

      const response = await this.client.sendMessage({
        system: this._getSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 1536,
        temperature: 0.2
      });

      const analysis = this._parseResponse(response);

      return {
        success: true,
        validated: analysis.validated,
        confidence: analysis.confidence,
        concerns: analysis.concerns,
        recommendations: analysis.recommendations,
        reasoning: analysis.reasoning,
        timestamp: Date.now()
      };

    } catch (error) {
      this._log('error', 'Trade validation failed', { error: error.message });
      return {
        success: false,
        validated: true, // Default to allowing trade on error
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Suggest optimal exit timing
   * @param {Object} position - Open position
   * @param {Object} currentSignals - Current market signals
   * @param {Object} performance - Position performance
   * @returns {Promise<Object>} Exit suggestion
   */
  async suggestExit(position, currentSignals, performance) {
    try {
      const prompt = this._buildExitPrompt(position, currentSignals, performance);

      const response = await this.client.sendMessage({
        system: this._getSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 1024,
        temperature: 0.2
      });

      const analysis = this._parseResponse(response);

      return {
        success: true,
        action: analysis.action,
        urgency: analysis.urgency,
        reasoning: analysis.reasoning,
        targetPrice: analysis.targetPrice,
        timestamp: Date.now()
      };

    } catch (error) {
      this._log('error', 'Exit suggestion failed', { error: error.message });
      return {
        success: false,
        action: 'hold',
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
    return `You are an expert trading decision support system for cryptocurrency futures markets. Your role is to validate trade decisions and provide exit recommendations.

For trade validation, output JSON:
{
  "validated": boolean,
  "confidence": 0-100,
  "concerns": ["List of concerns"],
  "recommendations": ["List of suggestions"],
  "reasoning": "Detailed explanation"
}

For exit suggestions, output JSON:
{
  "action": "exit_now|hold|monitor_closely",
  "urgency": "high|medium|low",
  "reasoning": "Detailed explanation",
  "targetPrice": number or null
}

Guidelines:
- Be objective and data-driven
- Consider risk/reward carefully
- Flag conflicting signals
- Suggest protective stops when needed
- Provide clear reasoning`;
  }

  /**
   * Build the validation prompt
   * @private
   */
  _buildValidationPrompt(tradeDecision, signalData, marketContext) {
    const tradeSummary = `
Symbol: ${tradeDecision.symbol}
Side: ${tradeDecision.side}
Size: ${tradeDecision.size}
Entry Price: ${tradeDecision.entryPrice || 'Market'}
Stop Loss: ${tradeDecision.stopLoss || 'N/A'}
Take Profit: ${tradeDecision.takeProfit || 'N/A'}
`;

    const signalSummary = `
Signal Score: ${signalData.score}
Confidence: ${signalData.confidence}%
Indicators Agreeing: ${signalData.indicatorsAgreeing || 'N/A'}
Has Divergence: ${signalData.divergenceCount > 0 ? 'Yes' : 'No'}
Meets Entry Requirements: ${signalData.meetsEntryRequirements ? 'Yes' : 'No'}
`;

    const marketSummary = `
Volatility: ${((marketContext.volatility || 0) * 100).toFixed(2)}%
Volume: ${marketContext.volume || 'N/A'}
Trend: ${marketContext.trend || 'N/A'}
ADX: ${marketContext.adx || 'N/A'}
`;

    return `Validate this trade decision:

Trade Details:
${tradeSummary}

Signal Analysis:
${signalSummary}

Market Context:
${marketSummary}

Questions to answer:
1. Should this trade be executed? (validated: true/false)
2. What's your confidence level? (0-100)
3. What concerns do you have?
4. Any recommendations to improve the trade?
5. What's the key reasoning?

Provide your analysis in JSON format.`;
  }

  /**
   * Build the exit prompt
   * @private
   */
  _buildExitPrompt(position, currentSignals, performance) {
    const posSummary = `
Symbol: ${position.symbol}
Side: ${position.side}
Size: ${position.size}
Entry Price: $${position.entryPrice}
Current Price: $${position.currentPrice || 'N/A'}
Duration: ${position.duration || 'N/A'} minutes
`;

    const perfSummary = `
Unrealized PnL: $${performance.pnl?.toFixed(2) || '0.00'}
Return: ${((performance.return || 0) * 100).toFixed(2)}%
Max Profit: ${((performance.maxProfit || 0) * 100).toFixed(2)}%
Max Drawdown: ${((performance.maxDrawdown || 0) * 100).toFixed(2)}%
`;

    const signalSummary = `
Current Signal Score: ${currentSignals.score || 'N/A'}
Signal Direction: ${currentSignals.type || 'N/A'}
Trend Changed: ${currentSignals.trendChanged ? 'Yes' : 'No'}
`;

    return `Suggest exit timing for this position:

Position:
${posSummary}

Performance:
${perfSummary}

Current Signals:
${signalSummary}

Should we:
- exit_now: Close the position immediately
- hold: Keep the position open
- monitor_closely: Watch for exit signals

Provide your recommendation in JSON format with action, urgency, reasoning, and targetPrice.`;
  }

  /**
   * Parse Claude's response
   * @private
   */
  _parseResponse(response) {
    try {
      const content = response.content[0].text;

      let jsonText = content;
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonText);

      // Validation response
      if ('validated' in parsed) {
        return {
          validated: Boolean(parsed.validated),
          confidence: this._clamp(parsed.confidence || 50, 0, 100),
          concerns: Array.isArray(parsed.concerns) ? 
            parsed.concerns.slice(0, 5).map(c => String(c).substring(0, 200)) : [],
          recommendations: Array.isArray(parsed.recommendations) ? 
            parsed.recommendations.slice(0, 5).map(r => String(r).substring(0, 200)) : [],
          reasoning: String(parsed.reasoning || '').substring(0, 1000)
        };
      }

      // Exit suggestion response
      if ('action' in parsed) {
        return {
          action: ['exit_now', 'hold', 'monitor_closely'].includes(parsed.action) ? 
            parsed.action : 'hold',
          urgency: ['high', 'medium', 'low'].includes(parsed.urgency) ? 
            parsed.urgency : 'low',
          reasoning: String(parsed.reasoning || '').substring(0, 1000),
          targetPrice: parsed.targetPrice || null
        };
      }

      throw new Error('Unexpected response format');

    } catch (error) {
      this._log('warn', 'Failed to parse Claude response', { error: error.message });
      
      // Safe defaults
      return {
        validated: true,
        confidence: 50,
        concerns: [],
        recommendations: [],
        reasoning: 'Unable to parse AI response',
        action: 'hold',
        urgency: 'low'
      };
    }
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
    console.log(`[${timestamp}] [DecisionSupport] [${level.toUpperCase()}] ${message}`, 
      Object.keys(meta).length > 0 ? meta : '');
  }
}

module.exports = DecisionSupportSystem;
