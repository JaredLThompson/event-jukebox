#!/usr/bin/env node

/**
 * Test script to verify pre-buffering functionality
 */

const AudioService = require('./audio-service');

async function testPreBuffering() {
    console.log('🧪 Testing pre-buffering functionality...');
    
    const audioService = new AudioService();
    
    // Test song (a popular song that should be available)
    const testSong = {
        id: 'test-song',
        videoId: 'dQw4w9WgXcQ', // Rick Roll - reliable test video
        youtubeId: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley'
    };
    
    console.log('📦 Testing pre-buffer for:', testSong.title);
    
    try {
        const result = await audioService.preBuffer(testSong);
        
        if (result.success) {
            if (result.cached) {
                console.log('✅ Song was already cached');
            } else {
                console.log('✅ Song pre-buffered successfully');
            }
            
            // Check if file exists and has reasonable size
            const fs = require('fs');
            const path = require('path');
            const filepath = path.join(audioService.cacheDir, `${testSong.videoId}.mp3`);
            
            if (fs.existsSync(filepath)) {
                const stats = fs.statSync(filepath);
                console.log('📁 File size:', Math.round(stats.size / 1024), 'KB');
                
                if (stats.size > 1024) {
                    console.log('🎉 Pre-buffering test PASSED');
                } else {
                    console.log('❌ Pre-buffering test FAILED - file too small');
                }
            } else {
                console.log('❌ Pre-buffering test FAILED - file not found');
            }
        } else {
            console.log('❌ Pre-buffering test FAILED:', result.error);
        }
    } catch (error) {
        console.log('❌ Pre-buffering test ERROR:', error.message);
    }
    
    console.log('🧪 Test complete');
}

// Run test if called directly
if (require.main === module) {
    testPreBuffering();
}

module.exports = testPreBuffering;