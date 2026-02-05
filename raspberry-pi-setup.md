# Raspberry Pi Event Jukebox Setup

## Hardware Requirements
- Raspberry Pi 4 (4GB+ recommended)
- MicroSD card (32GB+ Class 10)
- Power supply + cooling case
- USB WiFi adapter (for dual WiFi)

## Option A: Docker Setup (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/event-jukebox/main/raspberry-pi-docker-setup.sh | bash
./setup-dual-wifi.sh
```

This installs and enables:
- `event-jukebox-docker` (web app container)
- `event-jukebox-audio` (headless audio service)
- `event-jukebox-wifi-api` (optional uplink WiFi manager)

### Headless Audio Service
The audio service runs on the host and plays music through the Pi speakers.

```bash
cd /home/pi/event-jukebox
sudo apt install -y yt-dlp mpg123 ffmpeg alsa-utils
sudo cp event-jukebox-audio.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable event-jukebox-audio
sudo systemctl start event-jukebox-audio
```

If the web app is not running on `http://localhost:3000`, set `JUKEBOX_URL` so the audio service targets the correct host:
```bash
sudo systemctl edit event-jukebox-audio
```
Add:
```
[Service]
Environment=JUKEBOX_URL=http://<host-or-ip>:3000
```
Then reload:
```bash
sudo systemctl daemon-reload
sudo systemctl restart event-jukebox-audio
```

## Option B: Direct Code Installation
If you want to run without Docker:

```bash
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/event-jukebox/main/raspberry-pi-complete-setup.sh | bash
./setup-dual-wifi.sh
```

## Optional: Disable the Desktop GUI (Recommended)
For a dedicated event appliance, you can boot to the console (no desktop) to reduce memory usage and avoid accidental GUI sessions.

Disable the desktop (boot to console):
```bash
sudo systemctl set-default multi-user.target
sudo reboot
```

Re-enable the desktop later if needed:
```bash
sudo systemctl set-default graphical.target
sudo reboot
```

## Optional: Persist PipeWire Headphone Volume (Debian 13 / PipeWire)
If the Pi boots with PipeWire and audio volume is muted/low, install a user-level systemd unit to set defaults on boot.

```bash
mkdir -p ~/.config/systemd/user
cp /home/pi/event-jukebox/systemd/user/event-jukebox-audio-defaults.service ~/.config/systemd/user/
sudo loginctl enable-linger pi
systemctl --user daemon-reload
systemctl --user enable event-jukebox-audio-defaults
systemctl --user start event-jukebox-audio-defaults
```

## Optional: Nginx Reverse Proxy (Port 80)
Expose the app on port 80 and forward to the Node app on port 3000.

```bash
sudo apt install -y nginx
sudo cp /home/pi/event-jukebox/nginx/event-jukebox.conf /etc/nginx/sites-available/event-jukebox
sudo ln -sf /etc/nginx/sites-available/event-jukebox /etc/nginx/sites-enabled/event-jukebox
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## Optional: HTTPS with a Self-Signed Cert (Nginx)
If you want HTTPS on the Pi (useful for captive portals or secure devices), generate a self-signed cert and use the SSL config.

```bash
sudo apt install -y nginx openssl
sudo mkdir -p /etc/ssl/event-jukebox
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \\
  -keyout /etc/ssl/event-jukebox/event-jukebox.key \\
  -out /etc/ssl/event-jukebox/event-jukebox.crt \\
  -subj "/CN=event-jukebox.local"

sudo cp /home/pi/event-jukebox/nginx/event-jukebox-ssl.conf /etc/nginx/sites-available/event-jukebox
sudo ln -sf /etc/nginx/sites-available/event-jukebox /etc/nginx/sites-enabled/event-jukebox
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Quick install script (same result):
```bash
sudo /home/pi/event-jukebox/setup-nginx.sh --hostname event-jukebox.local
```

Let's Encrypt (public DNS required):
```bash
sudo /home/pi/event-jukebox/setup-nginx.sh --hostname your-domain.example.com --letsencrypt
```

## Optional: HTTPS with Let's Encrypt (Nginx)
If the Pi has a public DNS name and is reachable from the internet, you can use Let's Encrypt for trusted HTTPS.

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example.com
```

Renewal is installed automatically. You can test renewal with:
```bash
sudo certbot renew --dry-run
```

## Audio Output Selection
Audio output is chosen from Settings and persisted on the Pi.

To list devices:
```bash
aplay -l
```

Examples:
- `hw:CARD=Set,DEV=0` (USB audio)
- `hw:CARD=vc4hdmi0,DEV=0` (HDMI 0)

If you adjust ALSA mixer levels (via `alsamixer`), persist them across reboots:
```bash
sudo alsactl store
```

## Service Management

```bash
sudo systemctl status event-jukebox-docker
sudo systemctl status event-jukebox-audio
```

Restart all services:
```bash
./restart-services.sh
```

### Avoid Port Conflicts
If you use Docker on the Pi, do **not** run the legacy `event-jukebox` systemd service at the same time (it will bind port 3000).

## Logs
```bash
sudo journalctl -u event-jukebox-audio -f
sudo journalctl -u event-jukebox-docker -f
```
