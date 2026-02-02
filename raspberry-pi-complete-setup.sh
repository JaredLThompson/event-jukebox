#!/bin/bash

# 🥧 Complete Raspberry Pi Wedding Jukebox Setup Script
# Run this script on a fresh Raspberry Pi OS installation

set -e  # Exit on any error

echo "🥧 Wedding Jukebox - Raspberry Pi Setup"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Update system
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
print_status "Installing Node.js 18..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install Python and dependencies
print_status "Installing Python and build tools..."
sudo apt install -y python3 python3-pip python3-venv git build-essential

# Install audio dependencies for headless audio system
print_status "Installing audio dependencies for headless audio system..."
sudo apt install -y yt-dlp mpg123 ffmpeg alsa-utils

# Install additional tools
print_status "Installing additional tools..."
sudo apt install -y htop curl wget nano

# Create application directory
APP_DIR="/home/pi/wedding-jukebox"
print_status "Setting up application directory: $APP_DIR"

if [ -d "$APP_DIR" ]; then
    print_warning "Directory already exists. Backing up..."
    sudo mv "$APP_DIR" "${APP_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Clone repository
print_status "Cloning Wedding Jukebox repository..."
git clone https://github.com/JaredLThompson/wedding-jukebox.git "$APP_DIR"
cd "$APP_DIR"

# Install Node.js dependencies
print_status "Installing Node.js dependencies..."
npm install

# Setup Python virtual environment
print_status "Setting up Python virtual environment..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Create systemd service
print_status "Creating systemd service..."
sudo tee /etc/systemd/system/wedding-jukebox.service > /dev/null <<EOF
[Unit]
Description=Wedding Jukebox
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin:$APP_DIR/venv/bin

[Install]
WantedBy=multi-user.target
EOF

# Enable service
sudo systemctl daemon-reload
sudo systemctl enable wedding-jukebox

# Setup headless audio service
print_status "Setting up headless audio service..."
if [ -f "$APP_DIR/wedding-jukebox-audio.service" ]; then
    sudo cp "$APP_DIR/wedding-jukebox-audio.service" /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable wedding-jukebox-audio
    print_success "Audio service configured and enabled"
else
    print_warning "wedding-jukebox-audio.service file not found - audio service not configured"
    print_warning "You may need to set up the audio service manually after cloning the latest code"
fi

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
    
    # Disable unnecessary services
    sudo systemctl disable bluetooth 2>/dev/null || true
    sudo systemctl disable cups 2>/dev/null || true
fi

# Create backup script
print_status "Creating backup script..."
tee "$APP_DIR/backup.sh" > /dev/null <<'EOF'
#!/bin/bash
BACKUP_DIR="/home/pi/wedding-jukebox/backups"
DATE=$(date +%Y%m%d_%H%M%S)

echo "Creating backup: $DATE"
mkdir -p "$BACKUP_DIR"

# Backup important files
cp oauth.json "$BACKUP_DIR/oauth_$DATE.json" 2>/dev/null || echo "No oauth.json to backup"
cp wedding-play-history.json "$BACKUP_DIR/history_$DATE.json" 2>/dev/null || echo "No history to backup"

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/oauth_*.json 2>/dev/null | tail -n +11 | xargs rm -f
ls -t "$BACKUP_DIR"/history_*.json 2>/dev/null | tail -n +11 | xargs rm -f

echo "Backup complete!"
EOF

chmod +x "$APP_DIR/backup.sh"

# Create update script
print_status "Creating update script..."
tee "$APP_DIR/update.sh" > /dev/null <<'EOF'
#!/bin/bash
cd /home/pi/wedding-jukebox

echo "🔄 Updating Wedding Jukebox..."

# Backup first
./backup.sh

# Stop services
sudo systemctl stop wedding-jukebox
sudo systemctl stop wedding-jukebox-audio

# Pull latest changes
git pull origin main

# Update dependencies
npm install
source venv/bin/activate
pip install -r requirements.txt

# Update audio service if it exists
if [ -f "wedding-jukebox-audio.service" ]; then
    sudo cp wedding-jukebox-audio.service /etc/systemd/system/
    sudo systemctl daemon-reload
fi

# Restart services
sudo systemctl start wedding-jukebox
sudo systemctl start wedding-jukebox-audio

echo "✅ Update complete!"
EOF

chmod +x "$APP_DIR/update.sh"

# Create status script
print_status "Creating status script..."
tee "$APP_DIR/status.sh" > /dev/null <<'EOF'
#!/bin/bash

echo "🥧 Wedding Jukebox Status"
echo "========================"
echo ""

# Service status
echo "📊 Web Service Status:"
sudo systemctl status wedding-jukebox --no-pager -l

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
echo "📝 Web Service Logs (last 10 lines):"
sudo journalctl -u wedding-jukebox --no-pager -n 10

echo ""
echo "🎵 Audio Service Logs (last 10 lines):"
sudo journalctl -u wedding-jukebox-audio --no-pager -n 10
EOF

chmod +x "$APP_DIR/status.sh"

print_success "Installation complete!"
echo ""
echo "🎉 Next Steps:"
echo "=============="
echo ""
echo "1. 🎵 Setup YouTube Music Authentication:"
echo "   cd $APP_DIR"
echo "   source venv/bin/activate"
echo "   python setup_auth.py"
echo ""
echo "2. 🚀 Start the services:"
echo "   sudo systemctl start wedding-jukebox"
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
echo "Logs:      sudo journalctl -u wedding-jukebox -f"
echo "Audio Logs: sudo journalctl -u wedding-jukebox-audio -f"
echo "Restart:   sudo systemctl restart wedding-jukebox"
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