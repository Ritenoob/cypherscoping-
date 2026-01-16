# Miniature Enigma - KuCoin Futures Trading Bot v5.0

An advanced algorithmic trading system for KuCoin Futures featuring 10 enhanced technical indicators, 3 live-only microstructure analyzers, cross-timeframe signal alignment, ROI-based risk management, and walk-forward optimization.

## What's New in V5.0

This version incorporates learnings from extensive backtesting and live trading development, including the MACD Strategy with Advanced Exit Logic which achieved 74.77% win rate and 7.628 profit factor over 3,143 trades.

**Key Enhancements:**
- Enhanced dashboard UI matching the proven V3.5 interface design
- ROI-based stop loss and take profit calculations with fee adjustment
- Volatility-aware leverage calculator using ATR thresholds
- Strategy profiles (Conservative, Neutral, Aggressive) with configurable weights
- Strategy router for multi-signal strategy support
- Backtest runner script with historical data fetching
- Signal export functionality (JSON, CSV, Markdown)

## Architecture Overview

The system implements a modular architecture with clear separation between indicator calculation, signal generation, strategy routing, and trade execution. All components follow a standardized interface for seamless integration.

## Core Components

### Technical Indicators (10 Total)

Each indicator returns a standardized result object containing the calculated value and an array of detected signals with direction, strength, and metadata.

**RSI Indicator** - Relative Strength Index with Wilder smoothing. Detects crossover, momentum shifts, divergence patterns, and overbought/oversold zones.

**MACD Indicator** - Moving Average Convergence Divergence. Identifies signal line crossovers, zero line crossovers, histogram patterns, and divergence.

**Williams %R Indicator** - Momentum oscillator ranging from -100 to 0. Detects threshold crossovers, failure swings, divergence, and extreme zones.

**Awesome Oscillator** - Bill Williams momentum indicator. Identifies zero crossings, saucer patterns, twin peaks formations, and divergence.

**Stochastic Indicator** - K/D momentum oscillator. Detects K/D crossovers, overbought/oversold zones, and divergence patterns.

**Bollinger Bands** - Volatility-based bands. Identifies band touches, squeeze conditions, breakouts, and %B analysis.

**EMA Trend** - Multiple exponential moving average system. Detects EMA crossovers, golden/death crosses, trend direction, and slope analysis.

**KDJ Indicator** - Extended stochastic with J line. The J line calculation uses the RSV formula: (Close-Low)/(High-Low)×100. Identifies J line extremes, K/D crossovers, and divergence.

**OBV Indicator** - On-Balance Volume with slope analysis. Uses z-score normalization for signal generation. Detects slope changes, breakouts, and divergence.

**DOM Analyzer** - Depth of Market analysis (live-only). Calculates bid/ask imbalance, wall detection, and microprice bias.

### Microstructure Analyzers (3 Total - Live Only)

These analyzers require live market data and will not generate signals during backtesting.

**Buy:Sell Ratio Analyzer** - Monitors trade flow across three time windows (5 seconds, 1 minute, 5 minutes). Detects flow imbalance, absorption patterns, exhaustion signals, and delta momentum.

**Price Ratio Analyzer** - Tracks relationships between bid, ask, index, mark, and last prices. Calculates spread in basis points and futures basis (premium/discount). Signals extreme premium/discount conditions, critical spread warnings, and convergence/divergence patterns.

**Funding Rate Analyzer** - Monitors perpetual futures funding rates. Tracks current rate, predicted rate, and funding timing (8-hour intervals). Provides annualized rate calculation (rate × 3 × 365). Signals extreme funding conditions, rate changes, and imminent funding warnings.

### Signal Generation System

The SignalGeneratorV2 integrates all indicators and microstructure analyzers to produce a composite trading signal. The score range spans from -120 to +120, with indicator scores contributing up to ±100 and microstructure scores contributing up to ±20.

Signal classifications follow this schema: STRONG_BUY (≥70), BUY (≥30), NEUTRAL (-30 to 30), SELL (≤-30), STRONG_SELL (≤-70).

### Strategy Profiles

Three pre-configured strategy profiles are available:

**Conservative** - Capital preservation focus with tighter thresholds (min score 70, min confidence 60%, 5+ indicators agreeing), lower leverage (max 25x), and smaller positions (max 1% per trade).

**Neutral** - Balanced approach with moderate thresholds (min score 50, min confidence 40%, 4+ indicators agreeing), standard leverage (50x), and medium positions (max 2% per trade).

**Aggressive** - Growth focus with looser thresholds (min score 40, min confidence 30%, 3+ indicators agreeing), higher leverage (max 100x), and larger positions (max 5% per trade).

## Directory Structure

```
miniature-enigma/
├── index.js                    # Main entry point
├── server.js                   # HTTP server with dashboard API
├── dashboard-v5.html           # Enhanced web dashboard UI
├── screenerEngine.js           # WebSocket screener with token management
├── coinList.js                 # Dynamic coin list manager
├── timeframeAligner.js         # Cross-timeframe signal alignment
├── screenerConfig.js           # Screener configuration
├── signal-weights.js           # Indicator weight configuration
├── package.json
├── config/
│   ├── runtimeConfig.js        # Runtime configuration
│   ├── pairs.json              # Enabled trading pairs
│   └── leverage-calculator.js  # Volatility-aware leverage
├── switches/
│   ├── strategyRouter.js       # Multi-strategy routing
│   └── signalProfiles/
│       ├── conservative.js
│       ├── neutral.js
│       └── aggressive.js
├── scripts/
│   ├── backtest-runner.js      # Backtest execution script
│   └── export-signals.js       # Signal export utility
├── src/
│   ├── indicators/             # 10 technical indicators
│   ├── microstructure/         # 3 live-only analyzers
│   ├── lib/                    # Core libraries
│   ├── optimizer/              # Paper trading engines
│   ├── backtest/               # Backtesting engine
│   └── utils/                  # Utilities
└── tests/                      # Test suites
```

## Installation

```bash
cd miniature-enigma
npm install
```

## Usage

Start the bot in paper trading mode:
```bash
npm run start:paper
```

Start the dashboard server:
```bash
npm run dashboard
```

Run a backtest:
```bash
npm run backtest -- --symbol BTCUSDTM --timeframe 15min --days 30
```

Export signals:
```bash
npm run export -- --format json --output ./signals.json
```

Run the test suite:
```bash
npm test
```

## Configuration

Edit `config/runtimeConfig.js` to customize position sizing, leverage, and risk management. Edit `config/pairs.json` to configure trading pairs. Edit `switches/signalProfiles/` to customize strategy profiles.

## Position Sizing Formulas

Position size calculation: `size = floor(notional / (price × multiplier) / lotSize) × lotSize`

Break-even ROI: `BE_ROI = (entryFee + exitFee) × leverage × 100 + buffer`

Stop loss price (long): `SL_price = entry × (1 - (SL_ROI / leverage / 100))`

Take profit price (long): `TP_price = entry × (1 + (TP_ROI / leverage / 100))`

Liquidation price (long): `liq = entry × (1 - (1/leverage) × (1 - maintMargin))`

## Success Criteria

The system targets the following performance metrics: test coverage greater than 95%, backtest Sharpe ratio greater than 1.5, signal accuracy greater than 55%, maximum drawdown less than 15%, latency under 100ms, microstructure win rate greater than 60%, and entry filter rate less than 20%.

## WebSocket Token Management

The screener engine implements automatic token refresh every 23 hours to maintain continuous WebSocket connectivity to KuCoin Futures. Token expiration is handled gracefully with automatic reconnection.

## License

ISC
