# KuCoin Futures Trading Bot V5 - Claude Code Instructions

## ⚠️ STARTUP INSTRUCTIONS - READ FIRST
**On every new session:**
1. Read `.claude/MEMORY.md` for human-readable status and next steps
2. Read `.claude/SESSION_STATE.json` for detailed state data
3. Resume from where the last session left off

These files contain persistent memory across sessions. Always update them before ending a session.

---

## Mission Statement

You are the autonomous optimization engine for a KuCoin Futures trading bot. Your singular objective is to **maximize profitability** while maintaining high win rates (>75%) and/or profit factors (>2.0). You have full autonomy to modify any code, parameters, or strategies to achieve this goal. 
Autonomy includes: testing and optimizing each indicator per time frame by adjusting inputs and settings, upgrading indicators i.e. enhancing the RSI to a socastic RSI, prioritizing indicators to best time frame results, adjusting signal scoring strengths weights, and much more 

## Project Overview

This is a Node.js trading bot for KuCoin Futures with:
- 11 technical indicators (RSI, MACD, Williams%R, AO, Stochastic, Bollinger, EMA, KDJ, OBV, DOM, ATR)
- 3 microstructure analyzers (Buy:Sell Ratio, Price Ratio, Funding Rate)
- Signal scoring system (-120 to +120 range)
- ROI-based risk management
- Volatility-aware leverage calculation
- Multi-timeframe alignment
- Paper trading optimization engine

## Directory Structure

```
/
├── index.js                 # Main entry point
├── server.js                # Dashboard HTTP server
├── screenerEngine.js        # WebSocket screener core
├── screenerConfig.js        # Screener parameters (OPTIMIZE THIS)
├── signal-weights.js        # Indicator weights (OPTIMIZE THIS)
├── timeframeAligner.js      # Multi-TF alignment
├── coinList.js              # Dynamic coin selection
├── config/
│   ├── runtimeConfig.js     # Runtime settings (OPTIMIZE THIS)
│   ├── apiCredentials.js    # API authentication
│   ├── leverage-calculator.js # Leverage logic (OPTIMIZE THIS)
│   └── pairs.json           # Trading pairs
├── switches/
│   ├── strategyRouter.js    # Strategy routing
│   └── signalProfiles/      # Strategy profiles (OPTIMIZE THESE)
│       ├── conservative.js
│       ├── neutral.js
│       └── aggressive.js
├── scripts/
│   ├── backtest-runner.js   # Backtesting
│   ├── export-signals.js    # Signal export
│   └── setup-api.js         # API setup
├── src/
│   ├── indicators/          # 10 technical indicators
│   ├── microstructure/      # 3 microstructure analyzers
│   ├── lib/                 # SignalGeneratorV2, CoinRankerV2
│   ├── optimizer/           # Paper trading engines
│   ├── backtest/            # BacktestEngine
│   └── utils/               # PositionCalculator
├── tests/                   # Test suites (69 tests)
├── logs/                    # Signal logs, backtest results
└── .env                     # API credentials & config
```

## Critical Files to Optimize

### 1. signal-weights.js
Contains weights for all indicators. Adjust based on backtest performance:
- Increase weights for indicators with high predictive accuracy
- Decrease weights for indicators generating false signals
- Balance between trend-following and mean-reversion signals

### 2. screenerConfig.js
Contains indicator parameters and thresholds:
- RSI period, overbought/oversold levels
- MACD fast/slow/signal periods
- Bollinger period and standard deviation
- Signal score thresholds

### 3. config/runtimeConfig.js
Contains risk management and position sizing:
- Stop loss and take profit ROI percentages
- Trailing stop activation and trail percentage
- Position sizing percentages
- Leverage settings

### 4. switches/signalProfiles/
Strategy profiles with different risk appetites:
- Optimize indicator weight distributions
- Tune entry/exit thresholds per profile
- Adjust leverage and position sizing

## Commands

```bash
# Run tests (always run after changes)
npm test

# Run backtest on specific symbol
npm run backtest -- --symbol BTCUSDTM --timeframe 15min --days 30

# Start paper trading
npm run start:paper

# Start live trading (use with caution)
npm run start:live

# Launch dashboard
npm run dashboard

# Validate API credentials
npm run validate

# Export signals for analysis
npm run export -- --format json --output ./analysis.json
```

## Optimization Workflow

### Phase 1: Data Collection
1. Run backtests across multiple symbols and timeframes
2. Export signal history for analysis
3. Identify patterns in winning vs losing trades

### Phase 2: Parameter Optimization
1. Use grid search or genetic algorithms to find optimal parameters
2. Focus on these high-impact parameters:
   - RSI_PERIOD (test: 7, 14, 21)
   - RSI_OVERSOLD/OVERBOUGHT (test: 25/75, 30/70, 35/65)
   - MACD_FAST/SLOW/SIGNAL (test: 8/17/9, 12/26/9, 5/35/5)
   - SIGNAL_MIN_SCORE (test: 40, 50, 60, 70)
   - STOP_LOSS_ROI (test: 0.3, 0.5, 0.75, 1.0)
   - TAKE_PROFIT_ROI (test: 1.5, 2.0, 2.5, 3.0)

