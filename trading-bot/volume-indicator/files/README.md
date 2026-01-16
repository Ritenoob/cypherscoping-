# KuCoin Futures Live Trading System

Complete automated trading system for KuCoin Futures with manual entry, automated break-even exits, trailing stops, and live signal analysis.

## 🚀 Features

### Core Trading Features
- **Manual Order Entry**: Place limit orders with custom size, price, and leverage
- **Automated Break-Even**: Moves stop loss to entry price after 10 pips profit
- **Trailing Stop Loss**: Trails every 3 pips of profit, moving SL forward by 1 pip
- **Real-time P&L Tracking**: Live unrealized profit/loss for all positions
- **Multi-Symbol Support**: Trade BTC, ETH, and SOL perpetual futures

### Signal Analysis
- **Live Technical Indicators**: RSI, Williams %R, ATR, AO, MACD, EMA 50/200
- **Signal Scoring System**: 100-point scale with confidence levels
- **Visual Signal Meter**: Real-time display of buy/sell strength
- **Signal Breakdown**: See exactly how each indicator contributes

### Safety & Monitoring
- **Real-time Logging**: Complete audit trail of all actions
- **Position Monitoring**: Automatic stop loss management
- **Account Balance**: Live account equity display
- **WebSocket Connection**: Real-time bidirectional communication

## 📋 Prerequisites

- Node.js 16+ installed
- KuCoin Futures account with API credentials
- Funded KuCoin Futures account (USDT)

## 🔧 Installation

### Step 1: Get KuCoin API Credentials

