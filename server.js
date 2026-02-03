const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const https = require('https');
const httpClient = require('http');
const WEDDING_PLAYLIST = require('./wedding-playlist');
const BRIDE_PLAYLIST = require('./bride-playlist');
const SpotifyService = require('./spotify_service');
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

// Audio output settings
const AUDIO_OUTPUT_FILE = path.join(__dirname, 'audio-output.json');
let audioOutputDevice = null;

// Initialize Spotify service
const spotifyService = new SpotifyService();

// Play history tracking
const PLAY_HISTORY_FILE = 'wedding-play-history.json';
const AUDIO_CACHE_DIR = path.join(__dirname, 'audio-cache');
let playHistory = [];

function loadCacheManifest() {
  const manifestPath = path.join(AUDIO_CACHE_DIR, 'cache-manifest.json');
  if (!fs.existsSync(manifestPath)) return {};
  try {
    const data = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

function saveCacheManifest(manifest) {
  const manifestPath = path.join(AUDIO_CACHE_DIR, 'cache-manifest.json');
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  } catch (error) {
    console.error('Failed to save cache manifest:', error.message);
  }
}

function loadAudioOutput() {
  if (!fs.existsSync(AUDIO_OUTPUT_FILE)) return null;
  try {
    const data = fs.readFileSync(AUDIO_OUTPUT_FILE, 'utf8');
    const parsed = JSON.parse(data);
    if (parsed && parsed.device && parsed.device !== 'default') {
      return parsed.device;
    }
  } catch (error) {
    console.error('Failed to load audio output settings:', error.message);
  }
  return null;
}

function saveAudioOutput(device) {
  try {
    const payload = {
      device: device && device !== 'default' ? device : null,
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(AUDIO_OUTPUT_FILE, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('Failed to save audio output settings:', error.message);
  }
}

function listAudioOutputs() {
  return new Promise((resolve) => {
    execFile('aplay', ['-L'], (error, stdout) => {
      if (error || !stdout) {
        return resolve([
          { id: 'default', name: 'Default', description: 'System default output' }
        ]);
      }

      const lines = stdout.split('\n');
      const outputs = [];
      let current = null;

      for (const line of lines) {
        if (!line.trim()) continue;
        if (!line.startsWith(' ')) {
          if (current) outputs.push(current);
          current = { id: line.trim(), name: line.trim(), description: '' };
        } else if (current && !current.description) {
          current.description = line.trim();
        }
      }
      if (current) outputs.push(current);

      const normalized = outputs.filter(item => item.id !== 'null');
      normalized.unshift({ id: 'default', name: 'Default', description: 'System default output' });
      resolve(normalized);
    });
  });
}

function fetchYouTubeOEmbed(youtubeId) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return resolve(null);
        }
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Load persisted audio output selection
audioOutputDevice = loadAudioOutput();

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

app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/api/audio/output', async (req, res) => {
  const outputs = await listAudioOutputs();
  res.json({
    device: audioOutputDevice || 'default',
    outputs
  });
});

app.post('/api/audio/output', (req, res) => {
  const device = typeof req.body?.device === 'string' ? req.body.device.trim() : '';
  audioOutputDevice = device && device !== 'default' ? device : null;
  saveAudioOutput(audioOutputDevice);
  io.emit('audioOutputCommand', { device: audioOutputDevice || 'default' });
  res.json({ success: true, device: audioOutputDevice || 'default' });
});

app.get('/venue', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'venue.html'));
});

app.get('/cache', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cache.html'));
});

app.get('/kiosk', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kiosk.html'));
});

