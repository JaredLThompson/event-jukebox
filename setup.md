# Local Setup Guide

## Prerequisites
- Node.js 18+
- Python 3.8+

## Quick Start
```bash
npm install
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
npm run dev
```

Open http://localhost:3000

## Optional: YouTube Music Auth (No Ads)
```bash
source venv/bin/activate
python setup_auth.py
```

See `setup_youtube_auth.md` for details.

## Optional: Spotify Setup
```bash
node setup_spotify_auth.js
```

See `setup_spotify_integration.md` for details.

## Notes
- Local dev uses browser audio by default.
- Headless audio is intended for the Raspberry Pi setup.

