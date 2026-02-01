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
PI_VERSION=$(grep "Revision" /proc/cpuinfo | awk '{print $3}')
if [[ $PI_VERSION == *"a03111"* ]] || [[ $PI_VERSION == *"b03111"* ]] || [[ $PI_VERSION == *"c03111"* ]]; then
    print_success "Raspberry Pi 4 detected - perfect for Docker!"
elif [[ $PI_VERSION == *"a020d3"* ]] || [[ $PI_VERSION == *"a02082"* ]]; then
    print_warning "Raspberry Pi 3 detected - Docker will work but may be slower"
else
    print_warning "Older Pi detected - consider using the direct code installation instead"
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
if ! command -v docker-compose &> /dev/null; then
    sudo apt install -y docker-compose
    print_success "Docker Compose installed successfully"
else
    print_status "Docker Compose already installed"
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

# Create docker-compose.yml for Pi
print_status "Creating Pi-optimized docker-compose.yml..."
tee docker-compose.pi.yml > /dev/null <<EOF
version: '3.8'

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
    environment:
      - NODE_ENV=production
      - PORT=3000
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
sudo tee /etc/systemd/system/wedding-jukebox-docker.service > /dev/null <<EOF
[Unit]
Description=Wedding Jukebox Docker
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/docker-compose -f docker-compose.pi.yml up -d
ExecStop=/usr/bin/docker-compose -f docker-compose.pi.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Enable service
sudo systemctl daemon-reload
sudo systemctl enable wedding-jukebox-docker

# Create data directories
mkdir -p "$APP_DIR/data"
mkdir -p "$APP_DIR/backups"

# Set permissions
sudo chown -R pi:pi "$APP_DIR"

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

# Update script
tee "$APP_DIR/update.sh" > /dev/null <<'EOF'
#!/bin/bash
cd /home/pi/wedding-jukebox

echo "🔄 Updating Wedding Jukebox Docker..."

# Backup first
./backup.sh

# Pull latest image and restart
docker-compose -f docker-compose.pi.yml pull
docker-compose -f docker-compose.pi.yml up -d

echo "✅ Update complete!"
EOF

# Status script
tee "$APP_DIR/status.sh" > /dev/null <<'EOF'
#!/bin/bash

echo "🥧 Wedding Jukebox Docker Status"
echo "================================"
echo ""

# Container status
echo "📊 Container Status:"
docker-compose -f docker-compose.pi.yml ps

echo ""
echo "🌡️  System Info:"
echo "Temperature: $(vcgencmd measure_temp)"
echo "Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "Disk: $(df -h / | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"

echo ""
echo "🌐 Network:"
hostname -I | awk '{print "IP Address: " $1}'

echo ""
echo "📝 Container Logs:"
docker-compose -f docker-compose.pi.yml logs --tail=10
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

# Pull the Docker image
print_status "Pulling Wedding Jukebox Docker image..."
docker pull ghcr.io/jaredlthompson/wedding-jukebox:latest

print_success "Docker installation complete!"
echo ""
echo "🎉 Next Steps:"
echo "=============="
echo ""
echo "1. 🎵 Setup YouTube Music Authentication (optional):"
echo "   cd $APP_DIR"
echo "   # Install Python temporarily for auth setup"
echo "   sudo apt install -y python3-pip"
echo "   pip3 install ytmusicapi"
echo "   python3 setup_auth.py"
echo ""
echo "2. 🚀 Start the service:"
echo "   sudo systemctl start wedding-jukebox-docker"
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
echo "Logs:      docker-compose -f docker-compose.pi.yml logs -f"
echo "Restart:   sudo systemctl restart wedding-jukebox-docker"
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