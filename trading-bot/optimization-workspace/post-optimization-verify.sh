#!/bin/bash
set -euo pipefail

echo "Running post-optimization verification..."

# Run tests
if npm test 2>/dev/null; then
    echo "✓ All tests passed"
else
    echo "✗ Tests failed. Review changes."
    exit 1
fi

# Run audit again
if [ -f ./scripts/audit-live-system.sh ]; then
    echo "Running full audit..."
    ./scripts/audit-live-system.sh
fi

echo ""
echo "✓ Verification complete"
