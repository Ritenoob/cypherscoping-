#!/bin/bash

# KuCoin Futures Trading System - Setup Script

echo "========================================"
echo "KuCoin Futures Trading System Setup"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js 16+ from https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js version: $(node --version)"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed!"
    exit 1
fi

echo "✓ npm version: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✓ Dependencies installed"
echo ""

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✓ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env file and add your KuCoin API credentials!"
    echo ""
    echo "Required credentials:"
    echo "  - KUCOIN_API_KEY"
    echo "  - KUCOIN_API_SECRET"
    echo "  - KUCOIN_API_PASSPHRASE"
    echo ""
    echo "Get them from: https://www.kucoin.com/account/api"
    echo "Make sure to enable 'Futures Trading' permission!"
    echo ""
else
    echo "✓ .env file already exists"
    echo ""
fi

# Check if .env has been configured
if grep -q "your_api_key_here" .env 2>/dev/null; then
    echo "⚠️  WARNING: .env file still contains placeholder values!"
    echo "Please edit .env and add your real API credentials before starting."
    echo ""
fi

echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit .env file:"
echo "   nano .env"
echo ""
echo "2. Add your KuCoin API credentials"
echo ""
echo "3. Start the server:"
echo "   npm start"
echo ""
echo "4. Start your React frontend"
echo ""
echo "========================================"
echo ""
echo "Need help? Check README.md for detailed instructions"
echo ""
