class VirtualJukebox {
    constructor() {
        this.socket = io();
        this.player = null;
        this.isPlayerReady = false;
        this.currentSong = null;
        this.isPlaying = false;
        
        this.initializeElements();
        this.bindEvents();
        this.setupSocketListeners();
        this.loadInitialData();
        
        // Initialize YouTube player when API is ready
        window.onYouTubeIframeAPIReady = () => this.initializeYouTubePlayer();
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
        
        // Buffer status elements
        this.bufferStatus = document.getElementById('bufferStatus');
        this.bufferCount = document.getElementById('bufferCount');
        this.debugBufferBtn = document.getElementById('debugBufferBtn');
        
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
        
        // Tab switching
        this.searchTab.addEventListener('click', () => this.switchToSearchTab());
        this.manualTab.addEventListener('click', () => this.switchToManualTab());
        
        // YouTube Music search
        this.searchBtn.addEventListener('click', () => this.searchYouTubeMusic());
        this.clearSearchBtn.addEventListener('click', () => this.clearSearch());
        this.searchQuery.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchYouTubeMusic();
            }
        });
        
        // Audio controls
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
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
        
        // Buffer controls
        this.bufferStatus.addEventListener('click', () => this.forceBufferMore());
        this.debugBufferBtn.addEventListener('click', () => this.showBufferDebug());
        
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
            addedBy: this.userName.value.trim() || 'Anonymous'
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
        if (!this.player || !this.isPlayerReady || !this.isPlaying) {
            // If not playing, just go to next song normally
            this.playNextSong();
            return;
        }

        try {
            // Get current volume
            const currentVolume = this.player.getVolume();
            const fadeSteps = 20; // Number of fade steps
            const fadeInterval = 100; // Milliseconds between steps
            const volumeStep = currentVolume / fadeSteps;

            // Show fade indicator
            this.showToast('Fading to next song...', 'info');

            // Fade out current song
            let step = 0;
            const fadeOut = setInterval(() => {
                step++;
                const newVolume = Math.max(0, currentVolume - (volumeStep * step));
                this.setVolume(newVolume);

                if (step >= fadeSteps || newVolume <= 0) {
                    clearInterval(fadeOut);
                    
                    // Stop the current song completely before starting next
                    this.player.pauseVideo();
                    
                    // Play next song after a brief pause
                    setTimeout(() => {
                        this.playNextSong();
                        
                        // Restore volume after the new song starts
                        setTimeout(() => {
                            this.setVolume(currentVolume);
                            this.volumeSlider.value = currentVolume;
                        }, 500);
                    }, 100);
                }
            }, fadeInterval);

        } catch (error) {
            console.error('Error during fade transition:', error);
            this.showToast('Fade failed, skipping to next song', 'error');
            this.playNextSong();
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
        const borderColor = isFallback ? 'from-yellow-600 to-orange-600' : 'from-purple-600 to-pink-600';
        const icon = isFallback ? 'fas fa-magic' : 'fas fa-play-circle';
        
        this.nowPlaying.innerHTML = `
            <div class="bg-gradient-to-br ${borderColor} rounded-lg p-6 mb-4 pulse-glow">
                <div class="flex items-center space-x-4">
                    <img src="${song.albumArt}" alt="Album Art" class="w-20 h-20 rounded-lg shadow-lg">
                    <div class="flex-1">
                        <h3 class="text-2xl font-bold">${song.title}</h3>
                        <p class="text-lg text-purple-200">${song.artist}</p>
                        <p class="text-sm text-purple-300">
                            ${isFallback ? '🎵 Wedding DJ Auto-Play' : `Added by ${song.addedBy}`}
                        </p>
                    </div>
                    <div class="text-right">
                        <div class="text-3xl">
                            <i class="${icon} text-green-400"></i>
                        </div>
                        <p class="text-sm text-purple-200">${song.duration}</p>
                    </div>
                </div>
                ${isFallback ? '<div class="mt-3 text-center text-sm text-yellow-200">🎉 Playing wedding favorites while queue is empty</div>' : ''}
            </div>
        `;
    }

    updateQueue(queue) {
        this.currentQueue = queue; // Store current queue for reordering
        this.queueCount.textContent = queue.length;
        
        // Pre-buffer upcoming songs
        this.preBufferUpcomingSongs();
        
        if (queue.length === 0) {
            this.queueList.innerHTML = '<p class="text-gray-400 text-center py-8">No songs in queue</p>';
            return;
        }

        this.queueList.innerHTML = queue.map((song, index) => {
            const isMicBreak = song.type === 'mic-break';
            const bgColor = isMicBreak ? 'bg-orange-800 bg-opacity-50 border-orange-500' : 'bg-gray-800 bg-opacity-50';
            const icon = isMicBreak ? 'fas fa-microphone text-orange-400' : 'fas fa-music text-purple-400';
            
            return `
                <div class="queue-item ${bgColor} rounded-lg p-4 flex items-center space-x-4 hover:bg-opacity-70 transition-all border border-gray-700 cursor-move" 
                     data-id="${song.id}" data-index="${index}">
                    <div class="drag-handle text-gray-500 hover:text-gray-300">
                        <i class="fas fa-grip-vertical"></i>
                    </div>
                    <div class="text-2xl font-bold w-8 text-center ${isMicBreak ? 'text-orange-400' : 'text-purple-400'}">
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
                        <p class="text-gray-400 text-sm">${isMicBreak ? 'DJ Microphone Break' : song.artist}</p>
                        <p class="text-gray-500 text-xs">${isMicBreak ? 'Pause for announcements' : `Added by ${song.addedBy}`}</p>
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
    }

    switchToManualTab() {
        this.manualTab.classList.add('bg-purple-600');
        this.manualTab.classList.remove('bg-gray-600');
        this.searchTab.classList.add('bg-gray-600');
        this.searchTab.classList.remove('bg-purple-600');
        
        this.addSongForm.classList.remove('hidden');
        this.searchSection.classList.add('hidden');
    }

    // YouTube Music search methods
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
                this.displaySearchResults(data.results);
            } else {
                throw new Error(data.error || 'Search failed');
            }
        } catch (error) {
            console.error('Search error:', error);
            this.showToast('Failed to search YouTube Music', 'error');
        } finally {
            this.searchBtn.innerHTML = '<i class="fas fa-search"></i>';
            this.searchBtn.disabled = false;
        }
    }

    displaySearchResults(results) {
        const searchResultsList = document.getElementById('searchResultsList');
        
        if (results.length === 0) {
            searchResultsList.innerHTML = '<p class="text-gray-400 text-center py-4">No results found</p>';
            this.searchResults.classList.remove('hidden');
            return;
        }

        searchResultsList.innerHTML = results.map((song, index) => `
            <div class="bg-gray-800 bg-opacity-50 rounded-lg p-3 flex items-center space-x-3 hover:bg-opacity-70 transition-all">
                <img src="${song.thumbnail}" alt="Thumbnail" class="w-12 h-12 rounded shadow">
                <div class="flex-1">
                    <h4 class="font-semibold text-sm">${song.title}</h4>
                    <p class="text-gray-400 text-xs">${song.artist}</p>
                    <p class="text-gray-500 text-xs">${song.album} • ${song.duration_text}</p>
                </div>
                <button class="add-song-btn bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded text-sm transition-colors"
                        data-video-id="${song.videoId}"
                        data-title="${song.title}"
                        data-artist="${song.artist}"
                        data-thumbnail="${song.thumbnail}"
                        data-duration="${song.duration_text}">
                    <i class="fas fa-plus mr-1"></i>Add
                </button>
            </div>
        `).join('');
        
        // Add event listeners to all add buttons
        searchResultsList.querySelectorAll('.add-song-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const videoId = button.dataset.videoId;
                const title = button.dataset.title;
                const artist = button.dataset.artist;
                const thumbnail = button.dataset.thumbnail;
                const duration = button.dataset.duration;
                
                this.addYouTubeSong(videoId, title, artist, thumbnail, duration);
            });
        });
        
        this.searchResults.classList.remove('hidden');
    }

    async addYouTubeSong(videoId, title, artist, thumbnail, duration) {
        const userName = this.userName.value.trim() || 'Anonymous';
        
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
        } else if (event.data === YT.PlayerState.PAUSED) {
            this.isPlaying = false;
            this.playPauseBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Play';
            this.stopProgressTracking();
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
        if (!this.player || !this.isPlayerReady) return;
        
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
}

// Initialize the jukebox when the page loads
const jukebox = new VirtualJukebox();
window.jukebox = jukebox; // Make it globally accessible

// Initialize playlist editor
document.addEventListener('DOMContentLoaded', () => {
    jukebox.initializePlaylistEditor();
});

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