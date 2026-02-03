#!/bin/bash

# 🥧 Raspberry Pi Wedding Jukebox - Docker Setup
# This script installs Docker and runs the jukebox from the container registry

set -e

echo "🥧 Wedding Jukebox - Docker Pi Setup"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Check if running on Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    print_warning "This script is designed for Raspberry Pi, but continuing anyway..."
fi

# Check Pi version
PI_VERSION=$(grep "Revision" /proc/cpuinfo | head -1 | awk '{print $3}')
if [[ $PI_VERSION == *"c04170"* ]] || [[ $PI_VERSION == *"d04170"* ]] || [[ $PI_VERSION == *"c04171"* ]] || [[ $PI_VERSION == *"d04171"* ]]; then
    print_success "Raspberry Pi 5 detected - excellent for Docker!"
elif [[ $PI_VERSION == *"a03111"* ]] || [[ $PI_VERSION == *"b03111"* ]] || [[ $PI_VERSION == *"c03111"* ]]; then
    print_success "Raspberry Pi 4 detected - perfect for Docker!"
elif [[ $PI_VERSION == *"a020d3"* ]] || [[ $PI_VERSION == *"a02082"* ]]; then
    print_warning "Raspberry Pi 3 detected - Docker will work but may be slower"
else
    print_warning "Pi model not specifically recognized (revision: $PI_VERSION) - Docker should still work fine"
fi

# Update system
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Docker
print_status "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker pi
    rm get-docker.sh
    print_success "Docker installed successfully"
else
    print_status "Docker already installed"
fi

# Install Docker Compose
print_status "Installing Docker Compose..."
if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    # Try to install docker-compose-plugin first (preferred method)
    if sudo apt install -y docker-compose-plugin 2>/dev/null; then
        print_success "Docker Compose plugin installed successfully"
    else
        # Fallback to standalone docker-compose if plugin fails
        sudo apt install -y docker-compose
        print_success "Docker Compose installed successfully"
    fi
else
    print_status "Docker Compose already available"
    # Show which version is available
    if docker compose version &> /dev/null; then
        print_status "Using Docker Compose V2 (plugin): $(docker compose version --short 2>/dev/null || echo 'version unknown')"
    elif command -v docker-compose &> /dev/null; then
        print_status "Using Docker Compose V1: $(docker-compose --version 2>/dev/null || echo 'version unknown')"
    fi
fi

# Create application directory
APP_DIR="/home/pi/wedding-jukebox"
print_status "Setting up application directory: $APP_DIR"

if [ -d "$APP_DIR" ]; then
    print_warning "Directory already exists. Backing up..."
    sudo mv "$APP_DIR" "${APP_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Clone repository (for config files)
print_status "Cloning Wedding Jukebox repository..."
git clone https://github.com/JaredLThompson/wedding-jukebox.git "$APP_DIR"
cd "$APP_DIR"

# Ensure NetworkManager (nmcli) is available for host WiFi API
print_status "Ensuring NetworkManager tools are installed..."
if ! command -v nmcli &> /dev/null; then
    print_warning "nmcli not found - installing network-manager..."
    sudo apt install -y network-manager
fi
sudo systemctl enable --now NetworkManager 2>/dev/null || true

# Detect host IP for container -> host API calls
HOST_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')
if [[ -z "$HOST_IP" ]]; then
    HOST_IP=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+' | grep -v '^127\\.' | grep -v '^172\\.17\\.' | grep -v '^172\\.18\\.' | head -n 1)
fi

WIFI_API_URL_VALUE=""
if [[ -n "$HOST_IP" ]]; then
    WIFI_API_URL_VALUE="http://$HOST_IP:8787"
    print_success "Detected host IP: $HOST_IP"
else
    print_warning "Could not determine host IP automatically."
    print_warning "WiFi scanning will require manual WIFI_API_URL configuration."
fi

# Create docker-compose.yml for Pi
print_status "Creating Pi-optimized docker-compose.yml..."
tee docker-compose.pi.yml > /dev/null <<EOF
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
      - WIFI_API_URL=${WIFI_API_URL_VALUE}
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
EOF

# Create systemd service for Docker Compose
print_status "Creating systemd service..."

# Determine which Docker Compose command to use
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
    COMPOSE_PATH="/usr/bin/docker"
    COMPOSE_UNIT_PREFIX="compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
    COMPOSE_PATH="/usr/bin/docker-compose"
    COMPOSE_UNIT_PREFIX=""
else
    print_error "No Docker Compose found!"
    exit 1
fi

print_status "Using Docker Compose command: $COMPOSE_CMD"

sudo tee /etc/systemd/system/wedding-jukebox-docker.service > /dev/null <<EOF
[Unit]
Description=Wedding Jukebox Docker
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=$COMPOSE_PATH ${COMPOSE_UNIT_PREFIX} -f docker-compose.pi.yml up -d
ExecStop=$COMPOSE_PATH ${COMPOSE_UNIT_PREFIX} -f docker-compose.pi.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Enable service
sudo systemctl daemon-reload
sudo systemctl enable wedding-jukebox-docker
sudo systemctl start wedding-jukebox-docker

