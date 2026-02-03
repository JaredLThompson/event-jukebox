# Headless Audio Service (Current Implementation)

## Overview
The project now uses a **headless audio service** on the Raspberry Pi to handle real playback. This service runs outside Docker as a systemd unit (`wedding-jukebox-audio`) and plays through ALSA using `mpg123` and `yt-dlp`.

## Current Architecture
- **Web app**: Runs in Docker (or locally) and serves the UI + APIs.
- **Audio service**: Runs on the Pi host and receives playback commands over Socket.IO.
- **Audio output**: Controlled via Settings (ALSA device selection + volume).

## Benefits
- Reliable playback independent of browser audio
- Any device can be the DJ UI
- Server-side buffering and caching
- Stable audio output through ALSA

## How It Works
1. Web UI sends commands (`play`, `pause`, `skip`, `volume`)
2. Audio service downloads audio and plays via ALSA
3. Status is emitted back to the web app

## Configuration
- Audio output selection in Settings (persisted on Pi)
- `PREBUFFER_DEDUP=0` to disable pre-buffer de-duplication
- `ALSA_DEVICE` / `AMIXER_DEVICE` for manual overrides

## Future (Optional)
A dedicated **audio container** is possible, but currently unnecessary. The host audio service is simpler and has direct ALSA access.

