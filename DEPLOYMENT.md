# Wedding Jukebox Deployment Guide

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
git clone https://github.com/JaredLThompson/wedding-jukebox.git
cd wedding-jukebox
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
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/wedding-jukebox/main/raspberry-pi-docker-setup.sh | bash
./setup-dual-wifi.sh
```

### Headless Audio Service (Required for Pi playback)
The headless audio service runs separately from Docker and plays music through the Pi speakers.

```bash
cd /home/pi/wedding-jukebox
sudo apt install -y yt-dlp mpg123 ffmpeg alsa-utils
sudo cp wedding-jukebox-audio.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable wedding-jukebox-audio
sudo systemctl start wedding-jukebox-audio
```

### Services on the Pi
- `wedding-jukebox-docker` (web app)
- `wedding-jukebox-audio` (headless audio)

Avoid running the legacy `wedding-jukebox` systemd service at the same time as Docker, or port 3000 will be busy.

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
sudo docker rm -f wedding-jukebox-pi
sudo systemctl restart wedding-jukebox-docker
```

### Audio service not playing
```bash
sudo systemctl status wedding-jukebox-audio
sudo journalctl -u wedding-jukebox-audio -n 50
```

---

## Useful Commands (Pi)
```bash
./restart-services.sh
sudo journalctl -u wedding-jukebox-audio -f
sudo systemctl status wedding-jukebox-docker
```

