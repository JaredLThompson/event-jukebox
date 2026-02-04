const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const playlistFileSelect = document.getElementById('playlistFileSelect');
const loadPlaylistBtn = document.getElementById('loadPlaylistBtn');
const savePlaylistBtn = document.getElementById('savePlaylistBtn');
const tagMissingBtn = document.getElementById('tagMissingBtn');
const playlistItems = document.getElementById('playlistItems');
const previewPlayerEl = document.getElementById('previewPlayer');
const previewTitle = document.getElementById('previewTitle');
const previewTime = document.getElementById('previewTime');
const previewDuration = document.getElementById('previewDuration');
const previewProgress = document.getElementById('previewProgress');
const playPreviewBtn = document.getElementById('playPreviewBtn');
const pausePreviewBtn = document.getElementById('pausePreviewBtn');
const stopPreviewBtn = document.getElementById('stopPreviewBtn');
const newPlaylistName = document.getElementById('newPlaylistName');
const createPlaylistBtn = document.getElementById('createPlaylistBtn');
const duplicatePlaylistName = document.getElementById('duplicatePlaylistName');
const duplicatePlaylistBtn = document.getElementById('duplicatePlaylistBtn');

let currentPlaylist = [];
let previewPlayer = null;
let previewTimer = null;
let currentPreviewVideo = null;
let tagQueue = new Map();
let tagQueue = new Map();

const showToast = (message, tone = 'info') => {
  const toast = document.createElement('div');
  toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg text-white font-semibold z-50 ${
    tone === 'success' ? 'bg-green-600' : tone === 'error' ? 'bg-red-600' : 'bg-slate-700'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

const formatSearch = (song) => `${song.title} ${song.artist || ''}`.trim();

async function loadPlaylistFiles() {
  const response = await fetch('/api/playlists/files');
  const data = await response.json();
  const files = data.files || [];
  playlistFileSelect.innerHTML = files.map(file => `<option value="${file}">${file}</option>`).join('');
}

async function loadPlaylist() {
  const name = playlistFileSelect.value;
  if (!name) return;
  const response = await fetch(`/api/playlists/file?name=${encodeURIComponent(name)}`);
  if (!response.ok) {
    showToast('Failed to load playlist', 'error');
    return;
  }
  const data = await response.json();
  currentPlaylist = Array.isArray(data.playlist) ? data.playlist : [];
  renderPlaylist();
}

function renderPlaylist() {
  playlistItems.innerHTML = '';
  if (!currentPlaylist.length) {
    playlistItems.innerHTML = '<div class="text-sm text-slate-400">No items yet.</div>';
    return;
  }

  currentPlaylist.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'bg-slate-800 border border-slate-700 rounded-lg p-3 flex items-start gap-2';
    const tagSummary = item.tags
      ? `Energy ${item.tags.energy} · ${item.tags.pace}${item.tags.intent?.length ? ` · ${item.tags.intent.join(', ')}` : ''}`
      : 'Tags not generated';
    const tagsJson = item.tags ? JSON.stringify(item.tags, null, 2) : '';
    row.innerHTML = `
      <div class="text-xs text-slate-500 mt-1">${index + 1}</div>
      <div class="flex-1">
        <input data-index="${index}" class="playlist-search w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm" value="${item.search || ''}" />
        <input data-index="${index}" class="playlist-type w-full mt-2 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs" value="${item.type || ''}" placeholder="Type (optional)" />
        <div class="mt-2 text-xs text-slate-400">${tagSummary}</div>
        <div class="mt-2 hidden" data-tags-panel="${index}">
          <textarea data-index="${index}" class="playlist-tags w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-xs h-28" placeholder="Edit tags JSON">${tagsJson}</textarea>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <button data-toggle-tags="${index}" class="text-slate-300 hover:text-slate-200 px-2 text-xs">Tags</button>
        <button data-remove="${index}" class="text-red-300 hover:text-red-200 px-2">✕</button>
      </div>
    `;
    playlistItems.appendChild(row);
  });

  new Sortable(playlistItems, {
    animation: 150,
    onEnd: (evt) => {
      const moved = currentPlaylist.splice(evt.oldIndex, 1)[0];
      currentPlaylist.splice(evt.newIndex, 0, moved);
      renderPlaylist();
    }
  });
}

