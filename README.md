# Event Jukebox

A web-based wedding jukebox with YouTube Music + Spotify search, real-time collaboration, and a headless audio service for reliable playback on a Raspberry Pi.

## Highlights
- YouTube Music search and full playback (headless mode via yt-dlp + mpg123)
- Browser mode playback via YouTube iframe
- Spotify search with 30-second previews (no full Spotify playback)
- Real-time queue collaboration and DJ controls
- Headless audio service (Pi plays music, any device can DJ)
- Dual playlists with fallback mode and suppression
- Captive portal + dual WiFi hotspot for weddings

## Architecture (Current)
- **Web app**: Runs in Docker (or locally) and serves the DJ + guest UI.
- **Headless audio service**: Runs on the Pi as `event-jukebox-audio` (systemd). It downloads and plays audio via ALSA.
- **Settings**: Audio output device and volume are controlled from the UI and sent to the audio service.

## Quick Start

### Docker (Local)
```bash
# Build + run locally
./deploy-local.sh

# Or use registry image
./deploy-from-registry.sh
```

### Raspberry Pi (Recommended)
```bash
# Docker-based Pi setup
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/event-jukebox/main/raspberry-pi-docker-setup.sh | bash

# Dual WiFi setup (hotspot + internet)
./setup-dual-wifi.sh
```

### Headless Audio Service (Pi)
```bash
cd /home/pi/event-jukebox
sudo apt install -y yt-dlp mpg123 ffmpeg alsa-utils
sudo cp event-jukebox-audio.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable event-jukebox-audio
sudo systemctl start event-jukebox-audio
```

### Local Development
```bash
npm install
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
npm run dev
```

Open http://localhost:3000
If you are not running the headless audio service locally, switch **Settings → System Mode** to **Browser** so playback uses the YouTube iframe.

## Audio Output Selection
The settings page allows you to select an ALSA output device. This setting is persisted on the Pi and applied to the audio service.

To list devices on the Pi:
```bash
aplay -l
```

Common devices:
- `hw:CARD=Set,DEV=0` (USB audio)
- `hw:CARD=vc4hdmi0,DEV=0` (HDMI 0)
- `hw:CARD=vc4hdmi1,DEV=0` (HDMI 1)

## Event Branding
You can brand the UI for any event (wedding, dojo, house party, etc.) by editing `event-config.json`.

For Pi deployments, you can override it at `/app/data/event-config.json` (inside the Docker volume).

## Useful Commands (Pi)
```bash
# Restart services (Docker + audio)
./restart-services.sh

# Check audio logs
sudo journalctl -u event-jukebox-audio -f

# Check Docker service
sudo systemctl status event-jukebox-docker
```

## Configuration
Environment variables (optional):
- `PREBUFFER_DEDUP=0` to disable pre-buffer de-duplication (default enabled)
- `ALSA_DEVICE=hw:CARD=Set,DEV=0` to override audio output
- `AMIXER_DEVICE=hw:CARD=Set` to override mixer control device

## Documentation
- `DEPLOYMENT.md` - Full deployment guide
- `raspberry-pi-setup.md` - Detailed Pi setup
- `DOCKER_DEPLOYMENT_GUIDE.md` - Docker scripts and workflows
