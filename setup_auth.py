#!/usr/bin/env python3
"""
Setup YouTube Music authentication for the jukebox
This will create an oauth.json file with your credentials to avoid ads
"""

from ytmusicapi import YTMusic, setup as ytm_setup
import json
import os
import re
import sys

def _read_paste_block():
    """Read a pasted block from stdin (Ctrl-D to finish)."""
    print("\n📋 Paste your cURL command OR raw request headers below, then press Ctrl-D:")
    try:
        data = sys.stdin.read()
    except KeyboardInterrupt:
        return ""
    if data:
        return data.strip()
    # Fallback to single-line input
    try:
        return input().strip()
    except EOFError:
        return ""

def _extract_headers_from_curl(curl_text):
    """Extract header lines from a curl command."""
    headers = []
    for line in curl_text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("-H ") or line.startswith("--header "):
            # Remove leading -H/--header and surrounding quotes
            line = re.sub(r"^(-H|--header)\s+", "", line)
            line = line.strip()
            if (line.startswith("'") and line.endswith("'")) or (line.startswith('"') and line.endswith('"')):
                line = line[1:-1]
            # Strip trailing backslash if present
            if line.endswith("\\"):
                line = line[:-1].rstrip()
            headers.append(line)
    return "\n".join(headers).strip()

def _normalize_headers_input(raw_input):
    """Accept either curl or raw headers and return header block."""
    if "curl " in raw_input or raw_input.strip().startswith("curl "):
        headers = _extract_headers_from_curl(raw_input)
        return headers
    return raw_input.strip()

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
    print("6. Copy either:")
    print("   - Copy as cURL (recommended), OR")
    print("   - Copy request headers (raw headers)")
    print("\n" + "="*60)
    
    # Get headers from user
    headers_raw = _read_paste_block()
    
    if not headers_raw.strip():
        print("❌ No cURL command provided. Exiting...")
        return False
    
    try:
        print("\n🔄 Processing authentication...")
        
        headers = _normalize_headers_input(headers_raw)
        if "cookie:" not in headers.lower() or "x-goog-authuser:" not in headers.lower():
            print("❌ Missing required headers. Make sure your paste includes:")
            print("   - cookie:")
            print("   - x-goog-authuser:")
            return False

        # Use ytmusicapi's setup method (module-level)
        ytm_setup("oauth.json", headers)
        
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
