# Nova Island - File Share & FTP Plugin (Architecture & Agent Guide)

This document explains the architecture, file locations, and integration points for the **WiFi Drop, Web File Manager & FTP Server** extension added to Nova Island. Any future AI Agent or developer can read this file to understand the system and add further plugins or updates seamlessly.

---

## 1. Overview
The extension adds two lightweight, standalone network servers directly into Nova Island:
1. **Web File Manager (HTTP):**
   - Pure Node.js HTTP server supporting `HTTP Range` headers (audio/video streaming without buffering the whole file).
   - Serves an interactive responsive web UI with drag-and-drop upload, file viewing (videos, music, pictures, PDFs, text), CRUD operations (mkdir, rename, delete, batch select, move), and instant ZIP downloads.
   - **Root Modes:**
     - `drives`: Full PC freedom, listing all logical Windows drives (`C:\`, `D:\`, `E:\`, etc.) and allowing unrestricted navigation.
     - `custom`: Restricts access to a specific folder chosen by the user.
   - Built-in pure JavaScript QR code generator (`share-qr.js`) for one-scan phone pairing.
2. **FTP Server (RFC 959):**
   - Pure Node.js TCP socket server supporting Passive (`PASV`) and Active modes.
   - Compatible with FileZilla, mobile FTP managers, and Windows Network Places.
   - Mirrors the same root mode (All drives or custom folder) and read/write security settings.

---

## 2. File Map & Directory Structure

```text
nova-island-1.8.6/
├── share-server.js           # Web File Manager backend (HTTP Server, CRUD APIs, streaming)
├── ftp-server.js             # Pure Node.js FTP server implementation (RFC 959)
├── share-manager.js          # Coordinator: starts/stops servers, manages local Wi-Fi IP & status
├── share-qr.js               # Pure JS QR Code matrix & SVG/Data-URL generator
├── share-zip.js              # In-memory pure JS ZIP builder for folder downloads
├── views/
│   └── share.js              # Island UI controller for the "Share" tab
├── site/
│   └── share/                # Web client served to connected devices
│       ├── index.html        # Web app HTML (responsive, mobile gestures, modal players)
│       ├── share.css         # Modern dark-mode styling with batch action bar & chips
│       └── share.js          # Web client logic (CRUD, streaming, search, batch delete)
├── Setup-Plugin.cmd          # One-click batch setup to install/patch after upstream updates
├── install-plugin.js         # Node.js patch script for automated file injection & hook patching
└── NOVA_SHARE_GUIDE.md       # This comprehensive documentation file
```

---

## 3. Core Hook Points in the Main Application

When upgrading Nova Island to a newer version from GitHub, the following hooks integrate the plugin:

### A. `features.js`
- Default keys added to `DEFAULTS`:
  - `tabShare: true`
  - `sharePortWeb: 5050`
  - `sharePortFtp: 2121`
  - `shareRootMode: 'drives'` (`'drives'` or `'custom'`)
  - `shareFolder: ''`
  - `shareReadOnly: false`
  - `shareAuth: false`
  - `shareUser: 'nova'`
  - `sharePass: ''`

### B. `nova.js` (Electron Main Process)
- Imports `share-manager.js`:
  ```javascript
  const shareManager = require('./share-manager');
  ```
- Registers IPC handlers:
  ```javascript
  ipcMain.handle('share-status', () => shareManager.getStatus());
  ipcMain.handle('share-web-start', async () => await shareManager.startWeb());
  ipcMain.handle('share-web-stop', async () => await shareManager.stopWeb());
  ipcMain.handle('share-ftp-start', async () => await shareManager.startFtp());
  ipcMain.handle('share-ftp-stop', async () => await shareManager.stopFtp());
  ipcMain.on('share-open-folder', () => { ... });
  ```

### C. `preload.js` (IPC Bridge)
- Exposes `window.nova.share`:
  ```javascript
  share: {
    status: () => ipcRenderer.invoke('share-status'),
    startWeb: () => ipcRenderer.invoke('share-web-start'),
    stopWeb: () => ipcRenderer.invoke('share-web-stop'),
    startFtp: () => ipcRenderer.invoke('share-ftp-start'),
    stopFtp: () => ipcRenderer.invoke('share-ftp-stop'),
    openFolder: () => ipcRenderer.send('share-open-folder'),
    onStatus: on('share-status'),
  }
  ```

### D. `index.html` & `style.css` (Island UI)
- Tab button in header navigation: `<button role="tab" data-tab="share" class="tab">`.
- Tab view container: `<section id="v-share" class="view" role="tabpanel">`.
- Script tag: `<script src="views/share.js"></script>`.

### E. `prefs/index.html` & `prefs/prefs.js` (Settings Window)
- Navigation item: `<a href="#share-page" data-page="share-page">File Share & FTP</a>`.
- Settings view allowing toggling root drives vs custom folder, changing ports, setting credentials, and toggling read-only mode.

---

## 4. How to Update Nova Island from Upstream GitHub
1. Pull or extract the new version from GitHub.
2. Run `Setup-Plugin.cmd` (or `node install-plugin.js`).
3. Run `npm run dist:portable` or `npm run dist` to produce new `.exe` installers.

