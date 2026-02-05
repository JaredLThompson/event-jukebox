# Event Jukebox Deployment Guide

This guide covers local development, Docker deployment, and Raspberry Pi wedding setup.

## Quick Comparison

| Method | Difficulty | Best For |
|--------|------------|----------|
| Local Dev | Easy | Development, testing |
| Docker | Medium | Consistent environments |
| Raspberry Pi | Advanced | Weddings, events |

---

## Option 1: Local Development

### Prerequisites
- Node.js 18+
- Python 3.8+

### Setup
```bash
git clone https://github.com/JaredLThompson/event-jukebox.git
cd event-jukebox
npm install
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
npm run dev
```

Access:
- DJ Interface: http://localhost:3000
- Guest Interface: http://localhost:3000/user

---

## Option 2: Docker (Local or Server)

### Quick Start
```bash
./deploy-local.sh
```

### From Registry
```bash
./deploy-from-registry.sh
```

### Helpful Commands
```bash
./docker-manage.sh status
./docker-manage.sh logs -f
./docker-manage.sh restart
```

---

## Option 3: Raspberry Pi (Recommended for Events)

### Docker-based Pi Setup
```bash
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/event-jukebox/main/raspberry-pi-docker-setup.sh | bash
./setup-dual-wifi.sh
```

### Optional: Disable the Desktop GUI (Recommended)
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

### Optional: Persist PipeWire Headphone Volume (Debian 13 / PipeWire)
If the Pi boots with PipeWire and audio volume is muted/low, install a user-level systemd unit to set defaults on boot.

```bash
mkdir -p ~/.config/systemd/user
cp /home/pi/event-jukebox/systemd/user/event-jukebox-audio-defaults.service ~/.config/systemd/user/
sudo loginctl enable-linger pi
systemctl --user daemon-reload
systemctl --user enable event-jukebox-audio-defaults
systemctl --user start event-jukebox-audio-defaults
```

### Optional: Nginx Reverse Proxy (Port 80)
Expose the app on port 80 and forward to the Node app on port 3000.

```bash
sudo apt install -y nginx
sudo cp /home/pi/event-jukebox/nginx/event-jukebox.conf /etc/nginx/sites-available/event-jukebox
sudo ln -sf /etc/nginx/sites-available/event-jukebox /etc/nginx/sites-enabled/event-jukebox
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### Optional: HTTPS with a Self-Signed Cert (Nginx)
If you want HTTPS on the Pi, generate a self-signed cert and use the SSL config.

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

### Optional: HTTPS with Let's Encrypt (Nginx)
If the Pi has a public DNS name and is reachable from the internet, you can use Let's Encrypt for trusted HTTPS.

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example.com
```

Renewal is installed automatically. You can test renewal with:
```bash
sudo certbot renew --dry-run
```

### Headless Audio Service (Required for Pi playback)
The headless audio service runs separately from Docker and plays music through the Pi speakers.

```bash
cd /home/pi/event-jukebox
sudo apt install -y yt-dlp mpg123 ffmpeg alsa-utils
sudo cp event-jukebox-audio.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable event-jukebox-audio
sudo systemctl start event-jukebox-audio
```

### Services on the Pi
- `event-jukebox-docker` (web app)
- `event-jukebox-audio` (headless audio)

Avoid running the legacy `event-jukebox` systemd service at the same time as Docker, or port 3000 will be busy.

---

## Audio Output Selection
Audio output is selected from the Settings screen and persisted on the Pi.

To list devices:
```bash
aplay -l
```

Example device IDs:
- `hw:CARD=Set,DEV=0` (USB)
- `hw:CARD=vc4hdmi0,DEV=0` (HDMI 0)

If you adjust ALSA mixer levels (via `alsamixer`), persist them across reboots:
```bash
sudo alsactl store
```

## Event Branding
Edit `event-config.json` to change the event name, playlist labels, and UI text.
On the Pi, place an override at `/app/data/event-config.json` so updates survive container rebuilds.

---

## Troubleshooting

### Port 3000 already in use
```bash
sudo ss -lptn 'sport = :3000'
```
Stop the service that owns it, or avoid starting both Docker and the legacy service.

### Docker container won’t start (Pi)
Often caused by a port conflict or stale container.

```bash
sudo docker rm -f event-jukebox-pi
sudo systemctl restart event-jukebox-docker
```

### Audio service not playing
```bash
sudo systemctl status event-jukebox-audio
sudo journalctl -u event-jukebox-audio -n 50
```

---

## Useful Commands (Pi)
```bash
./restart-services.sh
sudo journalctl -u event-jukebox-audio -f
sudo systemctl status event-jukebox-docker
```
