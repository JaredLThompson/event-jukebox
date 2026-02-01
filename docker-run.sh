#!/bin/bash

# Quick Docker test script
echo "🐳 Building Wedding Jukebox Docker container..."

# Build the container
docker build -t wedding-jukebox .

# Run the container
echo "🎵 Starting Wedding Jukebox on port 3000..."
docker run -d \
  --name wedding-jukebox \
  -p 3000:3000 \
  -v $(pwd)/oauth.json:/app/oauth.json \
  -v $(pwd)/wedding-play-history.json:/app/wedding-play-history.json \
  wedding-jukebox

echo "✅ Wedding Jukebox is running!"
echo "🌐 Open http://localhost:3000 in your browser"
echo "📱 DJ Interface: http://localhost:3000"
echo "🎤 User Interface: http://localhost:3000/user"
echo "📋 QR Code: http://localhost:3000/qr"

echo ""
echo "To stop: docker stop wedding-jukebox"
echo "To view logs: docker logs -f wedding-jukebox"