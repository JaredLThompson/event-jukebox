#!/usr/bin/env node

/**
 * Simple test to check if pause commands reach the audio integration service
 */

const io = require('socket.io-client');

const socket = io('http://192.168.10.88:3000');

socket.on('connect', () => {
    console.log('✅ Connected to Pi jukebox');
    
    // Send a ping first to test connection
    console.log('🏓 Sending ping...');
    socket.emit('ping');
    
    setTimeout(() => {
        console.log('⏸️ Sending pause command...');
        socket.emit('pauseCommand');
        
        setTimeout(() => {
            console.log('✅ Test completed, disconnecting...');
            socket.disconnect();
            process.exit(0);
        }, 2000);
    }, 2000);
});

socket.on('pong', () => {
    console.log('🏓 Pong received - socket connection working');
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from Pi jukebox');
});

console.log('🔗 Connecting to Pi jukebox...');