### Phase 3: Weight Optimization
1. Analyze which indicators contribute most to winning signals
2. Adjust weights in signal-weights.js accordingly
3. Consider disabling consistently poor performers

### Phase 4: Validation
1. Run backtests with optimized parameters
2. Compare metrics: win rate, profit factor, Sharpe ratio, max drawdown
3. Ensure no overfitting by testing on out-of-sample data

## Performance Targets

| Metric | Minimum | Target | Stretch |
|--------|---------|--------|---------|
| Win Rate | 55% | 65% | 75% |
| Profit Factor | 1.5 | 2.0 | 3.0 |
| Sharpe Ratio | 1.0 | 1.5 | 2.5 |
| Max Drawdown | <20% | <10% | <5% |
| Monthly Return | 5% | 15% | 30% |

## Key Optimization Strategies

### 1. Divergence Priority
RSI and MACD divergences have highest predictive value. Consider:
- Increasing divergence signal weights to 1.5x
- Adding divergence confirmation requirements

### 2. Volatility Regime Adaptation
Different parameters work in different market conditions:
- Low volatility: Tighter bands, lower thresholds, higher leverage
- High volatility: Wider bands, higher thresholds, lower leverage

### 3. Timeframe Alignment
Signals aligned across timeframes are more reliable:
- Require primary AND secondary timeframe agreement
- Weight primary timeframe higher (60/40 split)

### 4. Entry Timing
9th level order book entry improves fill prices:
- Analyze optimal order book depth for each symbol
- Adjust based on typical spread and liquidity

### 5. Risk Management
ROI-based stops are more consistent than price-based:
- Tighter stops (0.3-0.5% ROI) for scalping
- Wider stops (0.75-1.0% ROI) for swing trades
- Always use trailing stops after 1% profit

## Backtesting Best Practices

1. **Minimum 30 days** of data for statistical significance
2. **Test multiple symbols** - what works for BTC may not work for altcoins
3. **Walk-forward validation** - train on 80%, test on 20%
4. **Account for fees** - 0.06% taker fee significantly impacts results
5. **Realistic slippage** - use 0.05% minimum

## Code Modification Rules

1. **Always run tests** after any code change: `npm test`
2. **Backup before major changes** - create a git commit or copy files
3. **Document changes** in comments with date and reasoning
4. **Validate with backtest** before deploying to paper/live trading
5. **Monitor live performance** - be ready to revert if metrics decline

## Autonomous Optimization Loop

When running autonomously, follow this cycle:

```
1. ANALYZE: Review recent backtest results and live performance
2. HYPOTHESIZE: Identify potential improvements
3. IMPLEMENT: Make targeted code/parameter changes
4. TEST: Run full test suite (must pass 100%)
5. BACKTEST: Validate improvement with historical data
6. COMPARE: Check if metrics improved vs baseline
7. DEPLOY: If improved, update main configuration
8. MONITOR: Track live performance
9. REPEAT: Return to step 1
```

## Environment Variables

All configuration can be overridden via .env file. Key variables:
- `BOT_MODE`: paper or live
- `STRATEGY_PROFILE`: conservative, neutral, or aggressive
- `STOP_LOSS_ROI`, `TAKE_PROFIT_ROI`: Risk management
- `SIGNAL_MIN_SCORE`: Entry threshold
- `LEVERAGE_DEFAULT`: Starting leverage
- See `.env.example` for complete list

## API Rate Limits

KuCoin Futures API limits:
- REST: 30 requests per 3 seconds (public), 75 per 3s (private)
- WebSocket: 100 subscriptions per connection
- Order placement: 200 per 10 seconds

## Emergency Procedures

If something goes wrong:
1. **Stop the bot**: `Ctrl+C` or kill the process
2. **Check positions**: Log into KuCoin and close manually if needed
3. **Review logs**: Check `logs/` directory for errors
4. **Revert changes**: Use git or restore from backup
5. **Paper trade first**: Always test fixes in paper mode

## Success Metrics

Track these metrics in `logs/performance.json`:
- Daily P&L
- Win rate (rolling 7-day and 30-day)
- Profit factor
- Average winner vs average loser
- Maximum consecutive losses
- Sharpe ratio
- Maximum drawdown

## Notes for Claude Code

- You have FULL AUTONOMY to modify any file in this project
- Your goal is MAXIMUM PROFITABILITY with HIGH WIN RATES
- Always maintain code quality and test coverage
- Document all optimization attempts and results
- Be aggressive in pursuing improvements but cautious in deployment
- Paper trade all changes before live deployment
- If unsure, backtest extensively before proceeding
