const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WEDDING_PLAYLIST = require('./wedding-playlist');
const BRIDE_PLAYLIST = require('./bride-playlist');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage for demo (replace with database in production)
let currentQueue = [];
let parkedQueue = []; // New: parked user submissions
let currentlyPlaying = null;
let connectedUsers = new Set();
let fallbackPlaylistIndex = 0;
let currentFallbackIndex = -1; // Track which song is currently playing from fallback
let fallbackMode = false;
let activePlaylist = 'bride'; // 'wedding' or 'bride'
let queueParked = false; // New: park user submissions instead of blocking them
let suppressedSongs = new Set(); // New: track suppressed playlist songs by index

// Play history tracking
const PLAY_HISTORY_FILE = 'wedding-play-history.json';
let playHistory = [];

// Load existing play history if it exists
function loadPlayHistory() {
  try {
    if (fs.existsSync(PLAY_HISTORY_FILE)) {
      const data = fs.readFileSync(PLAY_HISTORY_FILE, 'utf8');
      playHistory = JSON.parse(data);
      console.log(`Loaded ${playHistory.length} songs from play history`);
    }
  } catch (error) {
    console.error('Error loading play history:', error);
    playHistory = [];
  }
}

// Save play history to file
function savePlayHistory() {
  try {
    fs.writeFileSync(PLAY_HISTORY_FILE, JSON.stringify(playHistory, null, 2));
  } catch (error) {
    console.error('Error saving play history:', error);
  }
}

// Log a song to play history
function logSongPlayed(song, action = 'played') {
  const historyEntry = {
    timestamp: new Date().toISOString(),
    action: action, // 'played', 'added', 'skipped'
    song: {
      title: song.title,
      artist: song.artist,
      duration: song.duration,
      addedBy: song.addedBy,
      source: song.source || 'user',
      playlist: song.playlist || activePlaylist,
      type: song.type
    }
  };
  
  playHistory.push(historyEntry);
  savePlayHistory();
  
  // Emit to connected clients for real-time updates
  io.emit('playHistoryUpdate', {
    totalSongs: playHistory.length,
    lastSong: historyEntry
  });
}

// Initialize play history
loadPlayHistory();

app.get('/captive-portal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'captive-portal.html'));
});

// Captive portal detection - redirect common captive portal requests
app.get('/generate_204', (req, res) => {
  res.redirect('/captive-portal');
});

app.get('/hotspot-detect.html', (req, res) => {
  res.redirect('/captive-portal');
});

app.get('/library/test/success.html', (req, res) => {
  res.redirect('/captive-portal');
});

app.get('/connecttest.txt', (req, res) => {
  res.redirect('/captive-portal');
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/user', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

app.get('/qr', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

app.get('/api/network-info', (req, res) => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  
  let networkIP = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === 'IPv4' && !interface.internal) {
        networkIP = interface.address;
        break;
      }
    }
    if (networkIP !== 'localhost') break;
  }
  
  res.json({
    networkIP: networkIP,
    port: process.env.PORT || 3000
  });
});

app.get('/api/queue', (req, res) => {
  res.json({
    queue: currentQueue,
    currentlyPlaying: currentlyPlaying,
    connectedUsers: connectedUsers.size
  });
});

// YouTube Music search endpoint
app.get('/api/search', async (req, res) => {
  const { q, limit = 10 } = req.query;
  
  if (!q) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  try {
    const results = await searchYouTubeMusic(q, limit);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search YouTube Music' });
  }
});

