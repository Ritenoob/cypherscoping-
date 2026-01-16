#!/bin/bash

echo "# Trading Formulas & Calculations" > formulas.txt
echo "" >> formulas.txt

echo "## Position Sizing Formulas" >> formulas.txt
grep -rn "positionSize.*=\|size.*=.*\*\|quantity.*=" core/ screener/ strategy/ --include="*.js" 2>/dev/null | grep -v "test" | head -15 >> formulas.txt

echo "" >> formulas.txt
echo "## Leverage Calculations" >> formulas.txt
grep -rn "leverage.*=\|effectiveLeverage\|margin.*=" core/ screener/ strategy/ --include="*.js" 2>/dev/null | head -15 >> formulas.txt

echo "" >> formulas.txt
echo "## Risk Calculations" >> formulas.txt
grep -rn "risk.*=\|riskAmount\|riskPercent" core/ screener/ strategy/ --include="*.js" 2>/dev/null | head -15 >> formulas.txt

echo "" >> formulas.txt
echo "## Stop Loss Calculations" >> formulas.txt
grep -rn "stopLoss.*=\|stop.*=.*price" core/ screener/ strategy/ --include="*.js" 2>/dev/null | head -15 >> formulas.txt

echo "" >> formulas.txt
echo "## Break-even Calculations" >> formulas.txt
grep -rn "breakeven\|breakEven\|lockProfit" core/ screener/ strategy/ --include="*.js" 2>/dev/null | head -15 >> formulas.txt

echo "" >> formulas.txt
echo "## Price/Math Type Usage" >> formulas.txt
echo "Checking for Decimal usage (safe) vs native number (unsafe):" >> formulas.txt
grep -rn "new Decimal\|Decimal\.div\|Decimal\.mul" core/ screener/ strategy/ --include="*.js" 2>/dev/null | wc -l | xargs echo "Decimal operations found: " >> formulas.txt
grep -rn "parseFloat\|Number(" core/ screener/ strategy/ --include="*.js" 2>/dev/null | wc -l | xargs echo "Unsafe float operations found: " >> formulas.txt
