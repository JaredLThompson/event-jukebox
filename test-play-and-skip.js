#!/usr/bin/env node

/**
 * Test script to start music and then test skip functionality
 */

const io = require('socket.io-client');

const socket = io('http://192.168.10.88:3000');

let testStep = 0;
let currentSong = null;

socket.on('connect', () => {
    console.log('✅ Connected to Pi jukebox');
    
    // Step 1: Start music
    console.log('🎵 Step 1: Starting music...');
    socket.emit('manualPlayCommand');
    testStep = 1;
});

socket.on('audioServiceStatus', (data) => {
    console.log(`📊 Status: isPlaying=${data.isPlaying}, isPaused=${data.isPaused}, position=${data.position}, song=${data.currentSong?.title}`);
    
    // Step 2: When music is playing for a few seconds, skip to next song
    if (testStep === 1 && data.isPlaying && data.position > 3) {
        currentSong = data.currentSong?.title;
        console.log(`⏭️ Step 2: Music is playing (${currentSong}), sending skip command...`);
        socket.emit('skipCommand');
        testStep = 2;
    }
    
    // Step 3: Check if song changed after skip
    else if (testStep === 2 && data.currentSong?.title && data.currentSong.title !== currentSong) {
        console.log(`✅ Step 3: Song changed from "${currentSong}" to "${data.currentSong.title}" - Skip worked!`);
        setTimeout(() => {
            socket.disconnect();
            process.exit(0);
        }, 2000);
    }
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from Pi jukebox');
});

// Timeout after 30 seconds
setTimeout(() => {
    console.log('⏰ Test timeout - skip may not be working');
    socket.disconnect();
    process.exit(1);
}, 30000);

console.log('🔗 Connecting to Pi jukebox...');