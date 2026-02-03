#!/usr/bin/env node

/**
 * Test script for audio service
 */

const AudioService = require('./audio-service');

async function testAudio() {
    const audioService = new AudioService();
    
    console.log('🧪 Testing audio service...');
    
    // Test with a simple beep sound
    console.log('🔊 Testing system audio with beep...');
    
    try {
        // Create a simple test tone using speaker-test
        const { spawn } = require('child_process');
        
        const testSound = spawn('speaker-test', ['-t', 'sine', '-f', '440', '-l', '1']);
        
        testSound.on('close', (code) => {
            console.log(`🔊 Audio test completed with code: ${code}`);
            if (code === 0) {
                console.log('✅ Audio system is working!');
            } else {
                console.log('❌ Audio system test failed');
            }
        });
        
        testSound.on('error', (error) => {
            console.error('❌ Audio test error:', error.message);
            console.log('💡 Try: sudo apt install alsa-utils');
        });
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

if (require.main === module) {
    testAudio();
}