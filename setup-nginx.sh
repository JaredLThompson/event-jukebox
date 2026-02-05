#!/bin/bash
set -euo pipefail

APP_DIR="/home/pi/event-jukebox"
NGINX_SITE="event-jukebox"
SSL_DIR="/etc/ssl/event-jukebox"
CERT_PATH="$SSL_DIR/event-jukebox.crt"
KEY_PATH="$SSL_DIR/event-jukebox.key"
CONF_SRC="$APP_DIR/nginx/event-jukebox-ssl.conf"
CONF_DST="/etc/nginx/sites-available/$NGINX_SITE"
HOSTNAME="event-jukebox.local"
USE_LETSENCRYPT="false"

usage() {
  cat <<EOF
Usage: sudo ./setup-nginx.sh [--hostname <host>] [--letsencrypt]

Options:
  --hostname <host>     Common name for the self-signed certificate (default: event-jukebox.local)
  --letsencrypt         Use Let's Encrypt (requires public DNS and port 80 reachable)
EOF
}

print() { echo -e "[INFO] $1"; }
warn() { echo -e "[WARN] $1"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hostname)
      HOSTNAME="${2:-}"
      shift 2
      ;;
    --letsencrypt)
      USE_LETSENCRYPT="true"
      shift 1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      warn "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  warn "Please run as root (sudo ./setup-nginx.sh)"
  exit 1
fi

if [[ "$USE_LETSENCRYPT" == "true" ]]; then
  print "Installing nginx + certbot..."
  apt-get update -y
  apt-get install -y nginx certbot python3-certbot-nginx
else
  print "Installing nginx + openssl..."
  apt-get update -y
  apt-get install -y nginx openssl

  print "Creating self-signed certificate..."
  mkdir -p "$SSL_DIR"
  if [[ ! -f "$CERT_PATH" || ! -f "$KEY_PATH" ]]; then
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout "$KEY_PATH" \
      -out "$CERT_PATH" \
      -subj "/CN=${HOSTNAME}"
  else
    print "Certificate already exists, skipping generation."
  fi
fi

print "Installing nginx site config..."
if [[ ! -f "$CONF_SRC" ]]; then
  echo "[ERROR] Missing config: $CONF_SRC"
  exit 1
fi

cp "$CONF_SRC" "$CONF_DST"
ln -sf "$CONF_DST" /etc/nginx/sites-enabled/$NGINX_SITE
rm -f /etc/nginx/sites-enabled/default

print "Testing nginx config..."
nginx -t

print "Reloading nginx..."
systemctl reload nginx

if [[ "$USE_LETSENCRYPT" == "true" ]]; then
  print "Requesting Let's Encrypt certificate for ${HOSTNAME}..."
  certbot --nginx -d "$HOSTNAME"
  print "Let's Encrypt setup complete."
else
  print "Nginx is configured for HTTPS (self-signed) and HTTP redirect."
fi
