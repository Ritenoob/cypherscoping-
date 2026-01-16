#!/usr/bin/env node
/**
 * Export Signals Script
 * 
 * Exports signal history to various formats (JSON, CSV, Markdown)
 * Usage: node scripts/export-signals.js --format json --output ./signals.json
 */

const fs = require('fs');
const path = require('path');

function loadSignals(logDir = './logs') {
  const signalsFile = path.join(logDir, 'screener_matches.json');
  
  if (!fs.existsSync(signalsFile)) {
    console.log('No signals file found. Creating empty dataset.');
    return [];
  }
  
  const content = fs.readFileSync(signalsFile, 'utf-8');
  return JSON.parse(content);
}

function exportToJSON(signals, outputPath) {
  const formatted = signals.map(s => ({
    timestamp: new Date(s.ts).toISOString(),
    symbol: s.symbol,
    direction: s.direction,
    score: s.score,
    confidence: s.confidence,
    alignment: s.alignment,
    indicators: s.indicators || {}
  }));
  
  fs.writeFileSync(outputPath, JSON.stringify(formatted, null, 2));
  console.log(`Exported ${formatted.length} signals to ${outputPath}`);
}

function exportToCSV(signals, outputPath) {
  const headers = ['timestamp', 'symbol', 'direction', 'score', 'confidence', 'alignment'];
  const rows = [headers.join(',')];
  
  for (const signal of signals) {
    rows.push([
      new Date(signal.ts).toISOString(),
      signal.symbol,
      signal.direction,
      signal.score,
      signal.confidence,
      signal.alignment || 'N/A'
    ].join(','));
  }
  
  fs.writeFileSync(outputPath, rows.join('\n'));
  console.log(`Exported ${signals.length} signals to ${outputPath}`);
}

function exportToMarkdown(signals, outputPath) {
  const lines = [
    '# Signal Export Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total Signals: ${signals.length}`,
    '',
    '## Summary Statistics',
    ''
  ];
  
  const longSignals = signals.filter(s => s.direction === 'long');
  const shortSignals = signals.filter(s => s.direction === 'short');
  const avgScore = signals.reduce((sum, s) => sum + Math.abs(s.score), 0) / signals.length;
  const avgConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
  
  lines.push(`Long Signals: ${longSignals.length}`);
  lines.push(`Short Signals: ${shortSignals.length}`);
  lines.push(`Average Score: ${avgScore.toFixed(2)}`);
  lines.push(`Average Confidence: ${avgConfidence.toFixed(2)}%`);
  lines.push('');
  lines.push('## Recent Signals');
  lines.push('');
  lines.push('| Timestamp | Symbol | Direction | Score | Confidence |');
  lines.push('|-----------|--------|-----------|-------|------------|');
  
  const recentSignals = signals.slice(-20);
  for (const signal of recentSignals) {
    lines.push(`| ${new Date(signal.ts).toLocaleString()} | ${signal.symbol} | ${signal.direction.toUpperCase()} | ${signal.score > 0 ? '+' : ''}${signal.score} | ${signal.confidence}% |`);
  }
  
  fs.writeFileSync(outputPath, lines.join('\n'));
  console.log(`Exported signal report to ${outputPath}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    format: 'json',
    output: null,
    logDir: './logs'
  };
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    
    switch (key) {
      case 'format':
        config.format = value;
        break;
      case 'output':
        config.output = value;
        break;
      case 'logDir':
        config.logDir = value;
        break;
    }
  }
  
  if (!config.output) {
    const ext = config.format === 'csv' ? 'csv' : config.format === 'md' ? 'md' : 'json';
    config.output = `./signals_export_${Date.now()}.${ext}`;
  }
  
  return config;
}

function main() {
  const config = parseArgs();
  
  console.log('Loading signals...');
  const signals = loadSignals(config.logDir);
  
  if (signals.length === 0) {
    console.log('No signals to export');
    return;
  }
  
  console.log(`Found ${signals.length} signals`);
  
  switch (config.format) {
    case 'csv':
      exportToCSV(signals, config.output);
      break;
    case 'md':
    case 'markdown':
      exportToMarkdown(signals, config.output);
      break;
    default:
      exportToJSON(signals, config.output);
  }
}

if (require.main === module) {
  main();
}

module.exports = { loadSignals, exportToJSON, exportToCSV, exportToMarkdown };
