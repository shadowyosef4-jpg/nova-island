// Live downloads from IDM Nova through its local bridge (127.0.0.1:17890).
// Polls fast while something is moving, slowly while IDM Nova is idle or closed.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { shell } = require('electron');
const folderDownloads = require('./browser-downloads');

const BASE = 'http://127.0.0.1:17890';
// IDM Nova only answers callers that know the secret it keeps in the user's profile.
const TOKEN_FILE = path.join(process.env.APPDATA || '', 'app.idmnova.desktop', 'bridge.token');
let token = null;
function novaHeaders(extra = {}) {
  if (token === null) {
    try {
      token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    } catch {
      token = '';
    }
  }
  return token ? { ...extra, 'x-nova-token': token } : extra;
}
// a reinstall may have created a new secret: read it again next time
const forgetToken = () => {
  token = null;
};
const FAST_MS = 700;
const IDLE_MS = 2500;
const OFFLINE_MS = 6000;
const MAX_THUMB = 400 * 1024;

let send = () => {};
let items = [];
let online = false;
let outdated = false;
let enabled = true;
let timer = null;
const MAX_THUMBS = 30;
const thumbs = new Map(); // url -> data: URL ('' while loading or failed)

const EXE_CANDIDATES = [
  path.join(process.env.LOCALAPPDATA || '', 'IDM Nova', 'idm-nova.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'IDM Nova', 'idm-nova.exe'),
];
const exePath = () => EXE_CANDIDATES.find((p) => p && fs.existsSync(p)) || null;

// The island's CSP only allows data: images, so remote thumbnails are inlined here.
async function loadThumb(url) {
  if (thumbs.has(url) || !/^https?:\/\//.test(url)) return;
  thumbs.set(url, '');
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const type = (r.headers.get('content-type') || '').match(/^image\/[\w.+-]+/)?.[0];
    const buf = Buffer.from(await r.arrayBuffer());
    if (r.ok && type && buf.length <= MAX_THUMB) {
      const data = `data:${type};base64,${buf.toString('base64')}`;
      thumbs.set(url, data);
      // sent once; progress updates only carry the (short) remote URL
      send('dl-thumb', { url, data });
    }
  } catch {}
}

// IDM Nova's downloads, then the ones seen in download folders (a file IDM Nova is fetching
// may also show up there: it is listed once)
function allItems() {
  const names = new Set(items.map((d) => d.name));
  return [...items, ...folderDownloads.items().filter((d) => !names.has(d.name))];
}
const payload = () => ({ online, outdated, canLaunch: !online && !!exePath(), items: allItems() });

// forget thumbnails of downloads that left the list, and never keep more than MAX_THUMBS
function pruneThumbs() {
  const live = new Set(items.map((d) => d.thumbnail).filter(Boolean));
  for (const url of thumbs.keys()) if (!live.has(url)) thumbs.delete(url);
  while (thumbs.size > MAX_THUMBS) thumbs.delete(thumbs.keys().next().value);
}

// for a freshly loaded island: the list plus every thumbnail already fetched
const snapshot = () => ({
  ...payload(),
  thumbs: Object.fromEntries([...thumbs].filter(([, data]) => data)),
});
let last = '';
function publish() {
  const p = payload();
  const json = JSON.stringify(p);
  if (json === last) return;
  last = json;
  send('downloads', p);
}

async function poll() {
  clearTimeout(timer);
  if (!enabled) return;
  let next = OFFLINE_MS;
  try {
    const r = await fetch(`${BASE}/activity`, { headers: novaHeaders(), signal: AbortSignal.timeout(2000) });
    if (r.status === 403) forgetToken();
    // an IDM Nova build from before /activity answers 404: running, but can't report
    outdated = r.status === 404;
    const j = outdated ? {} : await r.json();
    items = Array.isArray(j.items) ? j.items : [];
    online = true;
    pruneThumbs();
    items.forEach((d) => d.thumbnail && loadThumb(d.thumbnail));
    const moving = items.some((d) => ['downloading', 'processing', 'queued'].includes(d.status));
    next = moving ? FAST_MS : IDLE_MS;
  } catch {
    online = false;
    outdated = false;
    items = [];
  }
  if (!enabled) return; // switched off while the request was in flight
  publish();
  timer = setTimeout(poll, next);
}

async function control(id, action) {
  const d = allItems().find((x) => x.id === id);
  if (action === 'open' || action === 'reveal') {
    // only paths IDM Nova or the folder watch itself reported
    if (!d?.path) return;
    if (action === 'open') shell.openPath(d.path);
    else shell.showItemInFolder(d.path);
    return;
  }
  if (action === 'launch') {
    const exe = exePath();
    if (exe) spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (!['pause', 'resume', 'show'].includes(action) || d?.source === 'folder') return;
  try {
    await fetch(`${BASE}/control`, {
      method: 'POST',
      headers: novaHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ id: id || null, action }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {}
  poll();
}

// Turned off in Settings: stop asking IDM Nova and clear the island.
function setEnabled(on) {
  if (on === enabled) return;
  enabled = on;
  online = outdated = false;
  items = [];
  publish();
  poll();
}

function start(sender, on = true, folders = true) {
  send = sender;
  enabled = on;
  folderDownloads.start(publish, folders);
  poll();
}

module.exports = { start, control, setEnabled, setFolders: folderDownloads.setEnabled, snapshot, novaHeaders, forgetToken };
