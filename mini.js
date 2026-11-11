// Floating mini player for YouTube videos popped out of the browser.
// The page is served from a local http server so the YouTube embed gets a real origin
// and referrer (embeds refuse to play from file://).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { BrowserWindow, screen, ipcMain, shell } = require('electron');
const settings = require('./settings');

const ROOT = path.join(__dirname, 'mini');
const FILES = { '/index.html': 'text/html', '/mini.css': 'text/css', '/mini.js': 'text/javascript' };
const PAD = 10;          // transparent margin around the card (room for its shadow)
const MIN_W = 280;
const MAX_W = 960;
const SNAP_PX = 60;      // snap to a screen edge when dropped this close
const EDGE_GAP = 16;

let server = null;
let port = 0;
let win = null;
let current = null;      // { id, t, appId, title, onClose }
let lastTime = 0;
let hoverTimer = null;
let hovering = false;
let resize = null;
let snapping = false;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const videoHeight = (w) => Math.round((w * 9) / 16);

function startServer() {
  if (server) return Promise.resolve();
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const { pathname } = new URL(req.url, 'http://localhost');
      const type = FILES[pathname];
      if (req.method !== 'GET' || !type) {
        res.writeHead(404);
        return res.end();
      }
      fs.readFile(path.join(ROOT, pathname), (err, data) => {
        if (err) {
          res.writeHead(500);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });
}

function saveBounds() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  settings.save('mini.json', { x: b.x, y: b.y, w: b.width - 2 * PAD });
}

// Snap the card to nearby screen edges after the user drops the window.
function snap() {
  if (!win || snapping) return;
  const b = win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  let { x, y } = b;
  const card = { l: b.x + PAD, t: b.y + PAD, r: b.x + b.width - PAD, b: b.y + b.height - PAD };
  if (Math.abs(card.l - wa.x) < SNAP_PX) x = wa.x + EDGE_GAP - PAD;
  if (Math.abs(wa.x + wa.width - card.r) < SNAP_PX) x = wa.x + wa.width - b.width - EDGE_GAP + PAD;
  if (Math.abs(card.t - wa.y) < SNAP_PX) y = wa.y + EDGE_GAP - PAD;
  if (Math.abs(wa.y + wa.height - card.b) < SNAP_PX) y = wa.y + wa.height - b.height - EDGE_GAP + PAD;
  x = clamp(x, wa.x - PAD, wa.x + wa.width - b.width + PAD);
  y = clamp(y, wa.y - PAD, wa.y + wa.height - b.height + PAD);
  if (x !== b.x || y !== b.y) {
    snapping = true;
    win.setPosition(x, y);
    setTimeout(() => (snapping = false), 50);
  }
  saveBounds();
}

function pollHover() {
  if (!win || win.isDestroyed()) return;
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const now = p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
  if (now !== hovering) {
    hovering = now;
    win.webContents.send('mini-hover', now);
  }
}

function createWindow() {
  const saved = settings.load('mini.json', {});
  const wa = screen.getPrimaryDisplay().workArea;
  const vw = clamp(saved.w || 420, MIN_W, MAX_W);
  const width = vw + 2 * PAD;
  const height = videoHeight(vw) + 2 * PAD;
  const x = Number.isFinite(saved.x) ? saved.x : wa.x + wa.width - width - EDGE_GAP + PAD;
  const y = Number.isFinite(saved.y) ? saved.y : wa.y + wa.height - height - EDGE_GAP + PAD;

  win = new BrowserWindow({
    x, y, width, height,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    title: 'Mini Player',
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  // links in the embed (video title, logo) open in the default browser, not an app window
  const own = (url) => url.startsWith(`http://127.0.0.1:${port}/`);
  const external = (url) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => {
    external(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (own(url)) return;
    e.preventDefault();
    external(url);
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true);
  win.on('moved', snap);
  win.on('closed', () => {
    clearInterval(hoverTimer);
    win = null;
    hovering = false;
    finish(lastTime, true);
  });
  hoverTimer = setInterval(pollHover, 120);
  snap(); // keep a restored position on screen
}

// Hand the video back to the tab at the time the mini player reached.
function finish(time, resume) {
  const session = current;
  current = null;
  if (session) session.onClose(time, resume);
}

async function open(opts) {
  await startServer();
  if (current && current.id !== opts.id) finish(lastTime, false); // previous video stays paused at its spot
  current = opts;
  lastTime = opts.t;
  if (!win) createWindow();
  const q = new URLSearchParams({ v: opts.id, t: opts.t.toFixed(2), title: opts.title || '' });
  await win.loadURL(`http://127.0.0.1:${port}/index.html?${q}`);
  win.show();
}

function close(time, resume) {
  if (typeof time === 'number' && Number.isFinite(time)) lastTime = time;
  finish(lastTime, resume);
  if (win) win.close();
}

// ---- IPC from the mini page ----
ipcMain.on('mini-time', (_e, t) => {
  if (typeof t === 'number' && Number.isFinite(t)) lastTime = t;
});
ipcMain.on('mini-close', (_e, { time, resume }) => close(time, !!resume));

ipcMain.on('mini-resize-start', (_e, corner) => {
  if (!win) return;
  resize = { corner: corner === 'bl' ? 'bl' : 'br', start: screen.getCursorScreenPoint(), b: win.getBounds() };
  resize.timer = setInterval(() => {
    if (!win || !resize) return;
    const p = screen.getCursorScreenPoint();
    const { b } = resize;
    const dx = p.x - resize.start.x;
    const w0 = b.width - 2 * PAD;
    const vw = clamp(resize.corner === 'br' ? w0 + dx : w0 - dx, MIN_W, MAX_W);
    const width = vw + 2 * PAD;
    const height = videoHeight(vw) + 2 * PAD;
    // grow away from the screen edge the window sits against
    const wa = screen.getDisplayMatching(b).workArea;
    const x = resize.corner === 'br' ? b.x : b.x + b.width - width;
    const lowerHalf = b.y + b.height / 2 > wa.y + wa.height / 2;
    const y = lowerHalf ? b.y + b.height - height : b.y;
    win.setBounds({ x, y, width, height });
  }, 10);
});
ipcMain.on('mini-resize-end', () => {
  if (!resize) return;
  clearInterval(resize.timer);
  resize = null;
  snap();
});

module.exports = { open, close, isOpen: () => !!win };