# Create data directories and files
mkdir -p "$APP_DIR/data"
mkdir -p "$APP_DIR/backups"
mkdir -p "$APP_DIR/audio-cache"

# Create required files if they don't exist (prevents Docker from creating them as directories)
touch "$APP_DIR/oauth.json" "$APP_DIR/wedding-play-history.json"
echo '{}' > "$APP_DIR/oauth.json" 2>/dev/null || true
echo '[]' > "$APP_DIR/wedding-play-history.json" 2>/dev/null || true

# Set permissions
sudo chown -R pi:pi "$APP_DIR"

# Install audio dependencies for headless audio system
print_status "Installing audio dependencies for headless audio system..."
sudo apt update
sudo apt install -y yt-dlp mpg123 ffmpeg alsa-utils nodejs npm

# Setup headless audio service
print_status "Setting up headless audio service..."
APP_USER="${SUDO_USER:-$(whoami)}"
sudo tee /etc/systemd/system/wedding-jukebox-audio.service > /dev/null <<EOF
[Unit]
Description=Wedding Jukebox Audio Service
After=network.target
Requires=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/env node audio-integration.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable wedding-jukebox-audio
print_success "Audio service configured and enabled"

# Setup WiFi API service (host-side)
print_status "Setting up host WiFi API service..."
sudo tee /etc/systemd/system/wedding-jukebox-wifi-api.service > /dev/null <<EOF
[Unit]
Description=Wedding Jukebox WiFi API
After=NetworkManager.service
Requires=NetworkManager.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/env node wifi-api.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
Environment=WIFI_API_PORT=8787
Environment=PATH=/usr/bin:/usr/local/bin
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable wedding-jukebox-wifi-api
sudo systemctl start wedding-jukebox-wifi-api
print_success "WiFi API service configured and enabled"

# Install Node dependencies for host audio service
print_status "Installing Node dependencies for audio service..."
cd "$APP_DIR"
if [ -f package-lock.json ]; then
    npm ci --omit=dev
else
    npm install --omit=dev
fi

# Configure firewall (if ufw is installed)
if command -v ufw &> /dev/null; then
    print_status "Configuring firewall..."
    sudo ufw allow 3000/tcp
fi

# Performance optimizations for Pi 4
if grep -q "Pi 4" /proc/cpuinfo; then
    print_status "Applying Raspberry Pi 4 optimizations..."
    
    # Increase GPU memory split
    if ! grep -q "gpu_mem=128" /boot/config.txt; then
        echo 'gpu_mem=128' | sudo tee -a /boot/config.txt
    fi
    
    # Docker optimizations
    if ! grep -q "cgroup_enable=cpuset" /boot/cmdline.txt; then
        sudo sed -i '$ s/$/ cgroup_enable=cpuset cgroup_enable=memory cgroup_memory=1/' /boot/cmdline.txt
    fi
fi

# Create management scripts
print_status "Creating management scripts..."

# YouTube Music authentication helper script
tee "$APP_DIR/setup-youtube-auth.sh" > /dev/null <<'EOF'
#!/bin/bash
echo "🎵 Setting up YouTube Music Authentication"
echo "=========================================="

cd "$(dirname "$0")"

# Check if python3-venv is installed
if ! python3 -m venv --help &> /dev/null; then
    echo "Installing python3-venv..."
    sudo apt update
    sudo apt install -y python3-venv
fi

# Create temporary virtual environment
echo "Creating temporary virtual environment..."
python3 -m venv auth-venv

# Activate and install ytmusicapi
echo "Installing ytmusicapi..."
source auth-venv/bin/activate
pip install ytmusicapi

# Run authentication setup
echo ""
echo "Starting YouTube Music authentication setup..."
echo "Follow the instructions to authenticate with your YouTube Music account."
python3 setup_auth.py

# Cleanup
deactivate
rm -rf auth-venv

echo ""
echo "✅ YouTube Music authentication setup complete!"
echo "The oauth.json file has been created and will be used by the Docker container."
EOF

chmod +x "$APP_DIR/setup-youtube-auth.sh"

# Update script
tee "$APP_DIR/update.sh" > /dev/null <<'EOF'
#!/bin/bash
cd "$(dirname "$0")"

echo "🔄 Updating Wedding Jukebox Docker..."

# Backup first
./backup.sh

# Compose command detection
if docker compose version &> /dev/null; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
  COMPOSE_CMD="docker-compose"
else
  echo "Docker Compose not found. Install docker-compose or the docker compose plugin."
  exit 1
fi

# Pull latest image and restart
$COMPOSE_CMD -f docker-compose.pi.yml pull
$COMPOSE_CMD -f docker-compose.pi.yml up -d

echo "✅ Update complete!"
EOF

# Status script
tee "$APP_DIR/status.sh" > /dev/null <<'EOF'
#!/bin/bash
cd "$(dirname "$0")"

echo "🥧 Wedding Jukebox Docker Status"
echo "================================"
echo ""

