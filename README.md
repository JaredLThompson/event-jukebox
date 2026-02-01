# 🎵 Wedding Jukebox - Ultimate Interactive Music Experience

A modern web-based wedding jukebox with **YouTube Music integration**, **dual WiFi Pi setup**, and **real-time collaboration**. Perfect for weddings, parties, and events!

## ✨ Features

### 🎵 **Music & Collaboration**
- **YouTube Music Integration**: Search and add real songs from YouTube Music
- **Real-time Collaboration**: Multiple guests can add songs simultaneously
- **Live Queue Management**: See the queue update in real-time across all devices
- **Song Suppression**: DJs can temporarily skip playlist songs without removing them
- **Advanced Pre-buffering**: Eliminates WiFi buffering issues during playback
- **Dual Playlists**: Wedding party playlist + elegant bride's collection

### 🎛️ **DJ Controls**
- **Queue Management**: Add, remove, reorder, and skip songs
- **Playlist Browser**: Browse and jump to specific songs
- **Park/Unpark Queue**: Control when user submissions are active
- **Play History**: Track all songs played during the event
- **Real-time Updates**: All changes sync instantly across devices

### 🌐 **Perfect Wedding Setup**
- **Raspberry Pi Hotspot**: Pi creates "Wedding-Jukebox" WiFi for guests
- **Dual WiFi**: Pi connects to venue WiFi for YouTube Music searches
- **Captive Portal**: Any website guests visit redirects to jukebox
- **No Passwords Needed**: Guests just connect and start requesting songs
- **Professional Audio**: DJ device handles audio playback to sound system

### 📱 **User Experience**
- **Mobile Responsive**: Works perfectly on phones, tablets, and desktops
- **Beautiful UI**: Modern design with glassmorphism effects
- **QR Code Access**: Easy guest access via QR codes
- **Real-time Feedback**: See your song added to the queue instantly

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

### Option 2: Raspberry Pi Wedding Setup (Ultimate! 🌟)

**Hardware needed for dual WiFi:**
- Raspberry Pi 4 (4GB+ recommended)
- **USB WiFi Adapter** (TP-Link AC600 T2U Plus recommended)
- MicroSD card (32GB+), power supply, case

```bash
# Docker Pi setup (recommended)
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/wedding-jukebox/main/raspberry-pi-docker-setup.sh | bash

# Then setup dual WiFi (hotspot + internet)
./setup-dual-wifi.sh

# Or traditional Pi setup
curl -fsSL https://raw.githubusercontent.com/JaredLThompson/wedding-jukebox/main/raspberry-pi-complete-setup.sh | bash
```

**How dual WiFi works:**
- **Built-in WiFi (wlan0)**: Connects to venue WiFi for internet
- **USB WiFi (wlan1)**: Creates "Wedding-Jukebox" hotspot for guests

### Option 3: Local Development
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

## 🎯 **Perfect for Weddings**

### **Guest Experience:**
1. **Connect to "Wedding-Jukebox" WiFi** (no password needed)
2. **Open any website** → automatically redirected to jukebox
3. **Request favorite songs** instantly
4. **See songs added to queue** in real-time

### **DJ Experience:**
- **Full control interface** at main URL
- **YouTube Music search** works perfectly (via venue WiFi)
- **Queue management** (reorder, skip, suppress songs)
- **Audio plays through DJ device** → mixer → speakers

### **Setup Cost:**
- **Raspberry Pi 4 (4GB)**: $75
- **USB WiFi Adapter**: $25 (TP-Link AC600 T2U Plus)
- **MicroSD + Power + Case**: $50
- **Total**: ~$150 (vs $500+ DJ equipment rental)

## 🌐 **Deployment Options**

| Method | Best For | Difficulty | Hardware Needed | Cost |
|--------|----------|------------|-----------------|------|
| **Docker** | Development, Cloud | ⭐ Easy | Computer | Free |
| **Pi Hotspot** | Weddings, Events | ⭐⭐ Medium | Pi 4 + USB WiFi | ~$150 |
| **Local** | Testing, Small Groups | ⭐ Easy | Computer | Free |

**Pi Hardware Checklist:**
- ✅ Raspberry Pi 4 (4GB+ RAM)
- ✅ **USB WiFi Adapter** (essential for dual WiFi)
- ✅ MicroSD card (32GB+ Class 10)
- ✅ Power supply + case with cooling

## 🎵 **How It Works**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Raspberry Pi  │    │   DJ Device      │    │  Sound System  │
│ (Dual WiFi Hub) │◄──►│  (Browser+Audio) │───►│   (Speakers)    │
│                 │    │                  │    │                 │
│ • Built-in WiFi │    │ • Plays music    │    │ • Amplifies     │
│   → Venue net   │    │ • DJ controls    │    │ • Party sound!  │
│ • USB WiFi      │    │ • Real-time UI   │    │                 │
│   → Guest hotspot│    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

**Why USB WiFi Adapter is Essential:**
- **Single WiFi Pi**: Can only connect to venue OR create hotspot (not both)
- **Dual WiFi Pi**: Built-in connects to venue, USB creates guest hotspot
- **Perfect wedding solution**: Guests get easy access + YouTube Music works

## 🛒 **Pi Hardware Shopping List**

**Essential Components:**
- **Raspberry Pi 4 (4GB)** - $75 ([Buy on Amazon](https://amazon.com/dp/B07TC2BK1X))
- **USB WiFi Adapter** - $25 ([TP-Link AC600 T2U Plus](https://amazon.com/dp/B07P5PRK7J))
- **MicroSD Card (32GB+)** - $15 ([SanDisk Ultra](https://amazon.com/dp/B073K14CVB))
- **Power Supply** - $15 ([Official Pi Power Supply](https://amazon.com/dp/B07TSDJSQH))
- **Case with Cooling** - $20 ([Argon ONE V2](https://amazon.com/dp/B08MJ3CSW7))

**Total: ~$150** 💰

**Why These Specific Items:**
- **Pi 4 (4GB)**: Handles Docker + dual WiFi smoothly
- **TP-Link AC600**: Proven compatibility with Pi dual WiFi setup
- **Class 10 SD**: Fast enough for real-time music streaming
- **Official power**: Prevents random shutdowns during events
- **Cooling case**: Keeps Pi stable during long wedding receptions

## 🛠️ **Tech Stack**

- **Backend**: Node.js, Express.js, Socket.IO
- **Frontend**: Vanilla JavaScript, HTML5, Tailwind CSS
- **Real-time**: WebSocket connections via Socket.IO
- **Music**: YouTube Music API integration
- **Deployment**: Docker, Raspberry Pi, GitHub Container Registry
- **Networking**: Dual WiFi, Captive Portal, Hotspot

## 📋 **Complete Setup Guide**

For detailed deployment instructions, see:
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide
- **[raspberry-pi-setup.md](raspberry-pi-setup.md)** - Detailed Pi instructions

## 🎉 **Success Stories**

Perfect for:
- **Weddings** - Guest interaction + professional DJ control
- **Parties** - Collaborative music selection
- **Events** - Easy setup, reliable performance
- **Venues** - No WiFi password sharing needed

## 🤝 **Contributing**

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎊 **Ready for Your Wedding?**

Deploy in minutes and create unforgettable musical memories! 

**Questions?** Open an issue or check the documentation.

**Happy Wedding!** 💒🎵

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