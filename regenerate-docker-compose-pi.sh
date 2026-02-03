#!/bin/bash

# Regenerate docker-compose.pi.yml with stable host WiFi API mapping

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

print_status "Regenerating docker-compose.pi.yml..."

WIFI_API_URL_VALUE="http://host.docker.internal:8787"

cat > docker-compose.pi.yml <<'COMPOSE'
services:
  wedding-jukebox:
    image: ghcr.io/jaredlthompson/wedding-jukebox:latest
    container_name: wedding-jukebox-pi
    ports:
      - "3000:3000"
    volumes:
      # Persist important data
      - jukebox-data:/app/data
      # Mount OAuth and history files if they exist
      - ./oauth.json:/app/oauth.json:ro
      - ./wedding-play-history.json:/app/wedding-play-history.json
      # Host audio cache (headless playback)
      - ./audio-cache:/app/audio-cache
      # Audio device access
      - /dev/snd:/dev/snd
    devices:
      - /dev/snd:/dev/snd
    environment:
      - NODE_ENV=production
      - PORT=3000
      - PULSE_RUNTIME_PATH=/run/user/1000/pulse
      - WIFI_API_URL=__WIFI_API_URL__
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
    networks:
      - jukebox-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/playlist/status"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    # Pi-specific optimizations
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

volumes:
  jukebox-data:
    driver: local

networks:
  jukebox-network:
    driver: bridge
COMPOSE

# Substitute WiFi API URL safely
perl -0pi -e "s#__WIFI_API_URL__#${WIFI_API_URL_VALUE}#g" docker-compose.pi.yml

print_success "docker-compose.pi.yml regenerated."
print_warning "Run: docker compose -f docker-compose.pi.yml up -d"
