/**
 * Audio Integration for Wedding Jukebox
 * Bridges the web interface with the headless audio service
 */

const AudioService = require('./audio-service');
const io = require('socket.io-client');

class AudioIntegration {
    constructor(jukeboxUrl = 'http://localhost:3000') {
        this.audioService = new AudioService();
        this.socket = io(jukeboxUrl);
        this.currentQueue = [];
        this.isProcessingQueue = false;
        this.lastPlayedSongId = null; // Track last played song to prevent duplicates
        this.wasPlaying = false; // Track previous playing state to detect song ends
        this.isFading = false;
        
        this.setupSocketListeners();
        console.log('🔗 Audio Integration connected to:', jukeboxUrl);
    }
    
    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('✅ Connected to Wedding Jukebox');
            this.socket.emit('audioServiceConnected', {
                service: 'headless-audio',
                capabilities: ['play', 'pause', 'stop', 'volume', 'fade']
            });
        });
        
        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from Wedding Jukebox');
        });
        
        this.socket.on('connect_error', (error) => {
            console.log('❌ Connection error:', error.message);
        });
        
        // Listen for queue updates
        this.socket.on('queueUpdated', (data) => {
            console.log('📋 Queue updated:', data.queue.length, 'songs');
            this.currentQueue = data.queue;
            
            // Only auto-start if nothing is playing and we're not processing
            if (data.queue.length > 0 && !this.audioService.isPlaying && !this.isProcessingQueue) {
                console.log('🚀 Queue has songs and nothing playing - starting in 2 seconds...');
                setTimeout(() => {
                    this.processQueue();
                }, 2000);
            }
        });
        
        // Listen for now playing updates (fallback songs, user songs, etc.)
        this.socket.on('nowPlaying', (song) => {
            if (!song) {
                console.log('🎵 Now playing event received: null (stopping)');
                return;
            }
            
            console.log('🎵 Now playing event received:', song.title, 'from', song.source || 'unknown source');
            console.log('🔍 Current state - isProcessingQueue:', this.isProcessingQueue, 'lastPlayedSongId:', this.lastPlayedSongId, 'audioService.isPlaying:', this.audioService.isPlaying);
            
            // Skip if this is from our own audio service (avoid loops)
            if (song.source === 'headless-audio') {
                console.log('🔄 Ignoring nowPlaying event (own service):', song.title);
                return;
            }
            
            // Skip if this is the exact same song we just played (avoid duplicates)
            if (song.id === this.lastPlayedSongId) {
                console.log('🔄 Ignoring duplicate nowPlaying event for:', song.title);
                return;
            }
            
            // Handle the nowPlaying event - this could be from skip commands or new songs
            console.log('🎵 Processing nowPlaying event for:', song.title);
            this.lastPlayedSongId = song.id;
            
            // If we're currently processing, queue this for later
            if (this.isProcessingQueue) {
                console.log('🔄 Currently processing queue, will handle nowPlaying after delay');
                setTimeout(() => {
                    if (!this.isProcessingQueue) {
                        console.log('🔄 Processing delayed nowPlaying event:', song.title);
                        this.handlePlayCommand({ song });
                    } else {
                        console.log('⚠️ Still processing queue, skipping delayed nowPlaying event');
                    }
                }, 1500);
            } else {
                // Process immediately
                console.log('🎵 Handling nowPlaying event immediately for:', song.title);
                this.handlePlayCommand({ song });
            }
        });
        
        // Listen for playback commands
        this.socket.on('playCommand', (data) => {
            console.log('▶️ Play command received:', data);
            this.handlePlayCommand(data);
        });
        
        // Listen for manual play requests (when play button is clicked)
        this.socket.on('manualPlayCommand', () => {
            console.log('🎵 Manual play command received');
            if (!this.audioService.isPlaying && !this.isProcessingQueue) {
                console.log('🚀 Starting queue processing from manual play command...');
                this.processQueue();
            } else {
                console.log('⚠️ Already playing or processing, ignoring manual play command');
            }
        });
        
        // Test socket connection
        this.socket.on('ping', () => {
            console.log('🏓 Ping received from web interface');
            this.socket.emit('pong');
        });
        
        this.socket.on('pauseCommand', () => {
            console.log('⏸️ Pause command received');
            console.log('Current audio service state - isPlaying:', this.audioService.isPlaying, 'isPaused:', this.audioService.isPaused, 'position:', this.audioService.position);
            
            this.audioService.pause();
            
            // Emit status immediately after pause
            setTimeout(() => {
                console.log('📊 Emitting status after pause...');
                this.emitStatus();
            }, 100);
        });
        
        this.socket.on('resumeCommand', () => {
            console.log('▶️ Resume command received');
            console.log('Current audio service state - isPlaying:', this.audioService.isPlaying, 'isPaused:', this.audioService.isPaused, 'pausedPosition:', this.audioService.pausedPosition);
            
            this.audioService.resume();
            
            // Emit status immediately after resume
            setTimeout(() => {
                console.log('📊 Emitting status after resume...');
                this.emitStatus();
            }, 100);
        });
        
        this.socket.on('stopCommand', () => {
            console.log('⏹️ Stop command received');
            this.audioService.stop();
            this.emitStatus();
        });
        
        this.socket.on('volumeCommand', (data) => {
            console.log('🔊 Volume command received:', data.volume);
            this.audioService.setVolume(data.volume);
            this.emitStatus();
        });
        
        this.socket.on('skipCommand', () => {
            console.log('⏭️ Skip command received');
            console.log('Current audio service state - isPlaying:', this.audioService.isPlaying, 'isProcessingQueue:', this.isProcessingQueue);
            console.log('Current queue length:', this.currentQueue.length);
            
            // Force clear the processing flag first
            this.isProcessingQueue = false;
            
            // Stop current audio and clear the lock
            this.audioService.stop();
            this.audioService.clearLock();
            
            // Always call the server to advance to the next song (handles both queue and fallback)
            console.log('🔄 Calling server to advance to next song...');
            
            fetch('http://localhost:3000/api/queue/next', {
                method: 'POST'
            }).then(response => {
                if (response.ok) {
                    console.log('✅ Server advanced to next song');
                } else {
                    console.log('⚠️ Server failed to advance to next song');
                }
            }).catch(error => {
                console.log('❌ Error calling next song API:', error.message);
            });
        });

        this.socket.on('fadeCommand', async (data = {}) => {
            if (this.isFading) {
                console.log('🎚️ Fade already in progress, ignoring new fade command');
                return;
            }

            this.isFading = true;
            const durationMs = typeof data.durationMs === 'number' ? data.durationMs : 2000;
            console.log(`🎚️ Fade command received (duration: ${durationMs}ms)`);

            try {
                let startVolume = this.audioService.volume;
                if (this.audioService.isPlaying) {
                    startVolume = await this.audioService.fadeOut(durationMs, 10);
                    this.audioService.stop();
                    this.audioService.clearLock();
                }

                // Restore volume to previous level for next track
                if (typeof startVolume === 'number') {
                    this.audioService.setVolume(startVolume);
                }

                console.log('🔄 Calling server to advance to next song after fade...');
                await fetch('http://localhost:3000/api/queue/next', { method: 'POST' });
            } catch (error) {
                console.log('❌ Fade command error:', error.message);
            } finally {
                this.isFading = false;
                this.emitStatus();
            }
        });
        
        this.socket.on('testAudioCommand', () => {
            console.log('🧪 Test audio command received');
            this.handleTestAudio();
        });
    }
    
    async handlePlayCommand(data) {
        console.log('🎵 handlePlayCommand called for:', data.song?.title);
        console.log('🔍 Current state - isProcessingQueue:', this.isProcessingQueue, 'audioService.isPlaying:', this.audioService.isPlaying);
        
        try {
            const result = await this.audioService.play(data.song);
            
            if (result.success) {
                console.log('✅ Song started successfully:', data.song.title);
                
                // Notify jukebox that song is now playing
                this.socket.emit('nowPlaying', {
                    song: data.song,
                    source: 'headless-audio'
                });
                
                this.emitStatus();
            } else {
                console.error('❌ Play command failed:', result.error);
                this.socket.emit('playbackError', {
                    error: result.error,
                    song: data.song
                });
            }
        } catch (error) {
            console.error('❌ Play command error:', error.message);
            this.socket.emit('playbackError', {
                error: error.message,
                song: data.song
            });
        }
    }
    
    async handleTestAudio() {
        try {
            const result = await this.audioService.playTestAudio();
            
            if (result.success) {
                this.socket.emit('testAudioStarted', {
                    message: 'Test audio playing',
                    source: 'headless-audio'
                });
                this.emitStatus();
            } else {
                console.error('❌ Test audio failed:', result.error);
                this.socket.emit('testAudioError', {
                    error: result.error
                });
            }
        } catch (error) {
            console.error('❌ Test audio error:', error.message);
            this.socket.emit('testAudioError', {
                error: error.message
            });
        }
    }
    
    async processQueue() {
        // Prevent concurrent queue processing
        if (this.isProcessingQueue) {
            console.log('⚠️ Already processing queue, skipping...');
            return;
        }
        
        if (this.currentQueue.length === 0) {
            console.log('📋 Queue is empty, nothing to process');
            this.isProcessingQueue = false;
            return;
        }
        
        if (this.audioService.isPlaying) {
            console.log('🎵 Song already playing, not starting another');
            this.isProcessingQueue = false;
            return;
        }
        
        this.isProcessingQueue = true;
        console.log('🔄 Processing queue - starting next song...');
        
        try {
            const nextSong = this.currentQueue[0];
            console.log('🎵 Playing next song from queue:', nextSong.title);
            
            const result = await this.audioService.play(nextSong);
            
            if (result.success) {
                console.log('✅ Song started successfully, calling server to update queue...');
                
                // Call server to properly update queue and now playing
                try {
                    const response = await fetch('http://localhost:3000/api/queue/next', {
                        method: 'POST'
                    });
                    
                    if (response.ok) {
                        console.log('✅ Server queue updated successfully');
                    } else {
                        console.log('⚠️ Server queue update failed, but song is playing');
                    }
                } catch (error) {
                    console.log('⚠️ Could not update server queue:', error.message);
                }
                
                this.emitStatus();
                
            } else {
                console.error('❌ Failed to start song:', result.error);
            }
            
        } catch (error) {
            console.error('❌ Queue processing error:', error.message);
        } finally {
            // Always clear the processing flag
            this.isProcessingQueue = false;
        }
    }
    
    async preBufferNextSong() {
        // Pre-buffer next song in queue or fallback playlist
        try {
            let nextSong = null;
            
            if (this.currentQueue.length > 1) {
                // Next song in queue
                nextSong = this.currentQueue[1];
                console.log('📦 Pre-buffering next queued song:', nextSong.title);
            } else {
                // Queue is empty or has only current song, get resolved fallback song
                try {
                    console.log('🔍 Fetching next resolved fallback song...');
                    const response = await fetch('http://localhost:3000/api/playlist/next-resolved');
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    
                    if (data.nextSong) {
                        nextSong = data.nextSong;
                        console.log('📦 Found resolved fallback song to pre-buffer:', nextSong.title);
                    } else {
                        console.log('⚠️ No next fallback song available');
                        return;
                    }
                } catch (error) {
                    console.log('⚠️ Could not get next resolved fallback song:', error.message);
                    return;
                }
            }
            
            if (nextSong && (nextSong.videoId || nextSong.youtubeId)) {
                // Use the audio service pre-buffer method
                const result = await this.audioService.preBuffer(nextSong);
                if (result.success) {
                    if (result.cached) {
                        console.log('✅ Song already cached:', nextSong.title);
                    } else {
                        console.log('✅ Song pre-buffered successfully:', nextSong.title);
                    }
                } else {
                    console.log('⚠️ Pre-buffer failed:', result.error);
                }
            } else {
                console.log('⚠️ No next song to pre-buffer or missing video ID');
            }
        } catch (error) {
            console.log('⚠️ Pre-buffer error:', error.message);
        }
    }
    
    handleSongEnd(finishedSong) {
        console.log('🎵 Song ended:', finishedSong.title);
        console.log('🔄 Will process queue after short delay...');
        
        this.socket.emit('songEnded', {
            song: finishedSong,
            source: 'headless-audio'
        });
        
        // Process next song after a delay
        setTimeout(() => {
            console.log('🔄 Processing next song after song end...');
            this.processQueue();
        }, 1000);
    }
    
    waitForSongEnd() {
        return new Promise((resolve) => {
            const checkStatus = () => {
                if (!this.audioService.isPlaying) {
                    console.log('🎵 Song ended detected, resolving waitForSongEnd');
                    resolve();
                } else {
                    setTimeout(checkStatus, 1000);
                }
            };
            
            // Start checking immediately
            checkStatus();
        });
    }
    
    emitStatus() {
        const status = this.audioService.getStatus();
        
        // Only detect song end if we were actually playing and now we're not, 
        // AND the song actually finished (not paused or stopped manually)
        if (this.wasPlaying && !status.isPlaying && !status.isPaused && status.currentSong) {
            // Additional check: only trigger song end if we played for a reasonable amount of time
            if (status.position > 5 || (status.duration > 0 && status.position >= status.duration - 1)) {
                console.log('🎵 Song end detected via status change!');
                this.handleSongEnd(status.currentSong);
            } else {
                console.log('⚠️ Ignoring potential false song end - position:', status.position, 'duration:', status.duration);
            }
        }
        
        this.wasPlaying = status.isPlaying;
        
        console.log('📊 Emitting status:', {
            isPlaying: status.isPlaying,
            isPaused: status.isPaused,
            position: status.position,
            duration: status.duration,
            currentSong: status.currentSong?.title,
            isBuffering: status.isBuffering,
            bufferingProgress: status.bufferingProgress
        });
        this.socket.emit('audioServiceStatus', {
            ...status,
            service: 'headless-audio',
            timestamp: Date.now()
        });
    }
    
    // Periodic status updates and pre-buffering
    startStatusUpdates() {
        setInterval(() => {
            this.emitStatus();
        }, 1000); // Every 1 second for progress updates
        
        // Periodic pre-buffering check every 10 seconds
        setInterval(() => {
            console.log('🔄 Periodic pre-buffer check...');
            this.preBufferNextSong();
        }, 10000);
        
        // Initial pre-buffer after 5 seconds
        setTimeout(() => {
            console.log('🚀 Initial pre-buffer check...');
            this.preBufferNextSong();
        }, 5000);
    }
}

// Run the integration
if (require.main === module) {
    const integration = new AudioIntegration();
    integration.startStatusUpdates();
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down audio integration...');
        integration.audioService.stop();
        process.exit(0);
    });
    
    console.log('🎵 Audio Integration running...');
    console.log('Press Ctrl+C to stop');
}

module.exports = AudioIntegration;
