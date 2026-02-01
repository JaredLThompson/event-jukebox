#!/bin/bash

# 🎵 Wedding Jukebox - Deploy from GitHub Container Registry
# This script pulls the latest container image and starts the jukebox

set -e

echo "🎵 Wedding Jukebox - GitHub Registry Deployment"
echo "=============================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

# Stop existing container if running
echo "🛑 Stopping existing containers..."
docker-compose down 2>/dev/null || true

# Pull latest image
echo "📥 Pulling latest Wedding Jukebox image..."
docker-compose pull

# Start the container
echo "🚀 Starting Wedding Jukebox..."
docker-compose up -d

# Wait for container to be healthy
echo "⏳ Waiting for container to be ready..."
sleep 10

# Check if container is running
if docker-compose ps | grep -q "Up"; then
    echo ""
    echo "✅ Wedding Jukebox is running!"
    echo ""
    echo "🎧 DJ Interface: http://localhost:3000"
    echo "📱 Guest Interface: http://localhost:3000/user"
    echo "📋 QR Codes: http://localhost:3000/qr"
    echo ""
    echo "📊 Container Status:"
    docker-compose ps
    echo ""
    echo "📝 View logs: docker-compose logs -f"
    echo "🛑 Stop: docker-compose down"
else
    echo "❌ Container failed to start. Check logs:"
    docker-compose logs
    exit 1
fi