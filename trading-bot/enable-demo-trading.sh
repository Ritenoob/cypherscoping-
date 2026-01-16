#!/bin/bash
# ============================================================================
# Enable Demo Trading - Automated Paper Trading System
# ============================================================================

echo "════════════════════════════════════════════════════════════"
echo "  🤖 DEMO TRADING ENGINE - Paper Trading System"
echo "════════════════════════════════════════════════════════════"
echo ""

# Enable demo trading
echo "📡 Enabling demo trading..."
RESPONSE=$(curl -s -X POST http://localhost:3001/api/demo/toggle \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Demo trading ENABLED"
else
  echo "❌ Failed to enable demo trading"
  echo "$RESPONSE"
  exit 1
fi

echo ""
echo "────────────────────────────────────────────────────────────"
echo "  📊 DEMO TRADING STATUS"
echo "────────────────────────────────────────────────────────────"

# Get status
curl -s http://localhost:3001/api/demo/status | jq '.' || echo "Status retrieval failed"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  🎯 DEMO TRADING PARAMETERS"
echo "════════════════════════════════════════════════════════════"
echo "  • Initial Balance: $10,000 (paper money)"
echo "  • Max Positions: 3 concurrent"
echo "  • Max Risk/Trade: 2% of balance"
echo "  • Entry Signal Threshold: 60 points"
echo "  • Min Indicator Confluence: 3 indicators"
echo "  • Stop Loss: 2% ROI (leveraged)"
echo "  • Take Profit: 4% ROI (leveraged)"
echo "  • Dynamic Leverage: 3x-10x (volatility-based)"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "✨ The system is now analyzing real-time market data"
echo "✨ It will place demo trades when indicators align"
echo "✨ Monitor logs: tail -f logs/demo-trading.log"
echo "✨ View dashboard: http://localhost:3001"
echo ""
echo "🛑 To disable: curl -X POST http://localhost:3001/api/demo/toggle -H 'Content-Type: application/json' -d '{\"enabled\": false}'"
echo ""