app.post('/api/queue/add', (req, res) => {
  const { song, addedBy } = req.body;
  
  if (!song || !song.title || !song.artist) {
    return res.status(400).json({ error: 'Invalid song data' });
  }

  const queueItem = {
    id: song.id || Date.now().toString(),
    ...song,
    addedBy: addedBy || 'Anonymous',
    addedAt: new Date().toISOString()
  };

  // If queue is parked, add to parked queue instead of main queue
  if (queueParked && song.type !== 'mic-break') {
    // Check for duplicates in both queues
    const isDuplicateInMain = currentQueue.some(item => 
      (song.videoId && item.videoId === song.videoId) ||
      (item.title.toLowerCase() === song.title.toLowerCase() && 
       item.artist.toLowerCase() === song.artist.toLowerCase())
    );
    
    const isDuplicateInParked = parkedQueue.some(item => 
      (song.videoId && item.videoId === song.videoId) ||
      (item.title.toLowerCase() === song.title.toLowerCase() && 
       item.artist.toLowerCase() === song.artist.toLowerCase())
    );

    const isCurrentlyPlaying = currentlyPlaying && (
      (song.videoId && currentlyPlaying.videoId === song.videoId) ||
      (currentlyPlaying.title.toLowerCase() === song.title.toLowerCase() && 
       currentlyPlaying.artist.toLowerCase() === song.artist.toLowerCase())
    );

    if (isDuplicateInMain || isDuplicateInParked) {
      return res.status(409).json({ 
        error: 'Song already queued',
        message: `"${song.title}" by ${song.artist} is already in the queue!`
      });
    }

    if (isCurrentlyPlaying) {
      return res.status(409).json({ 
        error: 'Song currently playing',
        message: `"${song.title}" by ${song.artist} is currently playing!`
      });
    }

    parkedQueue.push(queueItem);
    
    // Broadcast parked queue update
    io.emit('parkedQueueUpdated', {
      parkedQueue: parkedQueue,
      parkedCount: parkedQueue.length
    });

    return res.json({ 
      success: true, 
      queueItem,
      parked: true,
      message: `"${song.title}" added to queue! (${parkedQueue.length} songs waiting)`
    });
  }

  // Check for duplicates by videoId (most reliable) or title+artist
  const isDuplicate = currentQueue.some(queueItem => {
    if (song.videoId && queueItem.videoId) {
      return queueItem.videoId === song.videoId;
    }
    // Fallback to title+artist comparison (case insensitive)
    return queueItem.title.toLowerCase() === song.title.toLowerCase() && 
           queueItem.artist.toLowerCase() === song.artist.toLowerCase();
  });

  // Also check if it's currently playing
  const isCurrentlyPlaying = currentlyPlaying && (
    (song.videoId && currentlyPlaying.videoId === song.videoId) ||
    (currentlyPlaying.title.toLowerCase() === song.title.toLowerCase() && 
     currentlyPlaying.artist.toLowerCase() === song.artist.toLowerCase())
  );

  if (isDuplicate) {
    return res.status(409).json({ 
      error: 'Song already in queue',
      message: `"${song.title}" by ${song.artist} is already in the queue!`
    });
  }

  if (isCurrentlyPlaying) {
    return res.status(409).json({ 
      error: 'Song currently playing',
      message: `"${song.title}" by ${song.artist} is currently playing!`
    });
  }

  currentQueue.push(queueItem);
  
  // Broadcast only queue update (no currentlyPlaying to avoid restart)
  io.emit('queueUpdated', {
    queue: currentQueue
  });

  res.json({ success: true, queueItem });
});

app.post('/api/queue/reorder', (req, res) => {
  const { oldIndex, newIndex } = req.body;
  
  if (oldIndex < 0 || oldIndex >= currentQueue.length || 
      newIndex < 0 || newIndex >= currentQueue.length) {
    return res.status(400).json({ error: 'Invalid indices' });
  }

  // Move the item from oldIndex to newIndex
  const [movedItem] = currentQueue.splice(oldIndex, 1);
  currentQueue.splice(newIndex, 0, movedItem);
  
  // Broadcast updated queue
  io.emit('queueUpdated', {
    queue: currentQueue
  });

  res.json({ success: true, queue: currentQueue });
});

app.post('/api/queue/clear', (req, res) => {
  currentQueue = [];
  
  // Broadcast updated queue
  io.emit('queueUpdated', {
    queue: currentQueue
  });

  res.json({ success: true });
});

app.post('/api/queue/park', (req, res) => {
  queueParked = true;
  
  // Broadcast park state to all clients
  io.emit('queueParkChanged', {
    parked: true,
    message: 'New songs will be parked - playlist will play through',
    parkedCount: parkedQueue.length
  });

  res.json({ 
    success: true, 
    message: 'Queue parked - new submissions will be held until unparked',
    parked: true,
    parkedCount: parkedQueue.length
  });
});

app.post('/api/queue/park-current', (req, res) => {
  // Move all current queue items to parked queue
  const movedCount = currentQueue.length;
  parkedQueue.push(...currentQueue);
  currentQueue = [];
  queueParked = true;
  
  // Broadcast updates
  io.emit('queueParkChanged', {
    parked: true,
    message: `${movedCount} songs moved to parking - playlist will play through`,
    parkedCount: parkedQueue.length
  });
  
  io.emit('queueUpdated', {
    queue: currentQueue
  });
  
  io.emit('parkedQueueUpdated', {
    parkedQueue: parkedQueue,
    parkedCount: parkedQueue.length
  });

  res.json({ 
    success: true, 
    message: `${movedCount} songs parked - playlist will now play through`,
    parked: true,
    parkedCount: parkedQueue.length,
    movedCount: movedCount
  });
});

