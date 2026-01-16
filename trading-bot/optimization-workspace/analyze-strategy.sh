#!/bin/bash

echo "## Strategy Components Found" > strategy-analysis.txt
echo "" >> strategy-analysis.txt

# Find signal generators
echo "### Signal Generators" >> strategy-analysis.txt
grep -rn "signal\|indicator\|entry\|entryCondition" core/ screener/ strategy/ --include="*.js" 2>/dev/null | head -20 >> strategy-analysis.txt

echo "" >> strategy-analysis.txt
echo "### Exit Logic" >> strategy-analysis.txt
grep -rn "exit\|stopLoss\|takeProfit\|trailing" core/ screener/ strategy/ --include="*.js" 2>/dev/null | head -20 >> strategy-analysis.txt

echo "" >> strategy-analysis.txt
echo "### Position Sizing" >> strategy-analysis.txt
grep -rn "positionSize\|leverage\|risk\|sizing" core/ screener/ strategy/ --include="*.js" 2>/dev/null | head -20 >> strategy-analysis.txt

echo "" >> strategy-analysis.txt
echo "### Market Data Sources" >> strategy-analysis.txt
grep -rn "websocket\|ticker\|orderbook\|candle\|kline" core/ screener/ strategy/ --include="*.js" 2>/dev/null | head -20 >> strategy-analysis.txt
