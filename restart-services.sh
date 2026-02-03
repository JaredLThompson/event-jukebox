#!/usr/bin/env bash
set -euo pipefail

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found. This script is intended for the Raspberry Pi."
  exit 1
fi

SERVICES=(
  "wedding-jukebox"
  "wedding-jukebox-docker"
  "wedding-jukebox-audio"
  "wedding-jukebox-wifi-api"
  "wedding-jukebox-hotspot"
)

echo "Restarting Wedding Jukebox services..."

for service in "${SERVICES[@]}"; do
  if systemctl list-unit-files --type=service --no-legend | awk '{print $1}' | grep -q "^${service}\.service$"; then
    echo "↻ Restarting ${service}..."
    sudo systemctl restart "${service}"
  else
    echo "• Skipping ${service} (not installed)"
  fi
done

echo "Done."
