# 🚀 Wedding Jukebox Deployment Guide

This guide covers three deployment options for your Wedding Jukebox: Local Development, Docker Container, and Raspberry Pi.

## 🎯 **Quick Comparison**

| Method | Difficulty | Portability | Best For |
|--------|------------|-------------|----------|
| **Local** | ⭐ Easy | Low | Development, Testing |
| **Docker** | ⭐⭐ Medium | High | Cloud, Consistent Environments |
| **Raspberry Pi** | ⭐⭐⭐ Advanced | Very High | Weddings, Events, Portable Setup |

---

## 🖥️ **Option 1: Local Development**

### Prerequisites
- Node.js 18+
- Python 3.8+
- YouTube Music Premium account

### Setup
```bash
# Clone repository
git clone https://github.com/JaredLThompson/wedding-jukebox.git
cd wedding-jukebox

# Install dependencies
npm install
pip install -r requirements.txt

# Setup YouTube Music authentication
python setup_auth.py

# Start the server
node server.js
```

### Access
- DJ Interface: http://localhost:3000
- User Interface: http://localhost:3000/user
- QR Code: http://localhost:3000/qr

---

## 🐳 **Option 2: Docker Container**

### Prerequisites
- Docker & Docker Compose
- YouTube Music Premium account (optional for demo)

### Quick Start (Using Pre-built Image)
```bash
# Clone repository for config files
git clone https://github.com/JaredLThompson/wedding-jukebox.git
cd wedding-jukebox

# Deploy from GitHub Container Registry
./deploy-from-registry.sh
```

### Build Locally (Optional)
```bash
# Clone repository
git clone https://github.com/JaredLThompson/wedding-jukebox.git
cd wedding-jukebox

# Run setup script
./docker-setup.sh
```

### Manual Setup
```bash
# Setup YouTube Music (optional)
pip install -r requirements.txt
python setup_auth.py

# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Docker Commands
```bash
# Status
docker-compose ps

# Logs
docker-compose logs -f wedding-jukebox

# Restart
docker-compose restart

# Update
docker-compose pull && docker-compose up -d

# Shell access
docker exec -it wedding-jukebox-container bash
```

---

## 🥧 **Option 3: Raspberry Pi (ULTIMATE WEDDING SETUP! 🌟)**

The Pi deployment creates the **perfect wedding jukebox experience**:
- **🏠 Pi acts as WiFi hotspot** - Guests connect to "Wedding-Jukebox" network
- **🌐 Pi connects to venue WiFi** - Gets internet for YouTube Music searches  
- **🚪 Automatic captive portal** - Any website guests visit redirects to jukebox
- **🔑 No venue WiFi password needed** - Guests just connect and go!
- **💰 Cost: ~$150** (vs $500+ DJ equipment rental!)

### Hardware Requirements
- **Raspberry Pi 4** (4GB+ RAM recommended)
- **USB WiFi Adapter** (for dual WiFi - TP-Link AC600 T2U Plus recommended)
- **MicroSD Card** (32GB+ Class 10)
- **Power Supply** (Official Pi 4 power supply)
- **Case with cooling** (prevents overheating)

### 🚀 **Quick Dual WiFi Setup**
```bash
# 1. Flash Raspberry Pi OS to SD card with SSH enabled
# 2. SSH into Pi and run automated setup:
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/wedding-jukebox/main/raspberry-pi-complete-setup.sh | bash

# 3. Setup dual WiFi (hotspot + internet):
./setup-dual-wifi.sh
```

### 🎉 **Guest Experience**
1. **Connect to "Wedding-Jukebox" WiFi** (no password needed)
2. **Open any website** → automatically redirected to jukebox
3. **Request songs instantly!** 
4. **Browse internet** through Pi's connection (optional)

### 🎧 **DJ Experience**  
- **Access full DJ controls** at `http://192.168.4.1:3000`
- **YouTube Music search works perfectly** (via venue WiFi)
- **All features available** (queue management, playlist switching, suppression)
- **Real-time updates** across all connected devices

### 🚀 **Pi Setup Options**

#### **Option A: Docker on Pi (Recommended! 🌟)**
```bash
# Quick Docker setup - uses pre-built container
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/wedding-jukebox/main/raspberry-pi-docker-setup.sh | bash

# Setup dual WiFi (hotspot + internet):
./setup-dual-wifi.sh
```

