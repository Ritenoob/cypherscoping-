process.env.TZ = 'UTC';
process.env.TRADING_MODE = process.env.TRADING_MODE || 'paper';
process.env.SIMULATION = process.env.SIMULATION || 'false';
process.env.BURST_RATE_LIMIT_MS = '0';  // Disable burst rate limiting in tests
process.env.MAX_TRADES_PER_HOUR = '999';  // Disable hourly rate limiting in tests