1. Go to [KuCoin API Management](https://www.kucoin.com/account/api)
2. Create a new API key
3. **IMPORTANT**: Enable "Futures Trading" permission
4. Save your:
   - API Key
   - API Secret
   - API Passphrase

### Step 2: Setup Backend

```bash
# Navigate to backend directory
cd kucoin-futures-backend

# Install dependencies
npm install

# Create .env file from template
cp .env.example .env

# Edit .env and add your API credentials
nano .env  # or use any text editor
```

Your `.env` should look like:
```env
KUCOIN_API_KEY=64a1b2c3d4e5f6789abcdef0
KUCOIN_API_SECRET=a1b2c3d4-e5f6-7890-abcd-ef0123456789
KUCOIN_API_PASSPHRASE=YourPassphrase123
PORT=3000
```

### Step 3: Setup Frontend

The frontend is already provided in your React dashboard file. Simply import and use it:

```jsx
import KuCoinLiveTradingDashboard from './KuCoinLiveTradingDashboard';

function App() {
  return <KuCoinLiveTradingDashboard />;
}
```

## 🎯 Usage

### Start the Backend

```bash
# From kucoin-futures-backend directory
npm start

# Or for development with auto-reload
npm run dev
```

You should see:
```
✓ Connected to KuCoin Futures API
Account Balance: 1000.00
✓ Server ready on port 3001
Waiting for frontend connection...
```

### Start the Frontend

Run your React app with the dashboard component. The dashboard will automatically connect to `ws://localhost:3001`.

### Trading Workflow

1. **Monitor Signals**: Watch the Live Signal Analysis section for strong buy/sell signals
2. **Set Entry**: When signal shows HIGH confidence (>60), prepare your entry
3. **Place Order**: Use manual order entry with:
   - Select symbol (BTC/ETH/SOL)
   - Choose side (LONG/SHORT)
   - Set size (e.g., 0.001 BTC)
   - Set limit price
   - Adjust leverage (1-100x)
4. **Automated Exit**: System automatically:
   - Moves SL to break-even at +10 pips
   - Trails SL every +3 pips
   - Closes position if SL hit

## 🛡️ Automated Exit Strategy

### Break-Even Trigger
- **Activates**: When position is +10 pips in profit
- **Action**: Moves stop loss to entry price
- **Result**: Risk-free trade (minus fees)

### Trailing Stop
- **Activates**: After break-even triggered
- **Trigger**: Every +3 pips of additional profit
- **Movement**: Stop loss moves forward +1 pip
- **Direction**: Only forward, never backward

### Example
```
Entry: $95,000
Break-even at: $95,100 (+10 pips)
  → SL moved to $95,000

Price reaches $95,130 (+13 pips)
  → SL moved to $95,010

Price reaches $95,160 (+16 pips)
  → SL moved to $95,020

...continues until price hits SL or you close manually
```

## 📊 Signal Scoring System

Each indicator contributes to a total score from -100 (strong sell) to +100 (strong buy):

| Indicator | Max Contribution | Bullish Condition | Bearish Condition |
|-----------|-----------------|-------------------|-------------------|
| RSI | ±25 | < 30 (oversold) | > 70 (overbought) |
| Williams %R | ±20 | < -80 (oversold) | > -20 (overbought) |
| AO | ±15 | > 0 (bullish) | < 0 (bearish) |
| MACD | ±20 | > 0 (bullish) | < 0 (bearish) |
| EMA Trend | ±20 | EMA50 > EMA200 | EMA50 < EMA200 |

### Signal Interpretation

- **+60 to +100**: Strong BUY signal (HIGH confidence)
- **+40 to +59**: Medium BUY signal (MEDIUM confidence)
- **-40 to +40**: NEUTRAL (LOW confidence, no trade)
- **-59 to -40**: Medium SELL signal (MEDIUM confidence)
- **-100 to -60**: Strong SELL signal (HIGH confidence)

## 🔍 Monitoring & Logs

### Live Log Features
- **Real-time updates**: See every action as it happens
- **Color coding**: 
  - 🟢 Green: Success
  - 🔴 Red: Error
  - 🟡 Yellow: Warning
  - 🔵 Blue: Info
- **Export logs**: Download complete trading session logs
- **Timestamps**: Precise timing of all events

### What Gets Logged
- API connections/disconnections
- Order placements and results
- Position updates
- Break-even triggers
- Trailing stop movements
- Position closures
- Error messages

## ⚠️ Risk Warnings

**IMPORTANT: This is LIVE TRADING with REAL MONEY**

- Start with small position sizes
- Use appropriate leverage (lower is safer)
- Monitor your positions actively
- Understand that you can lose money
- Never trade more than you can afford to lose
- Test on KuCoin's testnet first if available
- System automation doesn't guarantee profits

## 🔧 Troubleshooting

### Backend won't start
```bash
# Check if port 3001 is in use
lsof -i :3001

# Kill process if needed
kill -9 <PID>

# Restart backend
npm start
```

### Frontend can't connect
1. Ensure backend is running
2. Check WebSocket URL is `ws://localhost:3001`
3. Check browser console for errors
4. Verify no firewall blocking port 3001

### API errors
1. Verify API credentials in `.env`
2. Check API key has "Futures Trading" permission
3. Ensure IP whitelist is configured (if set)
4. Check KuCoin API status page

### No market data
1. Wait 10-15 seconds after startup for data to load
2. Check logs for "Loaded X historical candles" messages
3. Verify symbols are correct (XBTUSDTM, ETHUSDTM, SOLUSDTM)

## 📁 Project Structure

```
kucoin-futures-backend/
├── server.js           # Main backend server
├── package.json        # Dependencies
├── .env               # API credentials (create from .env.example)
├── .env.example       # Template for environment variables
└── README.md          # This file

frontend/
└── KuCoinLiveTradingDashboard.jsx  # React dashboard component
```

## 🛠️ Technical Details

### WebSocket Messages

**Client → Server:**
```json
{ "type": "place_order", "symbol": "XBTUSDTM", "side": "buy", "size": 0.001, "price": 95000, "leverage": 10 }
{ "type": "close_position", "symbol": "XBTUSDTM" }
{ "type": "get_balance" }
```

**Server → Client:**
```json
{ "type": "log", "log": {...} }
{ "type": "positions", "data": [...] }
{ "type": "balance", "data": {...} }
{ "type": "market_data", "symbol": "XBTUSDTM", "data": {...} }
{ "type": "order_result", "result": {...} }
```

### Position Object Structure
```javascript
{
  symbol: "XBTUSDTM",
  side: "long",  // or "short"
  size: 0.001,
  leverage: 10,
  entryPrice: 95000,
  currentPrice: 95120,
  unrealizedPnl: 1.20,
  currentStopLoss: 95010,
  liquidationPrice: 86363.64
}
```

## 🔐 Security Best Practices

1. **Never commit `.env` file** to git
2. **Use API IP whitelist** on KuCoin
3. **Enable 2FA** on your KuCoin account
4. **Use read-only API keys** for testing
5. **Limit API key permissions** to only what's needed
6. **Monitor API key usage** on KuCoin regularly

## 📈 Performance Tips

1. **Start with low leverage**: 5-10x until you're comfortable
2. **Use small sizes**: 0.001-0.01 BTC to start
3. **Wait for HIGH confidence signals**: >60 score
4. **Don't overtrade**: Quality over quantity
5. **Monitor during active hours**: Higher volume = better fills
6. **Check spreads**: Wide spreads can eat into profits

## 🆘 Support & Contributing

- Report issues on GitHub
- Submit pull requests for improvements
- Share your trading results (anonymously)

## 📜 License

MIT License - Trade at your own risk

## ⚡ Quick Start Checklist

- [ ] Node.js installed
- [ ] KuCoin account created
- [ ] Futures account funded
- [ ] API credentials created
- [ ] Futures trading permission enabled
- [ ] `.env` file configured
- [ ] Dependencies installed (`npm install`)
- [ ] Backend started (`npm start`)
- [ ] Frontend connected
- [ ] Test with small position
- [ ] Monitor logs carefully

---

**Remember**: This system places REAL orders with REAL money. Always start small and trade responsibly!
