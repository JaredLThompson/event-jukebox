#!/bin/bash

# Quick Docker test script
echo "🐳 Building Event Jukebox Docker container..."

# Build the container
docker build -t event-jukebox .

# Run the container
echo "🎵 Starting Event Jukebox on port 3000..."
docker run -d \
  --name event-jukebox \
  -p 3000:3000 \
  -v $(pwd)/oauth.json:/app/oauth.json \
  -v $(pwd)/event-play-history.json:/app/event-play-history.json \
  event-jukebox

echo "✅ Event Jukebox is running!"
echo "🌐 Open http://localhost:3000 in your browser"
echo "📱 DJ Interface: http://localhost:3000"
echo "🎤 User Interface: http://localhost:3000/user"
echo "📋 QR Code: http://localhost:3000/qr"

echo ""
echo "To stop: docker stop event-jukebox"
echo "To view logs: docker logs -f event-jukebox"