app.post('/api/queue/unpark', (req, res) => {
  // Move all parked songs to the main queue
  currentQueue.push(...parkedQueue);
  const unparkedCount = parkedQueue.length;
  parkedQueue = [];
  queueParked = false;
  
  // Broadcast unpark state and updated queues
  io.emit('queueParkChanged', {
    parked: false,
    message: `${unparkedCount} songs moved to active queue!`
  });
  
  io.emit('queueUpdated', {
    queue: currentQueue
  });
  
  io.emit('parkedQueueUpdated', {
    parkedQueue: [],
    parkedCount: 0
  });

  res.json({ 
    success: true, 
    message: `Queue unparked - ${unparkedCount} songs moved to active queue`,
    parked: false,
    unparkedCount: unparkedCount
  });
});

app.get('/api/queue/status', (req, res) => {
  res.json({
    parked: queueParked,
    queueLength: currentQueue.length,
    parkedLength: parkedQueue.length,
    currentlyPlaying: currentlyPlaying,
    fallbackMode: fallbackMode
  });
});

app.post('/api/queue/next', async (req, res) => {
  // Log the previous song as played if there was one
  if (currentlyPlaying) {
    logSongPlayed(currentlyPlaying, 'played');
  }

  if (currentQueue.length > 0) {
    // Normal queue operation
    currentlyPlaying = currentQueue.shift();
    fallbackMode = false;
    
    // Send the new song to play
    io.emit('nowPlaying', currentlyPlaying);
    // Send updated queue (without currentlyPlaying to avoid restart)
    io.emit('queueUpdated', {
      queue: currentQueue
    });
  } else {
    // Queue is empty - activate fallback playlist
    try {
      const fallbackSong = await getNextFallbackSong();
      if (fallbackSong) {
        currentlyPlaying = fallbackSong;
        fallbackMode = true;
        
        io.emit('nowPlaying', currentlyPlaying);
        io.emit('queueUpdated', {
          queue: currentQueue
        });
        io.emit('fallbackMode', { active: true, song: currentlyPlaying });
      } else {
        // No fallback song available
        currentlyPlaying = null;
        fallbackMode = false;
        io.emit('nowPlaying', null);
        io.emit('queueUpdated', {
          queue: currentQueue
        });
      }
    } catch (error) {
      console.error('Error getting fallback song:', error);
      currentlyPlaying = null;
      fallbackMode = false;
      io.emit('nowPlaying', null);
    }
  }
  
  res.json({ currentlyPlaying, queue: currentQueue, fallbackMode });
});

app.delete('/api/queue/:id', (req, res) => {
  const { id } = req.params;
  currentQueue = currentQueue.filter(item => item.id !== id);
  
  io.emit('queueUpdated', {
    queue: currentQueue
  });
  
  res.json({ success: true });
});

app.post('/api/playlist/reset', (req, res) => {
  fallbackPlaylistIndex = 0;
  currentFallbackIndex = -1; // Reset current playing index too
  
  io.emit('playlistReset', { 
    message: 'Wedding playlist reset to beginning',
    index: fallbackPlaylistIndex 
  });
  
  res.json({ 
    success: true, 
    message: 'Wedding playlist reset to beginning',
    index: fallbackPlaylistIndex 
  });
});

app.get('/api/playlist/status', (req, res) => {
  const playlist = getCurrentPlaylist();
  // Use currentFallbackIndex for the currently playing song, fallbackPlaylistIndex for next song
  const displayIndex = currentFallbackIndex >= 0 ? currentFallbackIndex : fallbackPlaylistIndex;
  const nextIndex = (displayIndex + 1) % playlist.length;
  
  res.json({
    currentIndex: displayIndex,
    totalSongs: playlist.length,
    currentSong: displayIndex < playlist.length ? playlist[displayIndex] : null,
    nextSong: playlist[nextIndex] || null,
    fallbackMode: fallbackMode,
    activePlaylist: activePlaylist,
    playlistName: getPlaylistName()
  });
});

app.get('/api/playlist/full', (req, res) => {
  const playlist = getCurrentPlaylist();
  res.json({
    playlist: playlist,
    currentIndex: currentFallbackIndex >= 0 ? currentFallbackIndex : fallbackPlaylistIndex,
    totalSongs: playlist.length,
    fallbackMode: fallbackMode,
    activePlaylist: activePlaylist,
    playlistName: getPlaylistName()
  });
});

