#!/bin/bash

# 🎵 Wedding Jukebox Dual WiFi Setup Script
# This configures the Pi to be both a WiFi hotspot AND connect to venue WiFi
# Perfect for weddings - guests connect to Pi, Pi connects to venue internet

set -e

DRY_RUN=0
VENUE_SSID_FLAG=""
VENUE_PASSWORD_FLAG=""
HOTSPOT_SSID_FLAG=""
HOTSPOT_PASSWORD_FLAG=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        --venue-ssid)
            VENUE_SSID_FLAG="${2:-}"
            shift 2
            ;;
        --venue-pass)
            VENUE_PASSWORD_FLAG="${2:-}"
            shift 2
            ;;
        --hotspot-ssid)
            HOTSPOT_SSID_FLAG="${2:-}"
            shift 2
            ;;
        --hotspot-pass)
            HOTSPOT_PASSWORD_FLAG="${2:-}"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./setup-dual-wifi.sh [--dry-run] [--venue-ssid SSID] [--venue-pass PASS] [--hotspot-ssid SSID] [--hotspot-pass PASS]"
            exit 1
            ;;
    esac
done

run_cmd() {
    if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "[dry-run] $*"
        return 0
    fi
    "$@"
}

echo "🎵 Wedding Jukebox Dual WiFi Setup"
echo "=================================="
echo ""
if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "🧪 Dry-run mode enabled: commands will be printed but not executed."
    echo ""
fi

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "❌ Please run this script as pi user (not root/sudo)"
   echo "   Usage: ./setup-dual-wifi.sh"
   exit 1
fi

# Check if USB WiFi adapter is connected
echo "🔍 Checking for WiFi interfaces..."

# Ensure iw is installed (for capability checks)
echo "🔧 Ensuring required tools are installed..."
run_cmd sudo apt update
run_cmd sudo apt install -y iw

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

# Default: prefer wlan0 as venue, others as hotspot
if [[ " ${WIFI_INTERFACES[*]} " =~ " wlan0 " ]]; then
    VENUE_INTERFACE="wlan0"
fi
for iface in "${WIFI_INTERFACES[@]}"; do
    if [[ "$iface" != "$VENUE_INTERFACE" ]]; then
        HOTSPOT_INTERFACE="$iface"
        break
    fi
done

