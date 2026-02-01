#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function setupSpotifyAuth() {
    console.log('🎵 Spotify Integration Setup');
    console.log('============================\n');
    
    console.log('To integrate Spotify, you need to create a Spotify App:');
    console.log('1. Go to https://developer.spotify.com/dashboard');
    console.log('2. Log in with your Spotify account');
    console.log('3. Click "Create App"');
    console.log('4. Fill in the app details:');
    console.log('   - App name: "Wedding DJ Virtual Jukebox"');
    console.log('   - App description: "Virtual jukebox for wedding music"');
    console.log('   - Website: http://localhost:3000 (or your domain)');
    console.log('   - Redirect URI: http://localhost:3000/auth/spotify/callback');
    console.log('5. Accept the terms and create the app');
    console.log('6. Copy the Client ID and Client Secret\n');
    
    const clientId = await question('Enter your Spotify Client ID: ');
    if (!clientId.trim()) {
        console.log('❌ Client ID is required');
        rl.close();
        process.exit(1);
    }
    
    const clientSecret = await question('Enter your Spotify Client Secret: ');
    if (!clientSecret.trim()) {
        console.log('❌ Client Secret is required');
        rl.close();
        process.exit(1);
    }
    
    // Read existing .env file or create new one
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Remove existing Spotify credentials if they exist
    envContent = envContent.replace(/^SPOTIFY_CLIENT_ID=.*$/gm, '');
    envContent = envContent.replace(/^SPOTIFY_CLIENT_SECRET=.*$/gm, '');
    
    // Add new Spotify credentials
    envContent += `\n# Spotify API Credentials\n`;
    envContent += `SPOTIFY_CLIENT_ID=${clientId.trim()}\n`;
    envContent += `SPOTIFY_CLIENT_SECRET=${clientSecret.trim()}\n`;
    
    // Clean up extra newlines
    envContent = envContent.replace(/\n\n+/g, '\n\n').trim() + '\n';
    
    // Write the updated .env file
    fs.writeFileSync(envPath, envContent);
    
    console.log('\n✅ Spotify credentials saved to .env file');
    console.log('\n🔧 Next steps:');
    console.log('1. Restart your server: npm start');
    console.log('2. Spotify search will be available in the web interface');
    
    console.log('\n📝 Note: This setup uses Client Credentials flow for public search.');
    console.log('No user authentication is required for basic music search functionality.');
    
    rl.close();
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\n\n❌ Setup cancelled');
    rl.close();
    process.exit(0);
});

// Only run if called directly
if (require.main === module) {
    setupSpotifyAuth().catch(error => {
        console.error('❌ Setup failed:', error.message);
        rl.close();
        process.exit(1);
    });
}