app.post('/api/playlist/jump', (req, res) => {
  const { index } = req.body;
  const playlist = getCurrentPlaylist();
  
  if (index < 0 || index >= playlist.length) {
    return res.status(400).json({ error: 'Invalid playlist index' });
  }
  
  fallbackPlaylistIndex = index;
  currentFallbackIndex = index; // Set current playing index to the jumped position
  
  io.emit('playlistJump', { 
    message: `Jumped to song ${index + 1}`,
    index: fallbackPlaylistIndex 
  });
  
  res.json({ 
    success: true, 
    message: `Jumped to song ${index + 1}`,
    index: fallbackPlaylistIndex 
  });
});

app.post('/api/playlist/switch', (req, res) => {
  const { playlist } = req.body;
  
  if (playlist !== 'wedding' && playlist !== 'bride') {
    return res.status(400).json({ error: 'Invalid playlist. Must be "wedding" or "bride"' });
  }
  
  activePlaylist = playlist;
  fallbackPlaylistIndex = 0;
  currentFallbackIndex = -1;
  // Clear suppressed songs when switching playlists
  suppressedSongs.clear();
  
  const playlistName = getPlaylistName();
  
  io.emit('playlistSwitch', { 
    message: `Switched to ${playlistName}`,
    playlist: activePlaylist,
    playlistName: playlistName
  });
  
  res.json({ 
    success: true, 
    message: `Switched to ${playlistName}`,
    playlist: activePlaylist,
    playlistName: playlistName
  });
});

app.post('/api/playlist/suppress', (req, res) => {
  const { index } = req.body;
  const playlist = getCurrentPlaylist();
  
  if (index < 0 || index >= playlist.length) {
    return res.status(400).json({ error: 'Invalid playlist index' });
  }
  
  suppressedSongs.add(index);
  const songName = playlist[index].search.split(' ').slice(0, 2).join(' ');
  
  io.emit('playlistSuppressed', {
    index: index,
    message: `"${songName}" suppressed - will be skipped`,
    suppressedCount: suppressedSongs.size
  });
  
  res.json({ 
    success: true, 
    message: `Song ${index + 1} suppressed`,
    suppressedIndex: index,
    suppressedCount: suppressedSongs.size
  });
});

app.post('/api/playlist/unsuppress', (req, res) => {
  const { index } = req.body;
  const playlist = getCurrentPlaylist();
  
  if (index < 0 || index >= playlist.length) {
    return res.status(400).json({ error: 'Invalid playlist index' });
  }
  
  suppressedSongs.delete(index);
  const songName = playlist[index].search.split(' ').slice(0, 2).join(' ');
  
  io.emit('playlistUnsuppressed', {
    index: index,
    message: `"${songName}" restored - will play normally`,
    suppressedCount: suppressedSongs.size
  });
  
  res.json({ 
    success: true, 
    message: `Song ${index + 1} restored`,
    unsuppressedIndex: index,
    suppressedCount: suppressedSongs.size
  });
});

app.get('/api/playlist/suppressed', (req, res) => {
  res.json({
    suppressedSongs: Array.from(suppressedSongs),
    suppressedCount: suppressedSongs.size
  });
});

app.get('/api/history', (req, res) => {
  res.json({
    totalSongs: playHistory.length,
    history: playHistory,
    summary: {
      userSubmissions: playHistory.filter(entry => entry.song.source === 'youtube' || entry.song.source === 'user').length,
      fallbackSongs: playHistory.filter(entry => entry.song.source === 'fallback').length,
      uniqueUsers: [...new Set(playHistory.map(entry => entry.song.addedBy))].length
    }
  });
});

app.get('/api/history/export', (req, res) => {
  const exportData = {
    weddingDate: new Date().toISOString().split('T')[0],
    totalSongs: playHistory.length,
    summary: {
      userSubmissions: playHistory.filter(entry => entry.song.source === 'youtube' || entry.song.source === 'user').length,
      fallbackSongs: playHistory.filter(entry => entry.song.source === 'fallback').length,
      uniqueUsers: [...new Set(playHistory.map(entry => entry.song.addedBy))].length
    },
    playHistory: playHistory
  };
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="wedding-playlist-history.json"');
  res.json(exportData);
});

