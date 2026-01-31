# Virtual Jukebox Setup Guide

## Prerequisites

You'll need Node.js and npm installed on your system. If you don't have them:

### Install Node.js on macOS:

**Option 1: Using Homebrew (recommended)**
```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node
```

**Option 2: Download from official website**
- Visit https://nodejs.org/
- Download the LTS version for macOS
- Run the installer

## Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Start the development server:**
```bash
npm run dev
```

3. **Open your browser:**
Navigate to `http://localhost:3000`

## Features Ready to Use

✅ **Real-time collaboration** - Multiple users can add songs simultaneously  
✅ **Live queue management** - See updates across all devices instantly  
✅ **Modern UI** - Beautiful responsive design with animations  
✅ **User tracking** - See how many people are online  
✅ **Queue controls** - Add, remove, and skip songs  

## Next Steps for Amazon Music Integration

Since Amazon Music's Web API is currently in closed beta, here are your options:

### 1. Wait for Amazon Music API
- Monitor https://developer.amazon.com/docs/music/ for updates
- Join their developer program when available
- The app structure is ready for integration

### 2. Use Alternative Music Services (Available Now)

**Spotify Web API:**
```bash
# Add Spotify credentials to .env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

**YouTube Music API:**
- Integrate with YouTube Data API v3
- Add search and playback functionality

### 3. Demo Mode (Current)
The app currently works in demo mode where users can:
- Add song titles and artists manually
- Manage the queue collaboratively
- See real-time updates

## Architecture Overview

- **Backend:** Express.js + Socket.IO for real-time features
- **Frontend:** Vanilla JavaScript with modern ES6+ features
- **Styling:** Tailwind CSS with custom animations
- **Real-time:** WebSocket connections for instant updates

The codebase is structured to easily add music service integrations when APIs become available.