# Spotify Integration Setup Guide

This guide will help you set up Spotify integration for your Virtual Jukebox application.

## Prerequisites

- Node.js and npm installed
- A Spotify account (free or premium)
- Access to the Spotify Developer Dashboard

## Step 1: Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **"Create App"**
4. Fill in the app details:
   - **App name**: "Wedding DJ Virtual Jukebox"
   - **App description**: "Virtual jukebox for wedding music with Spotify integration"
   - **Website**: `http://localhost:3000` (or your domain)
   - **Redirect URI**: `http://localhost:3000/auth/spotify/callback`
5. Check the boxes for the terms of service
6. Click **"Save"**

## Step 2: Get Your Credentials

1. In your new app's dashboard, click **"Settings"**
2. Copy your **Client ID**
3. Click **"View client secret"** and copy your **Client Secret**

## Step 3: Configure Your Application

### Option A: Automatic Setup (Recommended)

Run the setup script:

```bash
node setup_spotify_auth.js
```

Follow the prompts to enter your Client ID and Client Secret.

### Option B: Manual Setup

1. Create or edit your `.env` file in the project root
2. Add your Spotify credentials:

```env
# Spotify API Credentials
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

## Step 4: Install Dependencies

```bash
npm install
```

## Step 5: Start Your Server

```bash
npm start
```

## Step 6: Test Spotify Integration

1. Open your jukebox in a web browser
2. Click on the **"Search Music"** tab
3. You should see both **"YouTube Music"** and **"Spotify"** tabs
4. Click on the **"Spotify"** tab
5. Search for a song to test the integration

## Features

### What Works
- **Search**: Find songs on Spotify
- **Preview**: Play 30-second previews of tracks (when available)
- **Queue**: Add Spotify songs to your queue
- **Metadata**: View song details, album art, and popularity

### What Doesn't Work (Spotify Limitations)
- **Full Playback**: Spotify doesn't allow full song playback through web APIs
- **Premium Required**: Some features may require Spotify Premium
- **Device Control**: Cannot control Spotify playback on user devices

## Troubleshooting

### "Spotify service not available"
- Check that your credentials are correctly set in the `.env` file
- Restart your server after adding credentials
- Verify your Client ID and Client Secret are correct

### "Spotify not configured"
- Run `node setup_spotify_auth.js` to configure credentials
- Make sure the `.env` file exists and contains the Spotify credentials

### Search not working
- Check your internet connection
- Verify your Spotify app is active in the Developer Dashboard
- Check the server console for error messages

## Usage Notes

- Spotify integration works alongside YouTube Music - users can search both services
- Spotify songs show with a green theme and Spotify logo
- Preview functionality is available for most tracks
- Songs are queued normally but playback depends on the source
- For full Spotify playback, users should open songs in their Spotify app

## API Limits

- Spotify has rate limits on API calls
- The app uses Client Credentials flow (no user login required)
- Search and metadata requests are generally unlimited for reasonable usage

## Support

If you encounter issues:
1. Check the server console for error messages
2. Verify your Spotify app settings in the Developer Dashboard
3. Ensure your `.env` file has the correct credentials
4. Restart the server after making changes

## Next Steps

Consider implementing:
- Spotify Connect integration for premium users
- Playlist import from Spotify
- Advanced search filters
- Recommendation engine based on queue history