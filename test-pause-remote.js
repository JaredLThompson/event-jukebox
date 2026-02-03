#!/usr/bin/env node

/**
 * Test script to trigger playback and test pause/resume on remote Pi
 */

const io = require('socket.io-client');

const socket = io('http://192.168.10.88:3000');

socket.on('connect', () => {
    console.log('✅ Connected to Pi jukebox');
    
    // First, trigger manual play to start audio service
    console.log('🎵 Sending manual play command...');
    socket.emit('manualPlayCommand');
    
    // Wait 10 seconds for song to start
    setTimeout(() => {
        console.log('⏸️ Sending pause command...');
        socket.emit('pauseCommand');
        
        // Wait 5 seconds
        setTimeout(() => {
            console.log('▶️ Sending resume command...');
            socket.emit('resumeCommand');
            
            // Wait 5 more seconds then disconnect
            setTimeout(() => {
                console.log('✅ Test completed, disconnecting...');
                socket.disconnect();
                process.exit(0);
            }, 5000);
        }, 5000);
    }, 10000);
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from Pi jukebox');
});

socket.on('audioServiceStatus', (data) => {
    console.log('📊 Audio service status:', {
        isPlaying: data.isPlaying,
        isPaused: data.isPaused,
        currentSong: data.currentSong?.title,
        position: data.position,
        duration: data.duration
    });
});

console.log('🔗 Connecting to Pi jukebox...');