app.get('/qr', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

function resolveNmcliPath() {
  if (process.env.NMCLI_PATH) return process.env.NMCLI_PATH;
  const candidates = ['/usr/bin/nmcli', '/usr/sbin/nmcli', '/bin/nmcli', '/sbin/nmcli'];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'nmcli';
}

function runNmcli(args) {
  const nmcliPath = resolveNmcliPath();
  const env = {
    ...process.env,
    PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
  };

  return new Promise((resolve, reject) => {
    execFile(nmcliPath, args, { timeout: 15000, env }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

function getWifiApiBase() {
  return process.env.WIFI_API_URL || '';
}

function proxyWifiRequest(req, res) {
  const baseUrl = getWifiApiBase();
  if (!baseUrl) {
    return res.status(500).json({ error: 'WiFi API unavailable.', details: 'WIFI_API_URL not configured.' });
  }

  let targetUrl;
  try {
    targetUrl = new URL(req.originalUrl, baseUrl);
  } catch (error) {
    return res.status(500).json({ error: 'WiFi API proxy error.', details: error.message });
  }

  const isHttps = targetUrl.protocol === 'https:';
  const client = isHttps ? https : httpClient;
  const body = req.method === 'GET' ? null : JSON.stringify(req.body || {});

  const proxyReq = client.request(
    targetUrl,
    {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body ? Buffer.byteLength(body) : 0
      },
      timeout: 15000
    },
    (proxyRes) => {
      let data = '';
      proxyRes.on('data', (chunk) => {
        data += chunk;
      });
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode || 500);
        res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');
        res.send(data);
      });
    }
  );

  proxyReq.on('error', (error) => {
    res.status(500).json({ error: 'WiFi API proxy error.', details: error.message });
  });

  if (body) {
    proxyReq.write(body);
  }
  proxyReq.end();
}

function splitNmcliLine(line) {
  const fields = [];
  let current = '';
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === ':') {
      fields.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}

app.get('/api/wifi/scan', async (req, res) => {
  const iface = req.query.iface || 'wlan0';
  if (!/^(wlan|wlx)[\w-]+$/.test(iface)) {
    return res.status(400).json({ error: 'Invalid interface name.' });
  }

  try {
    const { stdout } = await runNmcli([
      '-t',
      '-f',
      'SSID,SIGNAL,SECURITY,IN-USE,DEVICE,FREQ,CHAN,BAND',
      'dev',
      'wifi',
      'list',
      'ifname',
      iface
    ]);

    const networksBySsid = new Map();
    stdout.trim().split('\n').filter(Boolean).forEach((line) => {
      const [ssidRaw, signalRaw, securityRaw, inUseRaw, deviceRaw, freqRaw, chanRaw, bandRaw] = splitNmcliLine(line);
      if (deviceRaw && deviceRaw !== iface) return;
      const ssid = ssidRaw || '';
      if (!ssid) return;

      const signal = Number(signalRaw) || 0;
      const security = (securityRaw || '').trim();
      const inUse = (inUseRaw || '').trim() === '*';
      const freq = Number(freqRaw) || null;
      const channel = Number(chanRaw) || null;
      const band = (bandRaw || '').trim();

      const existing = networksBySsid.get(ssid);
      if (!existing) {
        networksBySsid.set(ssid, { ssid, signal, security, inUse, freq, channel, band });
        return;
      }

      existing.signal = Math.max(existing.signal, signal);
      if (security && !existing.security.includes(security)) {
        existing.security = existing.security
          ? `${existing.security}, ${security}`
          : security;
      }
      existing.inUse = existing.inUse || inUse;
      existing.freq = existing.freq || freq;
      existing.channel = existing.channel || channel;
      existing.band = existing.band || band;
    });

    const networks = Array.from(networksBySsid.values()).sort((a, b) => b.signal - a.signal);
    return res.json({ iface, networks });
  } catch (error) {
    if ((error.code === 'ENOENT' || (error.message || '').includes('ENOENT')) && getWifiApiBase()) {
      return proxyWifiRequest(req, res);
    }
    return res.status(500).json({
      error: 'Failed to scan WiFi networks.',
      details: error.stderr || error.message
    });
  }
});

app.get('/api/wifi/status', async (req, res) => {
  const iface = req.query.iface || 'wlan0';
  if (!/^(wlan|wlx)[\w-]+$/.test(iface)) {
    return res.status(400).json({ error: 'Invalid interface name.' });
  }

  try {
    const { stdout } = await runNmcli([
      '-t',
      '-f',
      'GENERAL.STATE,GENERAL.CONNECTION,IP4.ADDRESS,IP4.GATEWAY,IP4.DNS',
      'dev',
      'show',
      iface
    ]);

    const info = {};
    stdout.trim().split('\n').filter(Boolean).forEach((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) return;
      const key = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 1);
      if (!key) return;

      const baseKey = key.replace(/\[\d+\]$/, '');
      if (info[baseKey]) {
        if (Array.isArray(info[baseKey])) {
          info[baseKey].push(value);
        } else {
          info[baseKey] = [info[baseKey], value];
        }
      } else {
        info[baseKey] = value;
      }
    });

    const wifiList = await runNmcli([
      '-t',
      '-f',
      'ACTIVE,SSID,DEVICE',
      'dev',
      'wifi'
    ]);
    let activeSsid = '';
    wifiList.stdout.trim().split('\n').filter(Boolean).forEach((line) => {
      const [active, ssid, device] = splitNmcliLine(line);
      if (device === iface && active === 'yes') {
        activeSsid = ssid;
      }
    });

    const state = info['GENERAL.STATE'] || '';
    const connected = state.startsWith('100') || state.toLowerCase().includes('connected');

    return res.json({
      iface,
      connected,
      ssid: activeSsid,
      connection: info['GENERAL.CONNECTION'] || '',
      ip: Array.isArray(info['IP4.ADDRESS']) ? info['IP4.ADDRESS'][0] : (info['IP4.ADDRESS'] || ''),
      gateway: info['IP4.GATEWAY'] || '',
      dns: info['IP4.DNS'] || []
    });
  } catch (error) {
    if ((error.code === 'ENOENT' || (error.message || '').includes('ENOENT')) && getWifiApiBase()) {
      return proxyWifiRequest(req, res);
    }
    return res.status(500).json({
      error: 'Failed to load WiFi status.',
      details: error.stderr || error.message
    });
  }
});

