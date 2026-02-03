# Playlists Folder

You can put custom playlist files here and reference them from `event-config.json`.

## Supported formats
- `.js` exporting an array
- `.json` containing an array

## Example (JS)
```js
module.exports = [
  { search: 'Daft Punk One More Time', type: 'dance' },
  { search: 'Whitney Houston I Wanna Dance With Somebody', type: 'dance' }
];
```

## Example (JSON)
```json
[
  { "search": "Daft Punk One More Time", "type": "dance" },
  { "search": "Whitney Houston I Wanna Dance With Somebody", "type": "dance" }
]
```

## Config
Update `event-config.json`:
```json
{
  "playlists": {
    "primary": { "file": "playlists/dojo-playlist.js" },
    "secondary": { "file": "playlists/recovery-playlist.json" }
  }
}
```

Files are resolved relative to the project root. The loader will also check `playlists/` automatically.
