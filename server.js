const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const multer = require('multer');
const https = require('https');
const crypto = require('crypto');
const httpClient = require('http');
const WEDDING_PLAYLIST = require('./wedding-playlist');
const BRIDE_PLAYLIST = require('./bride-playlist');
const SpotifyService = require('./spotify_service');
require('dotenv').config();

const OAUTH_FILE = path.join(__dirname, 'oauth.json');

function parseCurlHeaders(curlText) {
  const headers = {};
  if (!curlText || typeof curlText !== 'string') return headers;
  const headerRegex = /(?:-H|--header)\s+(['"])(.*?)\1/g;
  let match;
  while ((match = headerRegex.exec(curlText)) !== null) {
    const raw = match[2];
    const idx = raw.indexOf(':');
    if (idx === -1) continue;
    const key = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    if (!key) continue;
    headers[key.toLowerCase()] = value;
  }
  return headers;
}

function parseHeaderBlock(headerBlock) {
  const headers = {};
  if (!headerBlock || typeof headerBlock !== 'string') return headers;
  for (const line of headerBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    headers[key.toLowerCase()] = value;
  }
  return headers;
}

function buildHeaderBlockFromHeaders(headers) {
  return Object.entries(headers)
    .map(([key, value]) => `${key.toLowerCase()}: ${value}`)
    .join('\n');
}

function extractHeaderLinesFromCurl(curlText) {
  if (!curlText || typeof curlText !== 'string') return '';
  const lines = [];
  for (const rawLine of curlText.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('-H ') || line.startsWith('--header ')) {
      let headerLine = line.replace(/^(-H|--header)\s+/, '');
      if ((headerLine.startsWith("'") && headerLine.endsWith("'")) || (headerLine.startsWith('"') && headerLine.endsWith('"'))) {
        headerLine = headerLine.slice(1, -1);
      }
      if (headerLine.endsWith('\\')) {
        headerLine = headerLine.slice(0, -1).trim();
      }
      lines.push(headerLine);
    }
  }
  return lines.join('\n').trim();
}

function normalizeHeaderBlock(input) {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (trimmed.startsWith('curl ') || trimmed.includes('\n -H ') || trimmed.includes('\n  -H ')) {
    return extractHeaderLinesFromCurl(trimmed);
  }
  return trimmed;
}

function lowercaseHeaderBlock(headerBlock) {
  if (!headerBlock || typeof headerBlock !== 'string') return '';
  return headerBlock
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      const idx = trimmed.indexOf(':');
      if (idx === -1) return trimmed;
      const key = trimmed.slice(0, idx).trim().toLowerCase();
      const value = trimmed.slice(idx + 1).trim();
      return `${key}: ${value}`;
    })
    .filter(Boolean)
    .join('\n');
}

function getHeaderValueCaseInsensitive(headers, key) {
  if (!headers || typeof headers !== 'object') return '';
  const lowerKey = key.toLowerCase();
  for (const [k, value] of Object.entries(headers)) {
    if (k.toLowerCase() === lowerKey) return value || '';
  }
  return '';
}

