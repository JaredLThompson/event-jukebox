# Virtual Jukebox 🎵

A modern web-based virtual jukebox application with **YouTube Music integration** that allows multiple users to collaboratively search, add, and manage a music queue in real-time.

## ✨ Features

- **🎼 YouTube Music Integration**: Search and add real songs from YouTube Music
- **⚡ Real-time Collaboration**: Multiple users can add songs simultaneously
- **🔄 Live Queue Management**: See the queue update in real-time across all connected devices
- **🎨 Modern UI**: Beautiful, responsive design with glassmorphism effects
- **🔌 Socket.IO Integration**: Real-time updates without page refreshes
- **👥 User Tracking**: See how many people are currently using the jukebox
- **🎛️ Queue Controls**: Add, remove, and skip songs in the queue
- **📱 Mobile Responsive**: Works perfectly on phones, tablets, and desktops

## 🚀 Quick Start

### Option 1: Docker (Recommended)
```bash
# Clone repository
git clone https://github.com/JaredLThompson/wedding-jukebox.git
cd wedding-jukebox

# Deploy from pre-built container
./deploy-from-registry.sh

# Access at http://localhost:3000
```

### Option 2: Local Development
Run the setup script:
```bash
./setup.sh
```

Or manually:
```bash
# Install Node.js dependencies
npm install

# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start the server
npm run dev
```

Open your browser to `http://localhost:3000` and start jamming! 🎶

## Tech Stack

- **Backend**: Node.js, Express.js, Socket.IO
- **Frontend**: Vanilla JavaScript, HTML5, Tailwind CSS
- **Real-time**: WebSocket connections via Socket.IO
- **Styling**: Tailwind CSS with custom animations

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd virtual-jukebox
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Build CSS (in a separate terminal):
```bash
npm run build:css
```

5. Start the development server:
```bash
npm run dev
```

6. Open your browser and navigate to `http://localhost:3000`

## 🎼 How to Use

### 🎵 YouTube Music Setup (Recommended for Ad-Free Experience)

For the best wedding experience without ads, set up YouTube Music authentication:

1. **Prerequisites**: You need a YouTube Music Premium account
2. **Run the setup script**:
   ```bash
   source venv/bin/activate
   python setup_auth.py
   ```
3. **Follow the prompts** to authenticate with your YouTube Music account
4. **Restart the server** - you'll now have ad-free music playback!

📖 **Detailed instructions**: See [setup_youtube_auth.md](setup_youtube_auth.md) for step-by-step guide

### Adding Songs
1. **YouTube Music Search** (Recommended):
   - Click the "Search YouTube Music" tab
   - Type any song, artist, or album name
   - Click on any result to add it to the queue
   - Real song data with thumbnails, duration, and artist info!

2. **Manual Entry**:
   - Click the "Manual Entry" tab  
   - Fill in song title, artist, and your name
   - Click "Add to Queue"

### Managing the Queue
- **View Queue**: See all upcoming songs with position numbers
- **Remove Songs**: Click the ❌ button next to any song
- **Play Next**: Click "Next Song" to advance the queue
- **Real-time Updates**: All changes sync instantly across all users

### Collaboration
- Multiple people can search and add songs simultaneously
- See how many users are currently online
- All queue changes appear instantly for everyone

## Music Service Integration

### YouTube Music (Currently Implemented)
The app uses YouTube Music via the unofficial `ytmusicapi` Python library:

- **Search**: Real-time search of YouTube Music catalog
- **No Ads**: With Premium account authentication (see setup above)
- **Rich Metadata**: Song titles, artists, albums, thumbnails, duration
- **High Quality**: Streams directly from YouTube Music

### Future Music Services
The app structure supports integration with other music services:
- Spotify Web API
- Apple Music API  
- Amazon Music API (when available)
- SoundCloud API

## Project Structure

```
virtual-jukebox/
├── public/
│   ├── css/
│   │   ├── input.css      # Tailwind source
│   │   └── output.css     # Compiled CSS
│   ├── js/
│   │   └── app.js         # Frontend JavaScript
│   └── index.html         # Main HTML file
├── server.js              # Express server & Socket.IO
├── package.json
├── tailwind.config.js
├── .env.example
└── README.md
```

## API Endpoints

- `GET /` - Serve the main application
- `GET /api/queue` - Get current queue and playing song
- `POST /api/queue/add` - Add a song to the queue
- `POST /api/queue/next` - Play the next song
- `DELETE /api/queue/:id` - Remove a song from the queue

## Socket Events

- `queueUpdated` - Broadcast when queue changes
- `nowPlaying` - Broadcast when a new song starts playing
- `userCount` - Update connected user count

## Future Enhancements

- [ ] User authentication and profiles
- [ ] Voting system for queue order
- [ ] Music service integration (Amazon Music, Spotify, etc.)
- [ ] Playlist creation and management
- [ ] Audio visualization
- [ ] Mobile app companion
- [ ] Admin controls for queue management
- [ ] Song history and statistics

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details