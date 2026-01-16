# ⚡ QUICK START GUIDE

Get trading in 5 minutes!

## Step 1: Get API Credentials (2 mins)

1. Go to https://www.kucoin.com/account/api
2. Click "Create API"
3. **Enable "Futures Trading" permission**
4. Save these 3 values:
   - API Key
   - API Secret  
   - Passphrase

## Step 2: Setup Backend (2 mins)

```bash
# Run setup script
./setup.sh

# Edit .env file
nano .env
```

Paste your credentials:
```env
KUCOIN_API_KEY=64a1b2c3d4e5f6789abcdef0
KUCOIN_API_SECRET=a1b2c3d4-e5f6-7890-abcd-ef0123456789
KUCOIN_API_PASSPHRASE=YourPassphrase123
```

Save and exit (Ctrl+X, Y, Enter)

## Step 3: Start Trading (1 min)

```bash
# Start backend
npm start
```

Should see:
```
✓ Connected to KuCoin Futures API
Account Balance: 1000.00
✓ Server ready on port 3001
```

## Step 4: Open Frontend

Start your React app - dashboard will auto-connect!

## First Trade Example

1. **Watch signals** - Wait for score > 60 (GREEN)
2. **Set order**:
   - Symbol: BTC
   - Side: LONG
   - Size: 0.001
   - Price: (market price - 10)
   - Leverage: 10x
3. **Click "PLACE LIMIT ORDER"**
4. **System takes over** - Auto break-even & trailing stops!

## 🎯 Trading Strategy

**Entry**: HIGH confidence signals only (score > 60)

**Exit**: Automated!
- Break-even at +10 pips
- Trails every +3 pips
- Locks in profits automatically

## ⚠️ Start Small!

- First trade: 0.001 BTC, 5-10x leverage
- Watch how the system works
- Increase size gradually

## 🆘 Issues?

**Can't connect:**
```bash
lsof -i :3001  # Check if port busy
```

**API errors:**
- Verify credentials in .env
- Check "Futures Trading" is enabled
- Confirm account is funded

## 📊 What to Monitor

- Signal score (aim for >60 or <-60)
- Break-even trigger (logs will show)
- Trailing stops (logs show each move)
- P&L (real-time in dashboard)

---

**That's it! You're trading!** 🚀

Remember: This is REAL money - start small, trade smart!
