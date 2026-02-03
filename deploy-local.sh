#!/bin/bash

# 🎵 Virtual Jukebox - Local Docker Deployment Script
# This script builds and deploys the Virtual Jukebox locally using Docker

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="wedding-jukebox"
IMAGE_NAME="wedding-jukebox:latest"
PORT=${PORT:-3000}
HOST_PORT=${HOST_PORT:-3000}
FORCE_LOCAL_BUILD=0

if [[ "$1" == "--force-local" ]]; then
    FORCE_LOCAL_BUILD=1
fi

echo -e "${PURPLE}🎵 Virtual Jukebox - Local Docker Deployment${NC}"
echo -e "${PURPLE}================================================${NC}"
echo ""

# Function to print status messages
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# If running on a Raspberry Pi and docker-compose.pi.yml exists, use that.
if grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null && [[ -f "docker-compose.pi.yml" ]]; then
    print_status "Raspberry Pi detected - using docker-compose.pi.yml"

    # Determine compose command
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        print_error "Docker Compose not found. Install docker-compose or the docker compose plugin."
        exit 1
    fi

    # Ensure host WiFi API is running if available
    if systemctl is-enabled wedding-jukebox-wifi-api &> /dev/null; then
        print_status "Starting WiFi API service..."
        sudo systemctl start wedding-jukebox-wifi-api || true
    fi

    # Use compose for Pi deployment
    print_status "Stopping any existing services..."
    $COMPOSE_CMD -f docker-compose.pi.yml down || true
    if docker ps -a --format '{{.Names}}' | grep -q "^wedding-jukebox-pi$"; then
        print_status "Removing stale container wedding-jukebox-pi..."
        docker rm -f wedding-jukebox-pi || true
    fi

    print_status "Starting services with docker-compose.pi.yml..."
    if [[ "$FORCE_LOCAL_BUILD" -eq 1 ]]; then
        print_warning "Force local build enabled. Building image locally..."
        docker build -t ghcr.io/jaredlthompson/wedding-jukebox:latest .
    else
        if ! $COMPOSE_CMD -f docker-compose.pi.yml pull; then
            print_warning "Image pull failed. Building locally instead..."
            docker build -t ghcr.io/jaredlthompson/wedding-jukebox:latest .
        fi
    fi
    $COMPOSE_CMD -f docker-compose.pi.yml up -d

    echo ""
    print_success "Deployment complete (Docker Compose)."
    echo ""
    exit 0
fi

# Check if Docker is installed and running
print_status "Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info &> /dev/null; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

print_success "Docker is installed and running"

# Stop and remove existing container if it exists
print_status "Checking for existing container..."
if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    print_warning "Stopping and removing existing container: ${CONTAINER_NAME}"
    docker stop ${CONTAINER_NAME} 2>/dev/null || true
    docker rm ${CONTAINER_NAME} 2>/dev/null || true
    print_success "Existing container removed"
fi

# Remove existing image if it exists (for fresh build)
if [[ "$1" == "--rebuild" ]] || [[ "$1" == "-r" ]]; then
    print_status "Rebuilding image from scratch..."
    docker rmi ${IMAGE_NAME} 2>/dev/null || true
fi

# Build the Docker image
print_status "Building Docker image: ${IMAGE_NAME}"
echo -e "${CYAN}This may take a few minutes for the first build...${NC}"

if docker build -t ${IMAGE_NAME} .; then
    print_success "Docker image built successfully"
else
    print_error "Failed to build Docker image"
    exit 1
fi

# Check if .env file exists and warn about configuration
if [[ -f ".env" ]]; then
    print_success "Found .env file - will be mounted into container"
    if grep -q "SPOTIFY_CLIENT_ID" .env 2>/dev/null; then
        print_success "Spotify credentials found in .env"
    else
        print_warning "No Spotify credentials in .env - Spotify integration will be disabled"
    fi
else
    print_warning "No .env file found - using default configuration"
    print_status "To enable Spotify integration:"
    echo "  1. Run: node setup_spotify_auth.js"
    echo "  2. Restart this deployment script"
fi

# Create volume for persistent data
print_status "Creating Docker volume for persistent data..."
docker volume create wedding-jukebox-data 2>/dev/null || true

# Detect host IP for QR codes
print_status "Detecting host IP address for QR codes..."
HOST_IP=""

# Try different methods to get the host IP
if command -v hostname &> /dev/null; then
    # Try hostname -I (Linux)
    HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || echo "")
fi

