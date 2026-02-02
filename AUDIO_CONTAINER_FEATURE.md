# Audio Container Feature Specification

## Overview
Separate audio playback from the DJ's web browser by creating a dedicated audio output container. This would provide more reliable audio output and better separation of concerns.

## Current Architecture
- **DJ Browser**: Web interface + Audio output
- **Issues**: Browser-dependent audio, potential reliability issues, tied to DJ's device

## Proposed Architecture
- **Main Container**: Web interface, queue management, API, credential handling
- **Audio Container**: Dedicated audio output service
- **Communication**: REST API between containers

## Benefits
- Reliable audio output independent of browser issues
- Headless audio service that can run on any device
- Better control over audio hardware/output
- Separation between UI and audio playback
- Can run audio service on dedicated hardware

## Technical Challenges

### YouTube Music Credentials
- YouTube Music uses browser-based OAuth flows
- Credentials are tied to browser sessions
- Won't work in headless environment

### Spotify Integration
- Better headless API support
- Could work directly in audio container

## Implementation Options

### Option 1: Hybrid Approach (Recommended)
- **Main container**: Handles all authentication (YouTube + Spotify)
- **Main container**: Streams/downloads audio and sends raw audio data to audio container
- **Audio container**: Receives audio stream and outputs to speakers
- **Pros**: Keeps all credential complexity in one place, works with both services
- **Cons**: More complex audio streaming between containers

### Option 2: Spotify-Only Audio Container
- **Audio container**: Only handles Spotify playback using Spotify API
- **Main container**: Falls back to browser playback for YouTube Music
- **Pros**: Simpler implementation, leverages Spotify's better API
- **Cons**: Mixed playback sources, YouTube still browser-dependent

### Option 3: Audio Proxy/Stream
- **Main container**: Downloads/streams all audio content
- **Audio container**: Pure audio player (no service integration)
- **Pros**: Service-agnostic audio container
- **Cons**: Most complex, requires audio format handling

### Option 4: Configuration Toggle
- **Setting**: Enable/disable audio container mode
- **Disabled**: Current browser-based playback
- **Enabled**: Audio container handles supported services, browser fallback
- **Pros**: Backward compatibility, gradual migration
- **Cons**: Dual code paths to maintain

## Technical Implementation

### Docker Compose Structure
```yaml
services:
  wedding-jukebox:
    # Main web application
    
  audio-player:
    # Dedicated audio output service
    
volumes:
  audio-cache:
    # Shared audio file storage
```

### API Design
```
POST /audio/play
POST /audio/pause
POST /audio/stop
POST /audio/skip
POST /audio/volume
GET  /audio/status
```

### Audio Container Technologies
- **Node.js**: `node-speaker`, `play-sound`, `fluent-ffmpeg`
- **Python**: `pygame`, `pydub`, `pyaudio`
- **Audio formats**: MP3, WAV, streaming support

## Workflow
1. DJ manages queue through web interface
2. Main container processes queue and handles authentication
3. Main container sends audio data/commands to audio container
4. Audio container handles physical audio output
5. Status updates flow back to main container and UI

## Configuration Options
- Enable/disable audio container mode
- Audio output device selection
- Volume control
- Audio quality settings
- Fallback behavior configuration

## Future Enhancements
- Multiple audio zones
- Audio effects/processing
- Integration with external audio systems
- Real-time audio visualization data
- Audio recording/logging

## Questions to Consider
1. What audio output hardware will be used?
2. Should we support multiple audio formats?
3. How should we handle audio caching/buffering?
4. What's the fallback strategy if audio container fails?
5. Should we support streaming to remote audio devices?

---
*Created: February 1, 2026*
*Status: Planning/Design Phase*