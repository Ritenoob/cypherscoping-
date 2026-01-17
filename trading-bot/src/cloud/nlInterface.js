/**
 * Natural Language Interface
 * 
 * Provides chat-based interaction with the trading bot:
 * - Query trading history
 * - Ask questions about trades
 * - Generate reports
 * - Execute commands
 */

class NaturalLanguageInterface {
  constructor(claudeClient, config) {
    this.client = claudeClient;
    this.config = config;
    this.conversationHistory = [];
  }

  /**
   * Process a natural language query
   * @param {string} query - User's question or command
   * @param {Object} context - Trading bot context (positions, history, etc.)
   * @returns {Promise<Object>} Response
   */
  async processQuery(query, context) {
    try {
      const prompt = this._buildQueryPrompt(query, context);

      // Build messages with conversation history
      const messages = [
        ...this.conversationHistory.slice(-10), // Keep last 10 exchanges
        {
          role: 'user',
          content: prompt
        }
      ];

      const response = await this.client.sendMessage({
        system: this._getSystemPrompt(),
        messages,
        maxTokens: 2048,
        temperature: 0.4
      });

      const content = response.content[0].text;

      // Update conversation history
      this.conversationHistory.push(
        { role: 'user', content: prompt },
        { role: 'assistant', content }
      );

      // Trim history if too long
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      return {
        success: true,
        response: content,
        timestamp: Date.now()
      };

    } catch (error) {
      this._log('error', 'Query processing failed', { error: error.message });
      return {
        success: false,
        error: error.message,
        response: 'I encountered an error processing your query. Please try again.',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Generate a report
   * @param {string} reportType - Type of report (daily, weekly, performance, etc.)
   * @param {Object} data - Data for the report
   * @returns {Promise<Object>} Generated report
   */
  async generateReport(reportType, data) {
    try {
      const prompt = this._buildReportPrompt(reportType, data);

      const response = await this.client.sendMessage({
        system: this._getReportSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 3072,
        temperature: 0.3
      });

      const content = response.content[0].text;

      return {
        success: true,
        report: content,
        reportType,
        timestamp: Date.now()
      };

    } catch (error) {
      this._log('error', 'Report generation failed', { error: error.message });
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
    this._log('info', 'Conversation history cleared');
  }

  /**
   * Build the system prompt for queries
   * @private
   */
  _getSystemPrompt() {
    return `You are an AI assistant for a cryptocurrency futures trading bot. Your role is to help users understand their trading activity, performance, and strategy.

You have access to:
- Open positions
- Trading history
- Performance metrics
- Current market conditions
- Bot configuration

Guidelines:
- Be conversational but professional
- Provide clear, actionable information
- Use bullet points for lists
- Include relevant numbers and percentages
- When asked "why" questions, explain the technical reasoning
- If you don't have the information, say so clearly
- Do not make up data or trades
- Keep responses concise (under 500 words)

Example queries you can handle:
- "What are my open positions?"
- "Why did you take that SOL trade?"
- "What's my performance today?"
- "Which indicators triggered the last trade?"
- "Show me my losing trades"`;
  }

  /**
   * Build the system prompt for reports
   * @private
   */
  _getReportSystemPrompt() {
    return `You are a professional trading report generator for cryptocurrency futures. Your reports should be:

- Well-structured with clear sections
- Data-driven with specific metrics
- Professional but readable
- Include actionable insights
- Highlight both strengths and areas for improvement

Use markdown formatting for better readability.`;
  }

  /**
   * Build the query prompt
   * @private
   */
  _buildQueryPrompt(query, context) {
    let contextInfo = 'Current Context:\n';

    if (context.openPositions && context.openPositions.length > 0) {
      contextInfo += '\nOpen Positions:\n';
      context.openPositions.forEach(pos => {
        contextInfo += `- ${pos.symbol}: ${pos.side} ${pos.size} @ $${pos.entryPrice} (PnL: ${pos.pnl > 0 ? '+' : ''}$${pos.pnl.toFixed(2)})\n`;
      });
    } else {
      contextInfo += '\nOpen Positions: None\n';
    }

    if (context.recentTrades && context.recentTrades.length > 0) {
      contextInfo += '\nRecent Trades (last 5):\n';
      context.recentTrades.slice(-5).forEach((trade, idx) => {
        contextInfo += `${idx + 1}. ${trade.symbol} ${trade.side} - Return: ${((trade.return || 0) * 100).toFixed(2)}% @ ${new Date(trade.timestamp).toLocaleString()}\n`;
      });
    }

    if (context.performance) {
      contextInfo += '\nPerformance Summary:\n';
      contextInfo += `- Win Rate: ${((context.performance.winRate || 0) * 100).toFixed(2)}%\n`;
      contextInfo += `- Total Trades: ${context.performance.totalTrades || 0}\n`;
      contextInfo += `- Profit Factor: ${context.performance.profitFactor?.toFixed(2) || 'N/A'}\n`;
      contextInfo += `- Balance: $${context.performance.balance?.toFixed(2) || 'N/A'}\n`;
    }

    return `${contextInfo}\n\nUser Query: ${query}\n\nProvide a helpful response based on the available context.`;
  }

  /**
   * Build the report prompt
   * @private
   */
  _buildReportPrompt(reportType, data) {
    let prompt = `Generate a ${reportType} trading report based on this data:\n\n`;

    if (data.summary) {
      prompt += 'Summary:\n';
      Object.entries(data.summary).forEach(([key, value]) => {
        prompt += `- ${key}: ${value}\n`;
      });
      prompt += '\n';
    }

    if (data.trades && data.trades.length > 0) {
      prompt += `Trades Analyzed: ${data.trades.length}\n\n`;
      
      const winners = data.trades.filter(t => t.return > 0);
      const losers = data.trades.filter(t => t.return < 0);
      
      prompt += `Winners: ${winners.length} (${((winners.length / data.trades.length) * 100).toFixed(1)}%)\n`;
      prompt += `Losers: ${losers.length} (${((losers.length / data.trades.length) * 100).toFixed(1)}%)\n\n`;
    }

    prompt += `\nCreate a comprehensive ${reportType} report with:
1. Executive Summary
2. Key Metrics
3. Trade Analysis
4. Strengths and Weaknesses
5. Recommendations

Use markdown formatting.`;

    return prompt;
  }

  /**
   * Logging utility
   * @private
   */
  _log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [NLInterface] [${level.toUpperCase()}] ${message}`, 
      Object.keys(meta).length > 0 ? meta : '');
  }
}

module.exports = NaturalLanguageInterface;