async function savePlaylist() {
  const name = playlistFileSelect.value;
  if (!name) {
    showToast('Select a playlist file', 'error');
    return;
  }

  const sanitized = currentPlaylist.map(item => ({
    search: item.search,
    type: item.type || 'custom',
    tags: item.tags,
    confidence: item.confidence,
    source: item.source,
    title: item.title,
    artist: item.artist,
    album: item.album,
    duration_sec: item.duration_sec,
    videoId: item.videoId
  }));

  const response = await fetch('/api/playlists/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, playlist: sanitized })
  });

  if (!response.ok) {
    showToast('Failed to save playlist', 'error');
    return;
  }

  showToast('Playlist saved', 'success');
}

function setPreview(song) {
  if (!song || !song.videoId) return;
  previewTitle.textContent = `${song.title} — ${song.artist || ''}`.trim();
  currentPreviewVideo = song.videoId;
  if (previewPlayer) {
    previewPlayer.loadVideoById(song.videoId);
  }
}

function stopPreview() {
  currentPreviewVideo = null;
  if (previewPlayer) {
    previewPlayer.stopVideo();
  }
  previewTitle.textContent = 'No track selected';
  previewTime.textContent = '0:00';
  previewDuration.textContent = '0:00';
  previewProgress.style.width = '0%';
}

async function searchYouTube() {
  const query = searchInput.value.trim();
  if (!query) return;
  searchResults.innerHTML = '<div class="text-sm text-slate-400">Searching...</div>';
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=10`);
  if (!response.ok) {
    searchResults.innerHTML = '<div class="text-sm text-red-300">Search failed.</div>';
    return;
  }
  const data = await response.json();
  const results = data.results || [];

  if (!results.length) {
    searchResults.innerHTML = '<div class="text-sm text-slate-400">No results.</div>';
    return;
  }

  searchResults.innerHTML = results.map(result => `
    <div class="bg-slate-800 border border-slate-700 rounded-lg p-3 flex items-center gap-3">
      <img src="${result.thumbnail || ''}" alt="" class="w-14 h-14 rounded-lg object-cover" />
      <div class="flex-1">
        <div class="font-semibold text-sm">${result.title}</div>
        <div class="text-xs text-slate-400">${result.artist || ''}</div>
      </div>
      <div class="flex gap-2">
        <button data-preview="${result.videoId}" class="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-2 rounded">Preview</button>
        <button data-add="${result.videoId}" class="bg-emerald-600 hover:bg-emerald-500 text-xs px-3 py-2 rounded">Add</button>
      </div>
    </div>
  `).join('');

  searchResults.querySelectorAll('[data-preview]').forEach(btn => {
    btn.addEventListener('click', () => {
      const videoId = btn.getAttribute('data-preview');
      const song = results.find(item => item.videoId === videoId);
      setPreview(song);
    });
  });

searchResults.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const videoId = btn.getAttribute('data-add');
      const song = results.find(item => item.videoId === videoId);
      if (!song) return;
      const newItem = {
        search: formatSearch(song),
        type: 'custom',
        source: { provider: 'youtube', uri: `https://www.youtube.com/watch?v=${song.videoId}` },
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration_sec: song.duration ? Number(song.duration) : null,
        videoId: song.videoId
      };
      currentPlaylist.unshift(newItem);
      renderPlaylist();
      queueTagging(newItem, 0);
    });
  });
}

playlistItems.addEventListener('input', (event) => {
  const target = event.target;
  const index = parseInt(target.getAttribute('data-index'), 10);
  if (Number.isNaN(index)) return;
  if (target.classList.contains('playlist-search')) {
    currentPlaylist[index].search = target.value;
  }
  if (target.classList.contains('playlist-type')) {
    currentPlaylist[index].type = target.value;
  }
  if (target.classList.contains('playlist-tags')) {
    try {
      const parsed = JSON.parse(target.value);
      currentPlaylist[index].tags = parsed;
      renderPlaylist();
    } catch {
      // Ignore invalid JSON while typing
    }
  }
});

playlistItems.addEventListener('click', (event) => {
  const toggle = event.target.closest('button[data-toggle-tags]');
  if (toggle) {
    const idx = toggle.getAttribute('data-toggle-tags');
    const panel = playlistItems.querySelector(`[data-tags-panel="${idx}"]`);
    if (panel) {
      panel.classList.toggle('hidden');
    }
    return;
  }
  const button = event.target.closest('button[data-remove]');
  if (!button) return;
  const index = parseInt(button.getAttribute('data-remove'), 10);
  currentPlaylist.splice(index, 1);
  renderPlaylist();
});

