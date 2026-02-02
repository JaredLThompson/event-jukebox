# 🥧 Raspberry Pi Wedding Jukebox Setup

## Hardware Requirements
- **Raspberry Pi 4** (4GB+ RAM recommended)
- **MicroSD Card** (32GB+ Class 10)
- **Power Supply** (Official Pi 4 power supply)
- **Case with cooling** (important for stability)
- **Ethernet cable** (optional, for setup)

## 🚀 **Quick Setup Options**

### **Option A: Docker Setup (Recommended! 🌟)**
**Uses pre-built container - faster, easier, more reliable**

```bash
# Quick Docker setup
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/wedding-jukebox/main/raspberry-pi-docker-setup.sh | bash

# Then setup dual WiFi (hotspot + internet):
./setup-dual-wifi.sh
```

**Pros:**
- ✅ **Faster setup** - no building on Pi
- ✅ **Consistent environment** - same as your dev setup
- ✅ **Easy updates** - just pull new image
- ✅ **Less Pi resources** - no compilation needed

### **Option B: Direct Code Installation**
**Builds everything on the Pi - more control**

```bash
# Traditional code setup
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/wedding-jukebox/main/raspberry-pi-complete-setup.sh | bash

# Then setup dual WiFi (hotspot + internet):
./setup-dual-wifi.sh
```

**Pros:**
- ✅ **Full control** - modify code directly
- ✅ **No Docker overhead** - runs natively

---

## 🎵 **Headless Audio System Setup**

**NEW!** The jukebox now includes a complete headless audio system that plays real music through Pi speakers!

### **What is Headless Audio?**
- **Real music playback** through Pi speakers (not browser-based)
- **Server-side audio processing** with mpg123 and yt-dlp
- **Full DJ controls** - pause, resume, skip, volume control
- **Automatic queue management** and pre-buffering
- **Works with any display device** - laptop, tablet, phone

### **Audio System Services**

The headless audio system requires **two services** to run:

1. **`wedding-jukebox`** - Main web server (Docker or native)
2. **`wedding-jukebox-audio`** - Audio service for Pi speakers

### **Setting Up Audio Service**

After running the main setup script, you need to set up the audio service:

```bash
cd /home/pi/wedding-jukebox

# Install audio dependencies
sudo apt update
sudo apt install -y yt-dlp mpg123 ffmpeg alsa-utils

# Copy audio service files
sudo cp wedding-jukebox-audio.service /etc/systemd/system/
sudo systemctl daemon-reload

# Enable and start audio service
sudo systemctl enable wedding-jukebox-audio
sudo systemctl start wedding-jukebox-audio
```

### **Verify Audio Setup**

```bash
# Check both services are running
sudo systemctl status wedding-jukebox-docker    # Main web server
sudo systemctl status wedding-jukebox-audio     # Audio service

# Test audio output
speaker-test -t wav -c 2

# Check audio service logs
sudo journalctl -u wedding-jukebox-audio -f
```

### **Audio Service Management**

```bash
# Start/stop audio service
sudo systemctl start wedding-jukebox-audio
sudo systemctl stop wedding-jukebox-audio
sudo systemctl restart wedding-jukebox-audio

# View audio service logs
sudo journalctl -u wedding-jukebox-audio -n 50

# Check audio processes
ps aux | grep mpg123
ps aux | grep audio-integration
```

### **How It Works**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Browser   │    │   Raspberry Pi   │    │   Speakers      │
│  (DJ Interface) │◄──►│  Audio Service   │───►│  (Real Music!)  │
│                 │    │                  │    │                 │
│ • DJ controls   │    │ • Downloads songs│    │ • Party sound   │
│ • Queue mgmt    │    │ • Plays via mpg123│    │ • Full quality  │
│ • Real-time UI  │    │ • Progress track │    │ • No buffering  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

**Key Benefits:**
- **No browser audio issues** - music plays directly from Pi
- **Better performance** - no audio streaming to browser
- **Reliable playback** - server-side audio processing
- **Full DJ control** - pause, resume, skip work perfectly
- **Any device can be DJ** - laptop, tablet, phone all work

---

## Manual Installation (if needed)

## Software Installation

### 1. Install Raspberry Pi OS
```bash
# Flash Raspberry Pi OS Lite (64-bit) to SD card
# Enable SSH and WiFi during setup
```

### 2. Initial Pi Setup
```bash
# SSH into your Pi
ssh pi@raspberrypi.local

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python and pip
sudo apt install -y python3 python3-pip python3-venv

# Install audio dependencies for headless audio system
sudo apt install -y yt-dlp mpg123 ffmpeg alsa-utils

# Install Git
sudo apt install -y git
```

