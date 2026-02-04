#!/bin/bash
set -e

SINK="${1:-@DEFAULT_SINK@}"
VOLUME="${2:-0.7}"

wpctl set-mute "$SINK" 0
wpctl set-volume "$SINK" "$VOLUME"
