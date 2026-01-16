#!/bin/bash
# ============================================================================
# Monitor Demo Trading System - Real-time Status Display
# ============================================================================

clear
echo "════════════════════════════════════════════════════════════════"
echo "  🤖 DEMO TRADING SYSTEM - LIVE MONITOR"
echo "════════════════════════════════════════════════════════════════"
echo ""

while true; do
  # Get current status
  STATUS=$(curl -s http://localhost:3001/api/demo/status 2>/dev/null)

  if [ $? -eq 0 ]; then
    ENABLED=$(echo "$STATUS" | jq -r '.enabled')
    BALANCE=$(echo "$STATUS" | jq -r '.metrics.balance')
    TOTAL_RETURN=$(echo "$STATUS" | jq -r '.metrics.totalReturn')
    TRADES=$(echo "$STATUS" | jq -r '.metrics.totalTrades')
    WIN_RATE=$(echo "$STATUS" | jq -r '.metrics.winRate')
    PROFIT_FACTOR=$(echo "$STATUS" | jq -r '.metrics.profitFactor')
    ACTIVE_POS=$(echo "$STATUS" | jq -r '.metrics.activePositions')
    MAX_DD=$(echo "$STATUS" | jq -r '.metrics.maxDrawdown')

    # Move cursor to top
    tput cup 3 0

    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│  STATUS: $([ "$ENABLED" = "true" ] && echo "🟢 ACTIVE    " || echo "🔴 DISABLED  ")                                        │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  Balance:        \$$BALANCE                                 │"
    echo "│  Total Return:   ${TOTAL_RETURN}%                                    │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  Total Trades:   $TRADES                                       │"
    echo "│  Win Rate:       ${WIN_RATE}%                                    │"
    echo "│  Profit Factor:  $PROFIT_FACTOR                                     │"
    echo "│  Max Drawdown:   ${MAX_DD}%                                    │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  Active Positions: $ACTIVE_POS                                    │"
    echo "└──────────────────────────────────────────────────────────────┘"
    echo ""
    echo "  Last Update: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    echo "  Press Ctrl+C to exit"
    echo "  Dashboard: http://localhost:3001"
    echo "  Logs: tail -f logs/demo-trading.log"
    echo ""
  else
    echo "❌ Cannot connect to server. Is it running?"
    exit 1
  fi

  sleep 3
done