### 3. Clone and Setup Application
```bash
# Clone your repository
git clone https://github.com/JaredLThompson/wedding-jukebox.git
cd wedding-jukebox

# Install Node.js dependencies
npm install

# Setup Python virtual environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Setup YouTube Music authentication
python setup_auth.py
```

### 4. Configure Dual WiFi Setup (Hotspot + Internet)
This is the ULTIMATE wedding setup - Pi creates hotspot for guests while staying connected to venue WiFi for YouTube Music!

```bash
# Install required packages
sudo apt install -y hostapd dnsmasq iptables-persistent

# Stop services while configuring
sudo systemctl stop hostapd
sudo systemctl stop dnsmasq
```

#### Configure WiFi Interfaces
```bash
# Edit dhcpcd.conf to set static IP for hotspot interface
sudo nano /etc/dhcpcd.conf
```

Add to end of file:
```
# Static IP for hotspot interface
interface wlan1
static ip_address=192.168.4.1/24
nohook wpa_supplicant
```

#### Configure Hostapd (WiFi Hotspot)
```bash
sudo nano /etc/hostapd/hostapd.conf
```

Add this configuration:
```
# Wedding Jukebox Hotspot Configuration
interface=wlan1
driver=nl80211
ssid=Wedding-Jukebox
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=WeddingMusic2026
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
```

```bash
# Tell hostapd where to find config
sudo nano /etc/default/hostapd
```
Uncomment and set: `DAEMON_CONF="/etc/hostapd/hostapd.conf"`

#### Configure DNSMasq (DHCP for guests)
```bash
# Backup original config
sudo mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig

# Create new config
sudo nano /etc/dnsmasq.conf
```

Add:
```
# Wedding Jukebox DHCP Configuration
interface=wlan1
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h

# Redirect all DNS queries to our jukebox
address=/#/192.168.4.1
```

#### Configure Internet Sharing
```bash
# Enable IP forwarding
echo 'net.ipv4.ip_forward=1' | sudo tee -a /etc/sysctl.conf

# Configure iptables for internet sharing
sudo iptables -t nat -A POSTROUTING -o wlan0 -j MASQUERADE
sudo iptables -A FORWARD -i wlan0 -o wlan1 -m state --state RELATED,ESTABLISHED -j ACCEPT
sudo iptables -A FORWARD -i wlan1 -o wlan0 -j ACCEPT

# Save iptables rules
sudo sh -c "iptables-save > /etc/iptables.ipv4.nat"

# Load rules on boot
sudo nano /etc/rc.local
```

Add before `exit 0`:
```bash
iptables-restore < /etc/iptables.ipv4.nat
```

#### Configure Venue WiFi Connection
```bash
# Configure wlan0 to connect to venue WiFi
sudo nano /etc/wpa_supplicant/wpa_supplicant.conf
```

Add venue network:
```
network={
    ssid="VenueWiFiName"
    psk="VenueWiFiPassword"
    priority=1
}
```

#### Enable Services
```bash
# Enable services
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq

# Start services
sudo systemctl start hostapd
sudo systemctl start dnsmasq

# Reboot to apply all changes
sudo reboot
```

### 5. Auto-start Services

#### Main Web Service
```bash
# Create systemd service
sudo nano /etc/systemd/system/wedding-jukebox.service
```

Add this content:
```ini
[Unit]
Description=Wedding Jukebox Web Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/wedding-jukebox
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

#### Audio Service (NEW!)
```bash
# Copy the audio service file
sudo cp wedding-jukebox-audio.service /etc/systemd/system/

# Enable both services
sudo systemctl daemon-reload
sudo systemctl enable wedding-jukebox
sudo systemctl enable wedding-jukebox-audio

