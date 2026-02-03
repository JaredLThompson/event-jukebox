#!/usr/bin/env node

/**
 * Test script to start music playing and then test pause/resume
 */

const io = require('socket.io-client');

const socket = io('http://192.168.10.88:3000');

let testStep = 0;

socket.on('connect', () => {
    console.log('✅ Connected to Pi jukebox');
    
    // Step 1: Start music
    console.log('🎵 Step 1: Starting music...');
    socket.emit('manualPlayCommand');
    testStep = 1;
});

socket.on('audioServiceStatus', (data) => {
    console.log(`📊 Status: isPlaying=${data.isPlaying}, isPaused=${data.isPaused}, position=${data.position}, song=${data.currentSong?.title}`);
    
    // Step 2: When music is playing, pause it
    if (testStep === 1 && data.isPlaying && data.position > 3) {
        console.log('⏸️ Step 2: Music is playing, sending pause...');
        socket.emit('pauseCommand');
        testStep = 2;
    }
    
    // Step 3: When paused, resume it
    else if (testStep === 2 && data.isPaused && !data.isPlaying) {
        console.log('▶️ Step 3: Music is paused, waiting 3 seconds then resuming...');
        setTimeout(() => {
            socket.emit('resumeCommand');
            testStep = 3;
        }, 3000);
    }
    
    // Step 4: When resumed, finish test
    else if (testStep === 3 && data.isPlaying && !data.isPaused) {
        console.log('✅ Step 4: Music resumed successfully! Test completed.');
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
    console.log('⏰ Test timeout - disconnecting');
    socket.disconnect();
    process.exit(1);
}, 30000);

console.log('🔗 Connecting to Pi jukebox...');