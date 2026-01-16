#!/usr/bin/env bash

set -e

cat << 'EOF' > .gitignore
# Dependencies
node_modules

# Build outputs
dist
build

# Environment variables
.env
.env.*

# OS / Editor
.DS_Store
.vscode
EOF

echo ".gitignore created successfully"

