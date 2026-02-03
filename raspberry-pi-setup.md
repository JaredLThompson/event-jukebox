# Raspberry Pi Wedding Jukebox Setup

## Hardware Requirements
- Raspberry Pi 4 (4GB+ recommended)
- MicroSD card (32GB+ Class 10)
- Power supply + cooling case
- USB WiFi adapter (for dual WiFi)

## Option A: Docker Setup (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/wedding-jukebox/main/raspberry-pi-docker-setup.sh | bash
./setup-dual-wifi.sh
```

This installs and enables:
- `wedding-jukebox-docker` (web app container)
- `wedding-jukebox-audio` (headless audio service)
- `wedding-jukebox-wifi-api` (optional uplink WiFi manager)

### Headless Audio Service
The audio service runs on the host and plays music through the Pi speakers.

```bash
cd /home/pi/wedding-jukebox
sudo apt install -y yt-dlp mpg123 ffmpeg alsa-utils
sudo cp wedding-jukebox-audio.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable wedding-jukebox-audio
sudo systemctl start wedding-jukebox-audio
```

## Option B: Direct Code Installation
If you want to run without Docker:

```bash
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/wedding-jukebox/main/raspberry-pi-complete-setup.sh | bash
./setup-dual-wifi.sh
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

## Service Management

```bash
sudo systemctl status wedding-jukebox-docker
sudo systemctl status wedding-jukebox-audio
```

Restart all services:
```bash
./restart-services.sh
```

### Avoid Port Conflicts
If you use Docker on the Pi, do **not** run the legacy `wedding-jukebox` systemd service at the same time (it will bind port 3000).

## Logs
```bash
sudo journalctl -u wedding-jukebox-audio -f
sudo journalctl -u wedding-jukebox-docker -f
```

