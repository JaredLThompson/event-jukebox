const { SpotifyApi, SpotifyClientCredentials } = require('@spotify/web-api-ts-sdk');
require('dotenv').config();

class SpotifyService {
    constructor() {
        this.spotifyApi = null;
        this.isInitialized = false;
        this.isEnabled = process.env.SPOTIFY_ENABLED === '1';
        this.initPromise = this.isEnabled ? this.initializeApi() : Promise.resolve();
    }

    async initializeApi() {
        try {
            if (!this.isEnabled) {
                console.warn('Spotify integration disabled (SPOTIFY_ENABLED=0)');
                return;
            }
            if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
                console.warn('Spotify credentials not found in environment variables');
                return;
            }

            // Use Client Credentials flow for public search (no user auth needed)
            this.spotifyApi = SpotifyApi.withClientCredentials(
                process.env.SPOTIFY_CLIENT_ID,
                process.env.SPOTIFY_CLIENT_SECRET
            );

            // Test the connection
            const timeoutMs = parseInt(process.env.SPOTIFY_INIT_TIMEOUT_MS || '5000', 10);
            await Promise.race([
                this.spotifyApi.search('test', ['track'], 'US', 1),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Spotify init timeout')), timeoutMs))
            ]);
            this.isInitialized = true;
            console.log('✅ Spotify API initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Spotify API:', error.message);
            this.isInitialized = false;
        }
    }

    async searchTracks(query, limit = 10) {
        await this.initPromise;
        if (!this.isEnabled) {
            throw new Error('Spotify API disabled');
        }
        if (!this.isInitialized) {
            throw new Error('Spotify API not initialized. Check your credentials.');
        }

        try {
            const results = await this.spotifyApi.search(query, ['track'], 'US', limit);
            
            return {
                success: true,
                results: results.tracks.items.map(track => ({
                    id: track.id,
                    title: track.name,
                    artist: track.artists.map(artist => artist.name).join(', '),
                    album: track.album.name,
                    duration_ms: track.duration_ms,
                    duration_text: this.formatDuration(track.duration_ms),
                    thumbnail: track.album.images[0]?.url || '',
                    preview_url: track.preview_url,
                    external_urls: track.external_urls,
                    uri: track.uri,
                    popularity: track.popularity,
                    explicit: track.explicit,
                    source: 'spotify'
                }))
            };
        } catch (error) {
            console.error('Spotify search error:', error);
            throw new Error(`Spotify search failed: ${error.message}`);
        }
    }

    async getTrack(trackId) {
        await this.initPromise;
        if (!this.isEnabled) {
            throw new Error('Spotify API disabled');
        }
        if (!this.isInitialized) {
            throw new Error('Spotify API not initialized');
        }

        try {
            const track = await this.spotifyApi.tracks.get(trackId);
            
            return {
                success: true,
                track: {
                    id: track.id,
                    title: track.name,
                    artist: track.artists.map(artist => artist.name).join(', '),
                    album: track.album.name,
                    duration_ms: track.duration_ms,
                    duration_text: this.formatDuration(track.duration_ms),
                    thumbnail: track.album.images[0]?.url || '',
                    preview_url: track.preview_url,
                    external_urls: track.external_urls,
                    uri: track.uri,
                    popularity: track.popularity,
                    explicit: track.explicit,
                    source: 'spotify'
                }
            };
        } catch (error) {
            console.error('Spotify get track error:', error);
            throw new Error(`Failed to get track: ${error.message}`);
        }
    }

    async getArtist(artistId) {
        await this.initPromise;
        if (!this.isEnabled) {
            throw new Error('Spotify API disabled');
        }
        if (!this.isInitialized) {
            throw new Error('Spotify API not initialized');
        }

        try {
            const artist = await this.spotifyApi.artists.get(artistId);
            return {
                success: true,
                artist: {
                    id: artist.id,
                    name: artist.name,
                    genres: artist.genres,
                    popularity: artist.popularity,
                    images: artist.images,
                    external_urls: artist.external_urls
                }
            };
        } catch (error) {
            console.error('Spotify get artist error:', error);
            throw new Error(`Failed to get artist: ${error.message}`);
        }
    }

    async getRecommendations(seedTracks = [], seedArtists = [], seedGenres = [], limit = 10) {
        if (!this.isInitialized) {
            throw new Error('Spotify API not initialized');
        }

        try {
            const recommendations = await this.spotifyApi.recommendations.get({
                seed_tracks: seedTracks.slice(0, 5), // Max 5 seeds total
                seed_artists: seedArtists.slice(0, 5),
                seed_genres: seedGenres.slice(0, 5),
                limit: limit,
                market: 'US'
            });

            return {
                success: true,
                recommendations: recommendations.tracks.map(track => ({
                    id: track.id,
                    title: track.name,
                    artist: track.artists.map(artist => artist.name).join(', '),
                    album: track.album.name,
                    duration_ms: track.duration_ms,
                    duration_text: this.formatDuration(track.duration_ms),
                    thumbnail: track.album.images[0]?.url || '',
                    preview_url: track.preview_url,
                    external_urls: track.external_urls,
                    uri: track.uri,
                    popularity: track.popularity,
                    explicit: track.explicit,
                    source: 'spotify'
                }))
            };
        } catch (error) {
            console.error('Spotify recommendations error:', error);
            throw new Error(`Failed to get recommendations: ${error.message}`);
        }
    }

    formatDuration(durationMs) {
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    isAvailable() {
        return this.isInitialized;
    }

    getStatus() {
        return {
            initialized: this.isInitialized,
            hasCredentials: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
        };
    }
}

module.exports = SpotifyService;
