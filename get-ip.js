#!/usr/bin/env node

const os = require('os');

function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    
    console.log('🌐 Available Network Interfaces:');
    console.log('================================');
    
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                console.log(`✅ ${name}: ${interface.address}`);
                return interface.address;
            }
        }
    }
    
    console.log('❌ No external IPv4 interfaces found');
    return 'localhost';
}

const ip = getLocalIPAddress();
const port = process.env.PORT || 3000;

console.log('');
console.log('🎵 Wedding Jukebox URLs:');
console.log('========================');
console.log(`🎛️  DJ Interface:    http://${ip}:${port}`);
console.log(`👥 Guest Interface: http://${ip}:${port}/user`);
console.log('');
console.log('💡 To generate QR codes for these URLs:');
console.log('   node generate-qr.js');
console.log('');
console.log('🔧 To use a different IP:');
console.log('   node generate-qr.js [IP_ADDRESS] [PORT]');
console.log('   Example: node generate-qr.js 192.168.1.100 3000');