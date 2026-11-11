// Downloads by browsers and other download managers, seen from the folders they save to: a
// partial file (.crdownload, .part, ...) that grows is a download, and its disappearance with a
// finished file left behind is the end. Only the folders themselves are watched (not their
// subfolders) and no browser file is ever read, so nothing here looks like snooping to security
// software. Folders: Windows' Downloads folder (wherever the user moved it) plus the ones added
// in Settings.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const settings = require('./settings');

const PARTIAL = /\.(crdownload|part|partial|download|opdownload|!ut|!qb)$/i;
const TICK_MS = 1000;
const SHOW_AFTER_MS = 1500; // a download that ends sooner never shows as "downloading"
const STALLED_MS = 10 * 60 * 1000; // no growth for this long: shown as paused
const KEEP_DONE_MS = 60 * 60 * 1000;
const MAX_DONE = 10;

let enabled = true;
let onChange = () => {};
let extra = load();
const watchers = new Map(); // folder -> fs.FSWatcher
const live = new Map(); // partial file path -> download
const ignored = new Set(); // partial files that were already there at start
let done = []; // finished downloads, newest first
let timer = null;
let scanQueued = false;

function load() {
  const list = settings.load('download-folders.json', []);
  return Array.isArray(list) ? list.filter((p) => typeof p === 'string' && path.isAbsolute(p)) : [];
}

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
function folders() {
  const out = [];
  for (const f of [app.getPath('downloads'), ...extra]) if (!out.some((x) => same(x, f))) out.push(f);
  return out;
}

const list = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
};
const statOf = (p) => {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
};

// "Movie.mp4.crdownload" -> "Movie.mp4"
const finalPath = (partial) => partial.replace(PARTIAL, '');

function finish(partial, d) {
  live.delete(partial);
  const dir = path.dirname(partial);
  let file = finalPath(partial);
  let st = statOf(file);
  // Chrome's "Unconfirmed 123.crdownload" gets its real name only at the end: the newest file
  // that appeared in the folder in the last few seconds
  if (!st || !st.size) {
    const fresh = list(dir)
      .filter((p) => !PARTIAL.test(p))
      .map((p) => [p, statOf(p)])
      .filter(([, s]) => s && s.size > 0 && Date.now() - s.mtimeMs < 5000)
      .sort((a, b) => b[1].mtimeMs - a[1].mtimeMs)[0];
    if (/^unconfirmed \d+/i.test(path.basename(partial)) && fresh) [file, st] = fresh;
  }
  if (!st || !st.size) return; // cancelled
  done = [{ ...d, id: `f:${file}`, name: path.basename(file), path: file, status: 'completed', downloaded: st.size, total: st.size, speed: 0, eta: null, finishedAt: Date.now() }, ...done.filter((x) => x.path !== file)].slice(0, MAX_DONE);
}

function scan() {
  scanQueued = false;
  const now = Date.now();
  const seen = new Set();
  for (const dir of folders()) {
    for (const p of list(dir)) {
      if (!PARTIAL.test(p) || ignored.has(p)) continue;
      seen.add(p);
      const st = statOf(p);
      if (!st) continue;
      let d = live.get(p);
      if (!d) {
        d = { id: `f:${p}`, name: path.basename(finalPath(p)), source: 'folder', createdAt: now, firstSeen: now, size: st.size, at: now, grewAt: now, speed: 0 };
        live.set(p, d);
      }
      const dt = (now - d.at) / 1000;
      if (dt >= 0.5) {
        const rate = Math.max(0, (st.size - d.size) / dt);
        d.speed = d.speed ? d.speed * 0.6 + rate * 0.4 : rate;
        if (st.size > d.size) d.grewAt = now;
        d.size = st.size;
        d.at = now;
      }
    }
  }
  for (const [p, d] of live) if (!seen.has(p)) finish(p, d);
  done = done.filter((d) => now - d.finishedAt < KEEP_DONE_MS);
  onChange();
  clearTimeout(timer);
  if (live.size) timer = setTimeout(scan, TICK_MS);
}

function queueScan() {
  if (scanQueued || !enabled) return;
  scanQueued = true;
  setTimeout(scan, 200);
}

// the downloads in the same shape as IDM Nova's
function items() {
  if (!enabled) return [];
  const now = Date.now();
  const moving = [...live.values()]
    .filter((d) => now - d.firstSeen >= SHOW_AFTER_MS)
    .map((d) => ({
      id: d.id, name: d.name, source: 'folder', createdAt: d.createdAt, downloaded: d.size, total: 0, eta: null,
      status: now - d.grewAt > STALLED_MS ? 'paused' : 'downloading', speed: now - d.grewAt > 3000 ? 0 : d.speed,
    }));
  return [...moving, ...done.map(({ finishedAt, ...d }) => d)];
}

function watch() {
  for (const w of watchers.values()) w.close();
  watchers.clear();
  if (!enabled) return;
  for (const dir of folders()) {
    // partial files already there are old (a browser closed mid-download), not news
    for (const p of list(dir)) if (PARTIAL.test(p)) ignored.add(p);
    try {
      const w = fs.watch(dir, { persistent: false }, queueScan);
      w.on('error', () => {});
      watchers.set(dir, w);
    } catch {}
  }
}

function start(changed, on = true) {
  onChange = changed;
  enabled = on;
  watch();
}

function setEnabled(on) {
  if (on === enabled) return;
  enabled = on;
  live.clear();
  done = [];
  watch();
  onChange();
}

// ---- folders, for Settings ----
const folderList = () => folders().map((p, i) => ({ path: p, fixed: i === 0 }));
function addFolder(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || !statOf(p)?.isDirectory()) return folderList();
  if (!folders().some((x) => same(x, p))) {
    extra = [...extra, p];
    settings.save('download-folders.json', extra);
    watch();
  }
  return folderList();
}
function removeFolder(p) {
  extra = extra.filter((x) => !same(x, p));
  settings.save('download-folders.json', extra);
  for (const k of live.keys()) if (same(path.dirname(k), p)) live.delete(k);
  watch();
  onChange();
  return folderList();
}

module.exports = { start, setEnabled, items, folderList, addFolder, removeFolder };