function getPythonCommand() {
  const isDocker = process.env.NODE_ENV === 'production' && fs.existsSync('/app/venv');
  if (isDocker) {
    return {
      cmd: '/app/venv/bin/python',
      cwd: '/app',
      env: {
        ...process.env,
        PATH: '/app/venv/bin:' + process.env.PATH,
        PYTHONPATH: '/app'
      }
    };
  }
  return {
    cmd: 'venv/bin/python3',
    cwd: __dirname,
    env: process.env
  };
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
let lastKnownVolumePercent = null;
const volumeFilePath = path.join(__dirname, 'data', 'audio-volume.json');

const loadSavedVolumePercent = () => {
  if (!fs.existsSync(volumeFilePath)) return null;
  try {
    const raw = fs.readFileSync(volumeFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    const volume = typeof parsed.volume === 'number' ? parsed.volume : null;
    if (volume === null || Number.isNaN(volume)) return null;
    const clamped = Math.max(0, Math.min(1, volume));
    return Math.round(clamped * 100);
  } catch (error) {
    console.log('⚠️ Failed to load saved volume:', error.message);
    return null;
  }
};

lastKnownVolumePercent = loadSavedVolumePercent();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const AUTH_COOKIE = 'jukebox_auth';
const AUTH_PASSCODE = process.env.DJ_PASSCODE || '';
const authSessions = new Map();

function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};
  return header.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function isAuthEnabled() {
  return Boolean(AUTH_PASSCODE && AUTH_PASSCODE.length >= 4);
}

function isAuthenticated(req) {
  if (!isAuthEnabled()) return true;
  const cookies = parseCookies(req);
  const token = cookies[AUTH_COOKIE];
  if (!token) return false;
  return authSessions.has(token);
}

function requireAuthPage(req, res, next) {
  if (isAuthenticated(req)) return next();
  const nextUrl = encodeURIComponent(req.originalUrl || '/');
  return res.redirect(`/login?next=${nextUrl}`);
}

function requireAuthApi(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function isPublicApi(req) {
  const path = req.path;
  if (req.method === 'GET') {
    return [
      '/api/queue',
      '/api/queue/status',
      '/api/playlist/status',
      '/api/playlist/next-resolved',
      '/api/search',
      '/api/spotify/recommendations',
      '/api/music-services/status',
      '/api/event-config',
      '/api/audio/output',
      '/api/system-mode',
      '/api/volume'
    ].includes(path);
  }
  if (req.method === 'POST') {
    return [
      '/api/queue/add'
    ].includes(path);
  }
  return false;
}

app.use((req, res, next) => {
  if (!isAuthEnabled()) return next();
  const protectedPaths = new Set([
    '/',
    '/index.html',
    '/settings',
    '/settings.html',
    '/playlist-editor',
    '/playlist-editor.html'
  ]);
  if (protectedPaths.has(req.path)) {
    return requireAuthPage(req, res, next);
  }
  if (req.path.startsWith('/api/') && !isPublicApi(req)) {
    return requireAuthApi(req, res, next);
  }
  return next();
});

app.use(express.static('public'));

// In-memory storage for demo (replace with database in production)
let currentQueue = [];
let parkedQueue = []; // New: parked user submissions
let currentlyPlaying = null;
let connectedUsers = new Set();
let audioServiceSockets = new Set();
let fallbackPlaylistIndex = 0;
let currentFallbackIndex = -1; // Track which song is currently playing from fallback
let fallbackMode = false;
let activePlaylist = 'bride'; // legacy playlist key
let activeEventId = null;
let activeThemeKey = null;
let activeFallbackSource = 'event';
let queueParked = false; // New: park user submissions instead of blocking them
let suppressedSongs = new Set(); // New: track suppressed playlist songs by index

// Playlist persistence
const PLAYLIST_STATE_FILE = path.join(__dirname, 'playlist-state.json');

// Event configuration
const EVENT_CONFIG_FILE = path.join(__dirname, 'event-config.json');
const EVENT_CONFIG_OVERRIDE = path.join(__dirname, 'data', 'event-config.json');
const EVENT_PRESETS_FILE = path.join(__dirname, 'data', 'event-presets.json');
let eventConfig = null;
const PLAYLISTS_DIR = path.join(__dirname, 'playlists');
const TAG_CACHE_FILE = path.join(__dirname, 'data', 'tag-cache.json');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini-2024-07-18';

// Audio output settings
const AUDIO_OUTPUT_FILE = path.join(__dirname, 'audio-output.json');
let audioOutputDevice = null;
const SYSTEM_CONFIG_FILE = path.join(__dirname, 'data', 'system-config.json');
let systemMode = 'headless';

// Initialize Spotify service
const spotifyService = new SpotifyService();

// Play history tracking
const PLAY_HISTORY_FILE = 'event-play-history.json';
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

function loadPlaylistState() {
  if (!fs.existsSync(PLAYLIST_STATE_FILE)) return null;
  try {
    const data = fs.readFileSync(PLAYLIST_STATE_FILE, 'utf8');
    const parsed = JSON.parse(data);
    if (typeof parsed === 'string') {
      return { activePlaylist: parsed };
    }
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.error('Failed to load playlist state:', error.message);
  }
  return null;
}

function savePlaylistState(state) {
  try {
    const payload = {
      activePlaylist: state?.activePlaylist || activePlaylist,
      activeEventId: state?.activeEventId || activeEventId,
      activeThemeKey: state?.activeThemeKey || activeThemeKey,
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(PLAYLIST_STATE_FILE, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('Failed to save playlist state:', error.message);
  }
}

function loadEventConfig() {
  const readConfig = (filepath) => {
    if (!fs.existsSync(filepath)) return null;
    const data = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(data);
  };

  try {
    const overrideConfig = readConfig(EVENT_CONFIG_OVERRIDE);
    if (overrideConfig) {
      if (!overrideConfig.themeKey) overrideConfig.themeKey = 'wedding';
      const themeKey = overrideConfig.themeKey || 'wedding';
      overrideConfig.eventsByTheme = overrideConfig.eventsByTheme || {};
      if (overrideConfig.eventsByTheme[themeKey] && !overrideConfig.eventsByTheme[themeKey].fallbackPlaylistFile) {
        overrideConfig.eventsByTheme[themeKey].fallbackPlaylistFile = overrideConfig.playlists?.primary?.file || 'wedding-playlist.js';
      }
      return overrideConfig;
    }
  } catch (error) {
    console.error('Failed to load event config override:', error.message);
  }

  try {
    const baseConfig = readConfig(EVENT_CONFIG_FILE);
    if (baseConfig) {
      if (!baseConfig.themeKey) baseConfig.themeKey = 'wedding';
      const themeKey = baseConfig.themeKey || 'wedding';
      baseConfig.eventsByTheme = baseConfig.eventsByTheme || {};
      if (baseConfig.eventsByTheme[themeKey] && !baseConfig.eventsByTheme[themeKey].fallbackPlaylistFile) {
        baseConfig.eventsByTheme[themeKey].fallbackPlaylistFile = baseConfig.playlists?.primary?.file || 'wedding-playlist.js';
      }
      return baseConfig;
    }
  } catch (error) {
    console.error('Failed to load event config:', error.message);
  }

  return {
    appName: 'Wedding Jukebox',
    eventName: 'Wedding',
    themeKey: 'wedding',
    playlists: {
      primary: {
        key: 'wedding',
        name: 'Wedding Party Playlist',
        shortName: 'Wedding Party',
        label: 'Wedding Playlist',
        addedBy: '🎵 Wedding DJ'
      },
      secondary: {
        key: 'bride',
        name: "Bride's Elegant Playlist",
        shortName: "Bride's Elegant",
        label: "Bride's Playlist",
        addedBy: "✨ Bride's Collection"
      },
      autoPlayLabel: '🎵 Wedding DJ Auto-Play'
    }
  };
}

function getEventConfig() {
  eventConfig = loadEventConfig();
  return eventConfig;
}

function saveEventConfig(config) {
  try {
    fs.mkdirSync(path.dirname(EVENT_CONFIG_OVERRIDE), { recursive: true });
    fs.writeFileSync(EVENT_CONFIG_OVERRIDE, JSON.stringify(config, null, 2));
    eventConfig = config;
    return true;
  } catch (error) {
    console.error('Failed to save event config:', error.message);
    return false;
  }
}

function loadEventPresets() {
  if (!fs.existsSync(EVENT_PRESETS_FILE)) return {};
  try {
    const data = fs.readFileSync(EVENT_PRESETS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('Failed to load event presets:', error.message);
    return {};
  }
}

function saveEventPresets(presets) {
  try {
    fs.mkdirSync(path.dirname(EVENT_PRESETS_FILE), { recursive: true });
    fs.writeFileSync(EVENT_PRESETS_FILE, JSON.stringify(presets, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to save event presets:', error.message);
    return false;
  }
}

function loadTagCache() {
  if (!fs.existsSync(TAG_CACHE_FILE)) return {};
  try {
    const data = fs.readFileSync(TAG_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('Failed to load tag cache:', error.message);
    return {};
  }
}

function saveTagCache(cache) {
  try {
    fs.mkdirSync(path.dirname(TAG_CACHE_FILE), { recursive: true });
    fs.writeFileSync(TAG_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error('Failed to save tag cache:', error.message);
  }
}

function buildTagSchema() {
  return {
    name: 'tag_set',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['tags', 'confidence'],
      properties: {
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        tags: {
          type: 'object',
          additionalProperties: false,
          required: ['energy', 'pace'],
          properties: {
            energy: { type: 'integer', minimum: 1, maximum: 5 },
            pace: { type: 'string', enum: ['slow', 'medium', 'fast'] },
            vibe: { type: 'array', items: { type: 'string', enum: ['chill', 'hype', 'romantic', 'emotional'] }, uniqueItems: true },
            participation: { type: 'array', items: { type: 'string', enum: ['background', 'dance', 'sing-along', 'line-dance'] }, uniqueItems: true },
            intent: { type: 'array', items: { type: 'string', enum: ['focus', 'celebration', 'transition', 'instructional', 'cool-down'] }, uniqueItems: true },
            movement: { type: 'array', items: { type: 'string', enum: ['steady-tempo', 'rhythmic', 'explosive', 'flowing', 'marching', 'syncopated'] }, uniqueItems: true },
            audience: { type: 'array', items: { type: 'string', enum: ['all-ages', 'kids', 'teens', 'adults', 'formal', 'informal'] }, uniqueItems: true },
            time: { type: 'array', items: { type: 'string', enum: ['dinner', 'late-night'] }, uniqueItems: true },
            function: { type: 'array', items: { type: 'string', enum: ['anthem', 'classic', 'nostalgia', 'crowd-hype', 'ceremonial'] }, uniqueItems: true },
            bpm: { type: 'integer', minimum: 40, maximum: 250 },
            key: { type: 'string' },
            explicit: { type: 'boolean' }
          }
        }
      }
    }
  };
}

function fallbackTags(payload) {
  const title = (payload.title || '').toLowerCase();
  const artist = (payload.artist || '').toLowerCase();
  const text = `${title} ${artist}`;

  const tags = {
    energy: 3,
    pace: 'medium',
    vibe: [],
    participation: [],
    intent: [],
    movement: [],
    audience: ['all-ages'],
    time: [],
    function: [],
    explicit: false
  };

  if (text.includes('shuffle') || text.includes('cha cha') || text.includes('electric slide')) {
    tags.participation.push('line-dance');
    tags.intent.push('instructional');
    tags.vibe.push('hype');
    tags.energy = 4;
  }

  if (text.includes('waltz') || text.includes('first dance') || text.includes('at last')) {
    tags.vibe.push('romantic');
    tags.intent.push('ceremonial');
    tags.pace = 'slow';
    tags.energy = 2;
  }

  if (text.includes('party') || text.includes('dance') || text.includes('club')) {
    tags.participation.push('dance');
    tags.vibe.push('hype');
    tags.intent.push('celebration');
    tags.energy = Math.max(tags.energy, 4);
  }

  if (text.includes('acoustic') || text.includes('piano') || text.includes('strings')) {
    tags.vibe.push('emotional');
    tags.pace = 'slow';
    tags.energy = Math.min(tags.energy, 2);
  }

  if (!tags.intent.length) {
    tags.intent.push('celebration');
  }

  if (!tags.participation.length) {
    tags.participation.push('background');
  }

  return { tags, confidence: 0.2, fallback: true };
}

async function tagTrackWithAI(payload) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const schema = buildTagSchema();
  const systemPrompt = [
    'You are a music tagging assistant.',
    'Return tags that match the provided schema exactly.',
    'Use only the allowed enum values.',
    'If uncertain, choose conservative defaults: energy=3, pace=medium, empty arrays.',
    'Return valid JSON only.'
  ].join(' ');

  const userPrompt = `Track info:\\n${JSON.stringify(payload, null, 2)}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_schema', json_schema: schema }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const output = data.choices?.[0]?.message?.content;
  if (!output) {
    throw new Error('OpenAI response missing content');
  }
  return JSON.parse(output);
}

function listPlaylistFiles() {
  if (!fs.existsSync(PLAYLISTS_DIR)) return [];
  try {
    const files = fs.readdirSync(PLAYLISTS_DIR);
    return files.filter(file => file.endsWith('.js') || file.endsWith('.json'));
  } catch (error) {
    console.error('Failed to read playlists directory:', error.message);
    return [];
  }
}

function sanitizePlaylistFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const playlistUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(PLAYLISTS_DIR, { recursive: true });
      cb(null, PLAYLISTS_DIR);
    },
    filename: (req, file, cb) => {
      cb(null, sanitizePlaylistFilename(file.originalname));
    }
  }),
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.js') || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only .js or .json playlists are allowed'));
    }
  },
  limits: { fileSize: 2 * 1024 * 1024 }
});

function getPlaylistConfig(key) {
  const config = getEventConfig();
  if (config.playlists?.primary?.key === key) return config.playlists.primary;
  if (config.playlists?.secondary?.key === key) return config.playlists.secondary;
  return config.playlists?.primary || {
    key: 'wedding',
    name: 'Wedding Party Playlist',
    shortName: 'Wedding Party',
    label: 'Wedding Playlist',
    addedBy: '🎵 Wedding DJ'
  };
}

function getThemeKey() {
  const config = getEventConfig();
  return config.themeKey || activeThemeKey || 'wedding';
}

function ensureEventsForTheme(themeKey) {
  const config = getEventConfig();
  config.eventsByTheme = config.eventsByTheme || {};
  if (!config.eventsByTheme[themeKey]) {
    const primary = config.playlists?.primary;
    const secondary = config.playlists?.secondary;
    config.eventsByTheme[themeKey] = {
      activeEventId: primary?.key || 'primary',
      fallbackPlaylistFile: primary?.file || 'wedding-playlist.js',
      events: [
        {
          id: primary?.key || 'primary',
          name: primary?.name || 'Primary Playlist',
          playlistFile: primary?.file || 'wedding-playlist.js',
          loop: true,
          allowUserInject: false,
          dedupeUserInject: true,
          injectToFallback: true
        },
        {
          id: secondary?.key || 'secondary',
          name: secondary?.name || 'Secondary Playlist',
          playlistFile: secondary?.file || 'bride-playlist.js',
          loop: true,
          allowUserInject: false,
          dedupeUserInject: true,
          injectToFallback: true
        }
      ]
    };
  }
  return config.eventsByTheme[themeKey];
}

function getActiveEventSet() {
  const themeKey = getThemeKey();
  const set = ensureEventsForTheme(themeKey);
  const events = Array.isArray(set.events) ? set.events : [];
  const activeId = activeEventId || set.activeEventId || (events[0] && events[0].id) || null;
  return { themeKey, events, activeEventId: activeId };
}

function getActiveEvent() {
  const { events, activeEventId: currentId } = getActiveEventSet();
  const active = events.find(event => event.id === currentId) || events[0] || null;
  return active;
}

function setActiveEvent(eventId) {
  const { themeKey, events } = getActiveEventSet();
  const exists = events.some(event => event.id === eventId);
  if (!exists) return false;
  activeEventId = eventId;
  activeThemeKey = themeKey;
  activeFallbackSource = 'event';
  fallbackPlaylistIndex = 0;
  currentFallbackIndex = -1;
  suppressedSongs.clear();
  savePlaylistState({ activePlaylist, activeEventId, activeThemeKey });
  return true;
}

function resolvePlaylistFile(playlistConfig, fallbackFile) {
  const file = playlistConfig?.file || fallbackFile;
  if (!file) return null;
  const candidates = [
    path.join(__dirname, file),
    path.join(__dirname, 'playlists', file),
    path.join(__dirname, 'playlists', path.basename(file))
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function parsePlaylistPayload(raw) {
  if (Array.isArray(raw)) {
    return { tracks: raw, description: '' };
  }
  if (raw && typeof raw === 'object') {
    const description = typeof raw.description === 'string' ? raw.description : '';
    const tracks = Array.isArray(raw.tracks)
      ? raw.tracks
      : Array.isArray(raw.playlist)
      ? raw.playlist
      : Array.isArray(raw.songs)
      ? raw.songs
      : null;
    if (tracks) {
      return { tracks, description };
    }
  }
  return null;
}

function loadPlaylistData(filepath) {
  if (!filepath) return null;
  try {
    let raw;
    if (filepath.endsWith('.json')) {
      raw = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } else if (filepath.endsWith('.js')) {
      const resolved = require.resolve(filepath);
      delete require.cache[resolved];
      raw = require(resolved);
    }
    return parsePlaylistPayload(raw);
  } catch (error) {
    console.error('Failed to load playlist file:', filepath, error.message);
  }
  return null;
}

function loadPlaylistFromFile(filepath) {
  const data = loadPlaylistData(filepath);
  return data ? data.tracks : null;
}

function savePlaylistFileToDisk(filename, playlist, description) {
  if (!filename || !Array.isArray(playlist)) return false;
  const safeName = sanitizePlaylistFilename(filename);
  if (!safeName.endsWith('.js') && !safeName.endsWith('.json')) return false;
  try {
    fs.mkdirSync(PLAYLISTS_DIR, { recursive: true });
    const filepath = path.join(PLAYLISTS_DIR, safeName);
    if (fs.existsSync(filepath)) {
      const backupsDir = path.join(__dirname, 'data', 'playlist-backups');
      fs.mkdirSync(backupsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${safeName.replace(/\.(js|json)$/, '')}-${timestamp}${path.extname(safeName)}`;
      fs.copyFileSync(filepath, path.join(backupsDir, backupName));
    }
    const payload = description
      ? { description: description.trim(), tracks: playlist }
      : playlist;
    if (safeName.endsWith('.json')) {
      fs.writeFileSync(filepath, JSON.stringify(payload, null, 2));
    } else {
      const contents = `module.exports = ${JSON.stringify(payload, null, 2)};\n`;
      fs.writeFileSync(filepath, contents);
    }
    return true;
  } catch (error) {
    console.error('Failed to save playlist file:', error.message);
    return false;
  }
}

function resolvePlaylistFileForKey(playlistKey) {
  const fallbackFile = playlistKey === 'bride' ? 'bride-playlist.js' : 'wedding-playlist.js';
  const config = getPlaylistConfig(playlistKey);
  return resolvePlaylistFile(config, fallbackFile);
}

function getThemeFallbackConfig() {
  const config = getEventConfig();
  const themeKey = getThemeKey();
  const themeEvents = ensureEventsForTheme(themeKey);
  const fallbackFile = themeEvents.fallbackPlaylistFile || config.playlists?.primary?.file || 'wedding-playlist.js';
  return {
    themeKey,
    file: fallbackFile,
    label: config.playlists?.autoPlayLabel || 'Auto-Play'
  };
}

function getEventPlaylistFile(activeEvent) {
  if (activeEvent?.playlistFile) {
    return activeEvent.playlistFile;
  }
  return getThemeFallbackConfig().file;
}

function resolveFallbackContext() {
  const activeEvent = getActiveEvent();
  const eventLoop = activeEvent?.loop !== false;
  const eventFile = getEventPlaylistFile(activeEvent);
  const eventPlaylist = loadPlaylistFromFile(resolvePlaylistFile({ file: eventFile }, eventFile));

  const themeFallback = getThemeFallbackConfig();
  const fallbackPlaylist = loadPlaylistFromFile(resolvePlaylistFile({ file: themeFallback.file }, themeFallback.file));

  if (!eventLoop && Array.isArray(eventPlaylist) && fallbackPlaylistIndex >= eventPlaylist.length && Array.isArray(fallbackPlaylist) && fallbackPlaylist.length) {
    if (activeFallbackSource !== 'theme') {
      activeFallbackSource = 'theme';
      fallbackPlaylistIndex = 0;
      currentFallbackIndex = -1;
      suppressedSongs.clear();
    }
    return {
      source: 'theme',
      playlist: fallbackPlaylist,
      loop: true,
      label: themeFallback.label,
      event: activeEvent
    };
  }

  activeFallbackSource = 'event';
  return {
    source: 'event',
    playlist: Array.isArray(eventPlaylist) ? eventPlaylist : [],
    loop: eventLoop,
    label: activeEvent?.name || getPlaylistName(),
    event: activeEvent
  };
}

function buildSearchStringFromSong(song) {
  if (song.search) return song.search;
  if (song.title && song.artist) return `${song.title} ${song.artist}`.trim();
  return song.title || '';
}

function playlistHasSong(playlist, song, searchString) {
  if (!Array.isArray(playlist)) return false;
  const searchLower = (searchString || '').toLowerCase();
  return playlist.some(item => {
    if (!item) return false;
    if (song.videoId && item.videoId && song.videoId === item.videoId) {
      return true;
    }
    if (item.search && searchLower) {
      return item.search.toLowerCase() === searchLower;
    }
    return false;
  });
}

function appendSongToPlaylistFile(song, playlistFile, options) {
  if (!playlistFile) return false;
  const safeName = sanitizePlaylistFilename(path.basename(playlistFile));
  const filepath = path.join(PLAYLISTS_DIR, safeName);
  const playlistData = loadPlaylistData(filepath);
  const playlist = playlistData?.tracks || [];
  const searchString = buildSearchStringFromSong(song);
  if (!searchString) return false;
  if (options?.dedupe && playlistHasSong(playlist, song, searchString)) {
    return false;
  }
  const entry = {
    search: searchString,
    type: options?.type || 'user'
  };
  if (song.videoId) {
    entry.videoId = song.videoId;
  }
  playlist.push(entry);
  return savePlaylistFileToDisk(safeName, playlist, playlistData?.description || '');
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

function loadSystemConfig() {
  if (!fs.existsSync(SYSTEM_CONFIG_FILE)) return { mode: 'headless' };
  try {
    const data = fs.readFileSync(SYSTEM_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(data);
    if (parsed && (parsed.mode === 'headless' || parsed.mode === 'browser')) {
      return parsed;
    }
  } catch (error) {
    console.error('Failed to load system config:', error.message);
  }
  return { mode: 'headless' };
}

function saveSystemConfig(mode) {
  try {
    fs.mkdirSync(path.dirname(SYSTEM_CONFIG_FILE), { recursive: true });
    const payload = { mode, savedAt: new Date().toISOString() };
    fs.writeFileSync(SYSTEM_CONFIG_FILE, JSON.stringify(payload, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to save system config:', error.message);
    return false;
  }
}

function listAudioOutputs() {
  return new Promise((resolve) => {
    execFile('aplay', ['-l'], (error, stdout) => {
      if (error || !stdout) {
        return resolve([
          { id: 'default', name: 'Default', description: 'System default output' }
        ]);
      }

      const outputs = [];
      const lines = stdout.split('\n');
      const deviceLine = /^card\s+(\d+):\s+([^\[]+)\[([^\]]+)\],\s+device\s+(\d+):\s+([^\[]+)\[([^\]]+)\]/;

      for (const line of lines) {
        const match = line.match(deviceLine);
        if (!match) continue;
        const cardId = match[2].trim();
        const cardName = match[3].trim();
        const deviceId = match[4].trim();
        const deviceName = match[6].trim();
        const id = `hw:CARD=${cardId},DEV=${deviceId}`;
        const name = `${cardName} (${deviceName})`;
        const description = `${cardId} / device ${deviceId}`;
        outputs.push({ id, name, description });
      }

      outputs.unshift({ id: 'default', name: 'Default', description: 'System default output' });
      resolve(outputs);
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
const systemConfig = loadSystemConfig();
systemMode = systemConfig.mode || 'headless';
const persistedState = loadPlaylistState();
if (persistedState) {
  if (persistedState.activePlaylist) {
    activePlaylist = persistedState.activePlaylist;
  }
  if (persistedState.activeEventId) {
    activeEventId = persistedState.activeEventId;
  }
  if (persistedState.activeThemeKey) {
    activeThemeKey = persistedState.activeThemeKey;
  }
}
eventConfig = loadEventConfig();

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

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  if (!isAuthEnabled()) {
    return res.redirect('/');
  }
  const passcode = (req.body?.passcode || '').trim();
  if (!passcode || passcode !== AUTH_PASSCODE) {
    return res.redirect('/login?error=1');
  }
  const token = crypto.randomBytes(24).toString('hex');
  authSessions.set(token, { createdAt: Date.now() });
  const nextUrl = req.body?.next ? decodeURIComponent(req.body.next) : '/';
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
  res.redirect(nextUrl || '/');
});

app.get('/logout', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies[AUTH_COOKIE];
  if (token) {
    authSessions.delete(token);
  }
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.redirect('/login');
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

app.get('/playlist-editor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'playlist-editor.html'));
});

app.get('/api/event-config', (req, res) => {
  res.json(getEventConfig());
});

app.post('/api/event-config', (req, res) => {
  const config = req.body;
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'Invalid event config' });
  }
  if (!config.appName || !config.eventName) {
    return res.status(400).json({ error: 'Event config must include appName and eventName' });
  }
  const saved = saveEventConfig(config);
  if (!saved) {
    return res.status(500).json({ error: 'Failed to save event config' });
  }
  if (config.themeKey) {
    activeThemeKey = config.themeKey;
    savePlaylistState({ activePlaylist, activeEventId, activeThemeKey });
  }
  io.emit('eventConfigUpdated', config);
  res.json({ success: true });
});

app.get('/api/events', (req, res) => {
  const { themeKey, events, activeEventId: currentId } = getActiveEventSet();
  const themeFallback = getThemeFallbackConfig();
  res.json({
    themeKey,
    events,
    activeEventId: currentId,
    fallbackPlaylistFile: themeFallback.file,
    fallbackLabel: themeFallback.label
  });
});

app.post('/api/events', (req, res) => {
  const { themeKey, events, activeEventId: requestedActive, fallbackPlaylistFile } = req.body || {};
  if (!themeKey || !Array.isArray(events)) {
    return res.status(400).json({ error: 'themeKey and events are required' });
  }
  const normalizedEvents = events.map(event => ({
    ...event,
    loop: event.loop !== false,
    allowUserInject: !!event.allowUserInject,
    dedupeUserInject: event.dedupeUserInject !== false,
    injectToFallback: event.injectToFallback !== false
  }));
  const config = getEventConfig();
  config.themeKey = themeKey;
  config.eventsByTheme = config.eventsByTheme || {};
  config.eventsByTheme[themeKey] = {
    activeEventId: requestedActive || (events[0] && events[0].id) || null,
    fallbackPlaylistFile: fallbackPlaylistFile || config.eventsByTheme[themeKey]?.fallbackPlaylistFile || config.playlists?.primary?.file || 'wedding-playlist.js',
    events: normalizedEvents
  };
  const saved = saveEventConfig(config);
  if (!saved) {
    return res.status(500).json({ error: 'Failed to save events' });
  }
  activeThemeKey = themeKey;
  activeEventId = config.eventsByTheme[themeKey].activeEventId;
  savePlaylistState({ activePlaylist, activeEventId, activeThemeKey });
  io.emit('eventsUpdated', { themeKey, events, activeEventId });
  res.json({ success: true });
});

app.post('/api/events/active', (req, res) => {
  const { id } = req.body || {};
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Event id is required' });
  }
  const ok = setActiveEvent(id);
  if (!ok) {
    return res.status(400).json({ error: 'Unknown event id' });
  }
  const activeEvent = getActiveEvent();
  io.emit('eventSwitched', { id, name: activeEvent?.name || id });
  res.json({ success: true, activeEventId: activeEventId });
});

app.post('/api/events/next', (req, res) => {
  const { events, activeEventId: currentId } = getActiveEventSet();
  if (!events.length) {
    return res.status(400).json({ error: 'No events configured' });
  }
  const currentIndex = events.findIndex(event => event.id === currentId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % events.length : 0;
  const nextEvent = events[nextIndex];
  setActiveEvent(nextEvent.id);
  io.emit('eventSwitched', { id: nextEvent.id, name: nextEvent.name });
  res.json({ success: true, activeEventId: nextEvent.id });
});

app.get('/api/event-presets', (req, res) => {
  const presets = loadEventPresets();
  res.json({ presets });
});

app.post('/api/event-presets', (req, res) => {
  const { key, preset } = req.body || {};
  if (!key || typeof key !== 'string' || !preset || typeof preset !== 'object') {
    return res.status(400).json({ error: 'Invalid preset payload' });
  }
  const presets = loadEventPresets();
  presets[key] = preset;
  const saved = saveEventPresets(presets);
  if (!saved) {
    return res.status(500).json({ error: 'Failed to save preset' });
  }
  res.json({ success: true });
});

app.get('/api/playlists/files', (req, res) => {
  const files = listPlaylistFiles();
  const payload = files.map((file) => {
    const filepath = path.join(PLAYLISTS_DIR, file);
    const data = loadPlaylistData(filepath);
    return {
      file,
      description: data?.description || ''
    };
  });
  res.json({ files: payload });
});

app.post('/api/ai/tag-track', async (req, res) => {
  try {
    const { videoId, title, artist, album, duration_sec, source, search, force } = req.body || {};
    if (!title || !artist) {
      return res.status(400).json({ error: 'title and artist are required' });
    }

    const cache = loadTagCache();
    if (!force && videoId && cache[videoId]) {
      return res.json({ ...cache[videoId], cached: true });
    }

    const payload = {
      title,
      artist,
      album: album || null,
      duration_sec: Number.isFinite(duration_sec) ? duration_sec : null,
      source: source || { provider: 'youtube', uri: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null },
      search: search || `${title} ${artist}`.trim()
    };

    let result;
    try {
      result = await tagTrackWithAI(payload);
    } catch (error) {
      console.error('Tagging error:', error.message);
      result = fallbackTags(payload);
    }

    const responsePayload = {
      tags: result.tags,
      confidence: result.confidence,
      cached: false,
      fallback: !!result.fallback,
      updatedAt: new Date().toISOString()
    };

    if (videoId) {
      cache[videoId] = responsePayload;
      saveTagCache(cache);
    }

    res.json(responsePayload);
  } catch (error) {
    console.error('Tagging error:', error.message);
    res.status(500).json({ error: 'Failed to tag track' });
  }
});

app.get('/api/playlists/file', (req, res) => {
  const name = req.query.name;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Missing playlist file name' });
  }
  const safeName = sanitizePlaylistFilename(name);
  const filepath = path.join(PLAYLISTS_DIR, safeName);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Playlist file not found' });
  }
  const data = loadPlaylistData(filepath);
  const playlist = data?.tracks;
  if (!Array.isArray(playlist)) {
    return res.status(400).json({ error: 'Playlist file is invalid' });
  }
  res.json({ playlist, filename: safeName, description: data?.description || '' });
});

app.post('/api/playlists/file', (req, res) => {
  const { name, playlist, description } = req.body || {};
  if (!name || typeof name !== 'string' || !Array.isArray(playlist)) {
    return res.status(400).json({ error: 'Invalid playlist payload' });
  }
  const safeName = sanitizePlaylistFilename(name);
  if (!safeName.endsWith('.js') && !safeName.endsWith('.json')) {
    return res.status(400).json({ error: 'Playlist file must be .js or .json' });
  }

  try {
    let finalDescription = typeof description === 'string' ? description : '';
    if (!finalDescription) {
      const existing = loadPlaylistData(path.join(PLAYLISTS_DIR, safeName));
      if (existing?.description) {
        finalDescription = existing.description;
      }
    }
    const saved = savePlaylistFileToDisk(safeName, playlist, finalDescription);
    if (!saved) {
      throw new Error('Failed to save playlist file');
    }
    res.json({ success: true, filename: safeName, description: finalDescription });
  } catch (error) {
    console.error('Failed to save playlist file:', error.message);
    res.status(500).json({ error: 'Failed to save playlist file' });
  }
});

app.post('/api/playlists/upload', (req, res) => {
  playlistUpload.single('playlist')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ success: true, filename: req.file.filename });
  });
});

app.post('/api/oauth', (req, res) => {
  try {
    const { curl } = req.body || {};
    if (!curl || typeof curl !== 'string') {
      return res.status(400).json({ error: 'Missing cURL content' });
    }
    const headersFromCurl = parseCurlHeaders(curl);
    let headerBlock = '';
    if (Object.keys(headersFromCurl).length) {
      headerBlock = buildHeaderBlockFromHeaders(headersFromCurl);
    } else {
      headerBlock = normalizeHeaderBlock(curl);
      if (!headerBlock) {
        return res.status(400).json({ error: 'No headers found in cURL' });
      }
      headerBlock = lowercaseHeaderBlock(headerBlock);
    }
    const headers = Object.keys(headersFromCurl).length
      ? headersFromCurl
      : parseHeaderBlock(headerBlock);
    const cookie = headers['cookie'];
    const authUser = headers['x-goog-authuser'];
    if (!cookie || !authUser) {
      return res.status(400).json({ error: 'Missing cookie or X-Goog-AuthUser header in cURL' });
    }

    if (fs.existsSync(OAUTH_FILE)) {
      const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
      const backupPath = `${OAUTH_FILE}.${ts}`;
      fs.copyFileSync(OAUTH_FILE, backupPath);
    }

    const { cmd, cwd, env } = getPythonCommand();
    const python = spawn(cmd, [
      'youtube_music_service.py',
      'setup_auth',
      '--output', OAUTH_FILE
    ], { cwd, env });

    let out = '';
    let error = '';
    python.stdout.on('data', (chunk) => { out += chunk.toString(); });
    python.stderr.on('data', (chunk) => { error += chunk.toString(); });
    python.stdin.write(headerBlock);
    python.stdin.end();

    python.on('close', (code) => {
      if (code !== 0) {
        console.error('OAuth setup error:', error || out);
        return res.status(500).json({ error: 'Failed to create oauth.json', details: error || out });
      }
      return res.json({ success: true });
    });

    python.on('error', (err) => {
      console.error('OAuth setup process error:', err);
      res.status(500).json({ error: 'Failed to start oauth setup' });
    });
  } catch (error) {
    console.error('Failed to save oauth.json:', error.message);
    res.status(500).json({ error: 'Failed to save oauth.json' });
  }
});

app.get('/api/oauth', (req, res) => {
  try {
    if (!fs.existsSync(OAUTH_FILE)) {
      return res.json({ exists: false });
    }
    const raw = fs.readFileSync(OAUTH_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const cookie = getHeaderValueCaseInsensitive(parsed, 'cookie');
    return res.json({
      exists: true,
      authUser: getHeaderValueCaseInsensitive(parsed, 'x-goog-authuser') || '0',
      origin: getHeaderValueCaseInsensitive(parsed, 'x-origin') || '',
      cookieLength: cookie.length,
      hasUserAgent: Boolean(getHeaderValueCaseInsensitive(parsed, 'user-agent'))
    });
  } catch (error) {
    console.error('Failed to read oauth.json:', error.message);
    res.status(500).json({ error: 'Failed to read oauth.json' });
  }
});

app.get('/api/oauth/test', (req, res) => {
  try {
    if (!fs.existsSync(OAUTH_FILE)) {
      return res.status(400).json({ error: 'oauth.json not found' });
    }
    const { cmd, cwd, env } = getPythonCommand();
    const python = spawn(cmd, [
      'youtube_music_service.py',
      'search',
      '--query', 'Taylor Swift',
      '--limit', '1',
      '--auth', OAUTH_FILE
    ], { cwd, env });

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
        console.error('OAuth test error:', error);
        return res.status(500).json({ error: 'Auth test failed', details: error || 'Unknown error' });
      }
      try {
        const parsed = JSON.parse(data);
        const count = Array.isArray(parsed.results) ? parsed.results.length : 0;
        if (!count) {
          return res.status(500).json({ error: 'Auth test returned no results', details: JSON.stringify(parsed).slice(0, 500) });
        }
        return res.json({ success: true, results: count });
      } catch (parseError) {
        console.error('Failed to parse OAuth test response:', parseError);
        return res.status(500).json({ error: 'Auth test parse failed', details: data.slice(0, 500) });
      }
    });

    python.on('error', (err) => {
      console.error('OAuth test process error:', err);
      res.status(500).json({ error: 'Auth test failed to start' });
    });
  } catch (error) {
    console.error('OAuth test failed:', error.message);
    res.status(500).json({ error: 'Auth test failed' });
  }
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

app.get('/api/system-mode', (req, res) => {
  res.json({ mode: systemMode || 'headless' });
});

app.post('/api/system-mode', (req, res) => {
  const { mode } = req.body || {};
  if (mode !== 'headless' && mode !== 'browser') {
    return res.status(400).json({ error: 'Invalid mode' });
  }
  systemMode = mode;
  const saved = saveSystemConfig(mode);
  if (!saved) {
    return res.status(500).json({ error: 'Failed to save system mode' });
  }
  io.emit('systemModeUpdated', { mode });
  res.json({ success: true, mode });
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
        const thumbnailFile = meta?.thumbnailFile || null;
        return {
          name,
          sizeBytes: stats.size,
          modified: stats.mtime.toISOString(),
          title: meta?.title || null,
          artist: meta?.artist || null,
          youtubeId: meta?.youtubeId || youtubeId,
          thumbnailFile: thumbnailFile,
          thumbnailUrl: thumbnailFile ? `/api/cache/file/${encodeURIComponent(thumbnailFile)}` : null
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

app.post('/api/cache/rebuild-thumbnails', async (req, res) => {
  try {
    console.log('🖼️ Rebuild thumbnails requested');
    if (!fs.existsSync(AUDIO_CACHE_DIR)) {
      console.log('🖼️ No audio cache directory found');
      return res.json({ success: true, rebuilt: 0 });
    }

    const manifest = loadCacheManifest();
    const files = fs.readdirSync(AUDIO_CACHE_DIR).filter(name => name.endsWith('.mp3'));
    let rebuilt = 0;

    console.log(`🖼️ Rebuilding thumbnails for ${files.length} cached tracks`);

    for (const name of files) {
      const youtubeId = name.replace('.mp3', '');
      const entry = manifest[youtubeId] || Object.values(manifest).find(item => item.filename === name) || null;
      if (!entry || !entry.albumArt) continue;

      try {
        const filename = entry.thumbnailFile || `${youtubeId}.jpg`;
        const filepath = path.join(AUDIO_CACHE_DIR, filename);
        if (fs.existsSync(filepath)) {
          continue;
        }

        const url = entry.albumArt;
        const client = url.startsWith('https') ? https : httpClient;

        await new Promise((resolve, reject) => {
          const file = fs.createWriteStream(filepath);
          client.get(url, (response) => {
            if (response.statusCode !== 200) {
              file.close();
              fs.unlink(filepath, () => {});
              reject(new Error(`Thumbnail download failed: ${response.statusCode}`));
              return;
            }
            response.pipe(file);
            file.on('finish', () => {
              file.close();
              entry.thumbnailFile = filename;
              resolve();
            });
            file.on('error', (err) => {
              fs.unlink(filepath, () => {});
              reject(err);
            });
          }).on('error', (err) => {
            fs.unlink(filepath, () => {});
            reject(err);
          });
        });

        rebuilt += 1;
      } catch (error) {
        console.error('Failed to rebuild thumbnail for', name, error.message);
      }
    }

    saveCacheManifest(manifest);
    console.log(`🖼️ Thumbnail rebuild complete. Rebuilt: ${rebuilt}`);
    res.json({ success: true, rebuilt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to rebuild thumbnails' });
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

    const activeEvent = getActiveEvent();
    const allowInject = !!activeEvent?.allowUserInject;
    if (allowInject && currentlyPlaying && currentlyPlaying.type !== 'mic-break') {
      const dedupe = activeEvent?.dedupeUserInject !== false;
      const injectToFallback = activeEvent?.injectToFallback !== false;
      const eventFile = getEventPlaylistFile(activeEvent);
      appendSongToPlaylistFile(currentlyPlaying, eventFile, { dedupe, type: 'user' });
      if (injectToFallback) {
        const themeFallback = getThemeFallbackConfig();
        if (themeFallback.file && themeFallback.file !== eventFile) {
          appendSongToPlaylistFile(currentlyPlaying, themeFallback.file, { dedupe, type: 'user' });
        }
      }
    }
    
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
  const activeConfig = getPlaylistConfig(activePlaylist);
  
  io.emit('playlistReset', { 
    message: `${activeConfig.label} reset to beginning`,
    index: fallbackPlaylistIndex 
  });
  
  res.json({ 
    success: true, 
    message: `${activeConfig.label} reset to beginning`,
    index: fallbackPlaylistIndex 
  });
});

app.get('/api/playlist/status', (req, res) => {
  const context = resolveFallbackContext();
  const playlist = context.playlist;
  const activeEvent = context.event;
  const shouldLoop = context.loop;
  const hasCurrent = currentFallbackIndex >= 0;
  const displayIndex = hasCurrent ? currentFallbackIndex : fallbackPlaylistIndex;
  const nextIndex = hasCurrent
    ? (shouldLoop ? (currentFallbackIndex + 1) % playlist.length : (currentFallbackIndex + 1))
    : fallbackPlaylistIndex;
  const eventComplete = !shouldLoop && playlist.length > 0 && fallbackPlaylistIndex >= playlist.length
    && (currentFallbackIndex >= playlist.length - 1 || currentFallbackIndex === -1);
  
  res.json({
    currentIndex: displayIndex,
    totalSongs: playlist.length,
    currentSong: hasCurrent && displayIndex < playlist.length ? playlist[displayIndex] : null,
    nextSong: nextIndex < playlist.length ? playlist[nextIndex] : null,
    fallbackMode: fallbackMode,
    activePlaylist: activePlaylist,
    playlistName: context.source === 'theme' ? context.label : getPlaylistName(),
    activeEventId: activeEvent?.id || null,
    activeEventName: activeEvent?.name || null,
    loop: shouldLoop,
    fallbackSource: context.source,
    eventComplete: eventComplete
  });
});

// New endpoint for getting pre-resolved fallback songs
app.get('/api/playlist/next-resolved', async (req, res) => {
  try {
    const context = resolveFallbackContext();
    const activeEvent = context.event;
    const shouldLoop = context.loop;
    const playlist = context.playlist;
    if (playlist.length === 0) {
      return res.json({ nextSong: null });
    }

    if (!shouldLoop && fallbackPlaylistIndex >= playlist.length) {
      return res.json({ nextSong: null });
    }
    
    // Get the next song that would be played
    let nextIndex = fallbackPlaylistIndex;
    let attempts = 0;
    const maxAttempts = playlist.length;
    
    // Find next non-suppressed song
    while (attempts < maxAttempts && suppressedSongs.has(nextIndex)) {
      nextIndex = shouldLoop ? (nextIndex + 1) % playlist.length : nextIndex + 1;
      attempts++;
      if (!shouldLoop && nextIndex >= playlist.length) {
        return res.json({ nextSong: null });
      }
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
        addedBy: context.source === 'theme'
          ? context.label
          : (activeEvent?.addedBy || `${activeEvent?.name || getPlaylistName()} Auto-Play`),
        addedAt: new Date().toISOString(),
        source: 'fallback',
        type: playlistItem.type,
        playlist: context.source === 'theme'
          ? `${context.event?.id || getThemeKey()}-fallback`
          : (activeEvent?.id || activePlaylist),
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
  
  const eventSet = getActiveEventSet();
  const eventMatch = eventSet.events.find(event => event.id === playlist);
  if (eventMatch) {
    setActiveEvent(eventMatch.id);
    const playlistName = getPlaylistName();
    io.emit('playlistSwitch', {
      message: `Switched to ${playlistName}`,
      playlist: eventMatch.id,
      playlistName: playlistName
    });
    return res.json({
      success: true,
      message: `Switched to ${playlistName}`,
      playlist: eventMatch.id,
      playlistName: playlistName
    });
  }

  if (playlist !== 'wedding' && playlist !== 'bride') {
    return res.status(400).json({ error: 'Invalid playlist. Must be "wedding" or "bride"' });
  }
  
  activePlaylist = playlist;
  fallbackPlaylistIndex = 0;
  currentFallbackIndex = -1;
  // Clear suppressed songs when switching playlists
  suppressedSongs.clear();
  savePlaylistState({ activePlaylist, activeEventId, activeThemeKey });
  
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
    if (playlistName !== 'wedding' && playlistName !== 'bride') {
      return res.status(400).json({ error: 'Invalid playlist name' });
    }

    const filepath = resolvePlaylistFileForKey(playlistName);
    const loaded = loadPlaylistFromFile(filepath);
    const fallback = playlistName === 'bride' ? BRIDE_PLAYLIST : WEDDING_PLAYLIST;
    const playlist = Array.isArray(loaded) ? loaded : fallback;
    
    res.json({
      success: true,
      playlist: playlist,
      playlistName: playlistName,
      file: filepath ? path.basename(filepath) : null
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
    
    if (playlistName !== 'wedding' && playlistName !== 'bride') {
      return res.status(400).json({ error: 'Invalid playlist name' });
    }
    
    const filepath = resolvePlaylistFileForKey(playlistName) || path.join(__dirname, playlistName === 'bride' ? 'bride-playlist.js' : 'wedding-playlist.js');
    const filename = path.basename(filepath);
    const constantName = playlistName === 'wedding' ? 'WEDDING_PLAYLIST' : 'BRIDE_PLAYLIST';

    // Backup existing playlist file
    try {
      if (fs.existsSync(filepath)) {
        const backupsDir = path.join(__dirname, 'data', 'playlist-backups');
        fs.mkdirSync(backupsDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `${filename.replace(/\\.(js|json)$/, '')}-${timestamp}${path.extname(filename)}`;
        fs.copyFileSync(filepath, path.join(backupsDir, backupName));
      }
    } catch (error) {
      console.error('Failed to backup playlist file:', error.message);
    }
    
    if (filepath.endsWith('.json')) {
      fs.writeFileSync(filepath, JSON.stringify(playlist, null, 2));
    } else {
      const fileContent = `const ${constantName} = ${JSON.stringify(playlist, null, 2)};

module.exports = ${constantName};
`;
      fs.writeFileSync(filepath, fileContent);
    }

    // Update in-memory playlist for default fallbacks
    if (playlistName === 'wedding') {
      WEDDING_PLAYLIST.length = 0;
      WEDDING_PLAYLIST.push(...playlist);
    } else if (playlistName === 'bride') {
      BRIDE_PLAYLIST.length = 0;
      BRIDE_PLAYLIST.push(...playlist);
    }
    
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
      totalSongs: playlist.length,
      file: filename
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
    if (playlistName !== 'wedding' && playlistName !== 'bride') {
      return res.status(400).json({ error: 'Invalid playlist name' });
    }
    const filepath = resolvePlaylistFileForKey(playlistName);
    const loaded = loadPlaylistFromFile(filepath);
    const fallback = playlistName === 'bride' ? BRIDE_PLAYLIST : WEDDING_PLAYLIST;
    const playlist = Array.isArray(loaded) ? loaded : fallback;
    
    // Add song at specified position or end
    if (position !== undefined && position >= 0 && position <= playlist.length) {
      playlist.splice(position, 0, newSong);
    } else {
      playlist.push(newSong);
    }
    
    // Save the updated playlist
    const constantName = playlistName === 'wedding' ? 'WEDDING_PLAYLIST' : 'BRIDE_PLAYLIST';
    const targetPath = filepath || path.join(__dirname, playlistName === 'bride' ? 'bride-playlist.js' : 'wedding-playlist.js');
    if (targetPath.endsWith('.json')) {
      fs.writeFileSync(targetPath, JSON.stringify(playlist, null, 2));
    } else {
      const fileContent = `const ${constantName} = ${JSON.stringify(playlist, null, 2)};

module.exports = ${constantName};
`;
      fs.writeFileSync(targetPath, fileContent);
    }
    
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
    if (playlistName !== 'wedding' && playlistName !== 'bride') {
      return res.status(400).json({ error: 'Invalid playlist name' });
    }
    const filepath = resolvePlaylistFileForKey(playlistName);
    const loaded = loadPlaylistFromFile(filepath);
    const fallback = playlistName === 'bride' ? BRIDE_PLAYLIST : WEDDING_PLAYLIST;
    const playlist = Array.isArray(loaded) ? loaded : fallback;
    
    if (songIndex < 0 || songIndex >= playlist.length) {
      return res.status(400).json({ error: 'Invalid song index' });
    }
    
    // Remove song
    const removedSong = playlist.splice(songIndex, 1)[0];
    
    // Save the updated playlist
    const constantName = playlistName === 'wedding' ? 'WEDDING_PLAYLIST' : 'BRIDE_PLAYLIST';
    const targetPath = filepath || path.join(__dirname, playlistName === 'bride' ? 'bride-playlist.js' : 'wedding-playlist.js');
    if (targetPath.endsWith('.json')) {
      fs.writeFileSync(targetPath, JSON.stringify(playlist, null, 2));
    } else {
      const fileContent = `const ${constantName} = ${JSON.stringify(playlist, null, 2)};

module.exports = ${constantName};
`;
      fs.writeFileSync(targetPath, fileContent);
    }
    
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
    if (playlistName !== 'wedding' && playlistName !== 'bride') {
      return res.status(400).json({ error: 'Invalid playlist name' });
    }
    const filepath = resolvePlaylistFileForKey(playlistName);
    const loaded = loadPlaylistFromFile(filepath);
    const fallback = playlistName === 'bride' ? BRIDE_PLAYLIST : WEDDING_PLAYLIST;
    const playlist = Array.isArray(loaded) ? loaded : fallback;
    
    if (fromIndex < 0 || fromIndex >= playlist.length || toIndex < 0 || toIndex >= playlist.length) {
      return res.status(400).json({ error: 'Invalid indices' });
    }
    
    // Move song from fromIndex to toIndex
    const [movedSong] = playlist.splice(fromIndex, 1);
    playlist.splice(toIndex, 0, movedSong);
    
    // Save the updated playlist
    const constantName = playlistName === 'wedding' ? 'WEDDING_PLAYLIST' : 'BRIDE_PLAYLIST';
    const targetPath = filepath || path.join(__dirname, playlistName === 'bride' ? 'bride-playlist.js' : 'wedding-playlist.js');
    if (targetPath.endsWith('.json')) {
      fs.writeFileSync(targetPath, JSON.stringify(playlist, null, 2));
    } else {
      const fileContent = `const ${constantName} = ${JSON.stringify(playlist, null, 2)};

module.exports = ${constantName};
`;
      fs.writeFileSync(targetPath, fileContent);
    }
    
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

app.get('/api/volume', requireAuthApi, (req, res) => {
  res.json({
    volume: typeof lastKnownVolumePercent === 'number' ? lastKnownVolumePercent : null
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
const emitUserCount = () => {
  const count = connectedUsers.size;
  io.emit('userCount', count);
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  connectedUsers.add(socket.id);

  if (typeof lastKnownVolumePercent === 'number') {
    socket.emit('volumeUpdated', { volume: lastKnownVolumePercent, source: 'server-sync' });
  }
  
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

  socket.on('audioServiceConnected', () => {
    audioServiceSockets.add(socket.id);
    connectedUsers.delete(socket.id);
    emitUserCount();
  });

  socket.on('requestVolumeSync', () => {
    if (typeof lastKnownVolumePercent === 'number') {
      socket.emit('volumeUpdated', { volume: lastKnownVolumePercent, source: 'server-sync' });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    audioServiceSockets.delete(socket.id);
    connectedUsers.delete(socket.id);
    emitUserCount();
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
    // Broadcast volume update to all clients so they sync their UI
    if (data && typeof data.volume === 'number') {
      const volumePercent = Math.round(data.volume * 100);
      lastKnownVolumePercent = volumePercent;
      io.emit('volumeUpdated', { volume: volumePercent, sourceId: socket.id });
    }
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
    // Also broadcast volume updates when audio service reports volume changes
    if (data && typeof data.volume === 'number') {
      const volumePercent = Math.round(data.volume * 100);
      lastKnownVolumePercent = volumePercent;
      io.emit('volumeUpdated', { volume: volumePercent, source: 'audio-service' });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Virtual Jukebox server running on port ${PORT}`);
});

// Fallback playlist functionality
function getCurrentPlaylist() {
  const activeEvent = getActiveEvent();
  const eventFile = getEventPlaylistFile(activeEvent);
  const eventPlaylist = loadPlaylistFromFile(resolvePlaylistFile({ file: eventFile }, eventFile));
  if (Array.isArray(eventPlaylist)) {
    return eventPlaylist;
  }

  const primaryConfig = getPlaylistConfig('wedding');
  const secondaryConfig = getPlaylistConfig('bride');
  const primaryFile = resolvePlaylistFile(primaryConfig, 'wedding-playlist.js');
  const secondaryFile = resolvePlaylistFile(secondaryConfig, 'bride-playlist.js');
  const primaryPlaylist = loadPlaylistFromFile(primaryFile) || WEDDING_PLAYLIST;
  const secondaryPlaylist = loadPlaylistFromFile(secondaryFile) || BRIDE_PLAYLIST;
  return activePlaylist === 'wedding' ? primaryPlaylist : secondaryPlaylist;
}

function getPlaylistName() {
  const activeEvent = getActiveEvent();
  if (activeEvent?.name) {
    return activeEvent.name;
  }
  return getPlaylistConfig(activePlaylist).name;
}

async function getNextFallbackSong() {
  const context = resolveFallbackContext();
  const activeEvent = context.event;
  const shouldLoop = context.loop;
  const playlist = context.playlist;
  if (playlist.length === 0) return null;

  if (!shouldLoop && fallbackPlaylistIndex >= playlist.length) {
    return null;
  }
  
  // Find next non-suppressed song
  let attempts = 0;
  const maxAttempts = playlist.length; // Prevent infinite loop
  
  while (attempts < maxAttempts) {
    if (!shouldLoop && fallbackPlaylistIndex >= playlist.length) {
      return null;
    }
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
            addedBy: context.source === 'theme'
              ? context.label
              : (activeEvent?.addedBy || `${activeEvent?.name || getPlaylistName()} Auto-Play`),
            addedAt: new Date().toISOString(),
            source: 'fallback',
            type: playlistItem.type,
            playlist: context.source === 'theme'
              ? `${context.event?.id || getThemeKey()}-fallback`
              : (activeEvent?.id || activePlaylist),
            playlistIndex: fallbackPlaylistIndex // Track which playlist song this is
          };
          
          // Set current playing index to the song we're about to play
          currentFallbackIndex = fallbackPlaylistIndex;
          // Increment index for next time
          fallbackPlaylistIndex = shouldLoop
            ? (fallbackPlaylistIndex + 1) % playlist.length
            : fallbackPlaylistIndex + 1;
          
          return fallbackSong;
        }
      } catch (error) {
        console.error('Error searching for fallback song:', error);
      }
    }
    
    // Move to next song (either because current was suppressed or failed to load)
    fallbackPlaylistIndex = shouldLoop
      ? (fallbackPlaylistIndex + 1) % playlist.length
      : fallbackPlaylistIndex + 1;
    attempts++;
  }
  
  // If all songs are suppressed, return null
  return null;
}

// YouTube Music integration functions
async function searchYouTubeMusic(query, limit = 10) {
  return new Promise((resolve, reject) => {
    const { cmd, cwd, env } = getPythonCommand();
    const python = spawn(cmd, [
      'youtube_music_service.py',
      'search',
      '--query', query,
      '--limit', limit.toString()
    ], { cwd, env });

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
