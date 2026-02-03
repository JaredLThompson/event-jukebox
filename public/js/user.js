class UserJukebox {
    constructor() {
        this.socket = io();
        this.recentAdditions = [];
        
        this.initializeElements();
        this.bindEvents();
        this.setupSocketListeners();
        this.loadInitialData();
    }

    initializeElements() {
        this.searchQuery = document.getElementById('searchQuery');
        this.searchBtn = document.getElementById('searchBtn');
        this.clearSearchBtn = document.getElementById('clearSearchBtn');
        this.userName = document.getElementById('userName');
        this.searchResults = document.getElementById('searchResults');
        this.resultsList = document.getElementById('resultsList');
        this.noResults = document.getElementById('noResults');
        this.nowPlayingPreview = document.getElementById('nowPlayingPreview');
        this.userCount = document.getElementById('userCount');
        this.queueCount = document.getElementById('queueCount');
        this.queueCountDisplay = document.getElementById('queueCountDisplay');
        this.recentAdditionsEl = document.getElementById('recentAdditions');
        this.currentQueueEl = document.getElementById('currentQueue');
        this.queueShowMore = document.getElementById('queueShowMore');
        this.showMoreBtn = document.getElementById('showMoreBtn');
        this.toast = document.getElementById('toast');
        this.toastMessage = document.getElementById('toastMessage');
        this.loadingOverlay = document.getElementById('loadingOverlay');

        // Queue display settings
        this.showAllQueue = false;
        this.maxQueueDisplay = 5;

        // Load saved username
        const savedName = localStorage.getItem('jukeboxUserName');
        if (savedName) {
            this.userName.value = savedName;
        }
    }

    bindEvents() {
        this.searchBtn.addEventListener('click', () => this.searchYouTubeMusic());
        this.clearSearchBtn.addEventListener('click', () => this.clearSearch());
        this.searchQuery.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchYouTubeMusic();
            }
        });

        // Save username when changed
        this.userName.addEventListener('change', () => {
            localStorage.setItem('jukeboxUserName', this.userName.value);
        });

        // Show more queue items
        this.showMoreBtn.addEventListener('click', () => {
            this.showAllQueue = !this.showAllQueue;
            this.updateCurrentQueue(this.currentQueueData);
        });
    }

    setupSocketListeners() {
        this.socket.on('queueUpdated', (data) => {
            this.queueCount.textContent = data.queue.length;
            this.queueCountDisplay.textContent = data.queue.length;
            this.updateRecentAdditions(data.queue);
            this.updateCurrentQueue(data.queue);
        });

        this.socket.on('nowPlaying', (song) => {
            this.updateNowPlayingPreview(song);
        });

        this.socket.on('queueParkChanged', (data) => {
            if (data.parked) {
                this.showToast('🅿️ Requests are being held - your songs will play later!', 'info');
            } else {
                this.showToast('🎵 Requests are now active!', 'success');
            }
        });

        this.socket.on('fallbackMode', (data) => {
            if (data.active) {
                this.showToast(`🎵 Auto-playing: ${data.song.title}`, 'info');
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
            
            this.queueCount.textContent = data.queue.length;
            this.queueCountDisplay.textContent = data.queue.length;
            this.userCount.textContent = data.connectedUsers;
            this.updateRecentAdditions(data.queue);
            this.updateCurrentQueue(data.queue);
            
            if (data.currentlyPlaying) {
                this.updateNowPlayingPreview(data.currentlyPlaying);
            }
        } catch (error) {
            console.error('Failed to load initial data:', error);
            this.showToast('Failed to load jukebox data', 'error');
        }
    }

    async searchYouTubeMusic() {
        const query = this.searchQuery.value.trim();
        if (!query) {
            this.showToast('Please enter a search query', 'error');
            return;
        }

        this.searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Searching...';
        this.searchBtn.disabled = true;
        this.hideResults();

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=15`);
            const data = await response.json();

            if (response.ok && data.results) {
                this.displaySearchResults(data.results);
            } else {
                throw new Error(data.error || 'Search failed');
            }
        } catch (error) {
            console.error('Search error:', error);
            this.showToast('Failed to search YouTube Music', 'error');
            this.showNoResults();
        } finally {
            this.searchBtn.innerHTML = '<i class="fas fa-search mr-2"></i>Search';
            this.searchBtn.disabled = false;
        }
    }

    displaySearchResults(results) {
        if (results.length === 0) {
            this.showNoResults();
            return;
        }

        this.resultsList.innerHTML = results.map((song, index) => `
            <div class="bg-gray-800 bg-opacity-50 rounded-lg p-4 hover:bg-opacity-70 transition-all border border-gray-700 hover:border-purple-500">
                <div class="flex items-center space-x-4">
                    <img src="${song.thumbnail}" alt="Thumbnail" class="w-16 h-16 rounded-lg shadow-lg flex-shrink-0">
                    <div class="flex-1 min-w-0">
                        <h4 class="font-semibold text-lg truncate">${song.title}</h4>
                        <p class="text-gray-400 truncate">${song.artist}</p>
                        <div class="flex items-center space-x-4 mt-1">
                            <span class="text-gray-500 text-sm">${song.album}</span>
                            <span class="text-purple-400 text-sm font-medium">${song.duration_text}</span>
                            ${song.isExplicit ? '<span class="bg-red-600 text-white text-xs px-2 py-1 rounded">EXPLICIT</span>' : ''}
                        </div>
                    </div>
                    <button class="add-queue-btn bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-6 py-3 rounded-lg font-semibold transition-all transform hover:scale-105 flex-shrink-0"
                            data-video-id="${song.videoId}"
                            data-title="${song.title}"
                            data-artist="${song.artist}"
                            data-thumbnail="${song.thumbnail}"
                            data-duration="${song.duration_text}"
                            data-album="${song.album}">
                        <i class="fas fa-plus mr-2"></i>Add to Queue
                    </button>
                </div>
            </div>
        `).join('');
        
        // Add event listeners to all add buttons
        this.resultsList.querySelectorAll('.add-queue-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const videoId = button.dataset.videoId;
                const title = button.dataset.title;
                const artist = button.dataset.artist;
                const thumbnail = button.dataset.thumbnail;
                const duration = button.dataset.duration;
                const album = button.dataset.album;
                
                this.addSongToQueue(videoId, title, artist, thumbnail, duration, album);
            });
        });
        
        this.searchResults.classList.remove('hidden');
        this.noResults.classList.add('hidden');
    }

    async addSongToQueue(videoId, title, artist, thumbnail, duration, album) {
        const userName = this.userName.value.trim() || 'Anonymous';
        
        this.showLoading();
        
        const songData = {
            song: {
                videoId: videoId,
                title: title,
                artist: artist,
                duration: duration,
                albumArt: thumbnail,
                album: album,
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
                const data = await response.json();
                if (data.parked) {
                    this.showToast(`🅿️ "${title}" parked! ${data.message}`, 'info');
                } else {
                    this.showToast(`"${title}" added to queue!`, 'success');
                }
                // Keep search results open so users can add more songs from the same search
                // this.searchQuery.value = '';
                // this.hideResults();
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
        } finally {
            this.hideLoading();
        }
    }

    updateNowPlayingPreview(song) {
        if (!song) {
            this.nowPlayingPreview.innerHTML = '<p class="text-gray-400">No song currently playing</p>';
            return;
        }

        const isFallback = song.source === 'fallback';
        const icon = isFallback ? 'fas fa-magic text-yellow-400' : 'fas fa-play-circle text-green-400';
        const eventConfig = window.eventConfig || {};
        const fallbackLabel = eventConfig.playlists?.primary?.addedBy || '🎵 Wedding DJ';
        const addedBy = isFallback ? fallbackLabel : song.addedBy;

        this.nowPlayingPreview.innerHTML = `
            <div class="flex items-center space-x-3">
                <img src="${song.albumArt}" alt="Album Art" class="w-12 h-12 rounded-lg shadow">
                <div class="flex-1 text-left">
                    <h4 class="font-semibold truncate">${song.title}</h4>
                    <p class="text-gray-400 text-sm truncate">${song.artist}</p>
                    <p class="text-xs text-purple-400">${addedBy}</p>
                </div>
                <div>
                    <i class="${icon} text-2xl"></i>
                </div>
            </div>
        `;
    }

    updateRecentAdditions(queue) {
        // Get the last 5 additions
        const recent = queue.slice(-5).reverse();
        
        if (recent.length === 0) {
            this.recentAdditionsEl.innerHTML = '<p class="text-gray-400 text-center py-4">No recent additions</p>';
            return;
        }

        this.recentAdditionsEl.innerHTML = recent.map(song => `
            <div class="flex items-center space-x-3 p-3 bg-gray-800 bg-opacity-30 rounded-lg">
                <img src="${song.albumArt}" alt="Album Art" class="w-10 h-10 rounded shadow">
                <div class="flex-1 min-w-0">
                    <h5 class="font-medium truncate">${song.title}</h5>
                    <p class="text-gray-400 text-sm truncate">${song.artist}</p>
                </div>
                <div class="text-right text-sm">
                    <p class="text-purple-400">${song.addedBy}</p>
                    <p class="text-gray-500">${song.duration}</p>
                </div>
            </div>
        `).join('');
    }

    updateCurrentQueue(queue) {
        this.currentQueueData = queue;
        
        if (queue.length === 0) {
            this.currentQueueEl.innerHTML = '<p class="text-gray-400 text-center py-8">No songs in queue</p>';
            this.queueShowMore.classList.add('hidden');
            return;
        }

        // Determine how many songs to show
        const displayCount = this.showAllQueue ? queue.length : Math.min(this.maxQueueDisplay, queue.length);
        const songsToShow = queue.slice(0, displayCount);

        this.currentQueueEl.innerHTML = songsToShow.map((song, index) => `
            <div class="flex items-center space-x-4 p-4 bg-gray-800 bg-opacity-30 rounded-lg border border-gray-700">
                <div class="text-2xl text-blue-400 font-bold w-8 text-center">
                    ${index + 1}
                </div>
                <img src="${song.albumArt}" alt="Album Art" class="w-14 h-14 rounded-lg shadow flex-shrink-0">
                <div class="flex-1 min-w-0">
                    <h4 class="font-semibold truncate">${song.title}</h4>
                    <p class="text-gray-400 text-sm truncate">${song.artist}</p>
                    <div class="flex items-center space-x-3 mt-1">
                        <span class="text-gray-500 text-xs">${song.duration}</span>
                        <span class="text-purple-400 text-xs">Added by ${song.addedBy}</span>
                    </div>
                </div>
                ${index === 0 ? '<div class="text-green-400 flex-shrink-0"><i class="fas fa-play-circle text-2xl" title="Next up"></i></div>' : ''}
            </div>
        `).join('');

        // Show/hide "show more" button
        if (queue.length > this.maxQueueDisplay) {
            this.queueShowMore.classList.remove('hidden');
            this.showMoreBtn.innerHTML = this.showAllQueue 
                ? '<i class="fas fa-chevron-up mr-1"></i>Show less'
                : `<i class="fas fa-chevron-down mr-1"></i>Show ${queue.length - this.maxQueueDisplay} more songs`;
        } else {
            this.queueShowMore.classList.add('hidden');
        }
    }

    showResults() {
        this.searchResults.classList.remove('hidden');
        this.noResults.classList.add('hidden');
    }

    hideResults() {
        this.searchResults.classList.add('hidden');
        this.noResults.classList.add('hidden');
    }

    clearSearch() {
        this.searchQuery.value = '';
        this.hideResults();
        this.showToast('Search cleared', 'info');
    }

    showNoResults() {
        this.searchResults.classList.add('hidden');
        this.noResults.classList.remove('hidden');
    }

    showLoading() {
        this.loadingOverlay.classList.remove('hidden');
    }

    hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }

    showToast(message, type = 'success') {
        this.toastMessage.textContent = message;
        this.toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg transform transition-transform duration-300 ${
            type === 'success' ? 'bg-green-500' : 
            type === 'error' ? 'bg-red-500' : 
            type === 'warning' ? 'bg-orange-500' : 'bg-blue-500'
        } text-white`;
        
        // Show toast
        this.toast.style.transform = 'translateX(0)';
        
        // Hide after 4 seconds
        setTimeout(() => {
            this.toast.style.transform = 'translateX(100%)';
        }, 4000);
    }
}

// Initialize the user jukebox when the page loads
const userJukebox = new UserJukebox();