app.post('/api/history/clear', (req, res) => {
  playHistory = [];
  savePlayHistory();
  
  io.emit('playHistoryUpdate', {
    totalSongs: 0,
    lastSong: null
  });
  
  res.json({ 
    success: true, 
    message: 'Play history cleared' 
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  connectedUsers.add(socket.id);
  
  // Send current state to new user
  socket.emit('queueUpdated', {
    queue: currentQueue
  });
  
  // Send currently playing song separately (if there is one)
  if (currentlyPlaying) {
    socket.emit('nowPlaying', currentlyPlaying);
  }
  
  socket.emit('userCount', connectedUsers.size);
  socket.broadcast.emit('userCount', connectedUsers.size);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    connectedUsers.delete(socket.id);
    socket.broadcast.emit('userCount', connectedUsers.size);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Virtual Jukebox server running on port ${PORT}`);
});

// Fallback playlist functionality
function getCurrentPlaylist() {
  return activePlaylist === 'wedding' ? WEDDING_PLAYLIST : BRIDE_PLAYLIST;
}

function getPlaylistName() {
  return activePlaylist === 'wedding' ? 'Wedding Party Playlist' : 'Bride\'s Elegant Playlist';
}

async function getNextFallbackSong() {
  const playlist = getCurrentPlaylist();
  if (playlist.length === 0) return null;
  
  // Find next non-suppressed song
  let attempts = 0;
  const maxAttempts = playlist.length; // Prevent infinite loop
  
  while (attempts < maxAttempts) {
    // Check if current song is suppressed
    if (!suppressedSongs.has(fallbackPlaylistIndex)) {
      // Get the current song from the playlist
      const playlistItem = playlist[fallbackPlaylistIndex];
      
      try {
        // Search for the song
        const searchResults = await searchYouTubeMusic(playlistItem.search, 1);
        if (searchResults.results && searchResults.results.length > 0) {
          const song = searchResults.results[0];
          
          const fallbackSong = {
            id: `fallback-${Date.now()}`,
            videoId: song.videoId,
            title: song.title,
            artist: song.artist,
            duration: song.duration_text,
            albumArt: song.thumbnail,
            album: song.album,
            addedBy: activePlaylist === 'wedding' ? '🎵 Wedding DJ' : '✨ Bride\'s Collection',
            addedAt: new Date().toISOString(),
            source: 'fallback',
            type: playlistItem.type,
            playlist: activePlaylist,
            playlistIndex: fallbackPlaylistIndex // Track which playlist song this is
          };
          
          // Set current playing index to the song we're about to play
          currentFallbackIndex = fallbackPlaylistIndex;
          // Increment index for next time
          fallbackPlaylistIndex = (fallbackPlaylistIndex + 1) % playlist.length;
          
          return fallbackSong;
        }
      } catch (error) {
        console.error('Error searching for fallback song:', error);
      }
    }
    
    // Move to next song (either because current was suppressed or failed to load)
    fallbackPlaylistIndex = (fallbackPlaylistIndex + 1) % playlist.length;
    attempts++;
  }
  
  // If all songs are suppressed, return null
  return null;
}

// YouTube Music integration functions
async function searchYouTubeMusic(query, limit = 10) {
  return new Promise((resolve, reject) => {
    // For Docker environments, use direct python call with proper environment
    const isDocker = process.env.NODE_ENV === 'production' && fs.existsSync('/app/venv');
    
    let python;
    if (isDocker) {
      // Docker environment - use venv python directly
      python = spawn('/app/venv/bin/python', [
        'youtube_music_service.py', 
        'search', 
        '--query', query, 
        '--limit', limit.toString()
      ], {
        cwd: '/app',
        env: { 
          ...process.env,
          PATH: '/app/venv/bin:' + process.env.PATH,
          PYTHONPATH: '/app'
        }
      });
    } else {
      // Local development - use bash with venv activation
      python = spawn('bash', [
        '-c',
        `source venv/bin/activate && python youtube_music_service.py search --query "${query}" --limit ${limit}`
      ], {
        cwd: __dirname
      });
    }

    let data = '';
    let error = '';

    python.stdout.on('data', (chunk) => {
      data += chunk.toString();
    });

    python.stderr.on('data', (chunk) => {
      error += chunk.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error('Python script error:', error);
        reject(new Error(`Python script failed with code ${code}: ${error}`));
        return;
      }

      try {
        const result = JSON.parse(data);
        resolve(result);
      } catch (parseError) {
        console.error('Failed to parse Python response:', parseError);
        reject(parseError);
      }
    });

    python.on('error', (err) => {
      console.error('Failed to start Python process:', err);
      reject(err);
    });
  });
}