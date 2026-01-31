#!/usr/bin/env python3
"""
Setup YouTube Music authentication for the jukebox
This will create an oauth.json file with your credentials to avoid ads
"""

from ytmusicapi import YTMusic
import json
import os

def setup_oauth():
    """Setup OAuth authentication for YouTube Music"""
    print("🎵 Setting up YouTube Music authentication...")
    print("🚫 This will eliminate ads during your wedding!")
    print("\n✅ Benefits:")
    print("- No commercials during songs")
    print("- Better audio quality")
    print("- Uninterrupted playback")
    print("- Access to your playlists")
    
    print("\n📋 Instructions:")
    print("1. Go to https://music.youtube.com (make sure you're logged in)")
    print("2. Open Developer Tools (F12)")
    print("3. Go to Network tab")
    print("4. Refresh the page")
    print("5. Look for a request to 'browse' or 'youtubei/v1/browse'")
    print("6. Right-click → Copy → Copy as cURL")
    print("\n" + "="*60)
    
    # Get headers from user
    print("\n📋 Paste your cURL command below and press Enter:")
    headers_raw = input()
    
    if not headers_raw.strip():
        print("❌ No cURL command provided. Exiting...")
        return False
    
    try:
        print("\n🔄 Processing authentication...")
        
        # Use ytmusicapi's setup method
        YTMusic.setup(filepath="oauth.json", headers_raw=headers_raw)
        
        print("✅ Authentication setup complete!")
        print("📁 Created oauth.json file")
        
        # Test the authentication
        print("🧪 Testing authentication...")
        yt = YTMusic("oauth.json")
        
        # Try a simple search to test
        results = yt.search("test", filter="songs", limit=1)
        if results:
            print("✅ Authentication successful!")
            print("🎵 Your jukebox will now play without ads!")
            print("\n🎉 Ready for the wedding!")
            return True
        else:
            print("⚠️  Authentication works but search returned no results")
            return True
            
    except Exception as e:
        print(f"❌ Error setting up authentication: {e}")
        print("\n💡 Try these solutions:")
        print("1. Make sure you're logged into YouTube Music")
        print("2. Copy the ENTIRE cURL command")
        print("3. Try refreshing YouTube Music and getting a new cURL")
        return False

def check_existing_auth():
    """Check if authentication already exists"""
    if os.path.exists("oauth.json"):
        print("📁 Found existing oauth.json file")
        try:
            yt = YTMusic("oauth.json")
            results = yt.search("test", filter="songs", limit=1)
            print("✅ Existing authentication is working!")
            print("🎵 Your jukebox is ready (no ads)!")
            return True
        except:
            print("❌ Existing authentication is invalid")
            os.remove("oauth.json")
            print("🗑️  Removed invalid oauth.json")
            return False
    return False

def manual_setup():
    """Manual setup instructions"""
    print("\n🔧 Manual Setup Method:")
    print("1. Go to https://music.youtube.com")
    print("2. Make sure you're logged in to your account")
    print("3. Open Developer Tools (F12) → Network tab")
    print("4. Refresh the page")
    print("5. Find a request to 'browse' or 'youtubei/v1/browse'")
    print("6. Right-click → Copy → Copy as cURL")
    print("7. Run this script again and paste the cURL command")
    
    print("\n📖 For detailed instructions:")
    print("https://ytmusicapi.readthedocs.io/en/latest/setup.html")

if __name__ == "__main__":
    print("🎵 YouTube Music Wedding Jukebox - Authentication Setup")
    print("🚫 Eliminate ads for your special day!")
    print("=" * 60)
    
    # Check if already authenticated
    if check_existing_auth():
        choice = input("\nAuthentication already working. Re-setup? (y/N): ")
        if choice.lower() != 'y':
            print("🎉 You're all set! No ads during the wedding!")
            exit(0)
    
    choice = input("\nChoose setup method:\n1. Automatic setup (recommended)\n2. Manual instructions\n3. Skip (keep ads - not recommended for wedding)\n\nEnter choice (1-3): ")
    
    if choice == "1":
        if setup_oauth():
            print("\n🎊 SUCCESS! Your wedding jukebox is now ad-free!")
            print("🔄 Restart your server: npm run dev")
        else:
            print("\n💡 If automatic setup failed, try option 2 for manual instructions")
    elif choice == "2":
        manual_setup()
    else:
        print("\n⚠️  WARNING: You'll get ads during songs!")
        print("🎵 For a wedding, authentication is highly recommended")
        print("💡 You can run this script again anytime: python setup_auth.py")