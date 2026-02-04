#!/usr/bin/env bash
set -euo pipefail

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found. This script is intended for the Raspberry Pi."
  exit 1
fi

SERVICES=(
  # "event-jukebox" # Local (non-Docker) service - keep commented to avoid port 3000 conflicts
  "event-jukebox-docker"
  "event-jukebox-audio"
  "event-jukebox-wifi-api"
  "event-jukebox-hotspot"
)

echo "Restarting Event Jukebox services..."

for service in "${SERVICES[@]}"; do
  if systemctl list-unit-files --type=service --no-legend | awk '{print $1}' | grep -q "^${service}\.service$"; then
    echo "↻ Restarting ${service}..."
    sudo systemctl restart "${service}"
  else
    echo "• Skipping ${service} (not installed)"
  fi
done

echo "Done."