**Why Docker on Pi?**
- ✅ **Uses your container image** - same environment as development
- ✅ **Faster setup** - no building Python packages on Pi
- ✅ **Easy updates** - `docker pull` gets latest version
- ✅ **More reliable** - consistent environment

#### **Option B: Direct Code Installation**
```bash
# Traditional setup - builds everything on Pi
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/wedding-jukebox/main/raspberry-pi-complete-setup.sh | bash

# Setup dual WiFi (hotspot + internet):
./setup-dual-wifi.sh
```

**When to use direct code:**
- ✅ **Maximum control** - edit code directly on Pi
- ✅ **No Docker** - if you prefer native installation
- ✅ **Development** - when testing changes on Pi

### Manual Setup (if needed)
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python and tools
sudo apt install -y python3 python3-pip python3-venv git build-essential

# Clone repository
git clone https://github.com/JaredLThompson/wedding-jukebox.git
cd wedding-jukebox

# Install dependencies
npm install
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Setup YouTube Music
python setup_auth.py

# Create systemd service
sudo cp raspberry-pi-service.conf /etc/systemd/system/wedding-jukebox.service
sudo systemctl enable wedding-jukebox
sudo systemctl start wedding-jukebox
```

### Pi Network Setup Options

#### 🌟 **Option A: Dual WiFi Setup (RECOMMENDED!)**
**Perfect for weddings - guests get easy access while Pi gets internet!**

```bash
# Run the automated dual WiFi setup script
./setup-dual-wifi.sh
```

**What this does:**
- **wlan0**: Connects to venue WiFi for internet access
- **wlan1**: Creates "Wedding-Jukebox" hotspot for guests  
- **Captive portal**: Redirects any website to jukebox
- **Internet sharing**: Guests can browse web through Pi

**Hardware needed:**
- USB WiFi adapter (TP-Link AC600 T2U Plus recommended)
- Built-in WiFi connects to venue, USB WiFi creates hotspot

#### **Option B: Connect to Venue WiFi Only**
```bash
# Configure WiFi
sudo raspi-config
# Navigate to Network Options > WiFi
```
- Simple setup, guests need venue WiFi password
- Good for small gatherings with reliable venue WiFi

#### **Option C: Hotspot Only**
```bash
# Install hostapd and dnsmasq
sudo apt install -y hostapd dnsmasq

# Configure hotspot (see raspberry-pi-setup.md for details)
```
- No internet access for YouTube Music searches
- Good for offline-only setups

#### **Option D: Ethernet + WiFi Bridge**
- Connect Pi via ethernet for stability
- Share connection via WiFi hotspot
- Best reliability for critical events

---

## 🎵 **Audio Setup Guide**

### Understanding the Architecture
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Server        │    │   DJ Device      │    │  Sound System  │
│  (Pi/Docker)    │◄──►│  (Laptop/Tablet) │───►│   (Speakers)    │
│                 │    │                  │    │                 │
│  • Manages queue│    │ • Plays audio    │    │ • Amplifies     │
│  • Coordinates  │    │ • Controls music │    │ • Outputs sound │
│  • Serves web   │    │ • DJ interface   │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### DJ Device Options

#### 💻 **Laptop (Recommended)**
- **Pros**: Full browser support, reliable, good performance
- **Cons**: Larger, needs power
- **Audio**: 3.5mm headphone jack, USB audio interface, or Bluetooth
- **Setup**: Open browser → http://[SERVER_IP]:3000

#### 📱 **Tablet**
- **Pros**: Portable, touch-friendly, good battery life
- **Cons**: Limited audio options, smaller screen
- **Audio**: 3.5mm adapter, USB-C audio, or Bluetooth
- **Setup**: Open browser → http://[SERVER_IP]:3000

#### 📱 **Phone (Backup)**
- **Pros**: Always available, portable
- **Cons**: Small screen, limited functionality
- **Audio**: 3.5mm adapter or Bluetooth only
- **Setup**: Scan QR code or visit IP address

### Audio Connection Methods

#### 🔌 **Wired (Recommended)**
```
DJ Device → 3.5mm cable → Mixer/Speakers
DJ Device → USB audio interface → Mixer/Speakers
```
- **Pros**: No latency, reliable, best quality
- **Cons**: Requires cable management

#### 📡 **Bluetooth**
```
DJ Device → Bluetooth → Bluetooth receiver → Speakers
```
- **Pros**: Wireless, clean setup
- **Cons**: Potential latency, connection issues

#### 🌐 **WiFi Audio (Advanced)**
```
DJ Device → WiFi → Chromecast/AirPlay → Speakers
```
- **Pros**: High quality, wireless
- **Cons**: Complex setup, potential delays

---

## 🔧 **Configuration Options**

### Environment Variables
```bash
# Server configuration
NODE_ENV=production
PORT=3000

