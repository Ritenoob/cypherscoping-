/**
 * Strategy Optimizer Agent
 * 
 * Uses Claude AI to:
 * - Evaluate current strategy performance
 * - Suggest indicator weight adjustments
 * - Identify market regime changes
 * - Generate optimization recommendations
 */

class StrategyOptimizerAgent {
  constructor(claudeClient, config) {
    this.client = claudeClient;
    this.config = config;
  }

  /**
   * Analyze strategy performance and suggest optimizations
   * @param {Object} performanceData - Strategy performance metrics
   * @param {Object} currentWeights - Current indicator weights
   * @param {Array} recentTrades - Recent trade history
   * @returns {Promise<Object>} Optimization recommendations
   */
  async optimizeStrategy(performanceData, currentWeights, recentTrades) {
    try {
      const prompt = this._buildOptimizationPrompt(performanceData, currentWeights, recentTrades);

      const response = await this.client.sendMessage({
        system: this._getSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 2048,
        temperature: 0.3
      });

      const analysis = this._parseResponse(response);

      return {
        success: true,
        recommendations: analysis.recommendations,
        weightAdjustments: analysis.weightAdjustments,
        marketRegime: analysis.marketRegime,
        reasoning: analysis.reasoning,
        priority: analysis.priority,
        timestamp: Date.now()
      };

    } catch (error) {
      this._log('error', 'Strategy optimization failed', { error: error.message });
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
    return `You are an expert quantitative trading strategist specializing in algorithmic optimization for cryptocurrency futures markets.

Your role is to analyze strategy performance and suggest data-driven improvements while respecting existing systems.

Output format (JSON):
{
  "recommendations": ["List of specific recommendations"],
  "weightAdjustments": {
    "indicatorName": { "current": 25, "suggested": 30, "reason": "explanation" }
  },
  "marketRegime": "trending|ranging|volatile|uncertain",
  "reasoning": "Detailed analysis",
  "priority": "high|medium|low"
}

Guidelines:
- Suggest conservative weight changes (max ±30% per indicator)
- Identify market regime shifts
- Focus on indicators with poor recent performance
- Maintain human-in-the-loop control (suggestions only)
- Be data-driven and specific`;
  }

  /**
   * Build the optimization prompt
   * @private
   */
  _buildOptimizationPrompt(performanceData, currentWeights, recentTrades) {
    const perfSummary = `
Win Rate: ${(performanceData.winRate * 100).toFixed(2)}%
Profit Factor: ${performanceData.profitFactor?.toFixed(2) || 'N/A'}
Total Trades: ${performanceData.totalTrades || 0}
Average Return: ${((performanceData.avgReturn || 0) * 100).toFixed(2)}%
Sharpe Ratio: ${performanceData.sharpeRatio?.toFixed(2) || 'N/A'}
`;

    const weightsSummary = Object.entries(currentWeights)
      .map(([name, config]) => `${name}: ${config.max} (${config.enabled ? 'enabled' : 'disabled'})`)
      .join('\n');

    const tradesSummary = recentTrades.slice(-10).map((trade, idx) => {
      return `Trade ${idx + 1}: ${trade.side} ${trade.symbol} | Return: ${((trade.return || 0) * 100).toFixed(2)}% | Duration: ${trade.duration}min`;
    }).join('\n');

    return `Analyze this trading strategy and suggest optimizations:

Current Performance:
${perfSummary}

Current Indicator Weights:
${weightsSummary}

Recent Trades (last 10):
${tradesSummary}

Questions to answer:
1. What is the current market regime?
2. Which indicators are performing well/poorly?
3. What weight adjustments would improve performance?
4. Are there any specific patterns in winning vs losing trades?
5. What's the priority of these changes?

Provide your analysis in JSON format.`;
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

      return {
        recommendations: Array.isArray(parsed.recommendations) ? 
          parsed.recommendations.slice(0, 10).map(r => String(r).substring(0, 200)) : [],
        weightAdjustments: parsed.weightAdjustments || {},
        marketRegime: String(parsed.marketRegime || 'uncertain'),
        reasoning: String(parsed.reasoning || '').substring(0, 2000),
        priority: ['high', 'medium', 'low'].includes(parsed.priority) ? parsed.priority : 'low'
      };

    } catch (error) {
      this._log('warn', 'Failed to parse Claude response', { error: error.message });
      
      return {
        recommendations: [],
        weightAdjustments: {},
        marketRegime: 'uncertain',
        reasoning: 'Unable to parse AI response',
        priority: 'low'
      };
    }
  }

  /**
   * Logging utility
   * @private
   */
  _log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [StrategyOptimizerAgent] [${level.toUpperCase()}] ${message}`, 
      Object.keys(meta).length > 0 ? meta : '');
  }
}

module.exports = StrategyOptimizerAgent;
