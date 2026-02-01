#!/bin/bash

# 🎵 Wedding Jukebox Dual WiFi Setup Script
# This configures the Pi to be both a WiFi hotspot AND connect to venue WiFi
# Perfect for weddings - guests connect to Pi, Pi connects to venue internet

set -e

echo "🎵 Wedding Jukebox Dual WiFi Setup"
echo "=================================="
echo ""

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "❌ Please run this script as pi user (not root/sudo)"
   echo "   Usage: ./setup-dual-wifi.sh"
   exit 1
fi

# Check if USB WiFi adapter is connected
echo "🔍 Checking for WiFi interfaces..."
WIFI_INTERFACES=$(ls /sys/class/net/ | grep wlan | wc -l)

if [ "$WIFI_INTERFACES" -lt 2 ]; then
    echo "⚠️  Warning: Only found $WIFI_INTERFACES WiFi interface(s)"
    echo "   For dual WiFi setup, you need:"
    echo "   - Built-in WiFi (wlan0) for venue internet"
    echo "   - USB WiFi adapter (wlan1) for guest hotspot"
    echo ""
    echo "   Recommended USB WiFi adapters:"
    echo "   - TP-Link AC600 T2U Plus"
    echo "   - Panda PAU09"
    echo "   - Any RTL8812AU chipset adapter"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Get venue WiFi credentials
echo ""
echo "📶 Venue WiFi Configuration"
echo "=========================="
read -p "Enter venue WiFi network name (SSID): " VENUE_SSID
read -s -p "Enter venue WiFi password: " VENUE_PASSWORD
echo ""

# Get hotspot configuration
echo ""
echo "📡 Guest Hotspot Configuration"
echo "============================="
read -p "Enter hotspot name [Wedding-Jukebox]: " HOTSPOT_SSID
HOTSPOT_SSID=${HOTSPOT_SSID:-Wedding-Jukebox}

read -s -p "Enter hotspot password [WeddingMusic2026]: " HOTSPOT_PASSWORD
HOTSPOT_PASSWORD=${HOTSPOT_PASSWORD:-WeddingMusic2026}
echo ""

echo ""
echo "🔧 Installing required packages..."
sudo apt update
sudo apt install -y hostapd dnsmasq iptables-persistent

echo "⏹️  Stopping services for configuration..."
sudo systemctl stop hostapd
sudo systemctl stop dnsmasq

echo "🌐 Configuring network interfaces..."

# Configure dhcpcd for static IP on hotspot interface
sudo tee -a /etc/dhcpcd.conf > /dev/null << EOF

# Wedding Jukebox Hotspot Configuration
interface wlan1
static ip_address=192.168.4.1/24
nohook wpa_supplicant
EOF

echo "📡 Configuring WiFi hotspot..."

# Configure hostapd
sudo tee /etc/hostapd/hostapd.conf > /dev/null << EOF
# Wedding Jukebox Hotspot Configuration
interface=wlan1
driver=nl80211
ssid=$HOTSPOT_SSID
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=$HOTSPOT_PASSWORD
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
EOF

# Configure hostapd daemon
sudo sed -i 's/#DAEMON_CONF=""/DAEMON_CONF="\/etc\/hostapd\/hostapd.conf"/' /etc/default/hostapd

echo "🏠 Configuring DHCP for guests..."

# Backup original dnsmasq config
sudo mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig 2>/dev/null || true

# Configure dnsmasq
sudo tee /etc/dnsmasq.conf > /dev/null << EOF
# Wedding Jukebox DHCP Configuration
interface=wlan1
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h

# Captive portal - redirect all DNS to jukebox
address=/#/192.168.4.1

# Don't read /etc/hosts
no-hosts

# Log DHCP requests
log-dhcp
EOF

echo "🌍 Configuring venue WiFi connection..."

# Add venue WiFi to wpa_supplicant
sudo tee -a /etc/wpa_supplicant/wpa_supplicant.conf > /dev/null << EOF

# Venue WiFi Network
network={
    ssid="$VENUE_SSID"
    psk="$VENUE_PASSWORD"
    priority=1
}
EOF

echo "🔀 Configuring internet sharing..."

# Enable IP forwarding
echo 'net.ipv4.ip_forward=1' | sudo tee -a /etc/sysctl.conf

# Configure iptables for NAT
sudo iptables -t nat -A POSTROUTING -o wlan0 -j MASQUERADE
sudo iptables -A FORWARD -i wlan0 -o wlan1 -m state --state RELATED,ESTABLISHED -j ACCEPT
sudo iptables -A FORWARD -i wlan1 -o wlan0 -j ACCEPT

# Save iptables rules
sudo sh -c "iptables-save > /etc/iptables.ipv4.nat"

# Create script to restore iptables on boot
sudo tee /etc/rc.local > /dev/null << 'EOF'
#!/bin/sh -e
#
# rc.local
#
# This script is executed at the end of each multiuser runlevel.
# Make sure that the script will "exit 0" on success or any other
# value on error.
#
# In order to enable or disable this script just change the execution
# bits.

# Restore iptables rules
iptables-restore < /etc/iptables.ipv4.nat

exit 0
EOF

sudo chmod +x /etc/rc.local

echo "🚀 Enabling services..."
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq

echo ""
echo "✅ Dual WiFi setup complete!"
echo ""
echo "📋 Configuration Summary:"
echo "========================"
echo "🏢 Venue WiFi (wlan0): $VENUE_SSID"
echo "📡 Guest Hotspot (wlan1): $HOTSPOT_SSID"
echo "🔑 Hotspot Password: $HOTSPOT_PASSWORD"
echo "🌐 Guest Access: http://192.168.4.1:3000"
echo ""
echo "🔄 Rebooting in 10 seconds to apply changes..."
echo "   After reboot:"
echo "   1. Pi will connect to '$VENUE_SSID' for internet"
echo "   2. Pi will broadcast '$HOTSPOT_SSID' for guests"
echo "   3. Guests connect to hotspot and visit any website"
echo "   4. They'll be redirected to the jukebox!"
echo ""

# Countdown
for i in {10..1}; do
    echo -ne "\rRebooting in $i seconds... (Ctrl+C to cancel)"
    sleep 1
done

echo ""
echo "🔄 Rebooting now..."
sudo reboot