# Start both services
sudo systemctl start wedding-jukebox
sudo systemctl start wedding-jukebox-audio
```

## Network Setup Options

### Option 1: Connect to Venue WiFi
- Pi connects to venue's WiFi
- DJ and guests connect to same WiFi
- Access via Pi's IP address
- **Pros**: Simple setup
- **Cons**: Guests need venue WiFi password

### Option 2: Pi as WiFi Hotspot Only
- Pi creates its own "Wedding-Jukebox" network
- Perfect for venues with no WiFi
- DJ and guests connect to Pi's hotspot
- Access via http://192.168.4.1:3000
- **Pros**: No venue WiFi needed
- **Cons**: No internet for YouTube Music searches

### Option 3: Dual WiFi Setup (RECOMMENDED! 🌟)
- **wlan0**: Connects to venue WiFi for internet
- **wlan1**: Creates "Wedding-Jukebox" hotspot for guests
- Pi bridges internet from venue WiFi to guest hotspot
- **Perfect wedding solution!**
- **Pros**: Guests get easy access + YouTube Music works
- **Cons**: Requires Pi with dual WiFi or USB WiFi adapter

### Option 4: Ethernet + WiFi Bridge
- Pi connected via ethernet for stability
- Pi shares connection via WiFi hotspot
- Best for venues with ethernet access

## Hardware for Dual WiFi Setup

### Built-in Dual WiFi (Pi 4 only):
Some Pi 4 models support dual WiFi, but most reliable approach is:

### USB WiFi Adapter Method:
```bash
# Get a reliable USB WiFi adapter
# Recommended: TP-Link AC600 T2U Plus
# Built-in WiFi (wlan0) → Venue internet
# USB WiFi (wlan1) → Guest hotspot
```

## Guest Experience with Dual WiFi

1. **Guests connect to "Wedding-Jukebox" WiFi** (Password: WeddingMusic2026)
2. **Any website they visit redirects to jukebox**
3. **They can browse internet through Pi's connection**
4. **DJ gets YouTube Music access for searches**
5. **Perfect isolated network for the wedding!**

## Audio Setup

### NEW: Headless Audio System
With the new headless audio system, **any device can be the DJ interface**:

1. **DJ Device Options**:
   - **Laptop** - Full browser, best performance
   - **Tablet** - Portable, touch-friendly  
   - **Phone** - Emergency backup option

2. **Audio Connection**:
   ```
   Raspberry Pi → 3.5mm/USB/HDMI → Mixer/Speakers
   ```

3. **How It Works**:
   - DJ controls music through web browser
   - Pi downloads and plays music through its audio output
   - No audio streaming between devices needed!

### Pro Tips:
- Use **Pi's audio output** (3.5mm, USB, or HDMI) to mixer/speakers
- Keep Pi **plugged in** and in a ventilated area
- DJ device just needs **web browser** - no special audio setup needed
- Have **backup DJ device** ready with same browser bookmarks

## Monitoring and Maintenance

### Check Service Status
```bash
# Check both services
sudo systemctl status wedding-jukebox        # Web server
sudo systemctl status wedding-jukebox-audio  # Audio service

# Or check Docker version
sudo systemctl status wedding-jukebox-docker
```

### View Logs
```bash
# Web server logs
sudo journalctl -u wedding-jukebox -f

# Audio service logs (NEW!)
sudo journalctl -u wedding-jukebox-audio -f

# Docker logs
docker-compose -f docker-compose.pi.yml logs -f
```

### Update Application
```bash
cd /home/pi/wedding-jukebox
git pull origin main

# Restart services
sudo systemctl restart wedding-jukebox
sudo systemctl restart wedding-jukebox-audio

# Or for Docker
sudo systemctl restart wedding-jukebox-docker
```

## Performance Optimization

### For Raspberry Pi 4:
```bash
# Increase GPU memory split
echo 'gpu_mem=128' | sudo tee -a /boot/config.txt

# Disable unnecessary services
sudo systemctl disable bluetooth
sudo systemctl disable cups

# Reboot
sudo reboot
```

## Backup Strategy
```bash
# Backup important files
cp oauth.json oauth.json.backup
cp wedding-play-history.json wedding-play-history.json.backup

# Backup audio cache (NEW!)
tar -czf audio-cache-backup.tar.gz audio-cache/
```

## Troubleshooting

### Common Issues:
1. **Pi overheating** - Add cooling, reduce overclock
2. **WiFi drops** - Use ethernet, update Pi firmware
3. **YouTube auth expires** - Re-run setup_auth.py
4. **Memory issues** - Use Pi 4 with 4GB+ RAM
5. **Audio not playing** - Check audio service status and Pi audio output
6. **Multiple songs playing** - Restart audio service

### Audio System Troubleshooting:
```bash
# Check audio service
sudo systemctl status wedding-jukebox-audio

# Check audio processes
ps aux | grep mpg123
ps aux | grep audio-integration

# Test Pi audio output
speaker-test -t wav -c 2

# Check audio service logs
sudo journalctl -u wedding-jukebox-audio -n 50

# Restart audio service
sudo systemctl restart wedding-jukebox-audio
```

### Performance Monitoring:
```bash
# Check CPU/memory usage
htop

# Check temperature
vcgencmd measure_temp

# Check network
ping google.com

# Check audio cache size
du -sh audio-cache/
```

## Security Considerations
- Change default Pi password
- Enable firewall for production use
- Keep system updated
- Use strong WiFi passwords

## Cost Estimate
- Raspberry Pi 4 (4GB): $75
- MicroSD Card (32GB): $15
- Case + Cooling: $20
- Power Supply: $15
- **Total: ~$125**

Much cheaper than renting DJ equipment! 🎉