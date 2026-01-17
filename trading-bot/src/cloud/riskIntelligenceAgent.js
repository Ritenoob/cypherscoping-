/**
 * Risk Intelligence Agent
 * 
 * Uses Claude AI for:
 * - AI-powered position sizing validation
 * - Market regime classification
 * - Volatility forecasting
 * - Risk scenario analysis
 */

class RiskIntelligenceAgent {
  constructor(claudeClient, config) {
    this.client = claudeClient;
    this.config = config;
  }

  /**
   * Analyze risk for a potential trade
   * @param {Object} tradeData - Proposed trade details
   * @param {Object} marketData - Current market conditions
   * @param {Object} portfolioData - Current portfolio state
   * @returns {Promise<Object>} Risk analysis
   */
  async analyzeRisk(tradeData, marketData, portfolioData) {
    try {
      const prompt = this._buildRiskPrompt(tradeData, marketData, portfolioData);

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
        riskScore: analysis.riskScore,
        marketRegime: analysis.marketRegime,
        volatilityForecast: analysis.volatilityForecast,
        positionSizeAdjustment: analysis.positionSizeAdjustment,
        warnings: analysis.warnings,
        reasoning: analysis.reasoning,
        timestamp: Date.now()
      };

    } catch (error) {
      this._log('error', 'Risk analysis failed', { error: error.message });
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Classify market regime
   * @param {Object} marketData - Market indicators
   * @returns {Promise<Object>} Regime classification
   */
  async classifyRegime(marketData) {
    try {
      const prompt = this._buildRegimePrompt(marketData);

      const response = await this.client.sendMessage({
        system: this._getSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 512,
        temperature: 0.2
      });

      const content = response.content[0].text;
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : content;
      const parsed = JSON.parse(jsonText);

      return {
        success: true,
        regime: parsed.regime || 'uncertain',
        confidence: this._clamp(parsed.confidence || 50, 0, 100),
        characteristics: parsed.characteristics || [],
        reasoning: String(parsed.reasoning || '').substring(0, 500),
        timestamp: Date.now()
      };

    } catch (error) {
      this._log('error', 'Regime classification failed', { error: error.message });
      return {
        success: false,
        regime: 'uncertain',
        confidence: 0,
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
    return `You are an expert risk management specialist for cryptocurrency futures trading with deep knowledge of market dynamics and portfolio theory.

Your role is to assess trading risks objectively and provide actionable insights.

Output format (JSON):
{
  "riskScore": 0-100,
  "marketRegime": "trending|ranging|volatile|crisis",
  "volatilityForecast": "low|moderate|high|extreme",
  "positionSizeAdjustment": -50 to +50 (percentage),
  "warnings": ["List of specific risk concerns"],
  "reasoning": "Detailed explanation"
}

Guidelines:
- Be conservative in volatile conditions
- Consider correlation risks in portfolio
- Flag unusual market conditions
- Suggest position size adjustments (max ±50%)
- Provide clear risk warnings`;
  }

  /**
   * Build the risk analysis prompt
   * @private
   */
  _buildRiskPrompt(tradeData, marketData, portfolioData) {
    const tradeSummary = `
Symbol: ${tradeData.symbol}
Side: ${tradeData.side}
Proposed Size: ${tradeData.size}
Entry Price: ${tradeData.entryPrice || 'Market'}
Stop Loss: ${tradeData.stopLoss || 'N/A'}
Take Profit: ${tradeData.takeProfit || 'N/A'}
`;

    const marketSummary = `
Volatility (24h): ${((marketData.volatility || 0) * 100).toFixed(2)}%
Volume Change: ${((marketData.volumeChange || 0) * 100).toFixed(2)}%
Price Change (24h): ${((marketData.priceChange || 0) * 100).toFixed(2)}%
ADX: ${marketData.adx || 'N/A'}
`;

    const portfolioSummary = `
Total Balance: $${portfolioData.balance?.toFixed(2) || 'N/A'}
Open Positions: ${portfolioData.openPositions || 0}
Total Exposure: ${((portfolioData.exposure || 0) * 100).toFixed(2)}%
Unrealized PnL: $${portfolioData.unrealizedPnL?.toFixed(2) || '0.00'}
`;

    return `Analyze the risk for this proposed trade:

Trade Details:
${tradeSummary}

Market Conditions:
${marketSummary}

Portfolio State:
${portfolioSummary}

Questions to answer:
1. What is the overall risk score (0-100)?
2. What market regime are we in?
3. What's the volatility forecast?
4. Should position size be adjusted?
5. What are the key risk warnings?

Provide your analysis in JSON format.`;
  }

  /**
   * Build the regime classification prompt
   * @private
   */
  _buildRegimePrompt(marketData) {
    return `Classify the current market regime based on these indicators:

ADX: ${marketData.adx || 'N/A'}
Volatility: ${((marketData.volatility || 0) * 100).toFixed(2)}%
Volume Trend: ${marketData.volumeTrend || 'N/A'}
Price Action: ${marketData.priceAction || 'N/A'}

Classify as: trending, ranging, volatile, or crisis

Provide response in JSON format:
{
  "regime": "regime_type",
  "confidence": 0-100,
  "characteristics": ["key characteristics"],
  "reasoning": "explanation"
}`;
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
        riskScore: this._clamp(parsed.riskScore || 50, 0, 100),
        marketRegime: String(parsed.marketRegime || 'uncertain'),
        volatilityForecast: String(parsed.volatilityForecast || 'moderate'),
        positionSizeAdjustment: this._clamp(parsed.positionSizeAdjustment || 0, -50, 50),
        warnings: Array.isArray(parsed.warnings) ? 
          parsed.warnings.slice(0, 5).map(w => String(w).substring(0, 200)) : [],
        reasoning: String(parsed.reasoning || '').substring(0, 1000)
      };

    } catch (error) {
      this._log('warn', 'Failed to parse Claude response', { error: error.message });
      
      return {
        riskScore: 50,
        marketRegime: 'uncertain',
        volatilityForecast: 'moderate',
        positionSizeAdjustment: 0,
        warnings: [],
        reasoning: 'Unable to parse AI response'
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
    console.log(`[${timestamp}] [RiskIntelligenceAgent] [${level.toUpperCase()}] ${message}`, 
      Object.keys(meta).length > 0 ? meta : '');
  }
}

module.exports = RiskIntelligenceAgent;
