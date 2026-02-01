#!/usr/bin/env node

const QRCode = require('qrcode');
const fs = require('fs');
const os = require('os');

function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
    
    return 'localhost';
}

async function generateQRCodes() {
    const localIP = getLocalIPAddress();
    const port = process.env.PORT || 3000;
    
    // URLs to generate QR codes for
    const urls = {
        'DJ Interface': `http://${localIP}:${port}`,
        'Guest Interface': `http://${localIP}:${port}/user`,
        'Localhost DJ': `http://localhost:${port}`,
        'Localhost Guest': `http://localhost:${port}/user`
    };
    
    console.log('🎵 Wedding Jukebox QR Code Generator');
    console.log('==================================================');
    console.log(`📡 Detected Local IP: ${localIP}`);
    console.log(`🔌 Server Port: ${port}`);
    console.log('');
    
    try {
        // Generate QR codes
        for (const [name, url] of Object.entries(urls)) {
            const filename = `qr-${name.toLowerCase().replace(/\s+/g, '-')}.png`;
            
            await QRCode.toFile(filename, url, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            
            console.log(`✅ ${name}: ${filename}`);
            console.log(`   URL: ${url}`);
            console.log('');
        }
        
        // Generate a combined HTML page with all QR codes
        await generateQRCodePage(urls, localIP, port);
        
        console.log('🎊 QR Codes generated successfully!');
        console.log('');
        console.log('📱 For Wedding Guests:');
        console.log(`   • Print qr-guest-interface.png`);
        console.log(`   • Or open qr-codes.html in browser and print`);
        console.log('');
        console.log('🎛️ For DJ Setup:');
        console.log(`   • Use qr-dj-interface.png for quick access`);
        console.log('');
        console.log('💡 Tips:');
        console.log('   • Make sure all devices are on the same WiFi network');
        console.log('   • Test the URLs before the wedding');
        console.log(`   • Your server should be running on ${localIP}:${port}`);
        
    } catch (error) {
        console.error('❌ Error generating QR codes:', error.message);
        process.exit(1);
    }
}

async function generateQRCodePage(urls, localIP, port) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wedding Jukebox QR Codes</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 10px;
            font-size: 2.5em;
        }
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 40px;
            font-size: 1.2em;
        }
        .qr-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
            margin-bottom: 40px;
        }
        .qr-card {
            text-align: center;
            padding: 20px;
            border: 2px solid #e0e0e0;
            border-radius: 15px;
            background: #f9f9f9;
        }
        .qr-card h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.3em;
        }
        .qr-code {
            margin: 15px 0;
        }
        .url {
            font-family: monospace;
            background: #e8e8e8;
            padding: 8px 12px;
            border-radius: 5px;
            font-size: 0.9em;
            word-break: break-all;
            color: #555;
        }
        .instructions {
            background: #f0f8ff;
            border-left: 4px solid #4CAF50;
            padding: 20px;
            margin-top: 30px;
            border-radius: 5px;
        }
        .instructions h3 {
            color: #2E7D32;
            margin-top: 0;
        }
        .guest-highlight {
            border-color: #4CAF50;
            background: #f8fff8;
        }
        .dj-highlight {
            border-color: #FF9800;
            background: #fff8f0;
        }
        @media print {
            body { background: white; }
            .container { box-shadow: none; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎵 Wedding Jukebox</h1>
        <p class="subtitle">Scan QR codes to access the music queue</p>
        
        <div class="qr-grid">
            <div class="qr-card guest-highlight">
                <h3>👥 For Wedding Guests</h3>
                <div class="qr-code" id="guest-qr"></div>
                <div class="url">${urls['Guest Interface']}</div>
                <p><strong>Scan this to add songs to the queue!</strong></p>
            </div>
            
            <div class="qr-card dj-highlight">
                <h3>🎛️ For DJ/Host</h3>
                <div class="qr-code" id="dj-qr"></div>
                <div class="url">${urls['DJ Interface']}</div>
                <p><strong>Full DJ controls and queue management</strong></p>
            </div>
        </div>
        
        <div class="instructions">
            <h3>📱 How to Use:</h3>
            <ol>
                <li><strong>Make sure your wedding jukebox server is running</strong> on ${localIP}:${port}</li>
                <li><strong>Connect all devices to the same WiFi network</strong></li>
                <li><strong>Guests scan the "For Wedding Guests" QR code</strong> with their phone cameras</li>
                <li><strong>DJ/Host uses the "For DJ/Host" QR code</strong> for full controls</li>
                <li><strong>Start the music and let guests add their favorites!</strong></li>
            </ol>
            
            <h3>💡 Tips:</h3>
            <ul>
                <li>Print this page and place QR codes on tables</li>
                <li>Test the links before the wedding</li>
                <li>Make sure your laptop/server stays connected to WiFi</li>
                <li>Consider having a backup phone hotspot ready</li>
            </ul>
        </div>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
    <script>
        // Generate QR codes in the browser
        QRCode.toCanvas(document.getElementById('guest-qr'), '${urls['Guest Interface']}', {
            width: 200,
            margin: 2
        });
        
        QRCode.toCanvas(document.getElementById('dj-qr'), '${urls['DJ Interface']}', {
            width: 200,
            margin: 2
        });
    </script>
</body>
</html>`;

    fs.writeFileSync('qr-codes.html', html);
    console.log('✅ QR Codes HTML Page: qr-codes.html');
}

// Handle command line arguments
if (process.argv.length > 2) {
    const customIP = process.argv[2];
    const customPort = process.argv[3] || 3000;
    
    console.log(`🔧 Using custom IP: ${customIP}:${customPort}`);
    
    // Override the IP detection
    const originalGetLocalIP = getLocalIPAddress;
    getLocalIPAddress = () => customIP;
    process.env.PORT = customPort;
}

// Run the generator
generateQRCodes().catch(console.error);