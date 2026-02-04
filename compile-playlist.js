#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = 'event-play-history.json';

function compilePlaylistFromHistory() {
    try {
        // Check if history file exists
        if (!fs.existsSync(HISTORY_FILE)) {
            console.log('❌ No play history file found. Make sure event-play-history.json exists.');
            return;
        }

        // Load history data
        const historyData = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        
        if (historyData.length === 0) {
            console.log('📝 Play history is empty.');
            return;
        }

        // Filter for actually played songs (not just added)
        const playedSongs = historyData.filter(entry => entry.action === 'played');
        
        // Remove duplicates and mic breaks
        const uniqueSongs = [];
        const seenSongs = new Set();
        
        playedSongs.forEach(entry => {
            const song = entry.song;
            
            // Skip mic breaks
            if (song.type === 'mic-break') return;
            
            // Create unique identifier
            const songId = `${song.title.toLowerCase()}-${song.artist.toLowerCase()}`;
            
            if (!seenSongs.has(songId)) {
                seenSongs.add(songId);
                uniqueSongs.push({
                    title: song.title,
                    artist: song.artist,
                    duration: song.duration,
                    addedBy: song.addedBy,
                    source: song.source,
                    timestamp: entry.timestamp,
                    videoId: song.videoId || null
                });
            }
        });

        // Generate different playlist formats
        generateTextPlaylist(uniqueSongs);
        generateJavaScriptPlaylist(uniqueSongs);
        generateSpotifyFormat(uniqueSongs);
        generateStatistics(historyData, uniqueSongs);
        
    } catch (error) {
        console.error('❌ Error compiling playlist:', error.message);
    }
}

function generateTextPlaylist(songs) {
    const date = new Date().toISOString().split('T')[0];
    let content = `# Wedding Playlist - ${date}\n`;
    content += `# Generated from play history\n`;
    content += `# Total songs: ${songs.length}\n\n`;
    
    songs.forEach((song, index) => {
        const playTime = new Date(song.timestamp).toLocaleTimeString();
        content += `${index + 1}. ${song.title} - ${song.artist}`;
        if (song.duration) content += ` (${song.duration})`;
        content += ` [${playTime}]`;
        if (song.source === 'fallback') content += ` 🎵`;
        content += `\n`;
    });
    
    const filename = `wedding-playlist-${date}.txt`;
    fs.writeFileSync(filename, content);
    console.log(`📝 Text playlist saved: ${filename}`);
}

function generateJavaScriptPlaylist(songs) {
    const date = new Date().toISOString().split('T')[0];
    let content = `// Wedding Playlist - Generated from play history\n`;
    content += `// Date: ${date}\n`;
    content += `// Total songs: ${songs.length}\n\n`;
    content += `const WEDDING_MEMORY_PLAYLIST = [\n`;
    
    songs.forEach((song, index) => {
        const searchTerm = `${song.title} ${song.artist}`.replace(/"/g, '\\"');
        content += `    {\n`;
        content += `        search: "${searchTerm}",\n`;
        content += `        type: "${song.source === 'fallback' ? 'wedding-favorite' : 'guest-request'}"\n`;
        content += `    }${index < songs.length - 1 ? ',' : ''}\n`;
    });
    
    content += `];\n\n`;
    content += `module.exports = WEDDING_MEMORY_PLAYLIST;\n`;
    
    const filename = `wedding-memory-playlist-${date}.js`;
    fs.writeFileSync(filename, content);
    console.log(`🎵 JavaScript playlist saved: ${filename}`);
}

function generateSpotifyFormat(songs) {
    const date = new Date().toISOString().split('T')[0];
    let content = `# Wedding Playlist for Spotify/Apple Music\n`;
    content += `# Copy and paste song names to search in your music app\n`;
    content += `# Date: ${date}\n\n`;
    
    songs.forEach((song, index) => {
        content += `${song.title} ${song.artist}\n`;
    });
    
    const filename = `wedding-spotify-list-${date}.txt`;
    fs.writeFileSync(filename, content);
    console.log(`🎧 Spotify format saved: ${filename}`);
}

function generateStatistics(historyData, uniqueSongs) {
    const stats = {
        totalEntries: historyData.length,
        songsPlayed: uniqueSongs.length,
        guestRequests: uniqueSongs.filter(s => s.source === 'youtube' || s.source === 'user').length,
        fallbackSongs: uniqueSongs.filter(s => s.source === 'fallback').length,
        uniqueGuests: [...new Set(historyData.map(entry => entry.song.addedBy))].length,
        duration: calculateTotalDuration(uniqueSongs)
    };
    
    console.log('\n📊 Wedding Music Statistics:');
    console.log(`   Total songs played: ${stats.songsPlayed}`);
    console.log(`   Guest requests: ${stats.guestRequests}`);
    console.log(`   Wedding favorites: ${stats.fallbackSongs}`);
    console.log(`   Unique contributors: ${stats.uniqueGuests}`);
    console.log(`   Estimated total duration: ${stats.duration}`);
    
    // Top contributors
    const contributors = {};
    historyData.forEach(entry => {
        if (entry.action === 'played' && entry.song.type !== 'mic-break') {
            const contributor = entry.song.addedBy;
            contributors[contributor] = (contributors[contributor] || 0) + 1;
        }
    });
    
    const topContributors = Object.entries(contributors)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);
    
    if (topContributors.length > 0) {
        console.log('\n🏆 Top Music Contributors:');
        topContributors.forEach(([name, count], index) => {
            console.log(`   ${index + 1}. ${name}: ${count} songs`);
        });
    }
}

function calculateTotalDuration(songs) {
    let totalMinutes = 0;
    
    songs.forEach(song => {
        if (song.duration && song.duration !== '∞') {
            const parts = song.duration.split(':');
            if (parts.length === 2) {
                totalMinutes += parseInt(parts[0]) + (parseInt(parts[1]) / 60);
            }
        }
    });
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// Run the script
console.log('🎵 Compiling wedding playlist from play history...\n');
compilePlaylistFromHistory();