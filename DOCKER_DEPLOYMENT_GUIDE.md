# 🐳 Docker Deployment Guide

## 🚀 Quick Start

### Deploy Locally
```bash
./deploy-local.sh
```

This single command will:
- Build the Docker image with all latest code (including Spotify integration)
- Create and start the container
- Set up persistent data volumes
- Mount configuration files
- Test the deployment
- Show you all the access URLs

### Manage Your Deployment
```bash
./docker-manage.sh [COMMAND]
```

## 📋 Available Commands

### Basic Operations
```bash
./docker-manage.sh start      # Start the container
./docker-manage.sh stop       # Stop the container
./docker-manage.sh restart    # Restart the container
./docker-manage.sh status     # Show container status
./docker-manage.sh logs       # Show logs
./docker-manage.sh logs -f    # Follow logs in real-time
```

### Advanced Operations
```bash
./docker-manage.sh shell      # Open bash shell in container
./docker-manage.sh health     # Run comprehensive health check
./docker-manage.sh update     # Rebuild with latest code
./docker-manage.sh remove     # Remove container and image
```

### Data Management
```bash
./docker-manage.sh backup     # Backup playlists and history
./docker-manage.sh restore    # Restore from backup
```

## 🎵 What Gets Deployed

### Included Features
- ✅ **YouTube Music Integration** - Full search and playback
- ✅ **Spotify Integration** - Search with 30-second previews (when configured)
- ✅ **Dual Playlists** - Wedding party + bride's elegant collection
- ✅ **Real-time Collaboration** - Multiple users can add songs
- ✅ **DJ Controls** - Queue management, playlist browser, history
- ✅ **Mobile Responsive** - Works on all devices
- ✅ **Persistent Data** - Play history and playlists survive restarts

### Container Configuration
- **Base Image**: Node.js 18 with Python 3
- **Port**: 3000 (configurable)
- **Volumes**: Persistent data, playlists, configuration
- **Health Checks**: Automatic monitoring
- **Auto-restart**: Container restarts if it crashes

## 🔧 Configuration

### Environment Variables (.env)
```bash
PORT=3000
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

### Spotify Setup (Optional)
1. Create app at [developer.spotify.com](https://developer.spotify.com/dashboard)
2. Run: `node setup_spotify_auth.js`
3. Redeploy: `./deploy-local.sh`

### YouTube Music Setup (Optional)
1. Run: `python setup_auth.py` (requires Premium account)
2. Redeploy: `./deploy-local.sh`

## 📱 Access URLs

After deployment, access your jukebox at:

- **DJ Interface**: http://localhost:3000
- **User Interface**: http://localhost:3000/user  
- **QR Codes**: http://localhost:3000/qr
- **API Status**: http://localhost:3000/api/music-services/status

### Mobile Access
Find your computer's IP address and use:
- **Mobile URL**: http://YOUR_IP:3000

## 🔍 Troubleshooting

### Container Won't Start
```bash
./docker-manage.sh logs        # Check for errors
./docker-manage.sh health      # Run health check
./deploy-local.sh --rebuild    # Force rebuild
```

### Application Not Responding
```bash
./docker-manage.sh restart     # Restart container
./docker-manage.sh health      # Check health
curl http://localhost:3000     # Test manually
```

### Update to Latest Code
```bash
./docker-manage.sh update      # Rebuild and restart
```

### Reset Everything
```bash
./docker-manage.sh remove      # Remove container/image
./deploy-local.sh              # Fresh deployment
```

## 💾 Data Persistence

### What's Persistent
- ✅ **Play History** - All songs played during events
- ✅ **Playlists** - Wedding and bride playlists
- ✅ **Configuration** - Environment variables and auth tokens
- ✅ **User Data** - Queue state and user sessions

### Backup & Restore
```bash
# Create backup
./docker-manage.sh backup

# List backups
ls -la backups/

# Restore from backup
./docker-manage.sh restore
```

## 🎯 Production Deployment

### For Wedding Events
1. **Test Locally**: Deploy and test all features
2. **Configure Services**: Set up YouTube Music and/or Spotify
3. **Create Backups**: Backup your playlists
4. **Deploy on Event Day**: Use the same scripts on event computer
5. **Monitor**: Use `./docker-manage.sh logs -f` to monitor

### Performance Tips
- **Use SSD Storage** for better performance
- **Ensure Good WiFi** for music service APIs
- **Monitor Resources**: `docker stats wedding-jukebox`
- **Keep Backups**: Regular backups of playlists and history

## 🚨 Emergency Commands

### Quick Recovery
```bash
# If container is stuck
docker kill wedding-jukebox
./docker-manage.sh start

# If deployment is broken
./docker-manage.sh remove
./deploy-local.sh

# If you need immediate access
docker run -p 3000:3000 wedding-jukebox:latest
```

### Access Container Directly
```bash
# Open shell in running container
./docker-manage.sh shell

# Run commands in container
docker exec wedding-jukebox ls -la
docker exec wedding-jukebox npm --version
```

## 📊 Monitoring

### Real-time Monitoring
```bash
# Follow logs
./docker-manage.sh logs -f

# Monitor resources
docker stats wedding-jukebox

# Check health
./docker-manage.sh health
```

### Health Endpoints
- **Application**: http://localhost:3000/api/music-services/status
- **Queue Status**: http://localhost:3000/api/queue
- **Playlist Status**: http://localhost:3000/api/playlist/status

---

## 🎉 Ready for Your Wedding!

Your Virtual Jukebox is now containerized and ready for deployment anywhere Docker runs. The scripts handle all the complexity - just run `./deploy-local.sh` and you're ready to party! 🎵