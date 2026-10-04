# Skyhop Isles — 3D Co-op Platform Adventure

A browser-based 3D platformer with original characters and colorful floating islands. Built to publish as a static site on GitHub Pages.

## Features
- 3D worlds with perspective camera, shadows, moving clouds, trees, platforms, coins, bouncing enemies, and a finish arch
- Four original heroes with different movement stats and silhouettes
- Running, jumping, stomp attacks, hearts, checkpoints/respawn, and coin progress
- Keyboard and mobile touch controls
- Online two-player co-op using PeerJS/WebRTC
- No build step or backend server required for static hosting

## Play locally
Open `index.html` through a local static web server (recommended because JavaScript modules are used), for example with VS Code Live Server.

## Publish on GitHub Pages
1. Upload `index.html`, `game.js`, `style.css`, and `.nojekyll` to your repository root.
2. Open **Settings → Pages**.
3. Select **Deploy from a branch**, choose your main branch and `/ (root)`, then save.
4. Open the published page.

## Controls
- Move: WASD or arrow keys
- Jump: Space
- Mobile: hold the on-screen directional pad to move and tap/hold Jump to leap; controls support multi-touch and release safely if your thumb slides off
- Pick a hero on the start screen

## Multiplayer notes
Create a room and share the six-character room code. Your friend opens the same published page and joins with that code. The game uses PeerJS's public signaling service to negotiate a peer-to-peer connection; it does not need Firebase or a dedicated game server, but internet access is required for signaling and some restrictive networks may prevent direct connections. This is not offline LAN discovery.

## Notes
This is an original, lightweight 3D platformer inspired by the co-op platform genre, not a copy of Mario assets or levels. Requires a browser with WebGL support and internet access to load Three.js and PeerJS from their CDNs.
