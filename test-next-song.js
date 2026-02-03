#!/usr/bin/env node

/**
 * Test script to test next song functionality
 */

const io = require('socket.io-client');

const socket = io('http://192.168.10.88:3000');

socket.on('connect', () => {
    console.log('✅ Connected to Pi jukebox');
    
    // First check current status
    console.log('📊 Checking current status...');
    
    setTimeout(() => {
        console.log('⏭️ Sending skip command...');
        socket.emit('skipCommand');
        
        setTimeout(() => {
            console.log('✅ Test completed, disconnecting...');
            socket.disconnect();
            process.exit(0);
        }, 5000);
    }, 3000);
});

socket.on('audioServiceStatus', (data) => {
    console.log(`📊 Status: isPlaying=${data.isPlaying}, isPaused=${data.isPaused}, position=${data.position}, song=${data.currentSong?.title}`);
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from Pi jukebox');
});

// Timeout after 15 seconds
setTimeout(() => {
    console.log('⏰ Test timeout - disconnecting');
    socket.disconnect();
    process.exit(1);
}, 15000);

console.log('🔗 Connecting to Pi jukebox...');