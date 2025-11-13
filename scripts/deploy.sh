#!/bin/bash

# Placement Test Deployment Script
# This script seeds the question database and verifies everything works

echo "🚀 Deploying Placement Test System"
echo "=================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in backend directory"
    echo "Please cd to the backend directory first"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
    echo ""
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found"
    echo "Please create .env with MONGODB_URI before continuing"
    echo ""
    echo "Example .env content:"
    echo "MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/aced-learning"
    echo ""
    exit 1
fi

# Check if MONGODB_URI is set
if ! grep -q "MONGODB_URI" .env; then
    echo "⚠️  Warning: MONGODB_URI not found in .env"
    echo "Please add MONGODB_URI to .env file"
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Seed questions
echo "📝 Seeding question database..."
node scripts/seedQuestions.js
if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Failed to seed questions"
    echo "Check the error above and fix before continuing"
    exit 1
fi

echo ""
echo "🧪 Running verification tests..."
node scripts/testPlacementTest.js
if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Tests failed"
    echo "Check the error above"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════"
echo "✅ Placement Test System Deployed Successfully!"
echo "═══════════════════════════════════════"
echo ""
echo "Next steps:"
echo "1. Restart your backend server (if needed)"
echo "2. Test from frontend - try starting a placement test"
echo "3. Verify first question appears"
echo ""
echo "If using PM2: pm2 restart aced-backend"
echo "If using systemctl: sudo systemctl restart aced-backend"
echo ""