app.post('/api/wifi/connect', async (req, res) => {
  const { iface = 'wlan0', ssid, password } = req.body || {};
  if (!/^(wlan|wlx)[\w-]+$/.test(iface)) {
    return res.status(400).json({ error: 'Invalid interface name.' });
  }
  if (!ssid || typeof ssid !== 'string') {
    return res.status(400).json({ error: 'SSID is required.' });
  }

  const args = ['dev', 'wifi', 'connect', ssid, 'ifname', iface];
  if (password && typeof password === 'string') {
    args.push('password', password);
  }

  try {
    const { stdout } = await runNmcli(args);
    return res.json({ ok: true, output: stdout.trim() });
  } catch (error) {
    if ((error.code === 'ENOENT' || (error.message || '').includes('ENOENT')) && getWifiApiBase()) {
      return proxyWifiRequest(req, res);
    }
    return res.status(500).json({
      error: 'Failed to connect to WiFi network.',
      details: error.stderr || error.message
    });
  }
});

app.get('/api/network-info', (req, res) => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  
  let networkIP = 'localhost';
  
  // Check if we're running in Docker and have a host IP provided
  if (process.env.HOST_IP) {
    networkIP = process.env.HOST_IP;
  } else {
    // Fallback to detecting network interfaces
    // Skip Docker internal networks (172.17.x.x, 172.18.x.x, etc.)
    for (const name of Object.keys(interfaces)) {
      for (const interface of interfaces[name]) {
        if (interface.family === 'IPv4' && !interface.internal) {
          // Skip Docker internal networks
          if (!interface.address.startsWith('172.17.') && 
              !interface.address.startsWith('172.18.') &&
              !interface.address.startsWith('172.19.') &&
              !interface.address.startsWith('172.20.')) {
            networkIP = interface.address;
            break;
          }
        }
      }
      if (networkIP !== 'localhost') break;
    }
  }
  
  res.json({
    networkIP: networkIP,
    port: process.env.PORT || 3000
  });
});

