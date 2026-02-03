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

# Find all wireless interfaces (wlan* and wlx*)
WIFI_INTERFACES=($(ls /sys/class/net/ | grep -E '^(wlan|wlx)'))
WIFI_COUNT=${#WIFI_INTERFACES[@]}

echo "Found WiFi interfaces: ${WIFI_INTERFACES[*]}"

# Debug: Show all network interfaces
echo "All network interfaces:"
ls /sys/class/net/ | grep -E '^(wlan|wlx)' || echo "  No wireless interfaces found"

if [ "$WIFI_COUNT" -lt 2 ]; then
    echo "⚠️  Warning: Only found $WIFI_COUNT WiFi interface(s)"
    echo "   For dual WiFi setup, you need:"
    echo "   - Built-in WiFi (wlan0) for venue internet"
    echo "   - USB WiFi adapter (wlan1/wlx*) for guest hotspot"
    echo ""
    echo "   Recommended USB WiFi adapters:"
    echo "   - TP-Link AC600 T2U Plus"
    echo "   - Panda PAU09"
    echo "   - Any RTL8812AU/RTL8821AU chipset adapter"
    echo ""
    echo "   Check if USB adapter is connected:"
    echo "   - Run: ip link show"
    echo "   - Look for wlx* interfaces"
    echo "   - Try: sudo ip link set wlx984827665cdf up"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Determine which interfaces to use
VENUE_INTERFACE=""
HOTSPOT_INTERFACE=""

# Look for built-in WiFi (usually wlan0)
if [[ " ${WIFI_INTERFACES[*]} " =~ " wlan0 " ]]; then
    VENUE_INTERFACE="wlan0"
fi

# Look for USB WiFi adapter (wlan1 or wlx*)
for iface in "${WIFI_INTERFACES[@]}"; do
    if [[ "$iface" != "$VENUE_INTERFACE" ]]; then
        HOTSPOT_INTERFACE="$iface"
        break
    fi
done

# If we don't have wlan0, use the first available interface for venue
if [[ -z "$VENUE_INTERFACE" && ${#WIFI_INTERFACES[@]} -gt 0 ]]; then
    VENUE_INTERFACE="${WIFI_INTERFACES[0]}"
    # And use the second for hotspot if available
    if [[ ${#WIFI_INTERFACES[@]} -gt 1 ]]; then
        HOTSPOT_INTERFACE="${WIFI_INTERFACES[1]}"
    fi
fi

echo ""
echo "📡 Interface Assignment:"
echo "   Venue WiFi: $VENUE_INTERFACE"
echo "   Guest Hotspot: $HOTSPOT_INTERFACE"
echo ""

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

# If NetworkManager is active, use nmcli workflow (Debian 13 / Trixie default)
if systemctl is-active --quiet NetworkManager; then
    echo ""
    echo "🧭 NetworkManager detected - using nmcli configuration"
    echo "   This bypasses hostapd/dnsmasq/dhcpcd and works with Debian 13."
    echo ""

    echo "🔧 Ensuring wpa_supplicant is installed..."
    sudo apt update
    sudo apt install -y wpasupplicant
    sudo systemctl enable --now wpa_supplicant

    echo "🔄 Restarting NetworkManager..."
    sudo systemctl restart NetworkManager

    echo "🧹 Cleaning existing connections..."
    # Remove any existing hotspot connection to avoid IP conflicts
    nmcli -t -f NAME,TYPE con show | awk -F: '$2=="wifi" && $1=="Hotspot"{print $1}' | xargs -r nmcli con delete
    nmcli -t -f NAME,TYPE con show | awk -F: '$2=="wifi" && $1=="Wedding-Jukebox-Hotspot"{print $1}' | xargs -r nmcli con delete

    # Remove existing venue connection by SSID to avoid stale DHCP leases
    nmcli -t -f NAME,TYPE,802-11-wireless.ssid con show | \
        awk -F: -v ssid="$VENUE_SSID" '$2=="802-11-wireless" && $3==ssid {print $1}' | \
        xargs -r nmcli con delete

    echo "📶 Connecting to venue WiFi on $VENUE_INTERFACE..."
    nmcli dev wifi connect "$VENUE_SSID" password "$VENUE_PASSWORD" ifname "$VENUE_INTERFACE"

    echo "📡 Creating guest hotspot on $HOTSPOT_INTERFACE..."
    nmcli con add type wifi ifname "$HOTSPOT_INTERFACE" con-name "Wedding-Jukebox-Hotspot" ssid "$HOTSPOT_SSID"
    nmcli con modify "Wedding-Jukebox-Hotspot" 802-11-wireless.mode ap 802-11-wireless.band bg
    nmcli con modify "Wedding-Jukebox-Hotspot" 802-11-wireless-security.key-mgmt wpa-psk
    nmcli con modify "Wedding-Jukebox-Hotspot" 802-11-wireless-security.psk "$HOTSPOT_PASSWORD"
    nmcli con modify "Wedding-Jukebox-Hotspot" ipv4.method shared ipv4.addresses 192.168.4.1/24 ipv6.method ignore

    # Stop dnsmasq so NetworkManager can manage shared mode cleanly
    sudo systemctl stop dnsmasq 2>/dev/null || true

    nmcli con up "Wedding-Jukebox-Hotspot"

    echo ""
    echo "✅ Dual WiFi setup complete (NetworkManager)!"
    echo ""
    echo "📋 Configuration Summary:"
    echo "========================"
    echo "🏢 Venue WiFi ($VENUE_INTERFACE): $VENUE_SSID"
    echo "📡 Guest Hotspot ($HOTSPOT_INTERFACE): $HOTSPOT_SSID"
    echo "🔑 Hotspot Password: $HOTSPOT_PASSWORD"
    echo "🌐 Guest Access: http://192.168.4.1:3000"
    echo ""
    echo "ℹ️  If venue WiFi does not get an IP, re-run this script or delete the WiFi profile:"
    echo "    nmcli con delete \"$VENUE_SSID\" && nmcli dev wifi connect \"$VENUE_SSID\" password \"<pass>\" ifname \"$VENUE_INTERFACE\""
    echo ""
    exit 0
fi

echo ""
echo "🔧 Installing required packages..."
sudo apt update
sudo apt install -y hostapd dnsmasq iptables-persistent

echo "🔌 Bringing up WiFi interfaces..."
# Bring up all WiFi interfaces
for iface in $(ls /sys/class/net/ | grep -E '^(wlan|wlx)'); do
    echo "  Bringing up $iface..."
    sudo ip link set "$iface" up 2>/dev/null || echo "    Failed to bring up $iface (may be normal)"
done

# Re-scan for interfaces after bringing them up
echo "🔍 Re-scanning for WiFi interfaces..."
WIFI_INTERFACES=($(ls /sys/class/net/ | grep -E '^(wlan|wlx)'))
WIFI_COUNT=${#WIFI_INTERFACES[@]}
echo "Found WiFi interfaces after bringing up: ${WIFI_INTERFACES[*]}"

echo "⏹️  Stopping services for configuration..."
sudo systemctl stop hostapd
sudo systemctl stop dnsmasq

echo "🌐 Configuring network interfaces..."

# Check if this is Ubuntu (uses netplan) or Raspberry Pi OS (uses dhcpcd)
if [ -f /etc/netplan/*.yaml ] || [ -d /etc/netplan ]; then
    echo "   Detected Ubuntu - configuring with netplan..."
    
    # Create netplan configuration for hotspot interface
    sudo tee /etc/netplan/99-wedding-jukebox-hotspot.yaml > /dev/null << EOF
network:
  version: 2
  wifis:
    $HOTSPOT_INTERFACE:
      addresses:
        - 192.168.4.1/24
      dhcp4: false
      dhcp6: false
EOF
    
    # Apply netplan configuration
    sudo netplan apply
    
elif [ -f /etc/dhcpcd.conf ]; then
    echo "   Detected Raspberry Pi OS - configuring with dhcpcd..."
    
    # Configure dhcpcd for static IP on hotspot interface
    sudo tee -a /etc/dhcpcd.conf > /dev/null << EOF

# Wedding Jukebox Hotspot Configuration
interface $HOTSPOT_INTERFACE
static ip_address=192.168.4.1/24
nohook wpa_supplicant
EOF
    
else
    echo "   Unknown network configuration system - using manual IP assignment..."
    # Fallback: manually assign IP
    sudo ip addr add 192.168.4.1/24 dev $HOTSPOT_INTERFACE 2>/dev/null || true
fi

echo "📡 Configuring WiFi hotspot..."

# Configure hostapd
sudo tee /etc/hostapd/hostapd.conf > /dev/null << EOF
# Wedding Jukebox Hotspot Configuration
interface=$HOTSPOT_INTERFACE
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
interface=$HOTSPOT_INTERFACE
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
sudo iptables -t nat -A POSTROUTING -o $VENUE_INTERFACE -j MASQUERADE
sudo iptables -A FORWARD -i $VENUE_INTERFACE -o $HOTSPOT_INTERFACE -m state --state RELATED,ESTABLISHED -j ACCEPT
sudo iptables -A FORWARD -i $HOTSPOT_INTERFACE -o $VENUE_INTERFACE -j ACCEPT

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

# Create systemd service to ensure hotspot IP is set on boot
sudo tee /etc/systemd/system/wedding-jukebox-hotspot.service > /dev/null << EOF
[Unit]
Description=Wedding Jukebox Hotspot IP Configuration
After=network.target
Before=hostapd.service dnsmasq.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash -c 'ip addr show $HOTSPOT_INTERFACE | grep -q "192.168.4.1" || ip addr add 192.168.4.1/24 dev $HOTSPOT_INTERFACE'
ExecStart=/bin/sleep 2

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable wedding-jukebox-hotspot

echo "🚀 Enabling services..."
# Unmask hostapd service (it gets masked during installation)
sudo systemctl unmask hostapd
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq

echo ""
echo "✅ Dual WiFi setup complete!"
echo ""
echo "📋 Configuration Summary:"
echo "========================"
echo "🏢 Venue WiFi ($VENUE_INTERFACE): $VENUE_SSID"
echo "📡 Guest Hotspot ($HOTSPOT_INTERFACE): $HOTSPOT_SSID"
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
