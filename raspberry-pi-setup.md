# 🥧 Raspberry Pi Wedding Jukebox Setup

## Hardware Requirements
- **Raspberry Pi 4** (4GB+ RAM recommended)
- **MicroSD Card** (32GB+ Class 10)
- **Power Supply** (Official Pi 4 power supply)
- **Case with cooling** (important for stability)
- **Ethernet cable** (optional, for setup)

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

### 4. Configure WiFi Hotspot (Optional)
```bash
# Install hostapd and dnsmasq
sudo apt install -y hostapd dnsmasq

# Configure as WiFi hotspot for venues without WiFi
# This creates a "Wedding-Jukebox" network guests can join
```

### 5. Auto-start Service
```bash
# Create systemd service
sudo nano /etc/systemd/system/wedding-jukebox.service
```

Add this content:
```ini
[Unit]
Description=Wedding Jukebox
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

```bash
# Enable and start service
sudo systemctl enable wedding-jukebox
sudo systemctl start wedding-jukebox
```

## Network Setup Options

### Option 1: Connect to Venue WiFi
- Pi connects to venue's WiFi
- DJ and guests connect to same WiFi
- Access via Pi's IP address

### Option 2: Pi as WiFi Hotspot
- Pi creates its own "Wedding-Jukebox" network
- Perfect for venues with no/poor WiFi
- DJ and guests connect to Pi's hotspot
- Access via http://192.168.4.1:3000

### Option 3: Ethernet + WiFi Bridge
- Pi connected via ethernet for stability
- Pi shares connection via WiFi hotspot
- Best of both worlds

## Audio Setup

### DJ Device Options:
1. **Laptop** - Full browser, best performance
2. **Tablet** - Portable, touch-friendly
3. **Phone** - Emergency backup option

### Audio Connection:
```
DJ Device → 3.5mm/USB/Bluetooth → Mixer/Speakers
```

### Pro Tips:
- Use **wired audio connection** (3.5mm or USB) for best quality
- Keep DJ device **plugged in** during event
- Have **backup device** ready with same browser bookmarks

## Monitoring and Maintenance

### Check Service Status
```bash
sudo systemctl status wedding-jukebox
```

### View Logs
```bash
sudo journalctl -u wedding-jukebox -f
```

### Update Application
```bash
cd /home/pi/wedding-jukebox
git pull origin main
sudo systemctl restart wedding-jukebox
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
```

## Troubleshooting

### Common Issues:
1. **Pi overheating** - Add cooling, reduce overclock
2. **WiFi drops** - Use ethernet, update Pi firmware
3. **YouTube auth expires** - Re-run setup_auth.py
4. **Memory issues** - Use Pi 4 with 4GB+ RAM

### Performance Monitoring:
```bash
# Check CPU/memory usage
htop

# Check temperature
vcgencmd measure_temp

# Check network
ping google.com
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