app.get('/api/cache', (req, res) => {
  try {
    if (!fs.existsSync(AUDIO_CACHE_DIR)) {
      return res.json({ files: [] });
    }

    let manifest = loadCacheManifest();

    const files = fs.readdirSync(AUDIO_CACHE_DIR)
      .filter(name => name.endsWith('.mp3'))
      .map(name => {
        const fullPath = path.join(AUDIO_CACHE_DIR, name);
        const stats = fs.statSync(fullPath);
        const youtubeId = name.replace('.mp3', '');
        const meta = manifest[youtubeId] || Object.values(manifest).find(entry => entry.filename === name) || null;
        return {
          name,
          sizeBytes: stats.size,
          modified: stats.mtime.toISOString(),
          title: meta?.title || null,
          artist: meta?.artist || null,
          youtubeId: meta?.youtubeId || youtubeId
        };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));

    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read cache' });
  }
});

app.get('/api/cache/file/:name', (req, res) => {
  const name = req.params.name;
  if (!name || name.includes('..') || name.includes('/')) {
    return res.status(400).send('Invalid file name');
  }

  const fullPath = path.join(AUDIO_CACHE_DIR, name);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).send('File not found');
  }

  if (req.query.download === '1') {
    const manifest = loadCacheManifest();
    const youtubeId = name.replace('.mp3', '');
    const meta = manifest[youtubeId] || Object.values(manifest).find(entry => entry.filename === name) || null;
    const safe = (value, fallback) => {
      const text = (value || fallback || '').toString().trim();
      const cleaned = text.replace(/[^\w\s.-]+/g, '').replace(/\s+/g, ' ').trim();
      return cleaned || fallback || 'unknown';
    };
    const title = safe(meta?.title, 'unknown-title');
    const artist = safe(meta?.artist, 'unknown-artist');
    const source = safe(meta?.source, 'unknown-source');
    const id = safe(meta?.youtubeId || youtubeId, 'unknown-id');
    const downloadName = `${artist} - ${title} (${source}) [${id}].mp3`;
    return res.download(fullPath, downloadName);
  }

  res.sendFile(fullPath);
});

