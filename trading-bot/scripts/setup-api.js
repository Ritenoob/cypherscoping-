#!/usr/bin/env node
/**
 * API Key Setup Script
 * 
 * Interactive setup for KuCoin Futures API credentials.
 * Usage: node scripts/setup-api.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENV_PATH = path.join(__dirname, '..', '.env');
const ENV_EXAMPLE_PATH = path.join(__dirname, '..', '.env.example');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

function mask(str) {
  if (!str || str.length <= 8) return '****';
  return str.substring(0, 4) + '****' + str.substring(str.length - 4);
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('KuCoin Futures Trading Bot - API Setup');
  console.log('='.repeat(60) + '\n');

  // Check for existing .env
  let existingConfig = {};
  if (fs.existsSync(ENV_PATH)) {
    console.log('Existing .env file found.\n');
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    content.split('\n').forEach(line => {
      const [key, ...val] = line.split('=');
      if (key && !key.startsWith('#')) {
        existingConfig[key.trim()] = val.join('=').trim();
      }
    });
    
    if (existingConfig.KUCOIN_API_KEY) {
      console.log(`Current API Key: ${mask(existingConfig.KUCOIN_API_KEY)}`);
    }
    
    const overwrite = await question('\nOverwrite existing configuration? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('\nSetup cancelled. Existing configuration preserved.');
      rl.close();
      return;
    }
    console.log('');
  }

  console.log('Enter your KuCoin Futures API credentials.');
  console.log('You can create API keys at: https://www.kucoin.com/account/api\n');
  console.log('IMPORTANT: Enable "Futures" permission when creating the API key.\n');

  const apiKey = await question('API Key: ');
  const apiSecret = await question('API Secret: ');
  const passphrase = await question('API Passphrase: ');
  
  console.log('');
  const apiVersion = await question('API Version (1 or 2, default 2): ') || '2';
  const botMode = await question('Trading Mode (paper/live, default paper): ') || 'paper';

  // Validate inputs
  if (!apiKey || !apiSecret || !passphrase) {
    console.log('\nError: All credentials are required.');
    rl.close();
    return;
  }

  // Create .env content
  const envContent = `# KuCoin Futures API Configuration
# Generated: ${new Date().toISOString()}

# API Credentials
KUCOIN_API_KEY=${apiKey}
KUCOIN_API_SECRET=${apiSecret}
KUCOIN_API_PASSPHRASE=${passphrase}

# API Version (v1 or v2)
KUCOIN_API_VERSION=${apiVersion}

# Trading Mode: paper or live
BOT_MODE=${botMode}

# Logging Level
LOG_LEVEL=info
`;

  // Write .env file
  fs.writeFileSync(ENV_PATH, envContent);
  console.log('\n' + '='.repeat(60));
  console.log('Configuration saved to .env');
  console.log('='.repeat(60));

  // Validate credentials
  console.log('\nValidating credentials...');
  
  try {
    // Set environment variables for validation
    process.env.KUCOIN_API_KEY = apiKey;
    process.env.KUCOIN_API_SECRET = apiSecret;
    process.env.KUCOIN_API_PASSPHRASE = passphrase;
    process.env.KUCOIN_API_VERSION = apiVersion;

    const { getCredentials } = require('../config/apiCredentials');
    const credentials = getCredentials();
    
    const isValid = await credentials.validateCredentials();
    
    if (isValid) {
      console.log('\n✓ Credentials validated successfully!');
      console.log('\nYou can now run the bot:');
      console.log('  npm run start:paper   (paper trading mode)');
      console.log('  npm run start:live    (live trading mode - use with caution)');
    } else {
      console.log('\n✗ Credential validation failed.');
      console.log('Please check your API key, secret, and passphrase.');
      console.log('Make sure "Futures" permission is enabled for this API key.');
    }
  } catch (error) {
    console.log('\n✗ Validation error:', error.message);
  }

  console.log('\n' + '='.repeat(60) + '\n');
  rl.close();
}

main().catch(err => {
  console.error('Setup error:', err);
  rl.close();
  process.exit(1);
});
