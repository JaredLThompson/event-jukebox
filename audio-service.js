#!/usr/bin/env node

/**
 * Headless Audio Service for Wedding Jukebox
 * Handles server-side audio playback through Pi speakers
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class AudioService {
    constructor() {
        this.currentProcess = null;
        this.isPlaying = false;
        this.currentSong = null;
        this.volume = 0.7;
        this.position = 0;
        this.duration = 0;
        this.isBuffering = false;
        this.bufferingProgress = null;
        this.isPlayingLock = false; // Prevent simultaneous play attempts
        
        // Pause/resume state
        this.isPaused = false;
        this.pausedSong = null;
        this.pausedPosition = 0;
        
        // Audio cache directory
        this.cacheDir = path.join(__dirname, 'audio-cache');
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }

        this.cacheManifestPath = path.join(this.cacheDir, 'cache-manifest.json');
        this.cacheManifest = this.loadCacheManifest();
        
        console.log('🎵 Audio Service initialized');
        console.log('📁 Cache directory:', this.cacheDir);
    }

    loadCacheManifest() {
        try {
            if (fs.existsSync(this.cacheManifestPath)) {
                const data = fs.readFileSync(this.cacheManifestPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.log('⚠️ Failed to load cache manifest, starting fresh');
        }
        return {};
    }

    saveCacheManifest() {
        try {
            fs.writeFileSync(this.cacheManifestPath, JSON.stringify(this.cacheManifest, null, 2));
        } catch (error) {
            console.log('⚠️ Failed to save cache manifest:', error.message);
        }
    }

    recordCacheEntry(youtubeId, song, filepath) {
        if (!youtubeId) return;
        const filename = path.basename(filepath || `${youtubeId}.mp3`);
        this.cacheManifest[youtubeId] = {
            youtubeId,
            filename,
            title: song?.title || null,
            artist: song?.artist || null,
            source: song?.source || null,
            cachedAt: new Date().toISOString()
        };
        this.saveCacheManifest();
    }
    
    /**
     * Play a song from URL or local file
     */
    async play(song) {
        // Prevent simultaneous play attempts
        if (this.isPlayingLock) {
            console.log('🔒 Play request blocked - already processing another play request');
            return { success: false, error: 'Another play request is in progress' };
        }
        
        this.isPlayingLock = true;
        
        try {
            console.log('🎵 Playing:', song.title, 'by', song.artist);
            
            // If we were paused, clear paused state so resume can't resurrect old audio
            if (this.isPaused) {
                console.log('🧹 Clearing paused state before new playback');
                this.isPaused = false;
                this.pausedSong = null;
                this.pausedPosition = 0;
            }
            
            // CRITICAL: Stop ALL current playback first
            this.stop();
            this.killAllMpg123Sync(); // Extra safety - kill all mpg123 processes synchronously
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for cleanup
            
            this.currentSong = song;
            this.isBuffering = true;
            this.bufferingProgress = `Preparing ${song.title}...`;
            
            let audioFile = null;
            let youtubeId = null;
            
            // Handle different audio sources with fallbacks
            if (song.audioUrl) {
                // Direct audio URL (Spotify preview, etc.)
                this.bufferingProgress = `Downloading ${song.title}...`;
                audioFile = await this.downloadAudio(song.audioUrl, song.id);
            } else if (song.spotifyId) {
                // Spotify track - get preview URL
                try {
                    this.bufferingProgress = `Getting Spotify preview for ${song.title}...`;
                    audioFile = await this.getSpotifyPreview(song.spotifyId, song.id);
                } catch (error) {
                    console.log('⚠️ Spotify failed, trying YouTube fallback...');
                    if (song.videoId || song.youtubeId) {
                        youtubeId = song.videoId || song.youtubeId;
                        this.bufferingProgress = `Downloading ${song.title} from YouTube...`;
                        audioFile = await this.extractYouTubeAudio(youtubeId);
                    } else {
                        throw error;
                    }
                }
            } else if (song.videoId || song.youtubeId) {
                // YouTube video - extract audio
                youtubeId = song.videoId || song.youtubeId;
                this.bufferingProgress = `Downloading ${song.title} from YouTube...`;
                audioFile = await this.extractYouTubeAudio(youtubeId);
            } else {
                throw new Error('No audio source available');
            }
            
            if (!audioFile || !fs.existsSync(audioFile)) {
                throw new Error('Audio file not found');
            }

            if (youtubeId) {
                this.recordCacheEntry(youtubeId, song, audioFile);
            }
            
            this.bufferingProgress = `Starting playback of ${song.title}...`;
            
            // Play audio file using mpg123 or similar
            await this.playAudioFile(audioFile);
            
            this.isBuffering = false;
            this.bufferingProgress = null;
            this.isPlayingLock = false; // Release lock
            return { success: true, message: 'Playback started' };
            
        } catch (error) {
            console.error('❌ Playback error:', error.message);
            this.isBuffering = false;
            this.bufferingProgress = null;
            this.isPlayingLock = false; // Release lock on error
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Get Spotify preview URL and download audio
     */
    async getSpotifyPreview(spotifyId, songId) {
        try {
            console.log('🎵 Getting Spotify preview for:', spotifyId);
            
            // For now, we'll use YouTube as fallback since Spotify previews are only 30 seconds
            // In a production system, you'd want to integrate with Spotify Web API
            // and handle premium account streaming
            
            // Try to find YouTube equivalent
            // This is a simplified approach - in production you'd want better matching
            throw new Error('Spotify playback requires YouTube fallback - not implemented yet');
            
        } catch (error) {
            console.error('❌ Spotify preview error:', error.message);
            throw error;
        }
    }
    
    /**
     * Download audio from URL
     */
    async downloadAudio(url, songId) {
        return new Promise((resolve, reject) => {
            const filename = `${songId}.mp3`;
            const filepath = path.join(this.cacheDir, filename);
            
            // Check if already cached
            if (fs.existsSync(filepath)) {
                console.log('📁 Using cached audio:', filename);
                resolve(filepath);
                return;
            }
            
            console.log('⬇️ Downloading audio:', url);
            
            const client = url.startsWith('https') ? https : http;
            const file = fs.createWriteStream(filepath);
            
            client.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Download failed: ${response.statusCode}`));
                    return;
                }
                
                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    console.log('✅ Audio downloaded:', filename);
                    resolve(filepath);
                });
                
                file.on('error', (err) => {
                    fs.unlink(filepath, () => {}); // Delete partial file
                    reject(err);
                });
            }).on('error', reject);
        });
    }
    
    /**
     * Extract audio from YouTube video using yt-dlp
     */
    async extractYouTubeAudio(youtubeId) {
        return new Promise((resolve, reject) => {
            const filename = `${youtubeId}.mp3`;
            const filepath = path.join(this.cacheDir, filename);
            
            // Check if already cached
            if (fs.existsSync(filepath)) {
                // Verify cached file is not empty
                const stats = fs.statSync(filepath);
                if (stats.size > 1024) { // At least 1KB
                    console.log('📁 Using cached YouTube audio:', filename);
                    resolve(filepath);
                    return;
                } else {
                    console.log('🗑️ Removing empty cached file:', filename);
                    fs.unlinkSync(filepath);
                }
            }
            
            console.log('🎬 Extracting YouTube audio:', youtubeId);
            this.bufferingProgress = `Downloading audio from YouTube...`;
            
            // Use yt-dlp to extract audio with additional options to bypass restrictions
            // Prefer PATH lookup, but allow override via YTDLP_PATH and common absolute paths.
            const ytdlpCandidates = [
                process.env.YTDLP_PATH,
                '/usr/local/bin/yt-dlp',
                '/usr/bin/yt-dlp'
            ].filter(Boolean);
            const ytdlpPath = ytdlpCandidates.find((candidate) => fs.existsSync(candidate)) || 'yt-dlp';
            const ytdlp = spawn(ytdlpPath, [
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '0',
                '--no-update',
                '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                '--referer', 'https://www.youtube.com/',
                '--add-header', 'Accept-Language:en-US,en;q=0.9',
                '--extractor-retries', '5',
                '--fragment-retries', '5',
                '--retry-sleep', '2',
                '--sleep-interval', '1',
                '--max-sleep-interval', '5',
                '--no-warnings',
                '--quiet',
                '--output', filepath.replace('.mp3', '.%(ext)s'),
                `https://www.youtube.com/watch?v=${youtubeId}`
            ]);
            
            let errorOutput = '';
            
            ytdlp.stderr.on('data', (data) => {
                errorOutput += data.toString();
                // Update buffering progress with more details
                if (data.toString().includes('Downloading')) {
                    this.bufferingProgress = `Downloading audio... (${Math.round(Math.random() * 50 + 10)}%)`;
                }
            });
            
            ytdlp.on('close', (code) => {
                if (code === 0 && fs.existsSync(filepath)) {
                    // Verify the downloaded file is not empty
                    const stats = fs.statSync(filepath);
                    if (stats.size > 1024) { // At least 1KB
                        console.log('✅ YouTube audio extracted:', filename, `(${Math.round(stats.size / 1024)}KB)`);
                        this.bufferingProgress = `Audio ready, starting playback...`;
                        resolve(filepath);
                    } else {
                        console.error('❌ Downloaded file is empty:', filename);
                        fs.unlinkSync(filepath);
                        reject(new Error('Downloaded audio file is empty'));
                    }
                } else {
                    console.error('❌ yt-dlp failed with code:', code);
                    console.error('Error output:', errorOutput);
                    reject(new Error(`Failed to extract YouTube audio: ${errorOutput || 'Unknown error'}`));
                }
            });
            
            ytdlp.on('error', (error) => {
                if (error && error.code === 'ENOENT') {
                    console.error('❌ yt-dlp not found. Install it or set YTDLP_PATH.');
                }
                console.error('❌ yt-dlp process error:', error);
                reject(error);
            });
            
            // Add timeout for very slow downloads
            setTimeout(() => {
                if (ytdlp && !ytdlp.killed) {
                    console.log('⏰ YouTube download taking too long, killing process...');
                    ytdlp.kill('SIGTERM');
                    reject(new Error('YouTube download timeout'));
                }
            }, 60000); // 60 second timeout
        });
    }
    
    /**
     * Play audio file using system audio player
     */
    async playAudioFile(filepath) {
        return new Promise((resolve, reject) => {
            console.log('🔊 Playing audio file:', path.basename(filepath));
            
            // Verify file exists and is not empty
            if (!fs.existsSync(filepath)) {
                reject(new Error('Audio file does not exist'));
                return;
            }
            
            const stats = fs.statSync(filepath);
            if (stats.size === 0) {
                reject(new Error('Audio file is empty'));
                return;
            }
            
            console.log('📁 File size:', Math.round(stats.size / 1024), 'KB');
            
            // Get file duration first
            this.getDuration(filepath).then(duration => {
                this.duration = duration;
                this.position = 0;
                console.log('📏 Duration:', duration, 'seconds');
                
                if (duration === 0) {
                    reject(new Error('Audio file has no duration - may be corrupted'));
                    return;
                }
                
                // Use mpg123 as primary player with better error handling
                this.currentProcess = spawn('mpg123', ['-q', '--gain', '50', filepath]);
                
                this.isPlaying = true;
                
                // Start progress tracking
                this.startProgressTracking();
                
                this.currentProcess.on('close', (code) => {
                    console.log(`🔇 Playback ended (code: ${code})`);
                    
                    // Check if this was a premature end (less than 10% of duration played)
                    if (this.duration > 0 && this.position < (this.duration * 0.1)) {
                        console.log('⚠️ Song ended prematurely - may indicate audio issue');
                    }
                    
                    this.isPlaying = false;
                    this.currentProcess = null;
                    this.stopProgressTracking();
                    resolve();
                });
                
                this.currentProcess.on('error', (error) => {
                    console.error('❌ Player error:', error.message);
                    this.isPlaying = false;
                    this.currentProcess = null;
                    this.stopProgressTracking();
                    reject(error);
                });
                
                // Add timeout for very short files or immediate failures
                setTimeout(() => {
                    if (this.currentProcess && this.position === 0) {
                        console.log('⚠️ No progress after 3 seconds - checking if file is valid');
                    }
                }, 3000);
                
            }).catch(error => {
                console.error('❌ Duration detection failed:', error.message);
                // Fallback: play without duration tracking but with better monitoring
                this.duration = 0;
                this.position = 0;
                
                this.currentProcess = spawn('mpg123', ['-q', '--gain', '50', filepath]);
                this.isPlaying = true;
                
                this.currentProcess.on('close', (code) => {
                    console.log(`🔇 Playback ended (code: ${code})`);
                    this.isPlaying = false;
                    this.currentProcess = null;
                    resolve();
                });
                
                this.currentProcess.on('error', (error) => {
                    console.error('❌ Player error:', error.message);
                    this.isPlaying = false;
                    this.currentProcess = null;
                    reject(error);
                });
            });
        });
    }
    
    /**
     * Get audio file duration
     */
    async getDuration(filepath) {
        return new Promise((resolve) => {
            const ffprobe = spawn('ffprobe', [
                '-v', 'quiet',
                '-show_entries', 'format=duration',
                '-of', 'csv=p=0',
                filepath
            ]);
            
            let output = '';
            ffprobe.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            ffprobe.on('close', () => {
                const duration = parseFloat(output.trim()) || 0;
                resolve(duration);
            });
            
            ffprobe.on('error', () => {
                resolve(0); // Default to 0 if ffprobe fails
            });
        });
    }
    
    /**
     * Start progress tracking
     */
    startProgressTracking() {
        // Clear any existing interval
        this.stopProgressTracking();
        
        this.progressInterval = setInterval(() => {
            if (this.isPlaying && this.duration > 0) {
                this.position += 1;
                if (this.position >= this.duration) {
                    this.position = this.duration;
                    this.stopProgressTracking();
                }
            }
            // Don't reset position to 0 when not playing - keep last known position
        }, 1000);
    }
    
    /**
     * Stop progress tracking
     */
    stopProgressTracking() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }
    
    /**
     * Stop current playback
     */
    /**
     * Synchronously kill all mpg123 processes
     */
    killAllMpg123Sync() {
        try {
            console.log('🔪 Synchronously killing all mpg123 processes...');
            const { execSync } = require('child_process');
            execSync('pkill -9 -f mpg123', { stdio: 'ignore' });
            console.log('✅ All mpg123 processes killed synchronously');
        } catch (error) {
            // This is expected if no processes are found
            console.log('⚠️ No mpg123 processes found to kill');
        }
    }

    stop() {
        console.log('⏹️ Stopping all playback...');
        
        // Kill current process if it exists
        if (this.currentProcess) {
            try {
                console.log('🔪 Killing current process:', this.currentProcess.pid);
                this.currentProcess.kill('SIGKILL'); // Use SIGKILL immediately
            } catch (error) {
                console.error('Error stopping process:', error.message);
            }
            this.currentProcess = null;
        }
        
        // Kill ALL mpg123 processes synchronously
        this.killAllMpg123Sync();
        
        this.isPlaying = false;
        this.isPlayingLock = false; // Clear the lock when stopping
        this.stopProgressTracking();
        
        // Only reset position and pause state if this is a full stop (not a pause)
        if (!this.isPaused) {
            this.position = 0;
            this.pausedSong = null;
            this.pausedPosition = 0;
        }
    }
    
    /**
     * Force clear the playing lock (for skip commands)
     */
    clearLock() {
        console.log('🔓 Clearing play lock');
        this.isPlayingLock = false;
    }
    
    /**
     * Pause/resume playback
     */
    pause() {
        console.log('⏸️ Pause method called');
        console.log('Current state - isPlaying:', this.isPlaying, 'currentProcess:', !!this.currentProcess, 'position:', this.position);
        
        if (this.currentProcess && this.isPlaying) {
            console.log('⏸️ Pausing playback at position:', this.position);
            
            // Store the current state for resume
            this.pausedSong = this.currentSong;
            this.pausedPosition = this.position;
            this.isPaused = true;
            
            // Stop the current process
            try {
                console.log('🔪 Killing current process for pause:', this.currentProcess.pid);
                this.currentProcess.kill('SIGKILL');
            } catch (error) {
                console.error('Error pausing:', error.message);
            }
            this.currentProcess = null;
            
            this.isPlaying = false;
            this.stopProgressTracking();
            
            console.log('✅ Pause completed - isPaused:', this.isPaused, 'pausedPosition:', this.pausedPosition);
        } else {
            console.log('⚠️ Cannot pause - no current process or not playing');
            console.log('State: isPlaying =', this.isPlaying, ', currentProcess =', !!this.currentProcess);
        }
    }
    
    resume() {
        console.log('▶️ Resume method called');
        console.log('Current state - isPaused:', this.isPaused, 'pausedSong:', !!this.pausedSong, 'pausedPosition:', this.pausedPosition);
        
        if (this.isPaused && this.pausedSong) {
            console.log('▶️ Resuming playback from position:', this.pausedPosition);
            
            // Resume from the paused position
            this.resumeFromPosition(this.pausedSong, this.pausedPosition);
            
            this.isPaused = false;
            this.pausedSong = null;
            this.pausedPosition = 0;
            
            console.log('✅ Resume initiated');
        } else {
            console.log('⚠️ Cannot resume - not paused or no paused song');
            console.log('State: isPaused =', this.isPaused, ', pausedSong =', !!this.pausedSong);
        }
    }
    
    /**
     * Resume playback from a specific position
     */
    async resumeFromPosition(song, startPosition) {
        try {
            console.log('🔄 resumeFromPosition called for:', song.title, 'at position:', startPosition);
            
            // If the song has ended (position >= duration), restart from beginning
            if (this.duration > 0 && startPosition >= this.duration - 1) {
                console.log('⚠️ Song has ended, restarting from beginning instead of resuming');
                startPosition = 0;
            }
            
            this.currentSong = song;
            this.position = startPosition;
            
            // Find the audio file (should be cached)
            let audioFile = null;
            if (song.videoId || song.youtubeId) {
                const youtubeId = song.videoId || song.youtubeId;
                const filename = `${youtubeId}.mp3`;
                const filepath = path.join(this.cacheDir, filename);
                
                if (fs.existsSync(filepath)) {
                    audioFile = filepath;
                    console.log('📁 Found cached audio file for resume:', filename);
                } else {
                    console.log('⚠️ Cached file not found, re-downloading...');
                    audioFile = await this.extractYouTubeAudio(youtubeId);
                }
            }
            
            if (audioFile && fs.existsSync(audioFile)) {
                console.log('🎵 Starting playback from position:', startPosition);
                // Start playback from the specified position
                await this.playAudioFileFromPosition(audioFile, startPosition);
            } else {
                console.error('❌ Could not resume - audio file not found');
                this.isPaused = false;
                this.pausedSong = null;
                this.pausedPosition = 0;
            }
        } catch (error) {
            console.error('❌ Resume error:', error.message);
            this.isPaused = false;
            this.pausedSong = null;
            this.pausedPosition = 0;
        }
    }
    
    /**
     * Play audio file from a specific position
     */
    async playAudioFileFromPosition(filepath, startPosition = 0) {
        return new Promise((resolve, reject) => {
            console.log('🔊 Playing audio file from position:', path.basename(filepath), 'at', startPosition + 's');
            
            // Verify file exists and is not empty
            if (!fs.existsSync(filepath)) {
                reject(new Error('Audio file does not exist'));
                return;
            }
            
            const stats = fs.statSync(filepath);
            if (stats.size === 0) {
                reject(new Error('Audio file is empty'));
                return;
            }
            
            // Use mpg123 with seek option to start from specific position
            const args = ['-q', '--gain', '50'];
            if (startPosition > 0) {
                // Convert to frame position (mpg123 uses frames, roughly 38.28 frames per second for MP3)
                const framePosition = Math.floor(startPosition * 38.28);
                args.push('--skip', framePosition.toString());
                console.log('🎯 Seeking to frame position:', framePosition, '(', startPosition, 'seconds)');
            }
            args.push(filepath);
            
            console.log('🎵 Starting mpg123 with args:', args.join(' '));
            this.currentProcess = spawn('mpg123', args);
            
            this.currentProcess.on('close', (code) => {
                console.log('🎵 Audio playback ended with code:', code);
                this.isPlaying = false;
                this.currentProcess = null;
                this.stopProgressTracking();
                resolve();
            });
            
            this.currentProcess.on('error', (error) => {
                console.error('❌ Audio playback error:', error.message);
                this.isPlaying = false;
                this.currentProcess = null;
                this.stopProgressTracking();
                reject(error);
            });
            
            // Start progress tracking
            this.isPlaying = true;
            this.startProgressTracking();
            
            console.log('✅ Audio playback started from position:', startPosition + 's', 'PID:', this.currentProcess.pid);
        });
    }
    
    /**
     * Set volume (0.0 to 1.0)
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        console.log('🔊 Volume set to:', Math.round(this.volume * 100) + '%');
        
        // Use amixer to set system volume (try common controls or override via env)
        this.applySystemVolume(Math.round(this.volume * 100));
    }

    applySystemVolume(percent) {
        const control = process.env.AMIXER_CONTROL;
        const device = process.env.AMIXER_DEVICE;
        const controlsToTry = control
            ? [control]
            : ['Master', 'PCM', 'Speaker', 'Headphone'];

        for (const ctl of controlsToTry) {
            const args = [];
            if (device) {
                args.push('-D', device);
            }
            args.push('sset', ctl, `${percent}%`);
            const result = spawnSync('amixer', args, { stdio: 'ignore' });
            if (result && result.status === 0) {
                return;
            }
        }
    }

    /**
     * Fade volume to 0 over a duration. Returns the starting volume.
     */
    fadeOut(durationMs = 2000, steps = null) {
        return new Promise((resolve) => {
            const startVolume = this.volume;
            const resolvedSteps = steps === null
                ? Math.max(5, Math.min(40, Math.round(durationMs / 100)))
                : steps;

            if (startVolume <= 0 || resolvedSteps <= 0) {
                this.setVolume(0);
                resolve(startVolume);
                return;
            }

            const stepMs = Math.max(50, Math.floor(durationMs / resolvedSteps));
            let currentStep = 0;
            const timer = setInterval(() => {
                currentStep += 1;
                const factor = Math.max(0, 1 - currentStep / resolvedSteps);
                this.setVolume(startVolume * factor);

                if (currentStep >= resolvedSteps) {
                    clearInterval(timer);
                    this.setVolume(0);
                    resolve(startVolume);
                }
            }, stepMs);
        });
    }
    
    /**
     * Play test audio for speaker testing
     */
    async playTestAudio() {
        try {
            console.log('🧪 Playing test audio...');
            
            const cacheTestFile = path.join(this.cacheDir, 'test-speakers.mp3');
            const repoTestFile = path.join(__dirname, 'audio', 'stereo-test.mp3');
            const testFile = fs.existsSync(cacheTestFile)
                ? cacheTestFile
                : repoTestFile;
            
            if (!fs.existsSync(testFile)) {
                throw new Error('Test audio file not found');
            }
            
            console.log('🔎 Using test audio file:', testFile);
            
            // Stop current playback
            this.stop();
            
            // Play test audio
            await this.playAudioFile(testFile);
            
            return { success: true, message: 'Test audio started' };
            
        } catch (error) {
            console.error('❌ Test audio error:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Pre-buffer a song (download without playing)
     */
    async preBuffer(song) {
        try {
            console.log('📦 Pre-buffering:', song.title);
            this.isBuffering = true;
            this.bufferingProgress = song.title;
            
            if (song.videoId || song.youtubeId) {
                const youtubeId = song.videoId || song.youtubeId;
                const filename = `${youtubeId}.mp3`;
                const filepath = path.join(this.cacheDir, filename);
                
                // Check if already cached
                if (fs.existsSync(filepath)) {
                    const stats = fs.statSync(filepath);
                    if (stats.size > 1024) {
                        console.log('📁 Already cached:', song.title);
                        this.isBuffering = false;
                        this.bufferingProgress = null;
                        return { success: true, cached: true };
                    } else {
                        // Remove corrupted cache file
                        fs.unlinkSync(filepath);
                    }
                }
                
                // Download in background
                await this.extractYouTubeAudio(youtubeId);
                this.recordCacheEntry(youtubeId, song, filepath);
                console.log('✅ Pre-buffered:', song.title);
                this.isBuffering = false;
                this.bufferingProgress = null;
                return { success: true, cached: false };
            }
            
            this.isBuffering = false;
            this.bufferingProgress = null;
            return { success: false, error: 'No video ID' };
        } catch (error) {
            console.log('⚠️ Pre-buffer failed:', error.message);
            this.isBuffering = false;
            this.bufferingProgress = null;
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Get current status
     */
    getStatus() {
        return {
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            currentSong: this.currentSong,
            volume: this.volume,
            position: this.position,
            duration: this.duration,
            isBuffering: this.isBuffering,
            bufferingProgress: this.bufferingProgress,
            pausedSong: this.pausedSong,
            pausedPosition: this.pausedPosition
        };
    }
    
    /**
     * Clean up old cache files
     */
    cleanCache() {
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        const now = Date.now();
        
        fs.readdir(this.cacheDir, (err, files) => {
            if (err) return;
            
            files.forEach(file => {
                const filepath = path.join(this.cacheDir, file);
                fs.stat(filepath, (err, stats) => {
                    if (err) return;
                    
                    if (now - stats.mtime.getTime() > maxAge) {
                        fs.unlink(filepath, () => {
                            console.log('🗑️ Cleaned cache file:', file);
                        });
                    }
                });
            });
        });
    }
}

// Export for use as module
module.exports = AudioService;

// Run as standalone service if called directly
if (require.main === module) {
    const audioService = new AudioService();
    
    // Clean cache on startup
    audioService.cleanCache();
    
    // Example usage
    console.log('🎵 Audio Service ready');
    console.log('📋 Status:', audioService.getStatus());
}
