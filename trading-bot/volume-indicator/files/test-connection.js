const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

// KuCoin API credentials
const KUCOIN_API_KEY = process.env.KUCOIN_API_KEY;
const KUCOIN_API_SECRET = process.env.KUCOIN_API_SECRET;
const KUCOIN_API_PASSPHRASE = process.env.KUCOIN_API_PASSPHRASE;
const KUCOIN_FUTURES_BASE_URL = 'https://api-futures.kucoin.com';

console.log('='.repeat(60));
console.log('KuCoin Futures API Connection Test');
console.log('='.repeat(60));
console.log('');

// Validate credentials exist
if (!KUCOIN_API_KEY || !KUCOIN_API_SECRET || !KUCOIN_API_PASSPHRASE) {
  console.error('❌ ERROR: Missing API credentials!');
  console.error('');
  console.error('Please set these environment variables in your .env file:');
  console.error('  - KUCOIN_API_KEY');
  console.error('  - KUCOIN_API_SECRET');
  console.error('  - KUCOIN_API_PASSPHRASE');
  console.error('');
  console.error('Get them from: https://www.kucoin.com/account/api');
  process.exit(1);
}

console.log('✓ Environment variables loaded');
console.log(`  API Key: ${KUCOIN_API_KEY.substring(0, 8)}...`);
console.log('');

// Generate signature
function generateSignature(timestamp, method, endpoint, body = '') {
  const strToSign = timestamp + method + endpoint + body;
  return crypto
    .createHmac('sha256', KUCOIN_API_SECRET)
    .update(strToSign)
    .digest('base64');
}

// Get headers
function getHeaders(method, endpoint, body = '') {
  const timestamp = Date.now().toString();
  const signature = generateSignature(timestamp, method, endpoint, body);
  const passphraseSignature = crypto
    .createHmac('sha256', KUCOIN_API_SECRET)
    .update(KUCOIN_API_PASSPHRASE)
    .digest('base64');

  return {
    'KC-API-KEY': KUCOIN_API_KEY,
    'KC-API-SIGN': signature,
    'KC-API-TIMESTAMP': timestamp,
    'KC-API-PASSPHRASE': passphraseSignature,
    'KC-API-KEY-VERSION': '2',
    'Content-Type': 'application/json'
  };
}

// Make API request
async function testRequest(description, method, endpoint) {
  try {
    console.log(`Testing: ${description}...`);
    const headers = getHeaders(method, endpoint);
    const url = `${KUCOIN_FUTURES_BASE_URL}${endpoint}`;

    const response = await axios({
      method,
      url,
      headers
    });

    if (response.data && response.data.code === '200000') {
      console.log(`✓ ${description} - SUCCESS`);
      return response.data;
    } else {
      console.log(`⚠ ${description} - Unexpected response`);
      console.log(`  Response code: ${response.data?.code}`);
      return response.data;
    }
  } catch (error) {
    console.log(`✗ ${description} - FAILED`);
    if (error.response?.data) {
      console.log(`  Error: ${error.response.data.msg || error.response.data.message}`);
      console.log(`  Code: ${error.response.data.code}`);
    } else {
      console.log(`  Error: ${error.message}`);
    }
    return null;
  }
}

// Run all tests
async function runTests() {
  console.log('Running API connection tests...');
  console.log('');

  // Test 1: Account Overview
  const balance = await testRequest(
    'Account Balance',
    'GET',
    '/api/v1/account-overview?currency=USDT'
  );
  
  if (balance?.data) {
    console.log(`  Account Equity: $${balance.data.accountEquity || '0.00'}`);
    console.log(`  Available Balance: $${balance.data.availableBalance || '0.00'}`);
  }
  console.log('');

  // Test 2: Position Query
  await testRequest(
    'Position Query',
    'GET',
    '/api/v1/positions'
  );
  console.log('');

  // Test 3: Contract Details
  const contract = await testRequest(
    'Contract Details (XBTUSDTM)',
    'GET',
    '/api/v1/contracts/XBTUSDTM'
  );
  
  if (contract?.data) {
    console.log(`  Symbol: ${contract.data.symbol}`);
    console.log(`  Base Currency: ${contract.data.baseCurrency}`);
    console.log(`  Quote Currency: ${contract.data.quoteCurrency}`);
    console.log(`  Max Leverage: ${contract.data.maxLeverage}x`);
  }
  console.log('');

  // Test 4: Ticker Data
  const ticker = await testRequest(
    'Ticker Data (XBTUSDTM)',
    'GET',
    '/api/v1/ticker?symbol=XBTUSDTM'
  );
  
  if (ticker?.data) {
    console.log(`  Price: $${ticker.data.price || 'N/A'}`);
    console.log(`  24h Volume: ${ticker.data.volume || 'N/A'}`);
  }
  console.log('');

  // Test 5: WebSocket Token
  await testRequest(
    'WebSocket Token',
    'POST',
    '/api/v1/bullet-private'
  );
  console.log('');

  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log('');
  
  if (balance) {
    console.log('✓ API credentials are valid');
    console.log('✓ Connection to KuCoin Futures API successful');
    console.log('✓ Ready to trade!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Run: npm start');
    console.log('  2. Start your React frontend');
    console.log('  3. Begin trading!');
  } else {
    console.log('✗ API connection failed');
    console.log('');
    console.log('Common issues:');
    console.log('  • Wrong API credentials');
    console.log('  • API key missing "Futures Trading" permission');
    console.log('  • IP not whitelisted (if IP whitelist is enabled)');
    console.log('  • Account not activated for futures trading');
    console.log('');
    console.log('Solutions:');
    console.log('  1. Double-check credentials in .env file');
    console.log('  2. Enable "Futures Trading" on your API key');
    console.log('  3. Check IP whitelist settings');
    console.log('  4. Ensure futures account is activated');
  }
  console.log('');
}

// Run the tests
runTests().catch(error => {
  console.error('');
  console.error('Unexpected error:', error.message);
  process.exit(1);
});
