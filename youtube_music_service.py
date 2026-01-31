#!/usr/bin/env python3
"""
YouTube Music API Service
Provides a bridge between the Node.js jukebox and YouTube Music
"""

import json
import sys
from ytmusicapi import YTMusic
import argparse
from typing import Dict, List, Any

class YouTubeMusicService:
    def __init__(self, auth_file: str = None):
        """Initialize YouTube Music service"""
        try:
            if auth_file:
                self.yt = YTMusic(auth_file)
            else:
                # Use without authentication for search only
                self.yt = YTMusic()
        except Exception as e:
            print(f"Error initializing YouTube Music: {e}", file=sys.stderr)
            self.yt = None

    def search_songs(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Search for songs on YouTube Music"""
        if not self.yt:
            return []
        
        try:
            results = self.yt.search(query, filter="songs", limit=limit)
            
            songs = []
            for result in results:
                song = {
                    'videoId': result.get('videoId', ''),
                    'title': result.get('title', 'Unknown Title'),
                    'artist': ', '.join([artist['name'] for artist in result.get('artists', [])]) or 'Unknown Artist',
                    'album': result.get('album', {}).get('name', 'Unknown Album') if result.get('album') else 'Unknown Album',
                    'duration': result.get('duration_seconds', 0),
                    'duration_text': result.get('duration', '0:00'),
                    'thumbnail': result.get('thumbnails', [{}])[-1].get('url', '') if result.get('thumbnails') else '',
                    'year': result.get('year', ''),
                    'isExplicit': result.get('isExplicit', False)
                }
                songs.append(song)
            
            return songs
        except Exception as e:
            print(f"Error searching songs: {e}", file=sys.stderr)
            return []

    def get_song_info(self, video_id: str) -> Dict[str, Any]:
        """Get detailed information about a specific song"""
        if not self.yt:
            return {}
        
        try:
            # Get song details
            song = self.yt.get_song(video_id)
            
            return {
                'videoId': video_id,
                'title': song.get('videoDetails', {}).get('title', 'Unknown Title'),
                'artist': song.get('videoDetails', {}).get('author', 'Unknown Artist'),
                'duration': song.get('videoDetails', {}).get('lengthSeconds', '0'),
                'thumbnail': song.get('videoDetails', {}).get('thumbnail', {}).get('thumbnails', [{}])[-1].get('url', ''),
                'description': song.get('videoDetails', {}).get('shortDescription', ''),
                'viewCount': song.get('videoDetails', {}).get('viewCount', '0')
            }
        except Exception as e:
            print(f"Error getting song info: {e}", file=sys.stderr)
            return {}

def main():
    parser = argparse.ArgumentParser(description='YouTube Music API Service')
    parser.add_argument('action', choices=['search', 'get_song'], help='Action to perform')
    parser.add_argument('--query', help='Search query')
    parser.add_argument('--video-id', help='Video ID for song info')
    parser.add_argument('--limit', type=int, default=10, help='Number of results to return')
    parser.add_argument('--auth', help='Path to authentication file')
    
    args = parser.parse_args()
    
    service = YouTubeMusicService(args.auth)
    
    if args.action == 'search':
        if not args.query:
            print(json.dumps({'error': 'Query is required for search'}))
            sys.exit(1)
        
        results = service.search_songs(args.query, args.limit)
        print(json.dumps({'results': results}))
    
    elif args.action == 'get_song':
        if not args.video_id:
            print(json.dumps({'error': 'Video ID is required'}))
            sys.exit(1)
        
        song_info = service.get_song_info(args.video_id)
        print(json.dumps({'song': song_info}))

if __name__ == '__main__':
    main()