# Python virtual environment
PATH=/app/venv/bin:$PATH
```

### Network Configuration
```javascript
// server.js - CORS settings
const io = socketIo(server, {
  cors: {
    origin: "*",  // Allow all origins for local network
    methods: ["GET", "POST"]
  }
});
```

### Performance Tuning

#### For Raspberry Pi:
```bash
# Increase GPU memory
echo 'gpu_mem=128' | sudo tee -a /boot/config.txt

# Disable unnecessary services
sudo systemctl disable bluetooth
sudo systemctl disable cups

# Monitor performance
htop
vcgencmd measure_temp
```

#### For Docker:
```yaml
# docker-compose.yml
services:
  wedding-jukebox:
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

---

## 🛠️ **Troubleshooting**

### Common Issues

#### **Port 3000 already in use**
```bash
# Find process using port
lsof -ti:3000

# Kill process
kill -9 [PID]

# Or use different port
PORT=3001 node server.js
```

#### **YouTube authentication expired**
```bash
# Re-authenticate
python setup_auth.py

# Restart service
sudo systemctl restart wedding-jukebox
```

#### **Pi overheating**
```bash
# Check temperature
vcgencmd measure_temp

# Solutions:
# - Add heatsink/fan
# - Improve ventilation
# - Reduce overclock settings
```

#### **WiFi connection drops**
```bash
# Check WiFi status
iwconfig

# Restart WiFi
sudo systemctl restart networking

# Use ethernet for stability
```

### Monitoring Commands

#### **Service Status**
```bash
# Systemd service
sudo systemctl status wedding-jukebox

# Process status
ps aux | grep node

# Port status
netstat -tlnp | grep 3000
```

#### **Logs**
```bash
# Service logs
sudo journalctl -u wedding-jukebox -f

# Application logs
tail -f /var/log/wedding-jukebox.log

# Docker logs
docker-compose logs -f
```

#### **Performance**
```bash
# System resources
htop
free -h
df -h

# Network
ping google.com
speedtest-cli
```

---

## 🔒 **Security Considerations**

### For Production Use
```bash
# Change default passwords
sudo passwd pi

# Enable firewall
sudo ufw enable
sudo ufw allow 3000/tcp

# Disable SSH password auth (use keys)
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no

# Keep system updated
sudo apt update && sudo apt upgrade
```

### Network Security
- Use strong WiFi passwords
- Consider VPN for remote access
- Limit network access to event duration
- Monitor connected devices

---

## 💰 **Cost Breakdown**

### Raspberry Pi Setup
- Raspberry Pi 4 (4GB): $75
- MicroSD Card (32GB): $15
- Case + Cooling: $20
- Power Supply: $15
- **Total: ~$125**

### Additional Equipment
- Audio cables: $10-20
- USB audio interface: $30-50
- Portable speaker: $50-200
- **Total System: $200-400**

### Comparison
- **Professional DJ**: $800-2000/event
- **DJ Equipment Rental**: $200-500/event
- **Wedding Jukebox**: $200-400 one-time

---

## 📋 **Pre-Event Checklist**

### 1 Week Before
- [ ] Test complete setup
- [ ] Verify YouTube Music authentication
- [ ] Update playlists
- [ ] Test audio connections
- [ ] Backup configuration

### Day Before
- [ ] Charge all devices
- [ ] Test network connectivity
- [ ] Print QR codes
- [ ] Prepare backup devices
- [ ] Test suppression features

### Day Of Event
- [ ] Arrive early for setup
- [ ] Test audio levels
- [ ] Verify guest network access
- [ ] Have backup phone ready
- [ ] Monitor system during event

---

## 🎉 **Success Tips**

1. **Always have a backup plan**: Second device, offline playlist
2. **Test everything twice**: Network, audio, authentication
3. **Keep it simple**: Don't over-complicate the setup
4. **Monitor actively**: Watch for issues during the event
5. **Have fun**: The system is designed to work smoothly!

---

## 📞 **Support**

- **GitHub Issues**: https://github.com/JaredLThompson/wedding-jukebox/issues
- **Documentation**: Check README.md for updates
- **Community**: Share your setup and experiences!

Happy wedding! 🎊