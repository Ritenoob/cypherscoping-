/**
 * Cloud Module Exports
 * 
 * Main entry point for all cloud AI services
 */

const CloudOrchestrator = require('./orchestrator');
const ClaudeClient = require('./claudeClient');
const SignalAnalysisAgent = require('./signalAnalysisAgent');
const StrategyOptimizerAgent = require('./strategyOptimizerAgent');
const RiskIntelligenceAgent = require('./riskIntelligenceAgent');
const NaturalLanguageInterface = require('./nlInterface');
const DecisionSupportSystem = require('./decisionSupport');

module.exports = {
  CloudOrchestrator,
  ClaudeClient,
  SignalAnalysisAgent,
  StrategyOptimizerAgent,
  RiskIntelligenceAgent,
  NaturalLanguageInterface,
  DecisionSupportSystem
};