# Compose command detection
if docker compose version &> /dev/null; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
  COMPOSE_CMD="docker-compose"
else
  echo "Docker Compose not found. Install docker-compose or the docker compose plugin."
  exit 1
fi

# Container status
echo "📊 Container Status:"
$COMPOSE_CMD -f docker-compose.pi.yml ps

echo ""
echo "🎵 Audio Service Status:"
sudo systemctl status wedding-jukebox-audio --no-pager -l

echo ""
echo "🌡️  System Info:"
echo "Temperature: $(vcgencmd measure_temp)"
echo "Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "Disk: $(df -h / | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"

echo ""
echo "🌐 Network:"
hostname -I | awk '{print "IP Address: " $1}'

echo ""
echo "📝 Container Logs (last 10 lines):"
$COMPOSE_CMD -f docker-compose.pi.yml logs --tail=10

echo ""
echo "🎵 Audio Service Logs (last 10 lines):"
sudo journalctl -u wedding-jukebox-audio -n 10 --no-pager
EOF

# Backup script
tee "$APP_DIR/backup.sh" > /dev/null <<'EOF'
#!/bin/bash
BACKUP_DIR="/home/pi/wedding-jukebox/backups"
DATE=$(date +%Y%m%d_%H%M%S)

echo "Creating backup: $DATE"
mkdir -p "$BACKUP_DIR"

# Backup important files
cp oauth.json "$BACKUP_DIR/oauth_$DATE.json" 2>/dev/null || echo "No oauth.json to backup"
cp wedding-play-history.json "$BACKUP_DIR/history_$DATE.json" 2>/dev/null || echo "No history to backup"

# Backup Docker volumes
docker run --rm -v wedding-jukebox_jukebox-data:/data -v "$BACKUP_DIR":/backup alpine tar czf "/backup/docker-data_$DATE.tar.gz" -C /data .

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/oauth_*.json 2>/dev/null | tail -n +11 | xargs rm -f
ls -t "$BACKUP_DIR"/history_*.json 2>/dev/null | tail -n +11 | xargs rm -f
ls -t "$BACKUP_DIR"/docker-data_*.tar.gz 2>/dev/null | tail -n +11 | xargs rm -f

echo "Backup complete!"
EOF

# Make scripts executable
chmod +x "$APP_DIR/update.sh"
chmod +x "$APP_DIR/status.sh"
chmod +x "$APP_DIR/backup.sh"

# Pull the Docker image (with retry for authentication issues)
print_status "Pulling Wedding Jukebox Docker image..."
if ! docker pull ghcr.io/jaredlthompson/wedding-jukebox:latest; then
    print_warning "Failed to pull from GitHub Container Registry. This might be due to rate limiting."
    print_status "Attempting to pull without authentication..."
    
    # Try with explicit public access
    if ! docker pull ghcr.io/jaredlthompson/wedding-jukebox:latest 2>/dev/null; then
        print_warning "Unable to pull pre-built image. Building locally instead..."
        print_status "Building Wedding Jukebox Docker image locally..."
        if docker build -t ghcr.io/jaredlthompson/wedding-jukebox:latest .; then
            print_success "Docker image built successfully"
        else
            print_error "Failed to build Docker image"
            exit 1
        fi
    else
        print_success "Docker image pulled successfully"
    fi
else
    print_success "Docker image pulled successfully"
fi

print_success "Docker installation complete!"
echo ""
echo "🎉 Next Steps:"
echo "=============="
echo ""
echo "1. 🎵 Setup YouTube Music Authentication (optional):"
echo "   cd $APP_DIR"
echo "   ./setup-youtube-auth.sh"
echo ""
echo "2. 🚀 Start the services:"
echo "   sudo systemctl start wedding-jukebox-docker"
echo "   sudo systemctl start wedding-jukebox-audio"
echo ""
echo "3. 🌐 Access the jukebox:"
echo "   Find your Pi's IP: hostname -I"
echo "   Open: http://[PI_IP]:3000"
echo ""
echo "📋 Useful Commands:"
echo "==================="
echo "Status:    $APP_DIR/status.sh"
echo "Update:    $APP_DIR/update.sh"
echo "Backup:    $APP_DIR/backup.sh"
echo "Logs:      docker compose -f docker-compose.pi.yml logs -f"
echo "Audio Logs: sudo journalctl -u wedding-jukebox-audio -f"
echo "Restart:   sudo systemctl restart wedding-jukebox-docker"
echo "           sudo systemctl restart wedding-jukebox-audio"
echo ""

# Get IP address
IP=$(hostname -I | awk '{print $1}')
if [ ! -z "$IP" ]; then
    echo "🌐 Your Pi's IP address: $IP"
    echo "🎵 DJ Interface:  http://$IP:3000"
    echo "📱 User Interface: http://$IP:3000/user"
    echo "📋 QR Code:       http://$IP:3000/qr"
fi

echo ""
print_warning "Reboot recommended to apply all changes: sudo reboot"
print_status "After reboot, the jukebox will start automatically!"
