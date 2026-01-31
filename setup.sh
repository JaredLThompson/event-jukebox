#!/bin/bash

echo "🎵 Setting up Virtual Jukebox with YouTube Music Integration..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install it first:"
    echo "   brew install node"
    exit 1
fi

# Check if Python3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 is not installed. Please install it first:"
    echo "   brew install python3"
    exit 1
fi

echo "✅ Node.js and Python3 are installed"

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Create Python virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "🐍 Creating Python virtual environment..."
    python3 -m venv venv
fi

# Install Python dependencies
echo "📦 Installing Python dependencies..."
source venv/bin/activate && pip install -r requirements.txt

echo "🎉 Setup complete!"
echo ""
echo "To start the jukebox:"
echo "   npm run dev"
echo ""
echo "Then open your browser to: http://localhost:3000"
echo ""
echo "Features:"
echo "✅ Real-time collaborative queue"
echo "✅ YouTube Music search integration"
echo "✅ Beautiful modern UI"
echo "✅ Mobile responsive design"