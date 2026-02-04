#!/bin/bash

# Update Event Jukebox with a fresh local Docker build
set -e

APP_DIR="/home/pi/event-jukebox"

echo "🔧 Updating Event Jukebox (local build)..."
cd "$APP_DIR"

if [ -x "./backup.sh" ]; then
    echo "💾 Running backup..."
    ./backup.sh
else
    echo "ℹ️  No backup.sh found, skipping backup."
fi

echo "🛑 Stopping existing container (if running)..."
docker stop event-jukebox 2>/dev/null || true
docker rm event-jukebox 2>/dev/null || true

echo "🏗️ Rebuilding and deploying container..."
./deploy-local.sh --rebuild

echo "🔊 Restarting audio service..."
sudo systemctl restart event-jukebox-audio

echo "✅ Update complete!"
