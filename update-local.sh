#!/bin/bash

# Update Wedding Jukebox with a fresh local Docker build
set -e

APP_DIR="/home/pi/wedding-jukebox"

echo "🔧 Updating Wedding Jukebox (local build)..."
cd "$APP_DIR"

if [ -x "./backup.sh" ]; then
    echo "💾 Running backup..."
    ./backup.sh
else
    echo "ℹ️  No backup.sh found, skipping backup."
fi

echo "🛑 Stopping existing container (if running)..."
docker stop wedding-jukebox 2>/dev/null || true
docker rm wedding-jukebox 2>/dev/null || true

echo "🏗️ Rebuilding and deploying container..."
./deploy-local.sh --rebuild

echo "🔊 Restarting audio service..."
sudo systemctl restart wedding-jukebox-audio

echo "✅ Update complete!"
