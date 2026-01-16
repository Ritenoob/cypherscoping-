#!/usr/bin/env node
/**
 * WEIGHT ADJUSTMENT CLI TOOL
 * Interactive CLI for tuning signal weights
 * 
 * Usage:
 *   node core/adjust-weights.js
 *   node core/adjust-weights.js --profile aggressive
 *   node core/adjust-weights.js --export balanced.json
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const WEIGHTS_FILE = path.join(__dirname, 'signal-weights.js');

// Parse command line arguments
const args = process.argv.slice(2);
const profileArg = args.find(arg => arg.startsWith('--profile='));
const exportArg = args.find(arg => arg.startsWith('--export='));

// Load current weights
let weightsConfig;
try {
  weightsConfig = require('./signal-weights.js');
} catch (err) {
  console.error('❌ Error loading signal-weights.js:', err.message);
  process.exit(1);
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function displayWeights(weights) {
  console.log('\n📊 Current Weights:');
  console.log('═══════════════════════════════════════');
  
  let total = 0;
  for (const [indicator, config] of Object.entries(weights)) {
    if (config.max !== undefined) {
      console.log(`  ${indicator.padEnd(15)}: ${config.max.toString().padStart(3)} points`);
      total += config.max;
    }
  }
  
  console.log('═══════════════════════════════════════');
  console.log(`  Total: ${total} points`);
  console.log('  Recommended: 100-150 points\n');
}

async function adjustWeight(weights, indicator) {
  if (!weights[indicator]) {
    console.log(`❌ Indicator '${indicator}' not found`);
    return false;
  }
  
  const currentMax = weights[indicator].max;
  const newValue = await question(`  New max points for ${indicator} (current: ${currentMax}): `);
  
  const parsed = parseInt(newValue);
  if (isNaN(parsed) || parsed < 0 || parsed > 100) {
    console.log(`  ❌ Invalid value. Must be 0-100`);
    return false;
  }
  
  weights[indicator].max = parsed;
  console.log(`  ✅ Updated ${indicator} to ${parsed} points`);
  return true;
}

async function saveWeights(profile, weights) {
  // Read the current file
  const fileContent = fs.readFileSync(WEIGHTS_FILE, 'utf8');
  
  // Create updated weights object string
  const weightsStr = JSON.stringify(weights, null, 6);
  
  // Replace the profile section
  const profileKey = profile === 'default' ? 'weights:' : `${profile}:`;
  const regex = new RegExp(`(${profileKey}\\s*{)[^}]*?(\\s*\\},)`, 's');
  
  // For simplicity, just inform user to manually update or export
  console.log('\n⚠️  Manual update required in signal-weights.js');
  console.log('Updated weights object:');
  console.log(weightsStr);
  
  return true;
}

async function exportWeights(profile, weights, filename) {
  const exportData = {
    profile,
    weights,
    exportedAt: new Date().toISOString(),
    totalPoints: Object.values(weights).reduce((sum, cfg) => sum + (cfg.max || 0), 0)
  };
  
  fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
  console.log(`✅ Exported ${profile} profile to ${filename}`);
}

async function selectProfile() {
  console.log('\n📋 Available Profiles:');
  console.log('  1. default');
  console.log('  2. conservative');
  console.log('  3. aggressive');
  console.log('  4. balanced');
  console.log('  5. scalping');
  console.log('  6. swingTrading');
  
  const choice = await question('\nSelect profile (1-6): ');
  const profiles = ['default', 'conservative', 'aggressive', 'balanced', 'scalping', 'swingTrading'];
  
  const index = parseInt(choice) - 1;
  if (index >= 0 && index < profiles.length) {
    return profiles[index];
  }
  
  console.log('❌ Invalid choice, using default');
  return 'default';
}

async function interactiveMode() {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║   MIRKO V3.5 Weight Adjustment Tool      ║');
  console.log('╚═══════════════════════════════════════════╝\n');
  
  // Select profile
  const profile = await selectProfile();
  const weights = profile === 'default' ? weightsConfig.weights : weightsConfig.profiles[profile];
  
  if (!weights) {
    console.log(`❌ Profile '${profile}' not found`);
    rl.close();
    return;
  }
  
  console.log(`\n✅ Editing profile: ${profile}`);
  
  let running = true;
  while (running) {
    await displayWeights(weights);
    
    console.log('Commands:');
    console.log('  adjust <indicator> - Adjust weight for indicator');
    console.log('  show              - Show current weights');
    console.log('  export <file>     - Export to JSON file');
    console.log('  quit              - Exit without saving');
    console.log('');
    
    const command = await question('> ');
    const parts = command.trim().split(' ');
    const cmd = parts[0].toLowerCase();
    
    if (cmd === 'quit' || cmd === 'exit' || cmd === 'q') {
      running = false;
    } else if (cmd === 'show') {
      // Just loop and display again
      continue;
    } else if (cmd === 'adjust' && parts[1]) {
      await adjustWeight(weights, parts[1]);
    } else if (cmd === 'export' && parts[1]) {
      await exportWeights(profile, weights, parts[1]);
    } else {
      console.log('❌ Unknown command');
    }
  }
  
  console.log('\n👋 Exiting...\n');
  rl.close();
}

// Main execution
(async () => {
  try {
    if (exportArg) {
      const filename = exportArg.split('=')[1];
      const profile = profileArg ? profileArg.split('=')[1] : 'default';
      const weights = profile === 'default' ? weightsConfig.weights : weightsConfig.profiles[profile];
      await exportWeights(profile, weights, filename);
      process.exit(0);
    } else {
      await interactiveMode();
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    rl.close();
    process.exit(1);
  }
})();
