#!/usr/bin/env node

/**
 * Test script for pause/resume functionality
 */

const AudioService = require('./audio-service');

async function testPauseResume() {
    console.log('🧪 Testing pause/resume functionality...');
    
    const audioService = new AudioService();
    
    // Test song
    const testSong = {
        id: 'test-song',
        title: 'Test Song',
        artist: 'Test Artist',
        videoId: 'DxQK_ARQmMY', // Don't Stop Me Now by Queen
        source: 'test'
    };
    
    try {
        console.log('1️⃣ Starting playback...');
        const playResult = await audioService.play(testSong);
        
        if (!playResult.success) {
            console.error('❌ Failed to start playback:', playResult.error);
            return;
        }
        
        console.log('✅ Playback started');
        
        // Wait 5 seconds
        console.log('⏰ Waiting 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('2️⃣ Current status before pause:');
        console.log(audioService.getStatus());
        
        console.log('3️⃣ Pausing...');
        audioService.pause();
        
        // Wait 1 second for pause to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('4️⃣ Status after pause:');
        console.log(audioService.getStatus());
        
        // Wait 3 seconds while paused
        console.log('⏰ Waiting 3 seconds while paused...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('5️⃣ Resuming...');
        audioService.resume();
        
        // Wait 1 second for resume to start
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('6️⃣ Status after resume:');
        console.log(audioService.getStatus());
        
        // Wait 5 more seconds
        console.log('⏰ Waiting 5 more seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('7️⃣ Final status:');
        console.log(audioService.getStatus());
        
        console.log('8️⃣ Stopping...');
        audioService.stop();
        
        console.log('✅ Test completed successfully');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
    
    process.exit(0);
}

// Run the test
testPauseResume();