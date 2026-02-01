#!/bin/bash

echo "🐳 Wedding Jukebox Docker Setup"
echo "================================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

echo "✅ Docker is installed"

# Check if oauth.json exists
if [ ! -f "oauth.json" ]; then
    echo ""
    echo "⚠️  YouTube Music OAuth not configured"
    echo "You have two options:"
    echo ""
    echo "1. 🎵 Full Setup (with YouTube Music)"
    echo "   - Requires YouTube Music Premium account"
    echo "   - Can play actual songs from playlists"
    echo "   - Run: python3 setup_auth.py (before Docker)"
    echo ""
    echo "2. 🧪 Demo Mode (without YouTube Music)"
    echo "   - Works without authentication"
    echo "   - Shows interface and queue management"
    echo "   - Songs won't actually play"
    echo ""
    read -p "Continue with Demo Mode? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "To set up YouTube Music authentication:"
        echo "1. Install Python dependencies: pip3 install -r requirements.txt"
        echo "2. Run: python3 setup_auth.py"
        echo "3. Follow the authentication prompts"
        echo "4. Then run this script again"
        exit 1
    fi
    
    # Create dummy oauth.json for demo mode
    echo '{"access_token": "demo", "refresh_token": "demo"}' > oauth.json
    echo "📝 Created demo oauth.json"
fi

# Create empty history file if it doesn't exist
if [ ! -f "wedding-play-history.json" ]; then
    echo '[]' > wedding-play-history.json
    echo "📝 Created empty play history file"
fi

echo ""
echo "🏗️  Building Docker container..."
docker build -t wedding-jukebox . || {
    echo "❌ Docker build failed"
    exit 1
}

echo ""
echo "🚀 Starting Wedding Jukebox..."
docker-compose up -d || {
    echo "❌ Failed to start container"
    exit 1
}

echo ""
echo "✅ Wedding Jukebox is running!"
echo ""
echo "🌐 Access URLs:"
echo "   DJ Interface:  http://localhost:3000"
echo "   User Interface: http://localhost:3000/user"
echo "   QR Code Page:   http://localhost:3000/qr"
echo ""
echo "📊 Management Commands:"
echo "   View logs:     docker-compose logs -f"
echo "   Stop service:  docker-compose down"
echo "   Restart:       docker-compose restart"
echo "   Update:        docker-compose pull && docker-compose up -d"
echo ""

# Wait a moment for the service to start
echo "⏳ Waiting for service to start..."
sleep 5

# Check if the service is healthy
if curl -s http://localhost:3000/api/playlist/status > /dev/null; then
    echo "✅ Service is running and healthy!"
    echo ""
    echo "🎉 Ready to use! Open http://localhost:3000 in your browser"
else
    echo "⚠️  Service may still be starting. Check logs with:"
    echo "   docker-compose logs -f"
fi