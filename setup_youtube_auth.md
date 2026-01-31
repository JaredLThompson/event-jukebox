# 🎵 Setup YouTube Music Authentication (No Ads!)

## Why You Need This
- **No commercials** during your wedding! 
- Uses your YouTube Music Premium account
- Better audio quality
- No interruptions during songs

## Quick Setup (5 minutes)

### Step 1: Get Your Browser Headers
1. **Open Chrome/Firefox** and go to https://music.youtube.com
2. **Make sure you're logged in** to your YouTube Music account
3. **Open Developer Tools** (F12 or right-click → Inspect)
4. **Go to Network tab**
5. **Refresh the page** (Ctrl+R or Cmd+R)
6. **Look for a request** that says "browse" or "youtubei/v1/browse"
7. **Right-click on it** → Copy → Copy as cURL

### Step 2: Create Authentication File
1. **Run the setup script:**
   ```bash
   source venv/bin/activate
   python setup_auth.py
   ```

2. **Choose option 1** (Automatic)
3. **Paste your cURL command** when prompted
4. **Wait for confirmation** ✅

### Step 3: Update the Server
The server will automatically use your authentication if the `oauth.json` file exists.

## Alternative: Manual Method

If the automatic method doesn't work:

1. **Create `oauth.json` manually:**
   ```json
   {
     "cookie": "your_cookie_here",
     "X-Goog-AuthUser": "0"
   }
   ```

2. **Get your cookie:**
   - In Developer Tools → Application tab
   - Look for Cookies → https://music.youtube.com
   - Copy the entire cookie string

## Test It Works
After setup, restart your server:
```bash
npm run dev
```

Search for a song - you should get **no ads** and **better quality**! 🎉

## Troubleshooting
- **"Authentication failed"** → Try the manual method
- **Still getting ads** → Make sure you have YouTube Music Premium
- **Can't find browse request** → Try refreshing the page a few times

## For Tomorrow's Wedding
Once set up, your jukebox will:
✅ **No commercials** during songs
✅ **High quality audio** 
✅ **Uninterrupted playback**
✅ **Perfect for the wedding!** 💒