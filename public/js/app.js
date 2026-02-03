// Settings Manager
class JukeboxSettings {
    constructor() {
        this.settings = this.loadSettings();
    }
    
    loadSettings() {
        const defaultSettings = {
            visualizerEnabled: true,
            defaultVisualizerType: 'bars',
            autoShowBehavior: 'always',
            youtubeEnabled: true,
            spotifyEnabled: true,
            soundcloudEnabled: false,
            appleMusicEnabled: false,
            showServiceIcons: true,
            compactQueue: false,
            fadeDurationMs: 2000
        };
        
        const saved = localStorage.getItem('jukeboxSettings');
        return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    }
    
    refresh() {
        this.settings = this.loadSettings();
    }
    
    get(key) {
        return this.settings[key];
    }
    
    set(key, value) {
        this.settings[key] = value;
        localStorage.setItem('jukeboxSettings', JSON.stringify(this.settings));
    }
    
    shouldShowVisualizer() {
        return this.settings.visualizerEnabled;
    }
    
    shouldAutoShowVisualizer(source) {
        if (!this.settings.visualizerEnabled) return false;
        
        switch (this.settings.autoShowBehavior) {
            case 'always': return true;
            case 'spotify-only': return source === 'spotify';
            case 'never': return false;
            default: return true;
        }
    }
    
    isServiceEnabled(service) {
        return this.settings[`${service}Enabled`];
    }
}

// Initialize settings
const jukeboxSettings = new JukeboxSettings();

class VirtualJukebox {
    constructor() {
        this.socket = io();
        this.player = null;
        this.isPlayerReady = false;
        this.currentSong = null;
        this.isPlaying = false;
        this.isFading = false;
        
        this.initializeElements();
        this.bindEvents();
        this.setupSocketListeners();
        this.loadInitialData();
        this.initializeSettingsUI();
        
        // Listen for when user returns from settings page
        window.addEventListener('focus', () => {
            this.applySettings();
        });
        
        // Warn before leaving page if music is playing
        window.addEventListener('beforeunload', (e) => {
            const isPlaying = this.isPlaying || (this.currentPreviewAudio && !this.currentPreviewAudio.paused);
            const hasQueue = this.currentQueue && this.currentQueue.length > 0;
            const hasCurrentSong = this.currentSong && this.currentSong.title;
            
            if (isPlaying || hasQueue || hasCurrentSong) {
                const message = 'Music is playing or queued. Leaving this page will interrupt the jukebox.';
                e.preventDefault();
                e.returnValue = message;
                return message;
            }
        });
        
        // Server-side audio - no YouTube Player API needed
    }

    initializeSettingsUI() {
        this.applySettings();
    }
    
    applySettings() {
        // Reload settings from localStorage
        jukeboxSettings.refresh();
        
        // Hide/show music service tabs based on settings
        if (this.spotifyTab) {
            if (jukeboxSettings.isServiceEnabled('spotify')) {
                this.spotifyTab.style.display = 'inline-block';
            } else {
                this.spotifyTab.style.display = 'none';
                if (this.currentMusicService === 'spotify') {
                    this.switchMusicService('youtube');
                }
            }
        }
        
        // Hide/show visualizer button and container based on settings
        const showVisualizerBtn = document.getElementById('showVisualizerBtn');
        const visualizerContainer = document.getElementById('visualizerContainer');
        
        if (jukeboxSettings.shouldShowVisualizer()) {
            if (showVisualizerBtn) showVisualizerBtn.style.display = 'inline-block';
            if (visualizerContainer) {
                visualizerContainer.style.display = 'block';
                visualizerContainer.classList.remove('hidden');
            }
            // Don't auto-show the container, let user control it
        } else {
            if (showVisualizerBtn) {
                showVisualizerBtn.style.display = 'none';
            }
            if (visualizerContainer) {
                visualizerContainer.style.display = 'none';
                visualizerContainer.classList.add('hidden');
            }
            if (window.visualizer) {
                window.visualizer.stop();
            }
        }
        
        // Apply compact queue setting
        if (jukeboxSettings.get('compactQueue')) {
            document.body.classList.add('compact-queue');
        } else {
            document.body.classList.remove('compact-queue');
        }
        
        // Update visualizer type if it exists
        if (window.visualizer) {
            window.visualizer.visualizerType = jukeboxSettings.get('defaultVisualizerType');
            const typeSelect = document.getElementById('visualizerType');
            if (typeSelect) {
                typeSelect.value = window.visualizer.visualizerType;
            }
        }

        const fadeDurationInput = document.getElementById('fadeDurationMs');
        if (fadeDurationInput) {
            const duration = parseInt(jukeboxSettings.get('fadeDurationMs'), 10);
            if (!Number.isNaN(duration)) {
                fadeDurationInput.value = duration;
            }
        }
    }

    initializeElements() {
        this.addSongForm = document.getElementById('addSongForm');
        this.songTitle = document.getElementById('songTitle');
        this.songArtist = document.getElementById('songArtist');
        this.userName = document.getElementById('userName');
        this.nowPlaying = document.getElementById('nowPlaying');
        this.queueList = document.getElementById('queueList');
        this.queueCount = document.getElementById('queueCount');
        this.userCount = document.getElementById('userCount');
        this.nextBtn = document.getElementById('nextBtn');
        this.fadeNextBtn = document.getElementById('fadeNextBtn');
        this.toast = document.getElementById('toast');
        this.toastMessage = document.getElementById('toastMessage');
        
        // YouTube Music search elements
        this.searchTab = document.getElementById('searchTab');
        this.manualTab = document.getElementById('manualTab');
        this.searchSection = document.getElementById('searchSection');
        this.searchQuery = document.getElementById('searchQuery');
        this.searchBtn = document.getElementById('searchBtn');
        this.clearSearchBtn = document.getElementById('clearSearchBtn');
        this.searchResults = document.getElementById('searchResults');
        
        // Music service selection
        this.musicServiceTabs = document.getElementById('musicServiceTabs');
        this.youtubeTab = document.getElementById('youtubeTab');
        this.spotifyTab = document.getElementById('spotifyTab');
        this.currentMusicService = 'youtube'; // Default to YouTube Music
        
        // Audio player elements
        this.audioPlayer = document.getElementById('audioPlayer');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.volumeBtn = document.getElementById('volumeBtn');
        this.volumeControl = document.getElementById('volumeControl');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressBar = document.getElementById('progressBar');
        this.currentTime = document.getElementById('currentTime');
        this.totalTime = document.getElementById('totalTime');
        
        // DJ controls
        this.addMicBreakBtn = document.getElementById('addMicBreakBtn');
        this.resetPlaylistBtn = document.getElementById('resetPlaylistBtn');
        this.clearQueueBtn = document.getElementById('clearQueueBtn');
        this.parkQueueBtn = document.getElementById('parkQueueBtn');
        this.parkCurrentBtn = document.getElementById('parkCurrentBtn');
        this.unparkQueueBtn = document.getElementById('unparkQueueBtn');
        this.parkedCount = document.getElementById('parkedCount');
        
        // Playlist status elements
        this.playlistStatus = document.getElementById('playlistStatus');
        this.playlistName = document.getElementById('playlistName');
        this.playlistPosition = document.getElementById('playlistPosition');
        this.nextPlaylistSong = document.getElementById('nextPlaylistSong');
        this.playlistProgress = document.getElementById('playlistProgress');
        
        // Playlist browser elements
        this.expandPlaylistBtn = document.getElementById('expandPlaylistBtn');
        this.collapsePlaylistBtn = document.getElementById('collapsePlaylistBtn');
        this.togglePlaylistViewBtn = document.getElementById('togglePlaylistViewBtn');
        this.playlistBrowser = document.getElementById('playlistBrowser');
        this.playlistItems = document.getElementById('playlistItems');
        this.playlistSearchInput = document.getElementById('playlistSearchInput');
        this.clearPlaylistSearchBtn = document.getElementById('clearPlaylistSearchBtn');
        this.playlistNoResults = document.getElementById('playlistNoResults');
        
        // Play history elements
        this.viewHistoryBtn = document.getElementById('viewHistoryBtn');
        this.historyModal = document.getElementById('historyModal');
        this.closeHistoryBtn = document.getElementById('closeHistoryBtn');
        this.exportHistoryBtn = document.getElementById('exportHistoryBtn');
        this.historyCount = document.getElementById('historyCount');
        this.totalSongsPlayed = document.getElementById('totalSongsPlayed');
        this.userSubmissions = document.getElementById('userSubmissions');
        this.uniqueUsers = document.getElementById('uniqueUsers');
        this.historyItems = document.getElementById('historyItems');
        this.historyEmpty = document.getElementById('historyEmpty');
        
        // Buffer elements removed - now using server-side pre-buffering
        
        // Visualizer elements
        this.visualizerContainer = document.getElementById('visualizerContainer');
        this.visualizerToggle = document.getElementById('visualizerToggle');
        this.visualizerTypeSelect = document.getElementById('visualizerType');
        this.visualizerCanvas = document.getElementById('visualizerCanvas');
        
        // Store the full playlist for searching
        this.fullPlaylist = [];
        this.currentPlaylistIndex = 0;
        this.playlistDetailedView = false; // New: toggle for detailed playlist view
        this.suppressedSongs = new Set(); // Track suppressed songs
        
        // Initialize drag and drop
        this.initializeDragAndDrop();
        
        // Initialize connection monitoring
        this.initializeConnectionMonitoring();
    }

