# CypherScope Trading Agent

AI-Powered Cryptocurrency Trading Agent with Multi-Agent Architecture

## Features

- **Multi-Agent System**: Specialized agents for signal analysis, risk management, trading execution, and market screening
- **Williams %R Gated Entry**: Trigger-based entry system with confirmation windows
- **Multi-Indicator Confirmation**: RSI, StochRSI, MACD, Bollinger, Stochastic, KDJ, OBV, CMF, and more
- **Risk Management**: Position sizing, leverage optimization, stop loss, take profit, and drawdown protection
- **AI-Powered Analysis**: ML-based market regime detection and pattern recognition
- **Dual Trading Modes**: Manual and algorithmic trading support
- **Coin Screener**: Automated market scanning and opportunity detection

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CYPHERSCOPE ORCHESTRATOR                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Signal        │  │   Risk          │  │   Trading       │  │
│  │   Analysis      │  │   Management    │  │   Executor      │  │
│  │   Agent         │  │   Agent         │  │   Agent         │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│  ┌────────┴────────────────────┴────────────────────┴────────┐  │
│  │                   Coin Screener Agent                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            │                                      │
│                            ▼                                      │
│              ┌─────────────────────────────┐                      │
│              │   KuCoin Futures API        │                      │
│              │   (Manual/Algo Trading)     │                      │
│              └─────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
cd cypherscoping-agent
npm install
npm run build
```

## Usage

### Basic Usage

```typescript
import { createAgent } from './src/main';

async function main() {
  const agent = await createAgent();
  
  // Set trading mode
  agent.setMode('algo');
  
  // Analyze a symbol
  const result = await agent.analyze('BTC/USDT', ohlcvData);
  console.log('Signal:', result.signal);
  console.log('AI Analysis:', result.aiAnalysis);
  
  // Scan market for opportunities
  const scan = await agent.scan();
  console.log('Opportunities:', scan.topOpportunities);
  
  // Execute trade
  await agent.trade('BTC/USDT', 'buy', 1.5);
  
  await agent.shutdown();
}

main();
```

### Event Handling

```typescript
agent.on('initialized', (data) => console.log('Ready:', data));
agent.on('mode-changed', (data) => console.log('Mode:', data.mode));
```

## Indicators

| Indicator | Weight | Purpose |
|-----------|--------|---------|
| Williams %R | 20 | Primary trigger |
| StochRSI | 20 | Oversold/overbought |
| RSI | 17 | Momentum |
| MACD | 18 | Trend |
| Stochastic | 18 | Momentum |
| KDJ | 17 | Momentum |
| OBV | 18 | Volume flow |
| CMF | 19 | Money flow |
| Bollinger | 20 | Volatility |
| AO | 17 | Trend |

## Scoring System

- **Range**: -220 to +220
- **Strong Long**: >= 95
- **Long**: >= 65
- **Neutral**: -39 to 39
- **Short**: <= -65
- **Strong Short**: <= -95

## Risk Management

- **Position Size**: 2% default, configurable
- **Max Leverage**: 10x
- **Stop Loss**: 6% ROI-based
- **Take Profit**: 15% ROI-based
- **Max Drawdown**: 3% daily

## Configuration

Create a `config.json` file:

```json
{
  "tradingMode": "algo",
  "risk": {
    "maxPositionSize": 0.02,
    "maxLeverage": 10,
    "stopLossPercent": 0.06,
    "takeProfitPercent": 0.15,
    "maxDrawdown": 0.03,
    "maxOpenPositions": 5
  },
  "symbols": ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
}
```

## License

Proprietary - Mirko's Quant Systems