app.delete('/api/cache/file/:name', (req, res) => {
  const name = req.params.name;
  if (!name || name.includes('..') || name.includes('/')) {
    return res.status(400).json({ error: 'Invalid file name' });
  }

  const fullPath = path.join(AUDIO_CACHE_DIR, name);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    fs.unlinkSync(fullPath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

app.post('/api/cache/clear', (req, res) => {
  try {
    if (!fs.existsSync(AUDIO_CACHE_DIR)) {
      return res.json({ success: true, deleted: 0 });
    }

    const olderThanDays = Number(req.body?.olderThanDays);
    const cutoffMs = Number.isFinite(olderThanDays) && olderThanDays > 0
      ? Date.now() - olderThanDays * 24 * 60 * 60 * 1000
      : null;

    const files = fs.readdirSync(AUDIO_CACHE_DIR).filter(name => name.endsWith('.mp3'));
    let deleted = 0;
    for (const name of files) {
      const fullPath = path.join(AUDIO_CACHE_DIR, name);
      try {
        if (cutoffMs !== null) {
          const stats = fs.statSync(fullPath);
          if (stats.mtimeMs > cutoffMs) {
            continue;
          }
        }
        fs.unlinkSync(fullPath);
        deleted += 1;
      } catch (error) {
        // Continue deleting other files
      }
    }
    res.json({ success: true, deleted });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

app.post('/api/cache/rebuild', async (req, res) => {
  try {
    if (!fs.existsSync(AUDIO_CACHE_DIR)) {
      return res.json({ success: true, updated: 0 });
    }

    const manifest = loadCacheManifest();
    const files = fs.readdirSync(AUDIO_CACHE_DIR).filter(name => name.endsWith('.mp3'));
    let updated = 0;

    for (const name of files) {
      const youtubeId = name.replace('.mp3', '');
      const existing = manifest[youtubeId];
      if (existing && (existing.title || existing.artist)) {
        continue;
      }

      const info = await fetchYouTubeOEmbed(youtubeId);
      if (!info) continue;

      manifest[youtubeId] = {
        youtubeId,
        filename: name,
        title: info.title || null,
        artist: info.author_name || null,
        source: 'youtube-oembed',
        cachedAt: new Date().toISOString()
      };
      updated += 1;
    }

    saveCacheManifest(manifest);
    res.json({ success: true, updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to rebuild cache metadata' });
  }
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

// Spotify search endpoint
app.get('/api/search/spotify', async (req, res) => {
  const { q, limit = 10 } = req.query;
  
  if (!q) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  try {
    if (!spotifyService.isAvailable()) {
      return res.status(503).json({ 
        error: 'Spotify service not available',
        message: 'Spotify API credentials not configured. Run setup_spotify_auth.js to configure.'
      });
    }

    const results = await spotifyService.searchTracks(q, limit);
    res.json(results);
  } catch (error) {
    console.error('Spotify search error:', error);
    res.status(500).json({ error: 'Failed to search Spotify' });
  }
});

// Spotify track details endpoint
app.get('/api/spotify/track/:trackId', async (req, res) => {
  const { trackId } = req.params;
  
  try {
    if (!spotifyService.isAvailable()) {
      return res.status(503).json({ 
        error: 'Spotify service not available' 
      });
    }

    const result = await spotifyService.getTrack(trackId);
    res.json(result);
  } catch (error) {
    console.error('Spotify track error:', error);
    res.status(500).json({ error: 'Failed to get Spotify track' });
  }
});

// Spotify recommendations endpoint
app.get('/api/spotify/recommendations', async (req, res) => {
  const { seed_tracks, seed_artists, seed_genres, limit = 10 } = req.query;
  
  try {
    if (!spotifyService.isAvailable()) {
      return res.status(503).json({ 
        error: 'Spotify service not available' 
      });
    }

    const seedTracks = seed_tracks ? seed_tracks.split(',') : [];
    const seedArtists = seed_artists ? seed_artists.split(',') : [];
    const seedGenres = seed_genres ? seed_genres.split(',') : [];

    const results = await spotifyService.getRecommendations(
      seedTracks, 
      seedArtists, 
      seedGenres, 
      parseInt(limit)
    );
    res.json(results);
  } catch (error) {
    console.error('Spotify recommendations error:', error);
    res.status(500).json({ error: 'Failed to get Spotify recommendations' });
  }
});

// Music service status endpoint
app.get('/api/music-services/status', (req, res) => {
  res.json({
    youtube: {
      available: true,
      name: 'YouTube Music'
    },
    spotify: {
      available: spotifyService.isAvailable(),
      name: 'Spotify',
      status: spotifyService.getStatus()
    }
  });
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
      (song.spotifyId && item.spotifyId === song.spotifyId) ||
      (item.title.toLowerCase() === song.title.toLowerCase() && 
       item.artist.toLowerCase() === song.artist.toLowerCase())
    );
    
    const isDuplicateInParked = parkedQueue.some(item => 
      (song.videoId && item.videoId === song.videoId) ||
      (song.spotifyId && item.spotifyId === song.spotifyId) ||
      (item.title.toLowerCase() === song.title.toLowerCase() && 
       item.artist.toLowerCase() === song.artist.toLowerCase())
    );

    const isCurrentlyPlaying = currentlyPlaying && (
      (song.videoId && currentlyPlaying.videoId === song.videoId) ||
      (song.spotifyId && currentlyPlaying.spotifyId === song.spotifyId) ||
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

  // Check for duplicates by videoId/spotifyId (most reliable) or title+artist
  const isDuplicate = currentQueue.some(queueItem => {
    // Check by unique ID first
    if (song.videoId && queueItem.videoId) {
      return queueItem.videoId === song.videoId;
    }
    if (song.spotifyId && queueItem.spotifyId) {
      return queueItem.spotifyId === song.spotifyId;
    }
    // Fallback to title+artist comparison (case insensitive)
    return queueItem.title.toLowerCase() === song.title.toLowerCase() && 
           queueItem.artist.toLowerCase() === song.artist.toLowerCase();
  });

  // Also check if it's currently playing
  const isCurrentlyPlaying = currentlyPlaying && (
    (song.videoId && currentlyPlaying.videoId === song.videoId) ||
    (song.spotifyId && currentlyPlaying.spotifyId === song.spotifyId) ||
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

// New endpoint for getting pre-resolved fallback songs
app.get('/api/playlist/next-resolved', async (req, res) => {
  try {
    const playlist = getCurrentPlaylist();
    if (playlist.length === 0) {
      return res.json({ nextSong: null });
    }
    
    // Get the next song that would be played
    let nextIndex = fallbackPlaylistIndex;
    let attempts = 0;
    const maxAttempts = playlist.length;
    
    // Find next non-suppressed song
    while (attempts < maxAttempts && suppressedSongs.has(nextIndex)) {
      nextIndex = (nextIndex + 1) % playlist.length;
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      return res.json({ nextSong: null });
    }
    
    const playlistItem = playlist[nextIndex];
    
    // Search for the song to get full details
    const searchResults = await searchYouTubeMusic(playlistItem.search, 1);
    if (searchResults.results && searchResults.results.length > 0) {
      const song = searchResults.results[0];
      
      const resolvedSong = {
        id: `fallback-${nextIndex}-${Date.now()}`,
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
        playlistIndex: nextIndex
      };
      
      res.json({ nextSong: resolvedSong });
    } else {
      res.json({ nextSong: null });
    }
  } catch (error) {
    console.error('Error getting next resolved song:', error);
    res.status(500).json({ error: 'Failed to get next song' });
  }
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

// Playlist management endpoints
app.get('/api/playlist/get/:playlistName', (req, res) => {
  const { playlistName } = req.params;
  
  try {
    let playlist;
    if (playlistName === 'wedding') {
      playlist = WEDDING_PLAYLIST;
    } else if (playlistName === 'bride') {
      playlist = BRIDE_PLAYLIST;
    } else {
      return res.status(400).json({ error: 'Invalid playlist name' });
    }
    
    res.json({
      success: true,
      playlist: playlist,
      playlistName: playlistName
    });
  } catch (error) {
    console.error('Error getting playlist:', error);
    res.status(500).json({ error: 'Failed to get playlist' });
  }
});

app.post('/api/playlist/save/:playlistName', (req, res) => {
  const { playlistName } = req.params;
  const { playlist } = req.body;
  
  if (!playlist || !Array.isArray(playlist)) {
    return res.status(400).json({ error: 'Invalid playlist data' });
  }
  
  try {
    // Validate playlist items
    for (const item of playlist) {
      if (!item.search || !item.type) {
        return res.status(400).json({ error: 'Invalid playlist item format' });
      }
    }
    
    // Update in-memory playlist
    if (playlistName === 'wedding') {
      WEDDING_PLAYLIST.length = 0;
      WEDDING_PLAYLIST.push(...playlist);
    } else if (playlistName === 'bride') {
      BRIDE_PLAYLIST.length = 0;
      BRIDE_PLAYLIST.push(...playlist);
    } else {
      return res.status(400).json({ error: 'Invalid playlist name' });
    }
    
    // Save to file
    const filename = playlistName === 'wedding' ? 'wedding-playlist.js' : 'bride-playlist.js';
    const constantName = playlistName === 'wedding' ? 'WEDDING_PLAYLIST' : 'BRIDE_PLAYLIST';
    
    const fileContent = `const ${constantName} = ${JSON.stringify(playlist, null, 2)};

module.exports = ${constantName};
`;
    
    fs.writeFileSync(filename, fileContent);
    
    // Reset playlist index and clear suppressions when playlist changes
    fallbackPlaylistIndex = 0;
    currentFallbackIndex = -1;
    suppressedSongs.clear();
    
    // Broadcast playlist update to all clients
    io.emit('playlistUpdated', {
      playlistName: playlistName,
      message: `${getPlaylistName()} updated with ${playlist.length} songs`,
      totalSongs: playlist.length
    });
    
    res.json({
      success: true,
      message: `${playlistName} playlist saved successfully`,
      totalSongs: playlist.length
    });
    
  } catch (error) {
    console.error('Error saving playlist:', error);
    res.status(500).json({ error: 'Failed to save playlist' });
  }
});

app.post('/api/playlist/add-song/:playlistName', (req, res) => {
  const { playlistName } = req.params;
  const { search, type, position } = req.body;
  
  if (!search || !type) {
    return res.status(400).json({ error: 'Search query and type are required' });
  }
  
  try {
    const newSong = { search, type };
    let playlist;
    
    if (playlistName === 'wedding') {
      playlist = WEDDING_PLAYLIST;
    } else if (playlistName === 'bride') {
      playlist = BRIDE_PLAYLIST;
    } else {
      return res.status(400).json({ error: 'Invalid playlist name' });
    }
    
    // Add song at specified position or end
    if (position !== undefined && position >= 0 && position <= playlist.length) {
      playlist.splice(position, 0, newSong);
    } else {
      playlist.push(newSong);
    }
    
    // Save the updated playlist
    const filename = playlistName === 'wedding' ? 'wedding-playlist.js' : 'bride-playlist.js';
    const constantName = playlistName === 'wedding' ? 'WEDDING_PLAYLIST' : 'BRIDE_PLAYLIST';
    
    const fileContent = `const ${constantName} = ${JSON.stringify(playlist, null, 2)};

module.exports = ${constantName};
`;
    
    fs.writeFileSync(filename, fileContent);
    
    // Broadcast update
    io.emit('playlistUpdated', {
      playlistName: playlistName,
      message: `Song added to ${getPlaylistName()}`,
      totalSongs: playlist.length
    });
    
    res.json({
      success: true,
      message: 'Song added to playlist',
      totalSongs: playlist.length
    });
    
  } catch (error) {
    console.error('Error adding song to playlist:', error);
    res.status(500).json({ error: 'Failed to add song to playlist' });
  }
});

app.delete('/api/playlist/remove-song/:playlistName/:index', (req, res) => {
  const { playlistName, index } = req.params;
  const songIndex = parseInt(index);
  
  try {
    let playlist;
    
    if (playlistName === 'wedding') {
      playlist = WEDDING_PLAYLIST;
    } else if (playlistName === 'bride') {
      playlist = BRIDE_PLAYLIST;
    } else {
      return res.status(400).json({ error: 'Invalid playlist name' });
    }
    
    if (songIndex < 0 || songIndex >= playlist.length) {
      return res.status(400).json({ error: 'Invalid song index' });
    }
    
    // Remove song
    const removedSong = playlist.splice(songIndex, 1)[0];
    
    // Save the updated playlist
    const filename = playlistName === 'wedding' ? 'wedding-playlist.js' : 'bride-playlist.js';
    const constantName = playlistName === 'wedding' ? 'WEDDING_PLAYLIST' : 'BRIDE_PLAYLIST';
    
    const fileContent = `const ${constantName} = ${JSON.stringify(playlist, null, 2)};

module.exports = ${constantName};
`;
    
    fs.writeFileSync(filename, fileContent);
    
    // Update suppressed songs indices (shift down indices after removed song)
    const newSuppressedSongs = new Set();
    for (const suppressedIndex of suppressedSongs) {
      if (suppressedIndex < songIndex) {
        newSuppressedSongs.add(suppressedIndex);
      } else if (suppressedIndex > songIndex) {
        newSuppressedSongs.add(suppressedIndex - 1);
      }
      // Skip the removed song index
    }
    suppressedSongs.clear();
    newSuppressedSongs.forEach(index => suppressedSongs.add(index));
    
    // Broadcast update
    io.emit('playlistUpdated', {
      playlistName: playlistName,
      message: `Song removed from ${getPlaylistName()}`,
      totalSongs: playlist.length
    });
    
    res.json({
      success: true,
      message: 'Song removed from playlist',
      removedSong: removedSong,
      totalSongs: playlist.length
    });
    
  } catch (error) {
    console.error('Error removing song from playlist:', error);
    res.status(500).json({ error: 'Failed to remove song from playlist' });
  }
});

app.post('/api/playlist/reorder/:playlistName', (req, res) => {
  const { playlistName } = req.params;
  const { fromIndex, toIndex } = req.body;
  
  if (fromIndex === undefined || toIndex === undefined) {
    return res.status(400).json({ error: 'fromIndex and toIndex are required' });
  }
  
  try {
    let playlist;
    
    if (playlistName === 'wedding') {
      playlist = WEDDING_PLAYLIST;
    } else if (playlistName === 'bride') {
      playlist = BRIDE_PLAYLIST;
    } else {
      return res.status(400).json({ error: 'Invalid playlist name' });
    }
    
    if (fromIndex < 0 || fromIndex >= playlist.length || toIndex < 0 || toIndex >= playlist.length) {
      return res.status(400).json({ error: 'Invalid indices' });
    }
    
    // Move song from fromIndex to toIndex
    const [movedSong] = playlist.splice(fromIndex, 1);
    playlist.splice(toIndex, 0, movedSong);
    
    // Save the updated playlist
    const filename = playlistName === 'wedding' ? 'wedding-playlist.js' : 'bride-playlist.js';
    const constantName = playlistName === 'wedding' ? 'WEDDING_PLAYLIST' : 'BRIDE_PLAYLIST';
    
    const fileContent = `const ${constantName} = ${JSON.stringify(playlist, null, 2)};

module.exports = ${constantName};
`;
    
    fs.writeFileSync(filename, fileContent);
    
    // Update suppressed songs indices
    const newSuppressedSongs = new Set();
    for (const suppressedIndex of suppressedSongs) {
      let newIndex = suppressedIndex;
      
      if (suppressedIndex === fromIndex) {
        // The moved song
        newIndex = toIndex;
      } else if (fromIndex < toIndex) {
        // Moving down: indices between fromIndex and toIndex shift up
        if (suppressedIndex > fromIndex && suppressedIndex <= toIndex) {
          newIndex = suppressedIndex - 1;
        }
      } else {
        // Moving up: indices between toIndex and fromIndex shift down
        if (suppressedIndex >= toIndex && suppressedIndex < fromIndex) {
          newIndex = suppressedIndex + 1;
        }
      }
      
      newSuppressedSongs.add(newIndex);
    }
    suppressedSongs.clear();
    newSuppressedSongs.forEach(index => suppressedSongs.add(index));
    
    // Broadcast update
    io.emit('playlistUpdated', {
      playlistName: playlistName,
      message: `${getPlaylistName()} reordered`,
      totalSongs: playlist.length
    });
    
    res.json({
      success: true,
      message: 'Playlist reordered successfully',
      totalSongs: playlist.length
    });
    
  } catch (error) {
    console.error('Error reordering playlist:', error);
    res.status(500).json({ error: 'Failed to reorder playlist' });
  }
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

app.post('/api/audio/test', (req, res) => {
  console.log('🧪 Test audio requested');
  
  // Emit test audio command to audio service
  io.emit('testAudioCommand');
  
  res.json({ success: true, message: 'Test audio command sent' });
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
  
  // Handle audio service commands and forward to audio service
  socket.on('pauseCommand', () => {
    console.log('⏸️ Pause command received from web interface, forwarding to audio service');
    io.emit('pauseCommand');
  });
  
  socket.on('resumeCommand', () => {
    console.log('▶️ Resume command received from web interface, forwarding to audio service');
    io.emit('resumeCommand');
  });
  
  socket.on('skipCommand', () => {
    console.log('⏭️ Skip command received from web interface, forwarding to audio service');
    io.emit('skipCommand');
  });

  socket.on('volumeCommand', (data) => {
    console.log('🔊 Volume command received from web interface, forwarding to audio service');
    io.emit('volumeCommand', data);
  });

  socket.on('fadeCommand', (data = {}) => {
    console.log('🎚️ Fade command received from web interface, forwarding to audio service');
    io.emit('fadeCommand', data);
  });
  
  socket.on('manualPlayCommand', () => {
    console.log('🎵 Manual play command received from web interface, forwarding to audio service');
    io.emit('manualPlayCommand');
  });
  
  // Handle audio service status updates and forward to all clients
  socket.on('audioServiceStatus', (data) => {
    // Forward audio service status to all connected clients
    io.emit('audioServiceStatus', data);
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
      // Local development - use direct python3 path
      python = spawn('venv/bin/python3', [
        'youtube_music_service.py', 
        'search', 
        '--query', query, 
        '--limit', limit.toString()
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