    bindEvents() {
        this.addSongForm.addEventListener('submit', (e) => this.handleAddSong(e));
        this.nextBtn.addEventListener('click', () => this.playNextSong());
        this.fadeNextBtn.addEventListener('click', () => this.fadeToNextSong());
        
        // Visualizer button
        const showVisualizerBtn = document.getElementById('showVisualizerBtn');
        if (showVisualizerBtn) {
            showVisualizerBtn.addEventListener('click', () => this.toggleVisualizer());
        }
        
        // Test audio button
        const testAudioBtn = document.getElementById('testAudioBtn');
        if (testAudioBtn) {
            testAudioBtn.addEventListener('click', () => this.testAudio());
        }
        
        // Tab switching
        this.searchTab.addEventListener('click', () => this.switchToSearchTab());
        this.manualTab.addEventListener('click', () => this.switchToManualTab());
        
        // Music service tabs
        this.youtubeTab?.addEventListener('click', () => this.switchMusicService('youtube'));
        this.spotifyTab?.addEventListener('click', () => this.switchMusicService('spotify'));
        
        // YouTube Music search
        this.searchBtn.addEventListener('click', () => this.searchMusic());
        this.clearSearchBtn.addEventListener('click', () => this.clearSearch());
        this.searchQuery.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchMusic();
            }
        });
        
        // Audio controls - with debugging
        console.log('🔧 Binding playPauseBtn event listener, element:', this.playPauseBtn);
        if (this.playPauseBtn) {
            this.playPauseBtn.addEventListener('click', () => {
                console.log('🔧 Play/Pause button clicked - event listener triggered!');
                this.togglePlayPause();
            });
        } else {
            console.error('❌ playPauseBtn element not found!');
        }
        
        this.volumeBtn.addEventListener('click', () => this.toggleVolumeControl());
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        
        // DJ controls
        this.addMicBreakBtn.addEventListener('click', () => this.addMicBreak());
        this.resetPlaylistBtn.addEventListener('click', () => this.resetPlaylist());
        this.clearQueueBtn.addEventListener('click', () => this.clearQueue());
        this.parkQueueBtn.addEventListener('click', () => this.parkQueue());
        this.parkCurrentBtn.addEventListener('click', () => this.parkCurrentQueue());
        this.unparkQueueBtn.addEventListener('click', () => this.unparkQueue());
        
        // Playlist browser controls
        this.expandPlaylistBtn.addEventListener('click', () => this.showPlaylistBrowser());
        this.collapsePlaylistBtn.addEventListener('click', () => this.hidePlaylistBrowser());
        this.togglePlaylistViewBtn.addEventListener('click', () => this.togglePlaylistView());
        
        // Playlist switcher
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('playlist-switch-btn')) {
                const playlist = e.target.dataset.playlist;
                this.switchPlaylist(playlist);
            }
        });
        
        // Play history controls
        this.viewHistoryBtn.addEventListener('click', () => this.showPlayHistory());
        this.closeHistoryBtn.addEventListener('click', () => this.hidePlayHistory());
        this.exportHistoryBtn.addEventListener('click', () => this.exportPlayHistory());
        
        // Buffer controls removed - now using server-side pre-buffering
        
        // Playlist search functionality
        this.playlistSearchInput.addEventListener('input', (e) => this.filterPlaylist(e.target.value));
        this.playlistSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearPlaylistSearch();
            }
        });
        this.clearPlaylistSearchBtn.addEventListener('click', () => this.clearPlaylistSearch());
        
        // Filter buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('playlist-filter-btn')) {
                const filter = e.target.dataset.filter;
                this.filterPlaylistByType(filter);
            }
        });
        
        // Keyboard shortcuts for DJ
        document.addEventListener('keydown', (e) => {
            // Only activate shortcuts when not typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            switch(e.key.toLowerCase()) {
                case 'f': // F key for fade to next
                    e.preventDefault();
                    this.fadeToNextSong();
                    break;
                case 'n': // N key for next song (no fade)
                    e.preventDefault();
                    this.playNextSong();
                    break;
                case ' ': // Spacebar for play/pause
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
            }
        });
    }

    setupSocketListeners() {
        this.socket.on('queueUpdated', (data) => {
            this.updateQueue(data.queue);
            // Only update now playing if currentlyPlaying is explicitly provided
            // This prevents restarts when just adding songs to queue
            if (data.hasOwnProperty('currentlyPlaying') && data.currentlyPlaying && 
                (!this.currentSong || data.currentlyPlaying.id !== this.currentSong.id)) {
                this.updateNowPlaying(data.currentlyPlaying);
            }
        });

        this.socket.on('nowPlaying', (song) => {
            this.updateNowPlaying(song);
            // Update playlist status when a new song starts
            if (song && song.source === 'fallback') {
                setTimeout(() => this.updatePlaylistStatus(), 500);
            }
        });

        this.socket.on('fallbackMode', (data) => {
            if (data.active) {
                this.showToast(`🎵 Playing wedding music: ${data.song.title}`, 'info');
                this.updatePlaylistStatus(); // Update status when fallback mode activates
            }
        });

        this.socket.on('playlistReset', (data) => {
            this.showToast(data.message, 'success');
            this.updatePlaylistStatus(); // Update status when playlist is reset
        });

        this.socket.on('playlistJump', (data) => {
            this.showToast(data.message, 'success');
            this.updatePlaylistStatus(); // Update status when playlist position changes
        });

        this.socket.on('playlistSwitch', (data) => {
            this.showToast(data.message, 'success');
            this.updatePlaylistStatus(); // Update status when playlist switches
        });

        this.socket.on('playHistoryUpdate', (data) => {
            this.historyCount.textContent = data.totalSongs;
            if (data.lastSong) {
                this.showToast(`♪ ${data.lastSong.song.title} logged to history`, 'info');
            }
        });

        this.socket.on('queueParkChanged', (data) => {
            if (data.parked) {
                this.parkQueueBtn.classList.add('hidden');
                this.unparkQueueBtn.classList.remove('hidden');
                this.showToast(data.message, 'info');
            } else {
                this.parkQueueBtn.classList.remove('hidden');
                this.unparkQueueBtn.classList.add('hidden');
                this.showToast(data.message, 'success');
            }
        });

        this.socket.on('parkedQueueUpdated', (data) => {
            this.parkedCount.textContent = data.parkedCount;
            if (data.parkedCount > 0) {
                this.unparkQueueBtn.classList.remove('hidden');
            }
        });

        this.socket.on('playlistSuppressed', (data) => {
            this.suppressedSongs.add(data.index);
            this.showToast(data.message, 'info');
            // Refresh playlist browser if it's open
            if (!this.playlistBrowser.classList.contains('hidden')) {
                this.displayPlaylistBrowser(this.fullPlaylist, this.currentPlaylistIndex);
            }
        });

        this.socket.on('playlistUnsuppressed', (data) => {
            this.suppressedSongs.delete(data.index);
            this.showToast(data.message, 'success');
            // Refresh playlist browser if it's open
            if (!this.playlistBrowser.classList.contains('hidden')) {
                this.displayPlaylistBrowser(this.fullPlaylist, this.currentPlaylistIndex);
            }
        });

        this.socket.on('userCount', (count) => {
            this.userCount.textContent = count;
        });

        this.socket.on('connect', () => {
            this.showToast('Connected to jukebox!', 'success');
        });

        this.socket.on('disconnect', () => {
            this.showToast('Disconnected from jukebox', 'error');
        });
        
        // Listen for audio service status updates (progress, etc.)
        this.socket.on('audioServiceStatus', (data) => {
            this.updateAudioServiceStatus(data);
        });
    }

    async loadInitialData() {
        try {
            const response = await fetch('/api/queue');
            const data = await response.json();
            
            this.updateQueue(data.queue);
            if (data.currentlyPlaying) {
                this.updateNowPlaying(data.currentlyPlaying);
            }
            this.userCount.textContent = data.connectedUsers;
            
            // Load playlist status
            this.updatePlaylistStatus();
            
            // Load history count
            this.loadHistoryCount();
        } catch (error) {
            console.error('Failed to load initial data:', error);
            this.showToast('Failed to load jukebox data', 'error');
        }
    }

    async loadHistoryCount() {
        try {
            const response = await fetch('/api/history');
            const data = await response.json();
            this.historyCount.textContent = data.totalSongs;
        } catch (error) {
            console.error('Failed to load history count:', error);
        }
    }

    async updatePlaylistStatus() {
        try {
            const response = await fetch('/api/playlist/status');
            const data = await response.json();
            
            // Always show playlist status since we have a default playlist
            this.playlistStatus.classList.remove('hidden');
            
            // Update playlist name and position
            this.playlistName.textContent = data.playlistName + ':';
            
            // Show current position (use 1 as minimum for display)
            const displayIndex = Math.max(0, data.currentIndex);
            this.playlistPosition.textContent = `Song ${displayIndex + 1} of ${data.totalSongs}`;
            
            // Update progress bar
            const progressPercent = ((displayIndex + 1) / data.totalSongs) * 100;
            this.playlistProgress.style.width = `${progressPercent}%`;
            
            // Show next song if available
            if (data.nextSong) {
                const nextSongName = this.parsePlaylistSong(data.nextSong.search);
                this.nextPlaylistSong.textContent = `Next: ${nextSongName}`;
            } else {
                this.nextPlaylistSong.textContent = 'Next: Back to start';
            }
            
            // Update active playlist button styling
            this.updatePlaylistButtonStyles(data.activePlaylist);
        } catch (error) {
            console.error('Failed to load playlist status:', error);
        }
    }

    updatePlaylistButtonStyles(activePlaylist) {
        const weddingBtn = document.getElementById('switchToWeddingBtn');
        const brideBtn = document.getElementById('switchToBrideBtn');
        
        // Reset styles
        weddingBtn.className = 'playlist-switch-btn bg-yellow-700 hover:bg-yellow-800 px-3 py-1 rounded text-xs transition-colors';
        brideBtn.className = 'playlist-switch-btn bg-yellow-700 hover:bg-yellow-800 px-3 py-1 rounded text-xs transition-colors';
        
        // Highlight active playlist
        if (activePlaylist === 'wedding') {
            weddingBtn.className = 'playlist-switch-btn bg-yellow-500 hover:bg-yellow-600 px-3 py-1 rounded text-xs transition-colors font-semibold';
        } else {
            brideBtn.className = 'playlist-switch-btn bg-yellow-500 hover:bg-yellow-600 px-3 py-1 rounded text-xs transition-colors font-semibold';
        }
    }

    async switchPlaylist(playlist) {
        try {
            const response = await fetch('/api/playlist/switch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ playlist: playlist })
            });

            if (response.ok) {
                const data = await response.json();
                this.showToast(data.message, 'success');
                
                // Update status after switching
                setTimeout(() => this.updatePlaylistStatus(), 500);
            } else {
                throw new Error('Failed to switch playlist');
            }
        } catch (error) {
            console.error('Error switching playlist:', error);
            this.showToast('Failed to switch playlist', 'error');
        }
    }

    async showPlayHistory() {
        try {
            const response = await fetch('/api/history');
            const data = await response.json();
            
            this.displayPlayHistory(data);
            this.historyModal.classList.remove('hidden');
        } catch (error) {
            console.error('Error loading play history:', error);
            this.showToast('Failed to load play history', 'error');
        }
    }

    hidePlayHistory() {
        this.historyModal.classList.add('hidden');
    }

    displayPlayHistory(data) {
        // Update summary
        this.totalSongsPlayed.textContent = data.totalSongs;
        this.userSubmissions.textContent = data.summary.userSubmissions;
        this.uniqueUsers.textContent = data.summary.uniqueUsers;

        if (data.history.length === 0) {
            this.historyItems.innerHTML = '';
            this.historyEmpty.classList.remove('hidden');
            return;
        }

        this.historyEmpty.classList.add('hidden');
        
        // Display history items (most recent first)
        this.historyItems.innerHTML = data.history.slice().reverse().map((entry, index) => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            const actionIcon = entry.action === 'played' ? 'fas fa-play text-green-400' : 
                              entry.action === 'added' ? 'fas fa-plus text-blue-400' : 
                              'fas fa-forward text-yellow-400';
            const actionText = entry.action === 'played' ? 'Played' : 
                              entry.action === 'added' ? 'Added' : 'Skipped';
            
            return `
                <div class="bg-gray-800 bg-opacity-50 rounded p-2 flex items-center space-x-3">
                    <div class="w-4">
                        <i class="${actionIcon} text-sm"></i>
                    </div>
                    <div class="flex-1">
                        <div class="text-sm font-medium text-green-200">${entry.song.title}</div>
                        <div class="text-xs text-gray-400">${entry.song.artist} • ${actionText} by ${entry.song.addedBy}</div>
                    </div>
                    <div class="text-xs text-gray-500">${time}</div>
                </div>
            `;
        }).join('');
    }

    async exportPlayHistory() {
        try {
            const response = await fetch('/api/history/export');
            const blob = await response.blob();
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `wedding-playlist-history-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.showToast('Play history exported successfully!', 'success');
        } catch (error) {
            console.error('Error exporting play history:', error);
            this.showToast('Failed to export play history', 'error');
        }
    }

    parsePlaylistSong(searchString) {
        // Extract song name from search string like "Cupid Shuffle Cupid"
        if (!searchString) return 'Unknown Song';
        
        // Simple approach: take first 1-3 words as song name
        const parts = searchString.split(' ');
        if (parts.length >= 2) {
            return parts.slice(0, 2).join(' ');
        }
        return searchString;
    }

    async handleAddSong(e) {
        e.preventDefault();
        
        const songData = {
            song: {
                title: this.songTitle.value.trim(),
                artist: this.songArtist.value.trim(),
                duration: '3:30', // Placeholder - would come from music service
                albumArt: 'https://via.placeholder.com/100x100/6366f1/ffffff?text=♪'
            },
            addedBy: this.userName.value.trim() || 'DJ'
        };

        try {
            const response = await fetch('/api/queue/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(songData)
            });

            if (response.ok) {
                this.addSongForm.reset();
                this.showToast('Song added to queue!', 'success');
            } else {
                throw new Error('Failed to add song');
            }
        } catch (error) {
            console.error('Error adding song:', error);
            this.showToast('Failed to add song to queue', 'error');
        }
    }

    async playNextSong() {
        // Check if we're using the audio service (headless mode or fallback songs)
        if (this.currentSong && (this.currentSong.source === 'headless-audio' || this.currentSong.source === 'fallback')) {
            // Send skip command directly to audio service
            this.socket.emit('skipCommand');
            this.showToast('Playing next song!', 'success');
            return;
        }
        
        // Fallback to server API for non-audio service mode
        try {
            const response = await fetch('/api/queue/next', {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                if (data.currentlyPlaying) {
                    this.showToast('Playing next song!', 'success');
                } else {
                    this.showToast('Queue is empty - add more songs!', 'info');
                }
            }
        } catch (error) {
            console.error('Error playing next song:', error);
            this.showToast('Failed to play next song', 'error');
        }
    }

    async fadeToNextSong() {
        console.log('🎵 Fade to Next button clicked');
        console.log('Current state - isPlaying:', this.isPlaying, 'currentlyPlaying:', this.currentlyPlaying);
        console.log('Socket connected:', this.socket.connected);
        
        // Test socket connection first
        console.log('🏓 Testing socket connection...');
        this.socket.emit('ping');
        this.socket.once('pong', () => {
            console.log('✅ Socket connection confirmed - pong received');
        });
        
        // If using headless audio, ask the audio service to fade then skip
        if (this.currentSong && (this.currentSong.source === 'headless-audio' || this.currentSong.source === 'fallback')) {
            console.log('📤 Headless audio detected, sending fade command to audio service');
            const durationMs = this.getFadeDurationMs();
            this.setFadeUI(true, durationMs);
            this.socket.emit('fadeCommand', { durationMs });
            this.showToast('Fading to next song...', 'info');
            setTimeout(() => this.setFadeUI(false), durationMs + 250);
            return;
        }

        // Always try to send skip command if something is playing (non-headless)
        if (this.isPlaying) {
            console.log('📤 Audio is playing, sending skip command to audio service');
            console.log('Emitting skipCommand via socket...');
            this.socket.emit('skipCommand');
            this.showToast('Skipping to next song...', 'info');
            return;
        }
        
        // If nothing seems to be playing, try to start the next song
        console.log('🚀 Nothing playing, trying to start next song...');
        this.playNextSong();
    }

    getFadeDurationMs() {
        const raw = jukeboxSettings.get('fadeDurationMs');
        const parsed = parseInt(raw, 10);
        if (Number.isNaN(parsed)) return 2000;
        return Math.min(10000, Math.max(500, parsed));
    }

    setFadeUI(isFading, durationMs = 2000) {
        this.isFading = isFading;
        if (!this.fadeNextBtn) return;
        if (isFading) {
            this.fadeNextBtn.disabled = true;
            this.fadeNextBtn.classList.add('opacity-70', 'cursor-not-allowed');
            this.fadeNextBtn.innerHTML = `<i class="fas fa-volume-down mr-2"></i>Fading... (${Math.round(durationMs / 1000)}s)`;
        } else {
            this.fadeNextBtn.disabled = false;
            this.fadeNextBtn.classList.remove('opacity-70', 'cursor-not-allowed');
            this.fadeNextBtn.innerHTML = '<i class="fas fa-volume-down mr-2"></i>Fade to Next';
        }
    }

    toggleVisualizer() {
        if (window.visualizer) {
            const isCurrentlyVisible = window.visualizer.visualizerContainer && 
                                     !window.visualizer.visualizerContainer.classList.contains('hidden');
            
            const showVisualizerBtn = document.getElementById('showVisualizerBtn');
            
            if (isCurrentlyVisible) {
                window.visualizer.hide();
                this.showToast('Visualizer hidden', 'info');
                if (showVisualizerBtn) {
                    showVisualizerBtn.innerHTML = '<i class="fas fa-wave-square mr-2"></i>Show Visualizer';
                }
            } else {
                window.visualizer.show();
                if (!window.visualizer.isActive) {
                    window.visualizer.start();
                }
                this.showToast('Visualizer shown', 'success');
                if (showVisualizerBtn) {
                    showVisualizerBtn.innerHTML = '<i class="fas fa-eye-slash mr-2"></i>Hide Visualizer';
                }
            }
        } else {
            this.showToast('Visualizer not available', 'error');
        }
    }

    confirmNavigation(url) {
        // Check if music is currently playing
        const isPlaying = this.isPlaying || (this.currentPreviewAudio && !this.currentPreviewAudio.paused);
        const hasQueue = this.currentQueue && this.currentQueue.length > 0;
        const hasCurrentSong = this.currentSong && this.currentSong.title;
        
        if (isPlaying || hasQueue || hasCurrentSong) {
            const message = isPlaying 
                ? "⚠️ Music is currently playing!\n\nNavigating away will interrupt the music and may affect the party experience.\n\nAre you sure you want to continue?"
                : hasCurrentSong || hasQueue
                ? "⚠️ You have music queued!\n\nNavigating away may interrupt the jukebox experience.\n\nAre you sure you want to continue?"
                : "Are you sure you want to leave the DJ interface?";
                
            if (confirm(message)) {
                window.location.href = url;
            }
        } else {
            // No music playing, safe to navigate
            window.location.href = url;
        }
    }

    async removeSongFromQueue(songId) {
        try {
            const response = await fetch(`/api/queue/${songId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.showToast('Song removed from queue', 'success');
            }
        } catch (error) {
            console.error('Error removing song:', error);
            this.showToast('Failed to remove song', 'error');
        }
    }

    updateNowPlaying(song) {
        if (!song) {
            this.currentSong = null;
            this.nowPlaying.innerHTML = `
                <div class="bg-gray-800 rounded-lg p-8 mb-4">
                    <i class="fas fa-music text-6xl text-gray-500 mb-4"></i>
                    <p class="text-gray-400">No song currently playing</p>
                </div>
            `;
            this.hidePlayerControls();
            return;
        }

        // Check if this is actually a new song
        const isNewSong = !this.currentSong || this.currentSong.id !== song.id;
        
        this.currentSong = song;
        
        // Handle mic breaks differently
        if (song.type === 'mic-break') {
            this.updateMicBreakDisplay(song);
            this.hidePlayerControls();
        } else {
            this.updateNowPlayingDisplay(song);
            // Only start playing if it's a new song and we have a videoId
            if (isNewSong && song.videoId && this.isPlayerReady) {
                this.playSong(song.videoId);
            }
            this.showPlayerControls();
        }
    }

    updateNowPlayingDisplay(song) {
        const isFallback = song.source === 'fallback';
        const isSpotify = song.source === 'spotify';
        const borderColor = isFallback ? 'from-yellow-600 to-orange-600' : 
                           isSpotify ? 'from-green-600 to-emerald-600' :
                           'from-purple-600 to-pink-600';
        const icon = isFallback ? 'fas fa-magic' : 
                    isSpotify ? 'fab fa-spotify' : 
                    'fas fa-play-circle';
        const serviceLabel = isFallback ? '🎵 Wedding DJ Auto-Play' :
                           isSpotify ? '🎵 Spotify' :
                           '🎵 YouTube Music';
        
        // Auto-show visualizer when a song starts playing
        if (window.visualizer && !isSpotify && window.visualizer.show && jukeboxSettings.shouldAutoShowVisualizer('youtube')) {
            window.visualizer.show();
        }
        
        // For Spotify songs, show preview button if available
        const previewButton = isSpotify && song.previewUrl ? 
            `<button onclick="jukebox.playSpotifyPreview('${song.previewUrl}')" 
                     class="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm mt-2 transition-colors">
                <i class="fas fa-play mr-1"></i>Preview
             </button>` : '';
        
        this.nowPlaying.innerHTML = `
            <div class="bg-gradient-to-br ${borderColor} rounded-lg p-6 mb-4 pulse-glow">
                <div class="flex items-center space-x-4">
                    <img src="${song.albumArt}" alt="Album Art" class="w-20 h-20 rounded-lg shadow-lg">
                    <div class="flex-1">
                        <h3 class="text-2xl font-bold">${song.title}</h3>
                        <p class="text-lg text-purple-200">${song.artist}</p>
                        <p class="text-sm text-purple-300">
                            ${isFallback ? serviceLabel : `Added by ${song.addedBy} • ${serviceLabel}`}
                        </p>
                        ${previewButton}
                    </div>
                    <div class="text-right">
                        <div class="text-3xl">
                            <i class="${icon} text-green-400"></i>
                        </div>
                        <p class="text-sm text-purple-200">${song.duration}</p>
                    </div>
                </div>
                ${isFallback ? '<div class="mt-3 text-center text-sm text-yellow-200">🎉 Playing wedding favorites while queue is empty</div>' : ''}
                ${isSpotify && !song.videoId ? '<div class="mt-3 text-center text-sm text-green-200">🎵 Spotify track - use preview or open in Spotify app</div>' : ''}
            </div>
        `;
    }

    updateQueue(queue) {
        this.currentQueue = queue; // Store current queue for reordering
        this.queueCount.textContent = queue.length;
        
        // Server-side pre-buffering now handles this automatically
        
        if (queue.length === 0) {
            this.queueList.innerHTML = '<p class="text-gray-400 text-center py-8">No songs in queue</p>';
            return;
        }

        this.queueList.innerHTML = queue.map((song, index) => {
            const isMicBreak = song.type === 'mic-break';
            const isSpotify = song.source === 'spotify';
            const bgColor = isMicBreak ? 'bg-orange-800 bg-opacity-50 border-orange-500' : 
                           isSpotify ? 'bg-green-800 bg-opacity-50 border-green-500' :
                           'bg-gray-800 bg-opacity-50';
            const icon = isMicBreak ? 'fas fa-microphone text-orange-400' : 
                        isSpotify ? 'fab fa-spotify text-green-400' :
                        'fas fa-music text-purple-400';
            const serviceLabel = isMicBreak ? 'DJ Microphone Break' :
                               isSpotify ? 'Spotify' :
                               'YouTube Music';
            
            return `
                <div class="queue-item ${bgColor} rounded-lg p-4 flex items-center space-x-4 hover:bg-opacity-70 transition-all border border-gray-700 cursor-move" 
                     data-id="${song.id}" data-index="${index}">
                    <div class="drag-handle text-gray-500 hover:text-gray-300">
                        <i class="fas fa-grip-vertical"></i>
                    </div>
                    <div class="text-2xl font-bold w-8 text-center ${isMicBreak ? 'text-orange-400' : isSpotify ? 'text-green-400' : 'text-purple-400'}">
                        ${index + 1}
                    </div>
                    ${isMicBreak ? 
                        `<div class="w-12 h-12 rounded shadow bg-orange-600 flex items-center justify-center">
                            <i class="fas fa-microphone text-white"></i>
                         </div>` :
                        `<img src="${song.albumArt}" alt="Album Art" class="w-12 h-12 rounded shadow">`
                    }
                    <div class="flex-1">
                        <h4 class="font-semibold ${isMicBreak ? 'text-orange-200' : ''}">${song.title}</h4>
                        <p class="text-gray-400 text-sm">${isMicBreak ? serviceLabel : song.artist}</p>
                        <p class="text-gray-500 text-xs">${isMicBreak ? 'Pause for announcements' : `Added by ${song.addedBy} • ${serviceLabel}`}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-400">${isMicBreak ? '∞' : song.duration}</p>
                        <button onclick="jukebox.removeSongFromQueue('${song.id}')" 
                                class="text-red-400 hover:text-red-300 mt-1">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Reinitialize drag and drop after updating
        this.initializeDragAndDrop();
    }

    showToast(message, type = 'success') {
        this.toastMessage.textContent = message;
        let bgColor = 'bg-green-500';
        if (type === 'error') bgColor = 'bg-red-500';
        if (type === 'info') bgColor = 'bg-blue-500';
        if (type === 'warning') bgColor = 'bg-orange-500';
        
        this.toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg transform transition-transform duration-300 ${bgColor} text-white`;
        
        // Show toast
        this.toast.style.transform = 'translateX(0)';
        
        // Hide after 3 seconds
        setTimeout(() => {
            this.toast.style.transform = 'translateX(100%)';
        }, 3000);
    }

    // Tab switching methods
    switchToSearchTab() {
        this.searchTab.classList.add('bg-purple-600');
        this.searchTab.classList.remove('bg-gray-600');
        this.manualTab.classList.add('bg-gray-600');
        this.manualTab.classList.remove('bg-purple-600');
        
        this.searchSection.classList.remove('hidden');
        this.addSongForm.classList.add('hidden');
        
        // Load music service status when switching to search
        this.loadMusicServiceStatus();
    }

    switchToManualTab() {
        this.manualTab.classList.add('bg-purple-600');
        this.manualTab.classList.remove('bg-gray-600');
        this.searchTab.classList.add('bg-gray-600');
        this.searchTab.classList.remove('bg-purple-600');
        
        this.addSongForm.classList.remove('hidden');
        this.searchSection.classList.add('hidden');
    }

    // Music service switching
    switchMusicService(service) {
        this.currentMusicService = service;
        
        // Update tab styling
        if (this.youtubeTab && this.spotifyTab) {
            this.youtubeTab.classList.remove('bg-purple-600', 'bg-gray-600');
            this.spotifyTab.classList.remove('bg-purple-600', 'bg-gray-600');
            
            if (service === 'youtube') {
                this.youtubeTab.classList.add('bg-purple-600');
                this.spotifyTab.classList.add('bg-gray-600');
            } else {
                this.spotifyTab.classList.add('bg-purple-600');
                this.youtubeTab.classList.add('bg-gray-600');
            }
        }
        
        // Clear previous search results
        this.clearSearch();
        
        // Update search placeholder
        const placeholder = service === 'spotify' ? 
            'Search Spotify for songs...' : 
            'Search YouTube Music for songs...';
        this.searchQuery.placeholder = placeholder;
        
        this.showToast(`Switched to ${service === 'spotify' ? 'Spotify' : 'YouTube Music'}`, 'info');
    }

    async loadMusicServiceStatus() {
        try {
            const response = await fetch('/api/music-services/status');
            const data = await response.json();
            
            // Update Spotify tab availability
            if (this.spotifyTab) {
                if (data.spotify.available) {
                    this.spotifyTab.classList.remove('opacity-50', 'cursor-not-allowed');
                    this.spotifyTab.title = 'Search Spotify';
                } else {
                    this.spotifyTab.classList.add('opacity-50', 'cursor-not-allowed');
                    this.spotifyTab.title = 'Spotify not configured - run setup_spotify_auth.js';
                    
                    // Switch to YouTube if Spotify was selected but not available
                    if (this.currentMusicService === 'spotify') {
                        this.switchMusicService('youtube');
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load music service status:', error);
        }
    }

    // Music search methods (unified for both YouTube and Spotify)
    async searchMusic() {
        if (this.currentMusicService === 'spotify') {
            return this.searchSpotify();
        } else {
            return this.searchYouTubeMusic();
        }
    }

    async searchYouTubeMusic() {
        const query = this.searchQuery.value.trim();
        if (!query) {
            this.showToast('Please enter a search query', 'error');
            return;
        }

        this.searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        this.searchBtn.disabled = true;

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=10`);
            const data = await response.json();

            if (response.ok && data.results) {
                this.displaySearchResults(data.results, 'youtube');
            } else {
                throw new Error(data.error || 'Search failed');
            }
        } catch (error) {
            console.error('YouTube search error:', error);
            this.showToast('Failed to search YouTube Music', 'error');
        } finally {
            this.searchBtn.innerHTML = '<i class="fas fa-search"></i>';
            this.searchBtn.disabled = false;
        }
    }

    async searchSpotify() {
        const query = this.searchQuery.value.trim();
        if (!query) {
            this.showToast('Please enter a search query', 'error');
            return;
        }

        this.searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        this.searchBtn.disabled = true;

        try {
            const response = await fetch(`/api/search/spotify?q=${encodeURIComponent(query)}&limit=10`);
            const data = await response.json();

            if (response.ok && data.results) {
                this.displaySearchResults(data.results, 'spotify');
            } else if (response.status === 503) {
                this.showToast('Spotify not configured. Run setup_spotify_auth.js', 'warning');
                this.switchMusicService('youtube');
            } else {
                throw new Error(data.error || 'Search failed');
            }
        } catch (error) {
            console.error('Spotify search error:', error);
            this.showToast('Failed to search Spotify', 'error');
        } finally {
            this.searchBtn.innerHTML = '<i class="fas fa-search"></i>';
            this.searchBtn.disabled = false;
        }
    }

    displaySearchResults(results, service = 'youtube') {
        const searchResultsList = document.getElementById('searchResultsList');
        
        if (results.length === 0) {
            searchResultsList.innerHTML = '<p class="text-gray-400 text-center py-4">No results found</p>';
            this.searchResults.classList.remove('hidden');
            return;
        }

        const serviceIcon = service === 'spotify' ? 'fab fa-spotify text-green-400' : 'fab fa-youtube text-red-400';
        const serviceColor = service === 'spotify' ? 'bg-green-600 hover:bg-green-700' : 'bg-purple-600 hover:bg-purple-700';

        searchResultsList.innerHTML = results.map((song, index) => {
            const explicitBadge = song.explicit ? '<span class="bg-red-500 text-white px-1 py-0.5 rounded text-xs ml-1">E</span>' : '';
            const previewButton = song.preview_url ? 
                `<button class="preview-btn bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs transition-colors mr-1"
                        data-preview-url="${song.preview_url}"
                        title="Preview 30s">
                    <i class="fas fa-play"></i>
                </button>` : '';
            
            return `
                <div class="bg-gray-800 bg-opacity-50 rounded-lg p-3 flex items-center space-x-3 hover:bg-opacity-70 transition-all">
                    <img src="${song.thumbnail}" alt="Thumbnail" class="w-12 h-12 rounded shadow">
                    <div class="flex-1">
                        <div class="flex items-center">
                            <h4 class="font-semibold text-sm">${song.title}</h4>
                            ${explicitBadge}
                        </div>
                        <p class="text-gray-400 text-xs">${song.artist}</p>
                        <div class="flex items-center text-gray-500 text-xs">
                            <i class="${serviceIcon} mr-1"></i>
                            <span>${song.album} • ${song.duration_text}</span>
                            ${service === 'spotify' && song.popularity ? ` • ${song.popularity}% popular` : ''}
                        </div>
                    </div>
                    <div class="flex items-center">
                        ${previewButton}
                        <button class="add-song-btn ${serviceColor} px-3 py-1 rounded text-sm transition-colors"
                                data-service="${service}"
                                data-song-id="${service === 'spotify' ? song.id : song.videoId}"
                                data-title="${song.title}"
                                data-artist="${song.artist}"
                                data-thumbnail="${song.thumbnail}"
                                data-duration="${song.duration_text}"
                                data-album="${song.album}"
                                ${service === 'spotify' ? `data-uri="${song.uri}" data-preview-url="${song.preview_url || ''}"` : ''}>
                            <i class="fas fa-plus mr-1"></i>Add
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add event listeners to all buttons
        searchResultsList.querySelectorAll('.add-song-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const service = button.dataset.service;
                const songId = button.dataset.songId;
                const title = button.dataset.title;
                const artist = button.dataset.artist;
                const thumbnail = button.dataset.thumbnail;
                const duration = button.dataset.duration;
                const album = button.dataset.album;
                
                if (service === 'spotify') {
                    const uri = button.dataset.uri;
                    const previewUrl = button.dataset.previewUrl;
                    this.addSpotifySong(songId, title, artist, thumbnail, duration, album, uri, previewUrl);
                } else {
                    this.addYouTubeSong(songId, title, artist, thumbnail, duration);
                }
            });
        });

        // Add preview functionality for Spotify
        if (service === 'spotify') {
            searchResultsList.querySelectorAll('.preview-btn').forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.playPreview(button.dataset.previewUrl, button);
                });
            });
        }
        
        this.searchResults.classList.remove('hidden');
    }

    async addYouTubeSong(videoId, title, artist, thumbnail, duration) {
        const userName = this.userName.value.trim() || 'DJ';
        
        const songData = {
            song: {
                videoId: videoId,
                title: title,
                artist: artist,
                duration: duration,
                albumArt: thumbnail,
                source: 'youtube'
            },
            addedBy: userName
        };

        try {
            const response = await fetch('/api/queue/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(songData)
            });

            if (response.ok) {
                this.showToast('Song added to queue!', 'success');
                // Keep search results open so users can add more songs
                // this.searchQuery.value = '';
                // this.searchResults.classList.add('hidden');
            } else if (response.status === 409) {
                // Duplicate song
                const errorData = await response.json();
                this.showToast(errorData.message, 'warning');
            } else {
                throw new Error('Failed to add song');
            }
        } catch (error) {
            console.error('Error adding song:', error);
            this.showToast('Failed to add song to queue', 'error');
        }
    }

    async addSpotifySong(trackId, title, artist, thumbnail, duration, album, uri, previewUrl) {
        const userName = this.userName.value.trim() || 'DJ';
        
        const songData = {
            song: {
                spotifyId: trackId,
                title: title,
                artist: artist,
                duration: duration,
                albumArt: thumbnail,
                album: album,
                uri: uri,
                previewUrl: previewUrl,
                source: 'spotify'
            },
            addedBy: userName
        };

        try {
            const response = await fetch('/api/queue/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(songData)
            });

            if (response.ok) {
                this.showToast('Spotify song added to queue!', 'success');
            } else if (response.status === 409) {
                // Duplicate song
                const errorData = await response.json();
                this.showToast(errorData.message, 'warning');
            } else {
                throw new Error('Failed to add song');
            }
        } catch (error) {
            console.error('Error adding Spotify song:', error);
            this.showToast('Failed to add song to queue', 'error');
        }
    }

    // Spotify preview functionality
    playPreview(previewUrl, buttonElement) {
        if (!previewUrl) {
            this.showToast('No preview available for this track', 'info');
            return;
        }

        // Stop any currently playing preview
        if (this.currentPreviewAudio) {
            this.currentPreviewAudio.pause();
            this.currentPreviewAudio = null;
            
            // Reset all preview buttons
            document.querySelectorAll('.preview-btn').forEach(btn => {
                btn.innerHTML = '<i class="fas fa-play"></i>';
                btn.classList.remove('bg-red-600');
                btn.classList.add('bg-blue-600');
            });
        }

        // Create and play new preview
        this.currentPreviewAudio = new Audio(previewUrl);
        this.currentPreviewAudio.volume = 0.3; // Lower volume for preview
        
        buttonElement.innerHTML = '<i class="fas fa-stop"></i>';
        buttonElement.classList.remove('bg-blue-600');
        buttonElement.classList.add('bg-red-600');
        
        this.currentPreviewAudio.play().catch(error => {
            console.error('Preview playback failed:', error);
            this.showToast('Preview playback failed', 'error');
        });

        // Auto-stop after 30 seconds or when ended
        this.currentPreviewAudio.addEventListener('ended', () => {
            buttonElement.innerHTML = '<i class="fas fa-play"></i>';
            buttonElement.classList.remove('bg-red-600');
            buttonElement.classList.add('bg-blue-600');
            this.currentPreviewAudio = null;
        });

        // Stop preview when clicking the button again
        buttonElement.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (this.currentPreviewAudio) {
                this.currentPreviewAudio.pause();
                this.currentPreviewAudio = null;
                buttonElement.innerHTML = '<i class="fas fa-play"></i>';
                buttonElement.classList.remove('bg-red-600');
                buttonElement.classList.add('bg-blue-600');
                
                // Restore original click handler
                buttonElement.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.playPreview(previewUrl, buttonElement);
                };
            }
        };
    }

    playSpotifyPreview(previewUrl) {
        if (!previewUrl) {
            this.showToast('No preview available for this track', 'info');
            return;
        }

        // Stop any currently playing preview
        if (this.currentPreviewAudio) {
            this.currentPreviewAudio.pause();
            this.currentPreviewAudio = null;
        }

        // Create and play new preview
        this.currentPreviewAudio = new Audio(previewUrl);
        this.currentPreviewAudio.volume = 0.5; // Moderate volume for now playing preview
        
        // Connect visualizer to Spotify preview audio
        if (window.visualizer && jukeboxSettings.shouldAutoShowVisualizer('spotify')) {
            window.visualizer.connectToAudioSource(this.currentPreviewAudio);
            window.visualizer.show();
            window.visualizer.start();
        }
        
        this.currentPreviewAudio.play().catch(error => {
            console.error('Spotify preview playback failed:', error);
            this.showToast('Preview playback failed', 'error');
        });

        this.showToast('Playing 30-second Spotify preview', 'info');

        // Auto-stop after 30 seconds
        this.currentPreviewAudio.addEventListener('ended', () => {
            this.currentPreviewAudio = null;
            this.showToast('Preview ended', 'info');
            // Stop visualizer when preview ends
            if (window.visualizer) {
                window.visualizer.stop();
            }
        });
    }

    // YouTube Player Integration
    initializeYouTubePlayer() {
        this.player = new YT.Player('youtubePlayer', {
            height: '0',
            width: '0',
            playerVars: {
                'autoplay': 0,
                'controls': 0,
                'disablekb': 1,
                'fs': 0,
                'modestbranding': 1,
                'rel': 0,
                'preload': 'auto' // Enable preloading
            },
            events: {
                'onReady': (event) => this.onPlayerReady(event),
                'onStateChange': (event) => this.onPlayerStateChange(event)
            }
        });
        
        // Initialize pre-buffering system
        this.preBufferQueue = [];
        this.maxPreBuffer = 3; // Pre-buffer up to 3 songs
    }

    onPlayerReady(event) {
        this.isPlayerReady = true;
        this.setVolume(50); // Set default volume
        console.log('YouTube player ready');
        
        // Initialize visualizer with YouTube player
        if (window.visualizer && window.visualizer.show) {
            // For YouTube iframe player, we need to use a different approach
            // since we can't directly access the audio stream
            window.visualizer.show();
        }
        
        // If there's a current song, start playing it
        if (this.currentSong && this.currentSong.videoId) {
            this.playSong(this.currentSong.videoId);
        }
    }

    onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.playPauseBtn.innerHTML = '<i class="fas fa-pause mr-2"></i>Pause';
            this.startProgressTracking();
            
            // Start visualizer when playing
            if (window.visualizer && window.visualizer.start) {
                window.visualizer.start();
            }
        } else if (event.data === YT.PlayerState.PAUSED) {
            this.isPlaying = false;
            this.playPauseBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Play';
            this.stopProgressTracking();
            
            // Stop visualizer when paused
            if (window.visualizer && window.visualizer.stop) {
                window.visualizer.stop();
            }
        } else if (event.data === YT.PlayerState.ENDED) {
            this.playNextSong();
        }
    }

    playSong(videoId) {
        if (this.player && this.isPlayerReady) {
            this.player.loadVideoById(videoId);
            this.showPlayerControls();
        }
    }

    togglePlayPause() {
        console.log('🎵 Play/Pause button clicked');
        console.log('Current state - isPlaying:', this.isPlaying, 'currentSong:', this.currentSong);
        
        // Check if we're using the audio service (headless mode or fallback songs)
        if (this.currentSong && (this.currentSong.source === 'headless-audio' || this.currentSong.source === 'fallback')) {
            // Test socket connection first
            console.log('🏓 Testing socket connection before pause...');
            this.socket.emit('ping');
            
            // Send pause/resume command to audio service
            if (this.isPlaying) {
                console.log('📤 Sending pause command to audio service');
                this.socket.emit('pauseCommand');
            } else {
                console.log('📤 Sending resume command to audio service');
                this.socket.emit('resumeCommand');
            }
            return;
        }
        
        // If no song is currently playing, try to start the queue
        if (!this.currentSong && !this.isPlaying) {
            console.log('🚀 No song playing, sending manual play command to audio service...');
            this.socket.emit('manualPlayCommand');
            return;
        }
        
        // Fallback to YouTube player if available
        if (!this.player || !this.isPlayerReady) {
            console.log('⚠️ No YouTube player available');
            return;
        }
        
        if (this.isPlaying) {
            this.player.pauseVideo();
        } else {
            this.player.playVideo();
        }
    }

    setVolume(volume) {
        if (this.player && this.isPlayerReady) {
            this.player.setVolume(volume);
        }
    }
    
    async testAudio() {
        const testAudioBtn = document.getElementById('testAudioBtn');
        if (!testAudioBtn) return;
        
        // Disable button and show loading state
        testAudioBtn.disabled = true;
        testAudioBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Testing...';
        
        try {
            const response = await fetch('/api/audio/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Show success state
                testAudioBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Playing Test';
                testAudioBtn.className = 'player-btn bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors';
                
                // Reset button after 5 seconds
                setTimeout(() => {
                    testAudioBtn.disabled = false;
                    testAudioBtn.innerHTML = '<i class="fas fa-volume-up mr-2"></i>Test Audio';
                    testAudioBtn.className = 'player-btn bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg transition-colors';
                }, 5000);
            } else {
                throw new Error(result.message || 'Test audio failed');
            }
        } catch (error) {
            console.error('Test audio error:', error);
            
            // Show error state
            testAudioBtn.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>Error';
            testAudioBtn.className = 'player-btn bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors';
            
            // Reset button after 3 seconds
            setTimeout(() => {
                testAudioBtn.disabled = false;
                testAudioBtn.innerHTML = '<i class="fas fa-volume-up mr-2"></i>Test Audio';
                testAudioBtn.className = 'player-btn bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg transition-colors';
            }, 3000);
        }
    }
    
    updateAudioServiceStatus(data) {
        console.log('📊 updateAudioServiceStatus called with:', {
            isPlaying: data.isPlaying,
            isPaused: data.isPaused,
            currentSong: data.currentSong?.title,
            position: data.position,
            duration: data.duration
        });
        
        // Update internal playing state
        this.isPlaying = data.isPlaying;
        
        // Update Now Playing display if audio service has a different song
        if (data.currentSong && data.isPlaying) {
            const audioServiceSong = data.currentSong;
            
            // Check if the audio service song is different from what we're showing
            if (!this.currentSong || this.currentSong.title !== audioServiceSong.title) {
                console.log('🔄 Audio service playing different song, updating display:', audioServiceSong.title);
                
                // Create a song object that matches our display format
                const displaySong = {
                    id: `audio-service-${Date.now()}`,
                    title: audioServiceSong.title,
                    artist: audioServiceSong.artist || 'Unknown Artist',
                    duration: this.formatTime(data.duration),
                    albumArt: audioServiceSong.albumArt || 'https://via.placeholder.com/100x100/6366f1/ffffff?text=♪',
                    addedBy: audioServiceSong.addedBy || '🎵 Audio Service',
                    source: 'headless-audio',
                    type: audioServiceSong.type || 'song'
                };
                
                this.updateNowPlaying(displaySong);
            }
        }
        
        // Update play/pause button based on audio service status
        const playPauseBtn = document.getElementById('playPauseBtn');
        if (playPauseBtn) {
            console.log('🔘 Updating play/pause button - isPlaying:', data.isPlaying, 'isPaused:', data.isPaused);
            
            if (data.isPlaying) {
                playPauseBtn.innerHTML = '<i class="fas fa-pause mr-2"></i>Pause';
                playPauseBtn.classList.remove('hidden');
                console.log('✅ Button set to Pause');
            } else if (data.isPaused) {
                playPauseBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Resume';
                playPauseBtn.classList.remove('hidden');
                console.log('✅ Button set to Resume (paused)');
            } else {
                playPauseBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Play';
                // Keep button visible even when not playing
                playPauseBtn.classList.remove('hidden');
                console.log('✅ Button set to Play');
            }
        } else {
            console.log('⚠️ Play/pause button not found in DOM');
        }
        
        // Update buffering status
        const bufferingStatus = document.getElementById('bufferingStatus');
        if (data.isBuffering && data.bufferingProgress) {
            if (bufferingStatus) {
                bufferingStatus.textContent = `📦 Buffering: ${data.bufferingProgress}`;
                bufferingStatus.classList.remove('hidden');
            }
        } else {
            if (bufferingStatus) {
                bufferingStatus.classList.add('hidden');
            }
        }
        
        // Update progress bar if audio service is playing
        if (data.isPlaying && data.currentSong && data.duration > 0) {
            const progressPercent = (data.position / data.duration) * 100;
            
            // Update progress bar
            const progressBar = document.getElementById('progressBar');
            if (progressBar) {
                progressBar.style.width = `${progressPercent}%`;
            }
            
            // Update time displays
            const currentTime = document.getElementById('currentTime');
            const totalTime = document.getElementById('totalTime');
            
            if (currentTime) {
                currentTime.textContent = this.formatTime(data.position);
            }
            
            if (totalTime) {
                totalTime.textContent = this.formatTime(data.duration);
            }
            
            // Show progress container
            const progressContainer = document.getElementById('progressContainer');
            if (progressContainer) {
                progressContainer.classList.remove('hidden');
            }
        } else {
            // Hide progress container when not playing
            const progressContainer = document.getElementById('progressContainer');
            if (progressContainer) {
                progressContainer.classList.add('hidden');
            }
        }
    }

    toggleVolumeControl() {
        this.volumeControl.classList.toggle('hidden');
    }

    showPlayerControls() {
        this.playPauseBtn.classList.remove('hidden');
        this.volumeBtn.classList.remove('hidden');
        this.progressContainer.classList.remove('hidden');
        this.audioPlayer.classList.remove('hidden');
    }

    hidePlayerControls() {
        this.playPauseBtn.classList.add('hidden');
        this.volumeBtn.classList.add('hidden');
        this.progressContainer.classList.add('hidden');
        this.volumeControl.classList.add('hidden');
        this.audioPlayer.classList.add('hidden');
        this.stopProgressTracking();
    }

    startProgressTracking() {
        this.progressInterval = setInterval(() => {
            if (this.player && this.isPlayerReady && this.isPlaying) {
                const currentTime = this.player.getCurrentTime();
                const duration = this.player.getDuration();
                
                if (duration > 0) {
                    const progress = (currentTime / duration) * 100;
                    this.progressBar.style.width = progress + '%';
                    
                    this.currentTime.textContent = this.formatTime(currentTime);
                    this.totalTime.textContent = this.formatTime(duration);
                }
            }
        }, 1000);
    }

    stopProgressTracking() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // DJ Control Methods
    initializeDragAndDrop() {
        if (this.sortable) {
            this.sortable.destroy();
        }
        
        this.sortable = Sortable.create(this.queueList, {
            animation: 150,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            onEnd: (evt) => {
                if (evt.oldIndex !== evt.newIndex) {
                    this.reorderQueue(evt.oldIndex, evt.newIndex);
                }
            }
        });
    }

    async reorderQueue(oldIndex, newIndex) {
        try {
            const response = await fetch('/api/queue/reorder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    oldIndex: oldIndex,
                    newIndex: newIndex
                })
            });

            if (response.ok) {
                this.showToast('Queue reordered!', 'success');
            } else {
                throw new Error('Failed to reorder queue');
            }
        } catch (error) {
            console.error('Error reordering queue:', error);
            this.showToast('Failed to reorder queue', 'error');
            // Reload the page to reset the queue display
            location.reload();
        }
    }

    async addMicBreak() {
        const micBreak = {
            song: {
                id: `mic-break-${Date.now()}`,
                title: '🎤 Microphone Break',
                artist: 'DJ Announcement',
                duration: '∞',
                albumArt: '',
                type: 'mic-break'
            },
            addedBy: 'DJ'
        };

        try {
            const response = await fetch('/api/queue/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(micBreak)
            });

            if (response.ok) {
                this.showToast('Mic break added to queue!', 'success');
            } else {
                throw new Error('Failed to add mic break');
            }
        } catch (error) {
            console.error('Error adding mic break:', error);
            this.showToast('Failed to add mic break', 'error');
        }
    }

    async clearQueue() {
        if (!confirm('Are you sure you want to clear the entire queue?')) {
            return;
        }

        try {
            const response = await fetch('/api/queue/clear', {
                method: 'POST'
            });

            if (response.ok) {
                this.showToast('Queue cleared!', 'success');
            } else {
                throw new Error('Failed to clear queue');
            }
        } catch (error) {
            console.error('Error clearing queue:', error);
            this.showToast('Failed to clear queue', 'error');
        }
    }

    async parkQueue() {
        try {
            const response = await fetch('/api/queue/park', {
                method: 'POST'
            });

            if (response.ok) {
                const data = await response.json();
                this.showToast(data.message, 'success');
            } else {
                throw new Error('Failed to park queue');
            }
        } catch (error) {
            console.error('Error parking queue:', error);
            this.showToast('Failed to park queue', 'error');
        }
    }

    async parkCurrentQueue() {
        if (this.currentQueue.length === 0) {
            this.showToast('No songs in queue to park', 'info');
            return;
        }

        if (!confirm(`Park all ${this.currentQueue.length} songs currently in queue? They'll be held until unparked.`)) {
            return;
        }

        try {
            const response = await fetch('/api/queue/park-current', {
                method: 'POST'
            });

            if (response.ok) {
                const data = await response.json();
                this.showToast(data.message, 'success');
            } else {
                throw new Error('Failed to park current queue');
            }
        } catch (error) {
            console.error('Error parking current queue:', error);
            this.showToast('Failed to park current queue', 'error');
        }
    }

    async unparkQueue() {
        try {
            const response = await fetch('/api/queue/unpark', {
                method: 'POST'
            });

            if (response.ok) {
                const data = await response.json();
                this.showToast(data.message, 'success');
            } else {
                throw new Error('Failed to unpark queue');
            }
        } catch (error) {
            console.error('Error unparking queue:', error);
            this.showToast('Failed to unpark queue', 'error');
        }
    }

    async resetPlaylist() {
        if (!confirm('Reset the wedding playlist back to the first song?')) {
            return;
        }

        try {
            const response = await fetch('/api/playlist/reset', {
                method: 'POST'
            });

            if (response.ok) {
                this.showToast('Wedding playlist reset to beginning!', 'success');
            } else {
                throw new Error('Failed to reset playlist');
            }
        } catch (error) {
            console.error('Error resetting playlist:', error);
            this.showToast('Failed to reset playlist', 'error');
        }
    }

    async showPlaylistBrowser() {
        try {
            const response = await fetch('/api/playlist/full');
            const data = await response.json();
            
            // Also get suppressed songs
            const suppressedResponse = await fetch('/api/playlist/suppressed');
            const suppressedData = await suppressedResponse.json();
            this.suppressedSongs = new Set(suppressedData.suppressedSongs);
            
            this.fullPlaylist = data.playlist;
            this.currentPlaylistIndex = data.currentIndex;
            
            this.displayPlaylistBrowser(data.playlist, data.currentIndex);
            this.playlistBrowser.classList.remove('hidden');
            
            // Focus on search input for quick searching
            setTimeout(() => this.playlistSearchInput.focus(), 100);
        } catch (error) {
            console.error('Error loading playlist:', error);
            this.showToast('Failed to load wedding playlist', 'error');
        }
    }

    hidePlaylistBrowser() {
        this.playlistBrowser.classList.add('hidden');
        this.clearPlaylistSearch();
    }

    togglePlaylistView() {
        this.playlistDetailedView = !this.playlistDetailedView;
        
        // Update button text and icon
        if (this.playlistDetailedView) {
            this.togglePlaylistViewBtn.innerHTML = '<i class="fas fa-compress-alt mr-1"></i>Compact';
        } else {
            this.togglePlaylistViewBtn.innerHTML = '<i class="fas fa-expand-alt mr-1"></i>Detailed';
        }
        
        // Refresh the current display
        if (this.fullPlaylist.length > 0) {
            this.displayPlaylistBrowser(this.fullPlaylist, this.currentPlaylistIndex);
        }
    }

    filterPlaylist(searchTerm) {
        if (!searchTerm.trim()) {
            this.displayPlaylistBrowser(this.fullPlaylist, this.currentPlaylistIndex);
            return;
        }

        const filtered = this.fullPlaylist.filter((song, index) => {
            const songName = this.parsePlaylistSong(song.search).toLowerCase();
            const searchString = song.search.toLowerCase();
            const songType = song.type.toLowerCase();
            const term = searchTerm.toLowerCase();
            
            return songName.includes(term) || 
                   searchString.includes(term) || 
                   songType.includes(term) ||
                   (index + 1).toString().includes(term); // Allow searching by number
        });

        if (filtered.length === 0) {
            this.playlistItems.innerHTML = '';
            this.playlistNoResults.classList.remove('hidden');
        } else {
            this.playlistNoResults.classList.add('hidden');
            this.displayFilteredPlaylist(filtered);
        }
    }

    filterPlaylistByType(type) {
        this.playlistSearchInput.value = type;
        this.filterPlaylist(type);
    }

    clearPlaylistSearch() {
        this.playlistSearchInput.value = '';
        this.playlistNoResults.classList.add('hidden');
        if (this.fullPlaylist.length > 0) {
            this.displayPlaylistBrowser(this.fullPlaylist, this.currentPlaylistIndex);
        }
    }

    clearSearch() {
        this.searchQuery.value = '';
        this.searchResults.classList.add('hidden');
        this.showToast('Search cleared', 'info');
    }

    displayFilteredPlaylist(filteredPlaylist) {
        // Create a map of original indices for filtered songs
        const originalIndices = filteredPlaylist.map(song => 
            this.fullPlaylist.findIndex(originalSong => 
                originalSong.search === song.search && originalSong.type === song.type
            )
        );

        this.playlistItems.innerHTML = filteredPlaylist.map((song, filterIndex) => {
            const originalIndex = originalIndices[filterIndex];
            const isCurrentSong = originalIndex === this.currentPlaylistIndex;
            const isSuppressed = this.suppressedSongs.has(originalIndex);
            const bgColor = isSuppressed ? 'bg-red-800 bg-opacity-50' : 
                           isCurrentSong ? 'bg-amber-600 bg-opacity-70' : 
                           'bg-gray-800 bg-opacity-50 hover:bg-gray-700 hover:bg-opacity-70';
            const textColor = isSuppressed ? 'text-red-200 line-through' :
                             isCurrentSong ? 'text-amber-100' : 'text-gray-200';
            const icon = isSuppressed ? 'fas fa-ban text-red-400' :
                        isCurrentSong ? 'fas fa-play text-amber-300' : 'fas fa-music text-gray-400';
            
            if (this.playlistDetailedView) {
                // Detailed view with artist and type
                const { title, artist } = this.parsePlaylistSongDetails(song.search);
                return `
                    <div class="playlist-item ${bgColor} rounded p-3 flex items-center space-x-3 transition-all"
                         ${!isSuppressed ? `onclick="jukebox.jumpToPlaylistSong(${originalIndex})" style="cursor: pointer;"` : ''}>
                        <div class="w-6 text-center">
                            <span class="text-xs font-mono ${textColor}">${(originalIndex + 1).toString().padStart(2, '0')}</span>
                        </div>
                        <div class="w-4">
                            <i class="${icon} text-sm"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium ${textColor} truncate">${title}</div>
                            <div class="text-xs text-gray-400 truncate ${isSuppressed ? 'line-through' : ''}">${artist}</div>
                            <div class="text-xs text-gray-500 ${isSuppressed ? 'line-through' : ''}">${song.type}</div>
                        </div>
                        <div class="flex space-x-1">
                            ${isSuppressed ? 
                                `<button onclick="jukebox.unsuppressSong(${originalIndex})" class="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs transition-colors" title="Restore song">
                                    <i class="fas fa-undo"></i>
                                </button>` :
                                `<button onclick="jukebox.suppressSong(${originalIndex})" class="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs transition-colors" title="Suppress song">
                                    <i class="fas fa-ban"></i>
                                </button>`
                            }
                        </div>
                        ${isCurrentSong ? '<div class="text-xs text-amber-300 font-semibold ml-2">CURRENT</div>' : ''}
                        ${isSuppressed ? '<div class="text-xs text-red-300 font-semibold ml-2">SUPPRESSED</div>' : ''}
                    </div>
                `;
            } else {
                // Compact view (original format)
                const songName = this.parsePlaylistSong(song.search);
                return `
                    <div class="playlist-item ${bgColor} rounded p-2 flex items-center space-x-3 transition-all"
                         ${!isSuppressed ? `onclick="jukebox.jumpToPlaylistSong(${originalIndex})" style="cursor: pointer;"` : ''}>
                        <div class="w-6 text-center">
                            <span class="text-xs font-mono ${textColor}">${(originalIndex + 1).toString().padStart(2, '0')}</span>
                        </div>
                        <div class="w-4">
                            <i class="${icon} text-sm"></i>
                        </div>
                        <div class="flex-1">
                            <span class="text-sm font-medium ${textColor}">${songName}</span>
                            <span class="text-xs text-gray-400 ml-2 ${isSuppressed ? 'line-through' : ''}">(${song.type})</span>
                        </div>
                        <div class="flex space-x-1">
                            ${isSuppressed ? 
                                `<button onclick="jukebox.unsuppressSong(${originalIndex})" class="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs transition-colors" title="Restore song">
                                    <i class="fas fa-undo"></i>
                                </button>` :
                                `<button onclick="jukebox.suppressSong(${originalIndex})" class="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs transition-colors" title="Suppress song">
                                    <i class="fas fa-ban"></i>
                                </button>`
                            }
                        </div>
                        ${isCurrentSong ? '<div class="text-xs text-amber-300 font-semibold">CURRENT</div>' : ''}
                        ${isSuppressed ? '<div class="text-xs text-red-300 font-semibold">SUPPRESSED</div>' : ''}
                    </div>
                `;
            }
        }).join('');
    }

    displayPlaylistBrowser(playlist, currentIndex) {
        this.playlistNoResults.classList.add('hidden');
        this.playlistItems.innerHTML = playlist.map((song, index) => {
            const isCurrentSong = index === currentIndex;
            const isSuppressed = this.suppressedSongs.has(index);
            const bgColor = isSuppressed ? 'bg-red-800 bg-opacity-50' : 
                           isCurrentSong ? 'bg-amber-600 bg-opacity-70' : 
                           'bg-gray-800 bg-opacity-50 hover:bg-gray-700 hover:bg-opacity-70';
            const textColor = isSuppressed ? 'text-red-200 line-through' :
                             isCurrentSong ? 'text-amber-100' : 'text-gray-200';
            const icon = isSuppressed ? 'fas fa-ban text-red-400' :
                        isCurrentSong ? 'fas fa-play text-amber-300' : 'fas fa-music text-gray-400';
            
            if (this.playlistDetailedView) {
                // Detailed view with artist and type
                const { title, artist } = this.parsePlaylistSongDetails(song.search);
                return `
                    <div class="playlist-item ${bgColor} rounded p-3 flex items-center space-x-3 transition-all"
                         ${!isSuppressed ? `onclick="jukebox.jumpToPlaylistSong(${index})" style="cursor: pointer;"` : ''}>
                        <div class="w-6 text-center">
                            <span class="text-xs font-mono ${textColor}">${(index + 1).toString().padStart(2, '0')}</span>
                        </div>
                        <div class="w-4">
                            <i class="${icon} text-sm"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium ${textColor} truncate">${title}</div>
                            <div class="text-xs text-gray-400 truncate ${isSuppressed ? 'line-through' : ''}">${artist}</div>
                            <div class="text-xs text-gray-500 ${isSuppressed ? 'line-through' : ''}">${song.type}</div>
                        </div>
                        <div class="flex space-x-1">
                            ${isSuppressed ? 
                                `<button onclick="jukebox.unsuppressSong(${index})" class="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs transition-colors" title="Restore song">
                                    <i class="fas fa-undo"></i>
                                </button>` :
                                `<button onclick="jukebox.suppressSong(${index})" class="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs transition-colors" title="Suppress song">
                                    <i class="fas fa-ban"></i>
                                </button>`
                            }
                        </div>
                        ${isCurrentSong ? '<div class="text-xs text-amber-300 font-semibold ml-2">CURRENT</div>' : ''}
                        ${isSuppressed ? '<div class="text-xs text-red-300 font-semibold ml-2">SUPPRESSED</div>' : ''}
                    </div>
                `;
            } else {
                // Compact view (original format)
                const songName = this.parsePlaylistSong(song.search);
                return `
                    <div class="playlist-item ${bgColor} rounded p-2 flex items-center space-x-3 transition-all"
                         ${!isSuppressed ? `onclick="jukebox.jumpToPlaylistSong(${index})" style="cursor: pointer;"` : ''}>
                        <div class="w-6 text-center">
                            <span class="text-xs font-mono ${textColor}">${(index + 1).toString().padStart(2, '0')}</span>
                        </div>
                        <div class="w-4">
                            <i class="${icon} text-sm"></i>
                        </div>
                        <div class="flex-1">
                            <span class="text-sm font-medium ${textColor}">${songName}</span>
                            <span class="text-xs text-gray-400 ml-2 ${isSuppressed ? 'line-through' : ''}">(${song.type})</span>
                        </div>
                        <div class="flex space-x-1">
                            ${isSuppressed ? 
                                `<button onclick="jukebox.unsuppressSong(${index})" class="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs transition-colors" title="Restore song">
                                    <i class="fas fa-undo"></i>
                                </button>` :
                                `<button onclick="jukebox.suppressSong(${index})" class="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs transition-colors" title="Suppress song">
                                    <i class="fas fa-ban"></i>
                                </button>`
                            }
                        </div>
                        ${isCurrentSong ? '<div class="text-xs text-amber-300 font-semibold">CURRENT</div>' : ''}
                        ${isSuppressed ? '<div class="text-xs text-red-300 font-semibold">SUPPRESSED</div>' : ''}
                    </div>
                `;
            }
        }).join('');
    }

    parsePlaylistSongDetails(searchString) {
        if (!searchString) return { title: 'Unknown Song', artist: 'Unknown Artist' };
        
        // Try to parse the search string to extract title and artist
        // Common patterns: "Song Title Artist Name", "Song Title by Artist", etc.
        const parts = searchString.split(' ');
        
        // Look for common separators or patterns
        if (searchString.includes(' by ')) {
            const [title, artist] = searchString.split(' by ');
            return { title: title.trim(), artist: artist.trim() };
        }
        
        // For orchestral/instrumental versions, try to identify the original song
        if (searchString.includes('Orchestral') || searchString.includes('Piano') || searchString.includes('Instrumental')) {
            // Pattern: "Song Title Artist/Version Info"
            // Take first 2-3 words as title, rest as artist/version
            if (parts.length >= 3) {
                const title = parts.slice(0, 2).join(' ');
                const artist = parts.slice(2).join(' ');
                return { title, artist };
            }
        }
        
        // Default: first 2 words as title, rest as artist
        if (parts.length >= 3) {
            const title = parts.slice(0, 2).join(' ');
            const artist = parts.slice(2).join(' ');
            return { title, artist };
        } else if (parts.length === 2) {
            return { title: parts[0], artist: parts[1] };
        }
        
        return { title: searchString, artist: 'Various Artists' };
    }

    async jumpToPlaylistSong(index) {
        try {
            const response = await fetch('/api/playlist/jump', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ index: index })
            });

            if (response.ok) {
                const data = await response.json();
                this.showToast(data.message, 'success');
                this.hidePlaylistBrowser();
                
                // Update the browser display to reflect new position
                setTimeout(() => this.updatePlaylistStatus(), 500);
            } else {
                throw new Error('Failed to jump to playlist position');
            }
        } catch (error) {
            console.error('Error jumping to playlist position:', error);
            this.showToast('Failed to jump to playlist position', 'error');
        }
    }

    // Override the onPlayerStateChange method to handle mic breaks
    onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.playPauseBtn.innerHTML = '<i class="fas fa-pause mr-2"></i>Pause';
            this.startProgressTracking();
        } else if (event.data === YT.PlayerState.PAUSED) {
            this.isPlaying = false;
            this.playPauseBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Play';
            this.stopProgressTracking();
        } else if (event.data === YT.PlayerState.ENDED) {
            // Check if current song is a mic break
            if (this.currentSong && this.currentSong.type === 'mic-break') {
                this.showToast('Mic break ended - click Next Song when ready', 'info');
            } else {
                this.playNextSong();
            }
        }
    }

    updateMicBreakDisplay(song) {
        this.nowPlaying.innerHTML = `
            <div class="bg-gradient-to-br from-orange-600 to-red-600 rounded-lg p-6 mb-4 pulse-glow">
                <div class="flex items-center space-x-4">
                    <div class="w-20 h-20 rounded-lg shadow-lg bg-orange-700 flex items-center justify-center">
                        <i class="fas fa-microphone text-4xl text-white"></i>
                    </div>
                    <div class="flex-1">
                        <h3 class="text-2xl font-bold">🎤 Microphone Break</h3>
                        <p class="text-lg text-orange-200">DJ Announcement Time</p>
                        <p class="text-sm text-orange-300">Music paused for microphone use</p>
                    </div>
                    <div class="text-right">
                        <div class="text-3xl">
                            <i class="fas fa-pause-circle text-orange-400"></i>
                        </div>
                        <p class="text-sm text-orange-200">Manual</p>
                    </div>
                </div>
                <div class="mt-4 text-center">
                    <p class="text-orange-200 text-sm">🎙️ Use your microphone for announcements, then click "Next Song" to continue</p>
                </div>
            </div>
        `;
    }

    async suppressSong(index) {
        try {
            const response = await fetch('/api/playlist/suppress', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ index: index })
            });

            if (response.ok) {
                const data = await response.json();
                this.showToast(data.message, 'success');
            } else {
                throw new Error('Failed to suppress song');
            }
        } catch (error) {
            console.error('Error suppressing song:', error);
            this.showToast('Failed to suppress song', 'error');
        }
    }

    async unsuppressSong(index) {
        try {
            const response = await fetch('/api/playlist/unsuppress', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ index: index })
            });

            if (response.ok) {
                const data = await response.json();
                this.showToast(data.message, 'success');
            } else {
                throw new Error('Failed to unsuppress song');
            }
        } catch (error) {
            console.error('Error unsuppressing song:', error);
            this.showToast('Failed to unsuppress song', 'error');
        }
    }

    // Pre-buffering system to reduce loading delays
    preBufferUpcomingSongs() {
        if (!this.player || !this.isPlayerReady) return;
        
        // Get next few songs to pre-buffer
        const songsToBuffer = [];
        
        // Add queue songs
        if (this.currentQueue && this.currentQueue.length > 0) {
            songsToBuffer.push(...this.currentQueue.slice(0, this.maxPreBuffer));
        }
        
        // If queue is short, add fallback songs
        if (songsToBuffer.length < this.maxPreBuffer) {
            this.preBufferFallbackSongs(this.maxPreBuffer - songsToBuffer.length);
        }
        
        // Pre-buffer the songs
        songsToBuffer.forEach((song, index) => {
            if (song.videoId && !this.preBufferQueue.includes(song.videoId)) {
                setTimeout(() => this.preBufferSong(song.videoId), index * 1000); // Stagger requests
            }
        });
    }

    async preBufferFallbackSongs(count) {
        try {
            const response = await fetch('/api/playlist/status');
            const data = await response.json();
            
            // Get upcoming fallback songs
            const upcomingSongs = [];
            for (let i = 1; i <= count && i < 10; i++) { // Don't go too far ahead
                const nextIndex = (data.currentIndex + i) % data.totalSongs;
                upcomingSongs.push({ index: nextIndex });
            }
            
            // Pre-buffer these fallback songs
            upcomingSongs.forEach((songInfo, index) => {
                setTimeout(() => this.preBufferFallbackSong(songInfo.index), (index + 1) * 1500);
            });
        } catch (error) {
            console.error('Error pre-buffering fallback songs:', error);
        }
    }

    async preBufferFallbackSong(playlistIndex) {
        try {
            const response = await fetch('/api/playlist/full');
            const data = await response.json();
            
            if (data.playlist && data.playlist[playlistIndex]) {
                const playlistItem = data.playlist[playlistIndex];
                const searchResults = await this.searchForPreBuffer(playlistItem.search);
                
                if (searchResults && searchResults.length > 0) {
                    this.preBufferSong(searchResults[0].videoId);
                }
            }
        } catch (error) {
            console.error('Error pre-buffering fallback song:', error);
        }
    }

    async searchForPreBuffer(query) {
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=1`);
            const data = await response.json();
            return data.results || [];
        } catch (error) {
            console.error('Error searching for pre-buffer:', error);
            return [];
        }
    }

    preBufferSong(videoId) {
        if (!videoId || this.preBufferQueue.includes(videoId)) return;
        
        try {
            // Create a hidden iframe to pre-load the video
            const preBufferFrame = document.createElement('iframe');
            preBufferFrame.style.display = 'none';
            preBufferFrame.style.width = '1px';
            preBufferFrame.style.height = '1px';
            preBufferFrame.src = `https://www.youtube.com/embed/${videoId}?autoplay=0&mute=1&controls=0`;
            preBufferFrame.setAttribute('data-video-id', videoId);
            preBufferFrame.setAttribute('data-buffer-time', new Date().toISOString());
            
            document.body.appendChild(preBufferFrame);
            
            // Add to pre-buffer queue
            this.preBufferQueue.push(videoId);
            this.updateBufferStatus();
            
            // Remove old pre-buffered videos to save memory
            if (this.preBufferQueue.length > this.maxPreBuffer * 2) {
                const oldVideoId = this.preBufferQueue.shift();
                const oldFrame = document.querySelector(`iframe[data-video-id="${oldVideoId}"]`);
                if (oldFrame) {
                    oldFrame.remove();
                }
            }
            
            // Remove the frame after 30 seconds to save memory
            setTimeout(() => {
                if (preBufferFrame.parentNode) {
                    preBufferFrame.remove();
                }
                const index = this.preBufferQueue.indexOf(videoId);
                if (index > -1) {
                    this.preBufferQueue.splice(index, 1);
                    this.updateBufferStatus();
                }
            }, 30000);
            
            console.log(`Pre-buffering: ${videoId}`);
            this.showToast(`Buffered song ${this.preBufferQueue.length}/${this.maxPreBuffer}`, 'info');
        } catch (error) {
            console.error('Error pre-buffering song:', error);
        }
    }

    updateBufferStatus() {
        if (this.bufferCount) {
            this.bufferCount.textContent = this.preBufferQueue.length;
            
            // Update buffer status color based on connection quality
            if (this.bufferStatus) {
                const qualityText = this.connectionQuality === 'good' ? 'Good' :
                                  this.connectionQuality === 'fair' ? 'Fair' : 'Poor';
                
                this.bufferStatus.className = `px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer ${
                    this.connectionQuality === 'good' ? 'bg-green-600' :
                    this.connectionQuality === 'fair' ? 'bg-yellow-600' : 'bg-red-600'
                }`;
                
                this.bufferStatus.title = `Connection: ${qualityText} | Buffered: ${this.preBufferQueue.length}/${this.maxPreBuffer} songs | Click to buffer more`;
            }
        }
    }

    // Enhanced playSong method with better buffering
    playSong(videoId) {
        if (this.player && this.isPlayerReady) {
            // Show buffering indicator
            this.showBufferingIndicator();
            
            // Set quality to auto (YouTube will choose best for connection)
            this.player.setPlaybackQuality('auto');
            
            // Load and play the video
            this.player.loadVideoById({
                videoId: videoId,
                startSeconds: 0,
                suggestedQuality: 'auto'
            });
            
            this.showPlayerControls();
            
            // Pre-buffer next songs when current song starts
            setTimeout(() => this.preBufferUpcomingSongs(), 2000);
        }
    }

    showBufferingIndicator() {
        // Add a subtle buffering indicator to the now playing section
        const bufferingDiv = document.createElement('div');
        bufferingDiv.id = 'bufferingIndicator';
        bufferingDiv.className = 'absolute top-2 right-2 bg-blue-600 text-white px-2 py-1 rounded text-xs';
        bufferingDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Loading...';
        
        const nowPlayingContainer = this.nowPlaying.querySelector('div');
        if (nowPlayingContainer) {
            nowPlayingContainer.style.position = 'relative';
            nowPlayingContainer.appendChild(bufferingDiv);
            
            // Remove after 10 seconds or when song starts playing
            setTimeout(() => {
                const indicator = document.getElementById('bufferingIndicator');
                if (indicator) indicator.remove();
            }, 10000);
        }
    }

    // Override onPlayerStateChange to handle buffering better
    onPlayerStateChange(event) {
        // Remove buffering indicator when video starts
        if (event.data === YT.PlayerState.PLAYING) {
            const indicator = document.getElementById('bufferingIndicator');
            if (indicator) indicator.remove();
            
            this.isPlaying = true;
            this.playPauseBtn.innerHTML = '<i class="fas fa-pause mr-2"></i>Pause';
            this.startProgressTracking();
        } else if (event.data === YT.PlayerState.PAUSED) {
            this.isPlaying = false;
            this.playPauseBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Play';
            this.stopProgressTracking();
        } else if (event.data === YT.PlayerState.BUFFERING) {
            // Show buffering indicator
            this.showBufferingIndicator();
            this.showToast('Buffering... Please wait', 'info');
        } else if (event.data === YT.PlayerState.ENDED) {
            // Check if current song is a mic break
            if (this.currentSong && this.currentSong.type === 'mic-break') {
                this.showToast('Mic break ended - click Next Song when ready', 'info');
            } else {
                this.playNextSong();
            }
        }
    }

    // Connection quality monitoring
    initializeConnectionMonitoring() {
        this.connectionQuality = 'good'; // good, fair, poor
        this.bufferHealthCheck();
        
        // Monitor connection every 30 seconds
        setInterval(() => this.bufferHealthCheck(), 30000);
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.showToast('Connection restored!', 'success');
            this.connectionQuality = 'good';
        });
        
        window.addEventListener('offline', () => {
            this.showToast('Connection lost - using cached songs', 'warning');
            this.connectionQuality = 'poor';
        });
    }

    async bufferHealthCheck() {
        const startTime = Date.now();
        
        try {
            // Test connection speed with a small API call
            await fetch('/api/playlist/status');
            const responseTime = Date.now() - startTime;
            
            console.log(`🌐 Connection test: ${responseTime}ms`);
            
            // Adjust buffering strategy based on response time
            if (responseTime < 500) {
                this.connectionQuality = 'good';
                this.maxPreBuffer = 3;
            } else if (responseTime < 2000) {
                this.connectionQuality = 'fair';
                this.maxPreBuffer = 5; // Buffer more on slower connections
                this.showToast(`Slow connection detected (${responseTime}ms) - increasing buffer`, 'info');
            } else {
                this.connectionQuality = 'poor';
                this.maxPreBuffer = 8; // Buffer even more on very slow connections
                this.showToast(`Very slow connection (${responseTime}ms) - buffering more songs`, 'warning');
            }
            
            this.updateBufferStatus();
        } catch (error) {
            this.connectionQuality = 'poor';
            this.maxPreBuffer = 8;
            console.error('Connection health check failed:', error);
        }
    }

    forceBufferMore() {
        this.showToast('Force buffering more songs...', 'info');
        this.maxPreBuffer = Math.min(this.maxPreBuffer + 3, 10); // Increase buffer, max 10
        this.preBufferUpcomingSongs();
    }

    showBufferDebug() {
        const debugInfo = {
            connectionQuality: this.connectionQuality,
            maxPreBuffer: this.maxPreBuffer,
            currentBufferCount: this.preBufferQueue.length,
            bufferedVideoIds: this.preBufferQueue,
            queueLength: this.currentQueue ? this.currentQueue.length : 0,
            currentSong: this.currentSong ? this.currentSong.title : 'None'
        };
        
        console.log('🎵 Buffer Debug Info:', debugInfo);
        
        // Show debug info in a toast
        const debugText = `Connection: ${this.connectionQuality} | Buffered: ${this.preBufferQueue.length}/${this.maxPreBuffer} | Queue: ${this.currentQueue ? this.currentQueue.length : 0}`;
        this.showToast(debugText, 'info');
        
        // Also show in alert for easy viewing
        alert(`Buffer Debug Info:
Connection Quality: ${this.connectionQuality}
Max Buffer Size: ${this.maxPreBuffer}
Currently Buffered: ${this.preBufferQueue.length} songs
Queue Length: ${this.currentQueue ? this.currentQueue.length : 0}
Current Song: ${this.currentSong ? this.currentSong.title : 'None'}

Check browser console (F12) for detailed video IDs`);
    }

    // Playlist Editor functionality
    initializePlaylistEditor() {
        // Playlist editor elements
        this.editPlaylistBtn = document.getElementById('editPlaylistBtn');
        this.playlistEditor = document.getElementById('playlistEditor');
        this.editingPlaylistName = document.getElementById('editingPlaylistName');
        this.addSongToPlaylistBtn = document.getElementById('addSongToPlaylistBtn');
        this.addSongForm = document.getElementById('addSongForm');
        this.newSongSearch = document.getElementById('newSongSearch');
        this.newSongType = document.getElementById('newSongType');
        this.confirmAddSongBtn = document.getElementById('confirmAddSongBtn');
        this.cancelAddSongBtn = document.getElementById('cancelAddSongBtn');
        this.savePlaylistBtn = document.getElementById('savePlaylistBtn');
        this.cancelEditBtn = document.getElementById('cancelEditBtn');
        this.editablePlaylistItems = document.getElementById('editablePlaylistItems');
        
        this.currentEditingPlaylist = null;
        this.editablePlaylist = [];
        
        // Bind playlist editor events
        this.editPlaylistBtn?.addEventListener('click', () => this.openPlaylistEditor());
        this.addSongToPlaylistBtn?.addEventListener('click', () => this.showAddSongForm());
        this.confirmAddSongBtn?.addEventListener('click', () => this.addSongToPlaylist());
        this.cancelAddSongBtn?.addEventListener('click', () => this.hideAddSongForm());
        this.savePlaylistBtn?.addEventListener('click', () => this.savePlaylist());
        this.cancelEditBtn?.addEventListener('click', () => this.closePlaylistEditor());
        
        // Enable drag and drop for reordering
        this.setupPlaylistDragAndDrop();
    }
    
    async openPlaylistEditor() {
        try {
            // Get current active playlist
            const playlistName = this.activePlaylist || 'wedding';
            this.currentEditingPlaylist = playlistName;
            
            // Fetch playlist data
            const response = await fetch(`/api/playlist/get/${playlistName}`);
            const data = await response.json();
            
            if (data.success) {
                this.editablePlaylist = [...data.playlist];
                this.editingPlaylistName.textContent = playlistName === 'wedding' ? 'Wedding Party' : 'Bride\'s Elegant';
                
                // Hide browser, show editor
                this.playlistBrowser.classList.add('hidden');
                this.playlistEditor.classList.remove('hidden');
                
                this.renderEditablePlaylist();
            } else {
                this.showToast('Failed to load playlist for editing', 'error');
            }
        } catch (error) {
            console.error('Error opening playlist editor:', error);
            this.showToast('Error opening playlist editor', 'error');
        }
    }
    
    closePlaylistEditor() {
        this.playlistEditor.classList.add('hidden');
        this.hideAddSongForm();
        this.currentEditingPlaylist = null;
        this.editablePlaylist = [];
    }
    
    showAddSongForm() {
        this.addSongForm.classList.remove('hidden');
        this.newSongSearch.focus();
    }
    
    hideAddSongForm() {
        this.addSongForm.classList.add('hidden');
        this.newSongSearch.value = '';
        this.newSongType.value = 'dance';
    }
    
    async addSongToPlaylist() {
        const search = this.newSongSearch.value.trim();
        const type = this.newSongType.value;
        
        if (!search) {
            this.showToast('Please enter a search query', 'error');
            return;
        }
        
        try {
            const response = await fetch(`/api/playlist/add-song/${this.currentEditingPlaylist}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ search, type })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Add to local editable playlist
                this.editablePlaylist.push({ search, type });
                this.renderEditablePlaylist();
                this.hideAddSongForm();
                this.showToast('Song added to playlist!', 'success');
            } else {
                this.showToast(data.error || 'Failed to add song', 'error');
            }
        } catch (error) {
            console.error('Error adding song:', error);
            this.showToast('Error adding song to playlist', 'error');
        }
    }
    
    async removeSongFromPlaylist(index) {
        if (!confirm('Remove this song from the playlist?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/playlist/remove-song/${this.currentEditingPlaylist}/${index}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Remove from local editable playlist
                this.editablePlaylist.splice(index, 1);
                this.renderEditablePlaylist();
                this.showToast('Song removed from playlist', 'success');
            } else {
                this.showToast(data.error || 'Failed to remove song', 'error');
            }
        } catch (error) {
            console.error('Error removing song:', error);
            this.showToast('Error removing song from playlist', 'error');
        }
    }
    
    async reorderPlaylist(fromIndex, toIndex) {
        try {
            const response = await fetch(`/api/playlist/reorder/${this.currentEditingPlaylist}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fromIndex, toIndex })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Update local editable playlist
                const [movedSong] = this.editablePlaylist.splice(fromIndex, 1);
                this.editablePlaylist.splice(toIndex, 0, movedSong);
                this.renderEditablePlaylist();
            } else {
                this.showToast(data.error || 'Failed to reorder playlist', 'error');
            }
        } catch (error) {
            console.error('Error reordering playlist:', error);
            this.showToast('Error reordering playlist', 'error');
        }
    }
    
    async savePlaylist() {
        try {
            const response = await fetch(`/api/playlist/save/${this.currentEditingPlaylist}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ playlist: this.editablePlaylist })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast(`Playlist saved! ${data.totalSongs} songs`, 'success');
                this.closePlaylistEditor();
                // Refresh playlist browser if it was open
                if (!this.playlistBrowser.classList.contains('hidden')) {
                    this.loadPlaylistBrowser();
                }
            } else {
                this.showToast(data.error || 'Failed to save playlist', 'error');
            }
        } catch (error) {
            console.error('Error saving playlist:', error);
            this.showToast('Error saving playlist', 'error');
        }
    }
    
    renderEditablePlaylist() {
        if (!this.editablePlaylistItems) return;
        
        this.editablePlaylistItems.innerHTML = '';
        
        this.editablePlaylist.forEach((song, index) => {
            const songElement = document.createElement('div');
            songElement.className = 'editable-playlist-item bg-purple-800 bg-opacity-50 rounded-lg p-3 flex items-center justify-between cursor-move';
            songElement.draggable = true;
            songElement.dataset.index = index;
            
            const songInfo = document.createElement('div');
            songInfo.className = 'flex-1';
            
            const songTitle = document.createElement('div');
            songTitle.className = 'font-medium text-purple-100';
            songTitle.textContent = song.search;
            
            const songMeta = document.createElement('div');
            songMeta.className = 'text-xs text-purple-300 mt-1';
            songMeta.innerHTML = `
                <span class="bg-purple-700 px-2 py-1 rounded">${song.type}</span>
                <span class="ml-2">#${index + 1}</span>
            `;
            
            songInfo.appendChild(songTitle);
            songInfo.appendChild(songMeta);
            
            const controls = document.createElement('div');
            controls.className = 'flex items-center space-x-2';
            
            const dragHandle = document.createElement('div');
            dragHandle.className = 'text-purple-400 cursor-move';
            dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'text-red-400 hover:text-red-300 transition-colors';
            removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.removeSongFromPlaylist(index);
            };
            
            controls.appendChild(dragHandle);
            controls.appendChild(removeBtn);
            
            songElement.appendChild(songInfo);
            songElement.appendChild(controls);
            
            this.editablePlaylistItems.appendChild(songElement);
        });
    }
    
    setupPlaylistDragAndDrop() {
        let draggedElement = null;
        let draggedIndex = null;
        
        // Use event delegation for dynamic elements
        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('editable-playlist-item')) {
                draggedElement = e.target;
                draggedIndex = parseInt(e.target.dataset.index);
                e.target.style.opacity = '0.5';
            }
        });
        
        document.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('editable-playlist-item')) {
                e.target.style.opacity = '1';
                draggedElement = null;
                draggedIndex = null;
            }
        });
        
        document.addEventListener('dragover', (e) => {
            if (e.target.closest('.editable-playlist-item')) {
                e.preventDefault();
            }
        });
        
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            const dropTarget = e.target.closest('.editable-playlist-item');
            
            if (dropTarget && draggedElement && dropTarget !== draggedElement) {
                const dropIndex = parseInt(dropTarget.dataset.index);
                
                if (draggedIndex !== null && draggedIndex !== dropIndex) {
                    this.reorderPlaylist(draggedIndex, dropIndex);
                }
            }
        });
    }
}

// Audio Visualizer Class
class AudioVisualizer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.bufferLength = 0;
        this.isActive = false;
        this.animationId = null;
        this.visualizerType = 'bars';
        this.currentSource = null; // Track current audio source
        this.colors = {
            primary: '#8b5cf6',
            secondary: '#a855f7',
            accent: '#ec4899',
            background: '#000000'
        };
        
        this.initializeElements();
        this.bindEvents();
    }
    
    initializeElements() {
        this.canvas = document.getElementById('visualizerCanvas');
        this.visualizerContainer = document.getElementById('visualizerContainer');
        this.visualizerToggle = document.getElementById('visualizerToggle');
        this.visualizerTypeSelect = document.getElementById('visualizerType');
        
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.resizeCanvas();
        } else {
            console.warn('Visualizer canvas not found - visualizer disabled');
        }
    }
    
    bindEvents() {
        if (this.visualizerToggle) {
            this.visualizerToggle.addEventListener('click', () => this.toggleVisualizer());
        }
        
        if (this.visualizerTypeSelect) {
            this.visualizerTypeSelect.addEventListener('change', (e) => {
                this.visualizerType = e.target.value;
            });
        }
        
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        if (!this.canvas) return;
        
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        this.canvas.width = rect.width - 32; // Account for padding
        this.canvas.height = 120;
    }
    
    async initializeAudioContext(audioElement) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            // Create analyser
            if (!this.analyser) {
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 256;
                this.bufferLength = this.analyser.frequencyBinCount;
                this.dataArray = new Uint8Array(this.bufferLength);
            }
            
            // Connect audio source
            if (audioElement) {
                // Disconnect any existing source
                if (this.currentSource) {
                    this.currentSource.disconnect();
                }
                
                const source = this.audioContext.createMediaElementSource(audioElement);
                source.connect(this.analyser);
                this.analyser.connect(this.audioContext.destination);
                this.currentSource = source;
            }
            
            return true;
        } catch (error) {
            console.warn('Failed to initialize audio context:', error);
            return false;
        }
    }
    
    show() {
        if (this.visualizerContainer) {
            this.visualizerContainer.classList.remove('hidden');
        }
    }
    
    hide() {
        if (this.visualizerContainer) {
            this.visualizerContainer.classList.add('hidden');
        }
        this.stop();
    }
    
    toggleVisualizer() {
        if (!this.visualizerContainer) return;
        
        if (this.isActive) {
            this.stop();
            if (this.visualizerToggle) {
                this.visualizerToggle.innerHTML = '<i class="fas fa-play mr-1"></i>Start';
            }
        } else {
            this.start();
            if (this.visualizerToggle) {
                this.visualizerToggle.innerHTML = '<i class="fas fa-pause mr-1"></i>Stop';
            }
        }
    }
    
    start() {
        if (!this.analyser || this.isActive) return;
        
        this.isActive = true;
        this.animate();
    }
    
    stop() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.clearCanvas();
        
        // Reset mode indicator to simulated when stopped
        const modeIndicator = document.getElementById('visualizerMode');
        if (modeIndicator) {
            modeIndicator.textContent = '(Simulated)';
            modeIndicator.className = 'text-xs text-gray-400 ml-2';
        }
    }
    
    animate() {
        if (!this.isActive) return;
        
        this.animationId = requestAnimationFrame(() => this.animate());
        
        if (this.analyser) {
            this.analyser.getByteFrequencyData(this.dataArray);
        }
        
        this.draw();
    }
    
    draw() {
        if (!this.ctx || !this.canvas) return;
        
        this.clearCanvas();
        
        switch (this.visualizerType) {
            case 'bars':
                this.drawBars();
                break;
            case 'waveform':
                this.drawWaveform();
                break;
            case 'circular':
                this.drawCircular();
                break;
        }
    }
    
    clearCanvas() {
        if (!this.ctx || !this.canvas) return;
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    drawBars() {
        if (!this.dataArray) return;
        
        const barWidth = this.canvas.width / this.bufferLength * 2;
        let x = 0;
        
        for (let i = 0; i < this.bufferLength; i++) {
            const barHeight = (this.dataArray[i] / 255) * this.canvas.height * 0.8;
            
            // Create gradient with more vibrant colors
            const gradient = this.ctx.createLinearGradient(0, this.canvas.height, 0, this.canvas.height - barHeight);
            gradient.addColorStop(0, this.colors.primary);
            gradient.addColorStop(0.5, this.colors.secondary);
            gradient.addColorStop(1, this.colors.accent);
            
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, this.canvas.height - barHeight, barWidth - 1, barHeight);
            
            // Add glow effect for higher frequencies
            if (this.dataArray[i] > 200) {
                this.ctx.shadowColor = this.colors.accent;
                this.ctx.shadowBlur = 10;
                this.ctx.fillRect(x, this.canvas.height - barHeight, barWidth - 1, barHeight);
                this.ctx.shadowBlur = 0;
            }
            
            x += barWidth;
        }
    }
    
    drawWaveform() {
        if (!this.dataArray) return;
        
        this.ctx.strokeStyle = this.colors.primary;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        const sliceWidth = this.canvas.width / this.bufferLength;
        let x = 0;
        
        for (let i = 0; i < this.bufferLength; i++) {
            const v = this.dataArray[i] / 255;
            const y = v * this.canvas.height;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        this.ctx.stroke();
    }
    
    drawCircular() {
        if (!this.dataArray) return;
        
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = Math.min(centerX, centerY) * 0.6;
        
        this.ctx.strokeStyle = this.colors.primary;
        this.ctx.lineWidth = 2;
        
        for (let i = 0; i < this.bufferLength; i++) {
            const angle = (i / this.bufferLength) * Math.PI * 2;
            const amplitude = (this.dataArray[i] / 255) * radius * 0.5;
            
            const x1 = centerX + Math.cos(angle) * radius;
            const y1 = centerY + Math.sin(angle) * radius;
            const x2 = centerX + Math.cos(angle) * (radius + amplitude);
            const y2 = centerY + Math.sin(angle) * (radius + amplitude);
            
            // Create gradient for each line
            const gradient = this.ctx.createLinearGradient(x1, y1, x2, y2);
            gradient.addColorStop(0, this.colors.primary);
            gradient.addColorStop(1, this.colors.accent);
            
            this.ctx.strokeStyle = gradient;
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
        }
    }
    
    // Method to connect to YouTube player or other audio sources
    connectToAudioSource(audioElement) {
        if (!audioElement) return;
        
        this.initializeAudioContext(audioElement).then(success => {
            if (success) {
                console.log('✅ Audio visualizer connected to audio source');
                
                // Update mode indicator
                const modeIndicator = document.getElementById('visualizerMode');
                if (modeIndicator) {
                    modeIndicator.textContent = '(Real Audio)';
                    modeIndicator.className = 'text-xs text-green-400 ml-2';
                }
                
                // If we successfully connected to real audio, stop simulation
                if (this.isActive && this.analyser) {
                    // Switch from simulation to real audio analysis
                    this.stop();
                    this.start();
                }
            }
        });
    }
    
    // Fallback visualizer for YouTube iframe (simulated visualization)
    startSimulatedVisualization() {
        if (this.isActive) return;
        
        this.isActive = true;
        this.simulateAudioData();
    }
    
    simulateAudioData() {
        if (!this.isActive) return;
        
        // Create simulated frequency data with some randomness and rhythm
        if (!this.dataArray) {
            this.bufferLength = 128;
            this.dataArray = new Uint8Array(this.bufferLength);
        }
        
        const time = Date.now() * 0.001;
        const bassFreq = Math.sin(time * 2) * 0.5 + 0.5;
        const midFreq = Math.sin(time * 4) * 0.3 + 0.4;
        const highFreq = Math.sin(time * 8) * 0.2 + 0.3;
        
        for (let i = 0; i < this.bufferLength; i++) {
            const freq = i / this.bufferLength;
            let amplitude = 0;
            
            if (freq < 0.1) {
                // Bass frequencies
                amplitude = bassFreq * (Math.random() * 0.3 + 0.7);
            } else if (freq < 0.5) {
                // Mid frequencies
                amplitude = midFreq * (Math.random() * 0.4 + 0.6);
            } else {
                // High frequencies
                amplitude = highFreq * (Math.random() * 0.5 + 0.5);
            }
            
            this.dataArray[i] = Math.floor(amplitude * 255);
        }
        
        this.animationId = requestAnimationFrame(() => this.simulateAudioData());
        this.draw();
    }
    
    start() {
        if (this.isActive) return;
        
        if (this.analyser) {
            // Real audio analysis
            this.isActive = true;
            this.animate();
        } else {
            // Fallback simulation for YouTube iframe
            this.startSimulatedVisualization();
        }
    }
}

// Initialize the jukebox when the page loads
const jukebox = new VirtualJukebox();

// Initialize visualizer after a short delay to ensure DOM is ready
setTimeout(() => {
    try {
        console.log('Initializing audio visualizer...');
        const visualizer = new AudioVisualizer();
        
        // Set default visualization type from settings
        visualizer.visualizerType = jukeboxSettings.get('defaultVisualizerType');
        const typeSelect = document.getElementById('visualizerType');
        if (typeSelect) {
            typeSelect.value = visualizer.visualizerType;
        }
        
        // Hide visualizer initially if disabled in settings
        if (!jukeboxSettings.shouldShowVisualizer()) {
            visualizer.hide();
        }
        
        window.visualizer = visualizer; // Make visualizer globally accessible
        console.log('Audio visualizer initialized successfully');
    } catch (error) {
        console.error('Failed to initialize visualizer:', error);
    }
}, 100);

window.jukebox = jukebox; // Make it globally accessible

// Make confirmNavigation globally accessible for onclick handlers
window.confirmNavigation = function(url) {
    if (window.jukebox && window.jukebox.confirmNavigation) {
        window.jukebox.confirmNavigation(url);
    } else {
        // Fallback if jukebox not ready
        window.location.href = url;
    }
};

// Initialize playlist editor
document.addEventListener('DOMContentLoaded', () => {
    jukebox.initializePlaylistEditor();
});