searchBtn.addEventListener('click', searchYouTube);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    searchYouTube();
  }
});
loadPlaylistBtn.addEventListener('click', loadPlaylist);
savePlaylistBtn.addEventListener('click', savePlaylist);
if (tagMissingBtn) {
  tagMissingBtn.addEventListener('click', tagMissingSongs);
}
stopPreviewBtn.addEventListener('click', stopPreview);
playPreviewBtn.addEventListener('click', () => previewPlayer && previewPlayer.playVideo());
pausePreviewBtn.addEventListener('click', () => previewPlayer && previewPlayer.pauseVideo());

createPlaylistBtn.addEventListener('click', async () => {
  const name = (newPlaylistName.value || '').trim();
  if (!name) {
    showToast('Enter a filename', 'error');
    return;
  }
  const response = await fetch('/api/playlists/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, playlist: [] })
  });
  if (!response.ok) {
    showToast('Failed to create playlist', 'error');
    return;
  }
  await loadPlaylistFiles();
  playlistFileSelect.value = name;
  currentPlaylist = [];
  renderPlaylist();
  newPlaylistName.value = '';
  showToast('Playlist created', 'success');
});

duplicatePlaylistBtn.addEventListener('click', async () => {
  const name = (duplicatePlaylistName.value || '').trim();
  if (!name) {
    showToast('Enter a filename', 'error');
    return;
  }
  const response = await fetch('/api/playlists/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, playlist: currentPlaylist })
  });
  if (!response.ok) {
    showToast('Failed to duplicate playlist', 'error');
    return;
  }
  await loadPlaylistFiles();
  playlistFileSelect.value = name;
  duplicatePlaylistName.value = '';
  showToast('Playlist duplicated', 'success');
});

async function queueTagging(item, index) {
  if (!item || !item.videoId || tagQueue.has(item.videoId)) return;
  tagQueue.set(item.videoId, true);
  try {
    const response = await fetch('/api/ai/tag-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: item.videoId,
        title: item.title,
        artist: item.artist,
        album: item.album,
        duration_sec: item.duration_sec,
        source: item.source,
        search: item.search
      })
    });
    if (!response.ok) {
      throw new Error('Tagging failed');
    }
    const data = await response.json();
    currentPlaylist[index].tags = data.tags;
    currentPlaylist[index].confidence = data.confidence;
    renderPlaylist();
  } catch (error) {
    showToast('Failed to tag track', 'error');
  } finally {
    tagQueue.delete(item.videoId);
  }
}

async function tagMissingSongs() {
  const pending = currentPlaylist
    .map((item, index) => ({ item, index }))
    .filter(entry => entry.item && !entry.item.tags && entry.item.videoId);

  if (!pending.length) {
    showToast('All songs already tagged', 'info');
    return;
  }

  if (tagMissingBtn) {
    tagMissingBtn.disabled = true;
    tagMissingBtn.textContent = `Tagging ${pending.length}...`;
  }

  for (const entry of pending) {
    await queueTagging(entry.item, entry.index);
  }

  if (tagMissingBtn) {
    tagMissingBtn.disabled = false;
    tagMissingBtn.textContent = 'Tag Untagged Songs';
  }
  showToast('Tagging complete', 'success');
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function startPreviewTimer() {
  if (previewTimer) clearInterval(previewTimer);
  previewTimer = setInterval(() => {
    if (!previewPlayer || typeof previewPlayer.getCurrentTime !== 'function') return;
    const current = previewPlayer.getCurrentTime();
    const duration = previewPlayer.getDuration();
    previewTime.textContent = formatTime(current);
    previewDuration.textContent = formatTime(duration);
    if (duration > 0) {
      previewProgress.style.width = `${Math.min(100, (current / duration) * 100)}%`;
    }
  }, 500);
}

window.onYouTubeIframeAPIReady = () => {
  previewPlayer = new YT.Player(previewPlayerEl, {
    height: '100%',
    width: '100%',
    videoId: '',
    playerVars: { autoplay: 0, controls: 1, rel: 0 },
    events: {
      onReady: () => startPreviewTimer(),
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.ENDED) {
          previewProgress.style.width = '100%';
        }
      }
    }
  });
};

(async () => {
  await loadPlaylistFiles();
  await loadPlaylist();
})();
