#!/bin/bash

echo "# Trade Limits & Guards" > limits-check.txt
echo "" >> limits-check.txt

echo "## Position Size Limits" >> limits-check.txt
grep -rn "MAX_POSITION\|maxPosition\|positionLimit" core/ screener/ strategy/ --include="*.js" 2>/dev/null >> limits-check.txt

echo "" >> limits-check.txt
echo "## Leverage Limits" >> limits-check.txt
grep -rn "MAX_LEVERAGE\|maxLeverage\|leverageLimit" core/ screener/ strategy/ --include="*.js" 2>/dev/null >> limits-check.txt

echo "" >> limits-check.txt
echo "## Risk Limits" >> limits-check.txt
grep -rn "MAX_RISK\|maxRisk\|riskLimit" core/ screener/ strategy/ --include="*.js" 2>/dev/null >> limits-check.txt

echo "" >> limits-check.txt
echo "## Order Validation" >> limits-check.txt
grep -rn "validate.*order\|check.*limit\|if.*>.*MAX\|if.*<.*MIN" core/ screener/ strategy/ --include="*.js" 2>/dev/null | head -20 >> limits-check.txt

echo "" >> limits-check.txt
echo "## Pre-Trade Checks" >> limits-check.txt
grep -rn "before.*order\|pre.*trade\|canTrade\|validateTrade" core/ screener/ strategy/ --include="*.js" 2>/dev/null >> limits-check.txt