# If wlan0 is not present, pick first as venue and second as hotspot
if [[ -z "$VENUE_INTERFACE" && ${#WIFI_INTERFACES[@]} -gt 0 ]]; then
    VENUE_INTERFACE="${WIFI_INTERFACES[0]}"
    if [[ ${#WIFI_INTERFACES[@]} -gt 1 ]]; then
        HOTSPOT_INTERFACE="${WIFI_INTERFACES[1]}"
    fi
fi

# Offer explicit selection when multiple interfaces are present
if [[ ${#WIFI_INTERFACES[@]} -ge 2 ]]; then
    echo "🧭 Select which interface should connect to venue WiFi:"
    select venue_choice in "${WIFI_INTERFACES[@]}"; do
        if [[ -n "$venue_choice" ]]; then
            VENUE_INTERFACE="$venue_choice"
            break
        fi
        echo "Invalid selection. Try again."
    done

    echo "🧭 Select which interface should run the guest hotspot:"
    for iface in "${WIFI_INTERFACES[@]}"; do
        if [[ "$iface" != "$VENUE_INTERFACE" ]]; then
            HOTSPOT_INTERFACE="$iface"
            break
        fi
    done
    if [[ -n "$HOTSPOT_INTERFACE" ]]; then
        echo "Default hotspot interface: $HOTSPOT_INTERFACE"
        read -p "Use this for hotspot? (Y/n): " -r
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            select hotspot_choice in "${WIFI_INTERFACES[@]}"; do
                if [[ -n "$hotspot_choice" && "$hotspot_choice" != "$VENUE_INTERFACE" ]]; then
                    HOTSPOT_INTERFACE="$hotspot_choice"
                    break
                fi
                echo "Invalid selection. Try again."
            done
        fi
    fi
fi

echo ""
echo "📡 Interface Assignment:"
echo "   Venue WiFi: $VENUE_INTERFACE"
echo "   Guest Hotspot: $HOTSPOT_INTERFACE"
echo ""

# Guard against missing hotspot interface
if [[ -z "$HOTSPOT_INTERFACE" ]]; then
    echo "❌ Hotspot interface not found."
    echo "   You need two WiFi interfaces to run dual WiFi."
    echo "   Detected: ${WIFI_INTERFACES[*]}"
    exit 1
fi

# Helper: replace a managed block in a file (idempotent)
replace_managed_block() {
    local file="$1"
    local start_marker="$2"
    local end_marker="$3"
    local content="$4"

    sudo touch "$file"
    sudo awk -v start="$start_marker" -v end="$end_marker" '
        $0 == start {in_block=1; next}
        $0 == end {in_block=0; next}
        !in_block {print}
    ' "$file" | sudo tee "${file}.tmp" > /dev/null

    {
        echo "$start_marker"
        echo "$content"
        echo "$end_marker"
    } | sudo tee -a "${file}.tmp" > /dev/null

    sudo mv "${file}.tmp" "$file"
}

# Get venue WiFi credentials
echo ""
echo "📶 Venue WiFi Configuration"
echo "=========================="
VENUE_SSID="${VENUE_SSID_FLAG}"
VENUE_PASSWORD="${VENUE_PASSWORD_FLAG}"
while [[ -z "$VENUE_SSID" ]]; do
    read -p "Enter venue WiFi network name (SSID): " VENUE_SSID
done
while [[ -z "$VENUE_PASSWORD" ]]; do
    read -s -p "Enter venue WiFi password: " VENUE_PASSWORD
    echo ""
done

# Get hotspot configuration
echo ""
echo "📡 Guest Hotspot Configuration"
echo "============================="
HOTSPOT_SSID="${HOTSPOT_SSID_FLAG}"
HOTSPOT_PASSWORD="${HOTSPOT_PASSWORD_FLAG}"
if [[ -z "$HOTSPOT_SSID" ]]; then
    read -p "Enter hotspot name [Wedding-Jukebox]: " HOTSPOT_SSID
    HOTSPOT_SSID=${HOTSPOT_SSID:-Wedding-Jukebox}
fi

if [[ -z "$HOTSPOT_PASSWORD" ]]; then
    read -s -p "Enter hotspot password [WeddingMusic2026]: " HOTSPOT_PASSWORD
    HOTSPOT_PASSWORD=${HOTSPOT_PASSWORD:-WeddingMusic2026}
    echo ""
fi

# If NetworkManager is active, use nmcli workflow (Debian 13 / Trixie default)
if systemctl is-active --quiet NetworkManager; then
    echo ""
    echo "🧭 NetworkManager detected - using nmcli configuration"
    echo "   This bypasses hostapd/dnsmasq/dhcpcd and works with Debian 13."
    echo ""

    echo "🔧 Ensuring wpa_supplicant is installed..."
    run_cmd sudo apt update
    run_cmd sudo apt install -y wpasupplicant
    run_cmd sudo systemctl enable --now wpa_supplicant

    echo "🔄 Restarting NetworkManager..."
    run_cmd sudo systemctl restart NetworkManager

    echo "🧹 Cleaning existing connections..."
    # Remove any existing hotspot connection to avoid IP conflicts
    nmcli -t -f NAME,TYPE con show | awk -F: '$2=="wifi" && $1=="Hotspot"{print $1}' | xargs -r -I{} run_cmd nmcli con delete "{}"
    nmcli -t -f NAME,TYPE con show | awk -F: '$2=="wifi" && $1=="Wedding-Jukebox-Hotspot"{print $1}' | xargs -r -I{} run_cmd nmcli con delete "{}"

    # Remove existing venue connection by SSID to avoid stale DHCP leases
    nmcli -t -f NAME,TYPE,802-11-wireless.ssid con show | \
        awk -F: -v ssid="$VENUE_SSID" '$2=="802-11-wireless" && $3==ssid {print $1}' | \
        xargs -r -I{} run_cmd nmcli con delete "{}"

    echo "📶 Connecting to venue WiFi on $VENUE_INTERFACE..."
    run_cmd nmcli dev wifi connect "$VENUE_SSID" password "$VENUE_PASSWORD" ifname "$VENUE_INTERFACE"

    echo "📡 Creating guest hotspot on $HOTSPOT_INTERFACE..."
    run_cmd nmcli con add type wifi ifname "$HOTSPOT_INTERFACE" con-name "Wedding-Jukebox-Hotspot" ssid "$HOTSPOT_SSID"
    run_cmd nmcli con modify "Wedding-Jukebox-Hotspot" 802-11-wireless.mode ap 802-11-wireless.band bg
    run_cmd nmcli con modify "Wedding-Jukebox-Hotspot" 802-11-wireless-security.key-mgmt wpa-psk
    run_cmd nmcli con modify "Wedding-Jukebox-Hotspot" 802-11-wireless-security.psk "$HOTSPOT_PASSWORD"
    run_cmd nmcli con modify "Wedding-Jukebox-Hotspot" ipv4.method shared ipv4.addresses 192.168.4.1/24 ipv6.method ignore

    echo "📈 Setting route metrics (prefer WiFi over Ethernet if both are up)..."
    VENUE_CONN_NAME=$(nmcli -t -f NAME,DEVICE connection show --active | awk -F: -v dev="$VENUE_INTERFACE" '$2==dev {print $1}' | head -n 1)
    ETH_CONN_NAME=$(nmcli -t -f NAME,DEVICE connection show --active | awk -F: '$2=="eth0" {print $1}' | head -n 1)
    if [[ -n "$VENUE_CONN_NAME" ]]; then
        run_cmd nmcli connection modify "$VENUE_CONN_NAME" ipv4.route-metric 50
    fi
    if [[ -n "$ETH_CONN_NAME" ]]; then
        run_cmd nmcli connection modify "$ETH_CONN_NAME" ipv4.route-metric 600
    fi

    # Stop dnsmasq so NetworkManager can manage shared mode cleanly
    run_cmd sudo systemctl stop dnsmasq 2>/dev/null || true

    run_cmd nmcli con up "Wedding-Jukebox-Hotspot"

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
run_cmd sudo apt update
run_cmd sudo apt install -y hostapd dnsmasq iptables-persistent

echo "🔌 Bringing up WiFi interfaces..."
# Bring up all WiFi interfaces
for iface in $(ls /sys/class/net/ | grep -E '^(wlan|wlx)'); do
    echo "  Bringing up $iface..."
    run_cmd sudo ip link set "$iface" up 2>/dev/null || echo "    Failed to bring up $iface (may be normal)"
done

# Re-scan for interfaces after bringing them up
echo "🔍 Re-scanning for WiFi interfaces..."
WIFI_INTERFACES=($(ls /sys/class/net/ | grep -E '^(wlan|wlx)'))
WIFI_COUNT=${#WIFI_INTERFACES[@]}
echo "Found WiFi interfaces after bringing up: ${WIFI_INTERFACES[*]}"

echo "⏹️  Stopping services for configuration..."
run_cmd sudo systemctl stop hostapd
run_cmd sudo systemctl stop dnsmasq

echo "🌐 Configuring network interfaces..."

# Check if this is Ubuntu (uses netplan) or Raspberry Pi OS (uses dhcpcd)
    if compgen -G "/etc/netplan/*.yaml" > /dev/null || [ -d /etc/netplan ]; then
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
    run_cmd sudo netplan apply
    
elif [ -f /etc/dhcpcd.conf ]; then
    echo "   Detected Raspberry Pi OS - configuring with dhcpcd..."
    
    # Configure dhcpcd for static IP on hotspot interface
    replace_managed_block \
        "/etc/dhcpcd.conf" \
        "# BEGIN WEDDING-JUKEBOX HOTSPOT" \
        "# END WEDDING-JUKEBOX HOTSPOT" \
        "interface $HOTSPOT_INTERFACE
static ip_address=192.168.4.1/24
nohook wpa_supplicant"
    
else
    echo "   Unknown network configuration system - using manual IP assignment..."
    # Fallback: manually assign IP
    run_cmd sudo ip addr add 192.168.4.1/24 dev "$HOTSPOT_INTERFACE" 2>/dev/null || true
fi

echo "📡 Configuring WiFi hotspot..."

# Configure hostapd
run_cmd sudo tee /etc/hostapd/hostapd.conf > /dev/null << EOF
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
    rsn_pairwise=CCMP
EOF

# Configure hostapd daemon
run_cmd sudo sed -i 's/#DAEMON_CONF=""/DAEMON_CONF="\/etc\/hostapd\/hostapd.conf"/' /etc/default/hostapd

echo "🏠 Configuring DHCP for guests..."

# Backup original dnsmasq config
run_cmd sudo mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig 2>/dev/null || true

# Configure dnsmasq
run_cmd sudo tee /etc/dnsmasq.conf > /dev/null << EOF
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

# Add venue WiFi to wpa_supplicant (idempotent)
replace_managed_block \
    "/etc/wpa_supplicant/wpa_supplicant.conf" \
    "# BEGIN WEDDING-JUKEBOX VENUE WIFI" \
    "# END WEDDING-JUKEBOX VENUE WIFI" \
    "network={
    ssid=\"$VENUE_SSID\"
    psk=\"$VENUE_PASSWORD\"
    priority=1
}"

echo "🔀 Configuring internet sharing..."

# Enable IP forwarding (idempotent)
run_cmd sudo tee /etc/sysctl.d/99-wedding-jukebox.conf > /dev/null << EOF
net.ipv4.ip_forward=1
EOF

# Configure iptables for NAT
run_cmd sudo iptables -t nat -A POSTROUTING -o "$VENUE_INTERFACE" -j MASQUERADE
run_cmd sudo iptables -A FORWARD -i "$VENUE_INTERFACE" -o "$HOTSPOT_INTERFACE" -m state --state RELATED,ESTABLISHED -j ACCEPT
run_cmd sudo iptables -A FORWARD -i "$HOTSPOT_INTERFACE" -o "$VENUE_INTERFACE" -j ACCEPT

# Save iptables rules using iptables-persistent (safe + standard)
run_cmd sudo sh -c "iptables-save > /etc/iptables/rules.v4"

# Create systemd service to ensure hotspot IP is set on boot
run_cmd sudo tee /etc/systemd/system/wedding-jukebox-hotspot.service > /dev/null << EOF
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

run_cmd sudo systemctl enable wedding-jukebox-hotspot

echo "🚀 Enabling services..."
# Unmask hostapd service (it gets masked during installation)
run_cmd sudo systemctl unmask hostapd
run_cmd sudo systemctl enable hostapd
run_cmd sudo systemctl enable dnsmasq

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
if [[ "$DRY_RUN" -eq 0 ]]; then
    for i in {10..1}; do
        echo -ne "\rRebooting in $i seconds... (Ctrl+C to cancel)"
        sleep 1
    done

    echo ""
    echo "🔄 Rebooting now..."
    sudo reboot
else
    echo ""
    echo "Dry-run complete. No changes were made."
fi
