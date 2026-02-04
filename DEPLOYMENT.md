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
