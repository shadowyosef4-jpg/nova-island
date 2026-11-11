/**
 * Nova Island Plugin / Mod Patch Script
 * Automatically applies or updates custom modules into any clean or updated Nova Island workspace.
 * Run with: node install-plugin.js [optional_target_directory]
 */

const fs = require('fs');
const path = require('path');

const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
console.log(`[Nova Plugin Setup] Patching target: ${targetDir}`);

// 1. Files to copy directly into target root
const ROOT_FILES = [
  'share-server.js',
  'ftp-server.js',
  'share-manager.js',
  'share-qr.js',
  'share-zip.js'
];

ROOT_FILES.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(targetDir, file);
  if (src !== dest && fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✔ Copied ${file}`);
  }
});

// 2. Views files
const viewSrc = path.join(__dirname, 'views', 'share.js');
const viewDest = path.join(targetDir, 'views', 'share.js');
if (viewSrc !== viewDest && fs.existsSync(viewSrc)) {
  fs.mkdirSync(path.dirname(viewDest), { recursive: true });
  fs.copyFileSync(viewSrc, viewDest);
  console.log(`✔ Copied views/share.js`);
}

// 3. Web Client files (site/share)
const siteSrc = path.join(__dirname, 'site', 'share');
const siteDest = path.join(targetDir, 'site', 'share');
if (siteSrc !== siteDest && fs.existsSync(siteSrc)) {
  fs.mkdirSync(siteDest, { recursive: true });
  for (const f of fs.readdirSync(siteSrc)) {
    fs.copyFileSync(path.join(siteSrc, f), path.join(siteDest, f));
  }
  console.log(`✔ Copied site/share web client assets`);
}

// 4. Helper for patching strings cleanly in existing files
function patchFile(relPath, searchStr, replaceStr, label) {
  const filePath = path.join(targetDir, relPath);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠ Missing file: ${relPath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(replaceStr.trim())) {
    console.log(`- ${relPath} already contains [${label}]`);
    return;
  }
  if (!content.includes(searchStr)) {
    console.warn(`⚠ Cannot find hook for [${label}] in ${relPath}`);
    return;
  }
  content = content.replace(searchStr, replaceStr);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✔ Patched [${label}] into ${relPath}`);
}

// Patch preload.js
patchFile(
  'preload.js',
  "  system: {",
  `  share: {
    status: () => ipcRenderer.invoke('share-status'),
    startWeb: () => ipcRenderer.invoke('share-web-start'),
    stopWeb: () => ipcRenderer.invoke('share-web-stop'),
    startFtp: () => ipcRenderer.invoke('share-ftp-start'),
    stopFtp: () => ipcRenderer.invoke('share-ftp-stop'),
    openFolder: () => ipcRenderer.send('share-open-folder'),
    onStatus: on('share-status'),
  },

  system: {`,
  'preload share bridge'
);

// Patch nova.js
patchFile(
  'nova.js',
  "const plugins = require('./plugins');",
  "const plugins = require('./plugins');\nconst shareManager = require('./share-manager');",
  'nova.js require'
);

patchFile(
  'nova.js',
  "// only meeting links the calendar itself produced (Meet / Teams / Zoom / Webex, https)",
  `// Share / WiFi Drop & FTP handlers
ipcMain.handle('share-status', () => shareManager.getStatus());
ipcMain.handle('share-web-start', async () => await shareManager.startWeb());
ipcMain.handle('share-web-stop', async () => await shareManager.stopWeb());
ipcMain.handle('share-ftp-start', async () => await shareManager.startFtp());
ipcMain.handle('share-ftp-stop', async () => await shareManager.stopFtp());
ipcMain.on('share-open-folder', () => {
  const folder = shareManager.getShareFolder();
  if (fs.existsSync(folder)) shell.openPath(folder);
});
shareManager.onChange((status) => {
  send('share-status', status);
  prefsWindow.send('share-status', status);
});

// only meeting links the calendar itself produced (Meet / Teams / Zoom / Webex, https)`,
  'nova.js ipc handlers'
);

console.log(`\n🎉 [Nova Plugin Setup] Patch completed successfully!`);

