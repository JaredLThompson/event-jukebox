#!/bin/bash

set -e

# 🧭 Verify Wedding Jukebox Router Mode
# Checks IP forwarding, NAT, and AP sharing status

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

pass() { echo -e "${GREEN}✅ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

HOTSPOT_IFACE="${1:-wlan1}"
VENUE_IFACE="${2:-wlan0}"

info "Checking router mode (hotspot: $HOTSPOT_IFACE, uplink: $VENUE_IFACE)"

# 1) IP forwarding
ip_forward=$(sysctl -n net.ipv4.ip_forward 2>/dev/null || echo "0")
if [[ "$ip_forward" == "1" ]]; then
  pass "IP forwarding enabled (net.ipv4.ip_forward=1)"
else
  fail "IP forwarding disabled (net.ipv4.ip_forward=$ip_forward)"
fi

# 2) NAT / masquerade
iptables_nat_ok=0
if sudo iptables -t nat -S 2>/dev/null | grep -q "MASQUERADE"; then
  pass "NAT masquerade rule present (iptables)"
  iptables_nat_ok=1
else
  warn "No NAT masquerade rule found in iptables"
fi

# 3) Forward rules
iptables_forward_ok=0
if sudo iptables -S FORWARD 2>/dev/null | grep -q "$HOTSPOT_IFACE"; then
  pass "Forward rules reference $HOTSPOT_IFACE (iptables)"
  iptables_forward_ok=1
else
  warn "No FORWARD rules reference $HOTSPOT_IFACE in iptables"
fi

if sudo iptables -S FORWARD 2>/dev/null | grep -q "$VENUE_IFACE"; then
  pass "Forward rules reference $VENUE_IFACE (iptables)"
  iptables_forward_ok=1
else
  warn "No FORWARD rules reference $VENUE_IFACE in iptables"
fi

# 4) Hotspot IP
if ip addr show "$HOTSPOT_IFACE" 2>/dev/null | grep -q "192.168.4.1/24"; then
  pass "$HOTSPOT_IFACE has 192.168.4.1/24"
else
  warn "$HOTSPOT_IFACE does not have 192.168.4.1/24"
fi

# 5) NetworkManager shared mode (if available)
if command -v nmcli >/dev/null 2>&1; then
  nm_conn=$(nmcli -t -f DEVICE,GENERAL.CONNECTION dev show 2>/dev/null | awk -F: -v dev="$HOTSPOT_IFACE" '$1==dev {print $2}')
  if [[ -n "$nm_conn" && "$nm_conn" != "--" ]]; then
    nm_shared=$(nmcli -t -f IP4.METHOD connection show "$nm_conn" 2>/dev/null | awk -F: '{print $2}')
    if [[ "$nm_shared" == "shared" ]]; then
      pass "NetworkManager shared mode enabled on $HOTSPOT_IFACE"
    elif [[ -n "$nm_shared" ]]; then
      warn "NetworkManager IP4 method on $HOTSPOT_IFACE is '$nm_shared' (expected 'shared')"
    else
      warn "NetworkManager IP4 method not found for connection '$nm_conn'"
    fi
  else
    warn "NetworkManager connection not found for $HOTSPOT_IFACE"
  fi
else
  info "nmcli not installed; skipping NetworkManager shared-mode check"
fi

# 5b) nftables NAT/forward rules (if iptables rules are missing)
nft_nat_ok=0
nft_forward_ok=0
if command -v nft >/dev/null 2>&1; then
  if sudo nft list ruleset 2>/dev/null | grep -q "masquerade"; then
    pass "nftables masquerade rule present"
    nft_nat_ok=1
  else
    warn "No nftables masquerade rule found"
  fi

  if sudo nft list ruleset 2>/dev/null | grep -q "forward" && \
     sudo nft list ruleset 2>/dev/null | grep -q "$HOTSPOT_IFACE" && \
     sudo nft list ruleset 2>/dev/null | grep -q "$VENUE_IFACE"; then
    pass "nftables forward rules reference $HOTSPOT_IFACE and $VENUE_IFACE"
    nft_forward_ok=1
  else
    warn "No nftables forward rules referencing $HOTSPOT_IFACE/$VENUE_IFACE found"
  fi
else
  info "nft not installed; skipping nftables checks"
fi

# 8) Summary: NAT + forwarding present via either backend
if [[ "$iptables_nat_ok" -eq 1 || "$nft_nat_ok" -eq 1 ]]; then
  pass "NAT appears configured"
else
  fail "NAT appears missing"
fi

if [[ "$iptables_forward_ok" -eq 1 || "$nft_forward_ok" -eq 1 ]]; then
  pass "Forwarding rules appear configured"
else
  fail "Forwarding rules appear missing"
fi

# 6) dnsmasq (if using hostapd/dnsmasq path)
if systemctl is-active --quiet dnsmasq 2>/dev/null; then
  pass "dnsmasq is active"
else
  warn "dnsmasq is not active (ok if using NetworkManager shared mode)"
fi

# 7) hostapd (if using hostapd path)
if systemctl is-active --quiet hostapd 2>/dev/null; then
  pass "hostapd is active"
else
  warn "hostapd is not active (ok if using NetworkManager hotspot)"
fi

echo ""
info "Done. Green means router mode is working. Yellow means review. Red means fix required."