if [[ -z "$HOST_IP" ]]; then
    # Try ifconfig (macOS/Linux)
    HOST_IP=$(ifconfig 2>/dev/null | grep -E 'inet [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | sed 's/addr://' || echo "")
fi

if [[ -z "$HOST_IP" ]]; then
    # Try ip route (Linux)
    HOST_IP=$(ip route get 8.8.8.8 2>/dev/null | grep -oP 'src \K[0-9.]+' || echo "")
fi

if [[ -z "$HOST_IP" ]]; then
    # Try route (macOS)
    HOST_IP=$(route get default 2>/dev/null | grep interface | awk '{print $2}' | xargs ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1 || echo "")
fi

if [[ -z "$HOST_IP" ]]; then
    # Fallback: try to get from network interfaces
    HOST_IP=$(python3 -c "
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(('8.8.8.8', 80))
    ip = s.getsockname()[0]
    s.close()
    print(ip)
except:
    print('')
" 2>/dev/null || echo "")
fi

if [[ -n "$HOST_IP" ]] && [[ "$HOST_IP" != "127.0.0.1" ]]; then
    print_success "Detected host IP: $HOST_IP"
else
    HOST_IP="localhost"
    print_warning "Could not detect host IP, using localhost"
fi

# Run the container
print_status "Starting container: ${CONTAINER_NAME}"
print_status "Port mapping: ${HOST_PORT}:${PORT}"

DOCKER_RUN_CMD="docker run -d \
    --name ${CONTAINER_NAME} \
    --restart unless-stopped \
    -p ${HOST_PORT}:${PORT} \
    -e HOST_IP=${HOST_IP} \
    -v wedding-jukebox-data:/app/data \
    -v $(pwd)/audio-cache:/app/audio-cache \
    -v $(pwd)/wedding-play-history.json:/app/wedding-play-history.json \
    -v $(pwd)/wedding-playlist.js:/app/wedding-playlist.js \
    -v $(pwd)/bride-playlist.js:/app/bride-playlist.js"

# Mount .env file if it exists
if [[ -f ".env" ]]; then
    DOCKER_RUN_CMD="${DOCKER_RUN_CMD} -v $(pwd)/.env:/app/.env"
fi

# Mount oauth.json if it exists (for YouTube Music auth)
if [[ -f "oauth.json" ]]; then
    DOCKER_RUN_CMD="${DOCKER_RUN_CMD} -v $(pwd)/oauth.json:/app/oauth.json"
    print_success "YouTube Music authentication file found"
fi

DOCKER_RUN_CMD="${DOCKER_RUN_CMD} ${IMAGE_NAME}"

if eval $DOCKER_RUN_CMD; then
    print_success "Container started successfully"
else
    print_error "Failed to start container"
    exit 1
fi

# Wait for container to be ready
print_status "Waiting for application to start..."
sleep 3

# Check if container is running
if docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    print_success "Container is running"
    
    # Test if the application is responding
    print_status "Testing application health..."
    for i in {1..10}; do
        if curl -s http://localhost:${HOST_PORT}/api/music-services/status > /dev/null 2>&1; then
            print_success "Application is responding"
            break
        fi
        if [[ $i -eq 10 ]]; then
            print_warning "Application may still be starting up"
        fi
        sleep 1
    done
else
    print_error "Container failed to start"
    print_status "Checking container logs..."
    docker logs ${CONTAINER_NAME}
    exit 1
fi

# Display deployment information
echo ""
echo -e "${GREEN}🎉 Deployment Successful!${NC}"
echo -e "${PURPLE}========================${NC}"
echo ""
echo -e "${CYAN}🌐 Access URLs:${NC}"
echo -e "   DJ Interface:    ${YELLOW}http://localhost:${HOST_PORT}${NC}"
echo -e "   User Interface:  ${YELLOW}http://localhost:${HOST_PORT}/user${NC}"
echo -e "   QR Codes:        ${YELLOW}http://localhost:${HOST_PORT}/qr${NC}"
echo ""
echo -e "${CYAN}🎵 Music Services:${NC}"
if [[ -f ".env" ]] && grep -q "SPOTIFY_CLIENT_ID" .env 2>/dev/null; then
    echo -e "   YouTube Music:   ${GREEN}✅ Available${NC}"
    echo -e "   Spotify:         ${GREEN}✅ Available${NC}"
else
    echo -e "   YouTube Music:   ${GREEN}✅ Available${NC}"
    echo -e "   Spotify:         ${YELLOW}⚠️  Not configured${NC}"
fi
echo ""
echo -e "${CYAN}🐳 Docker Commands:${NC}"
echo -e "   View logs:       ${YELLOW}docker logs ${CONTAINER_NAME}${NC}"
echo -e "   Stop container:  ${YELLOW}docker stop ${CONTAINER_NAME}${NC}"
echo -e "   Start container: ${YELLOW}docker start ${CONTAINER_NAME}${NC}"
echo -e "   Remove container:${YELLOW}docker rm ${CONTAINER_NAME}${NC}"
echo ""
echo -e "${CYAN}📱 For Mobile Access:${NC}"
if [[ "$HOST_IP" != "localhost" ]]; then
    echo -e "   Host IP:         ${YELLOW}${HOST_IP}${NC}"
    echo -e "   Mobile URL:      ${YELLOW}http://${HOST_IP}:${HOST_PORT}${NC}"
    echo -e "   QR Codes:        ${YELLOW}http://${HOST_IP}:${HOST_PORT}/qr${NC}"
else
    echo -e "   Find your IP:    ${YELLOW}ifconfig | grep 'inet ' | grep -v 127.0.0.1${NC}"
    echo -e "   Mobile URL:      ${YELLOW}http://YOUR_IP:${HOST_PORT}${NC}"
fi
echo ""

# Show container status
print_status "Container Status:"
docker ps --filter "name=${CONTAINER_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo -e "${PURPLE}🎵 Ready for your wedding! Enjoy the music! 🎉${NC}"

# Optional: Open browser
if command -v open &> /dev/null; then
    read -p "Open DJ interface in browser? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open "http://localhost:${HOST_PORT}"
    fi
elif command -v xdg-open &> /dev/null; then
    read -p "Open DJ interface in browser? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        xdg-open "http://localhost:${HOST_PORT}"
    fi
fi
