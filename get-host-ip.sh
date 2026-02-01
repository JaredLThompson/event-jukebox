#!/bin/bash

# 🌐 Get Host IP Address for Mobile Access
# This script helps you find your computer's IP address for mobile devices

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🌐 Finding Your Host IP Address${NC}"
echo -e "${CYAN}===============================${NC}"
echo ""

# Function to validate IP address
is_valid_ip() {
    local ip=$1
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        IFS='.' read -ra ADDR <<< "$ip"
        for i in "${ADDR[@]}"; do
            if [[ $i -gt 255 ]]; then
                return 1
            fi
        done
        return 0
    fi
    return 1
}

# Try different methods to get IP addresses
echo -e "${BLUE}Detected IP Addresses:${NC}"
echo ""

found_ips=()

# Method 1: hostname -I (Linux)
if command -v hostname &> /dev/null; then
    ips=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -v '^127\.' || echo "")
    if [[ -n "$ips" ]]; then
        while IFS= read -r ip; do
            if is_valid_ip "$ip" && [[ "$ip" != "127.0.0.1" ]]; then
                found_ips+=("$ip")
                echo -e "   ${GREEN}✅ $ip${NC} (hostname)"
            fi
        done <<< "$ips"
    fi
fi

# Method 2: ifconfig
if command -v ifconfig &> /dev/null; then
    ips=$(ifconfig 2>/dev/null | grep -E 'inet [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | awk '{print $2}' | sed 's/addr://' | grep -v '^127\.' || echo "")
    if [[ -n "$ips" ]]; then
        while IFS= read -r ip; do
            if is_valid_ip "$ip" && [[ "$ip" != "127.0.0.1" ]] && [[ ! " ${found_ips[@]} " =~ " ${ip} " ]]; then
                found_ips+=("$ip")
                echo -e "   ${GREEN}✅ $ip${NC} (ifconfig)"
            fi
        done <<< "$ips"
    fi
fi

# Method 3: ip command (Linux)
if command -v ip &> /dev/null; then
    ips=$(ip addr show 2>/dev/null | grep -E 'inet [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | awk '{print $2}' | cut -d'/' -f1 | grep -v '^127\.' || echo "")
    if [[ -n "$ips" ]]; then
        while IFS= read -r ip; do
            if is_valid_ip "$ip" && [[ "$ip" != "127.0.0.1" ]] && [[ ! " ${found_ips[@]} " =~ " ${ip} " ]]; then
                found_ips+=("$ip")
                echo -e "   ${GREEN}✅ $ip${NC} (ip command)"
            fi
        done <<< "$ips"
    fi
fi

# Method 4: Python socket method
if command -v python3 &> /dev/null; then
    ip=$(python3 -c "
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
    if is_valid_ip "$ip" && [[ "$ip" != "127.0.0.1" ]] && [[ ! " ${found_ips[@]} " =~ " ${ip} " ]]; then
        found_ips+=("$ip")
        echo -e "   ${GREEN}✅ $ip${NC} (python socket)"
    fi
fi

echo ""

if [[ ${#found_ips[@]} -eq 0 ]]; then
    echo -e "${YELLOW}⚠️  No IP addresses found automatically${NC}"
    echo ""
    echo "Try these manual methods:"
    echo "• macOS: System Preferences → Network → Advanced → TCP/IP"
    echo "• Windows: ipconfig"
    echo "• Linux: ip addr show"
    echo ""
else
    echo -e "${CYAN}🎵 Virtual Jukebox URLs:${NC}"
    echo ""
    
    # Show URLs for each IP
    for ip in "${found_ips[@]}"; do
        echo -e "${YELLOW}Using IP: $ip${NC}"
        echo -e "   DJ Interface:    http://$ip:3000"
        echo -e "   User Interface:  http://$ip:3000/user"
        echo -e "   QR Codes:        http://$ip:3000/qr"
        echo ""
    done
    
    # Recommend the best IP
    if [[ ${#found_ips[@]} -eq 1 ]]; then
        echo -e "${GREEN}✅ Use this IP for mobile devices: ${found_ips[0]}${NC}"
    else
        echo -e "${CYAN}💡 Multiple IPs found:${NC}"
        echo "• Use your WiFi network IP for mobile devices"
        echo "• Ethernet IPs typically start with 192.168.x.x or 10.x.x.x"
        echo "• Avoid IPs starting with 172.17.x.x (Docker internal)"
    fi
fi

echo ""
echo -e "${CYAN}📱 For Wedding Guests:${NC}"
echo "1. Make sure mobile devices are on the same WiFi network"
echo "2. Use the IP address shown above"
echo "3. Generate QR codes at http://YOUR_IP:3000/qr"
echo "4. Test the connection before the event!"