// Advanced Nova Share Web Server with:
// - All Windows Drives & Full Path Navigation (C:\, D:\, etc.)
// - Full CRUD & File Operations (Create, Rename, Delete, Move, Copy, ZIP)
// - Authentication & Read/Write permissions
// - Stream Media with HTTP Range (Audio, Video, PDF, Images)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FastZip = require('./share-zip');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

class ShareWebServer {
  constructor(options = {}) {
    this.port = options.port || 5050;
    this.rootMode = options.rootMode || 'drives'; // 'drives' or 'custom'
    this.customPath = options.customPath || path.join(os.homedir(), 'Downloads');
    this.readOnly = !!options.readOnly;
    this.requireAuth = !!options.requireAuth;
    this.username = options.username || 'nova';
    this.password = options.password || '';
    this.server = null;
    this.running = false;
  }

  static getDrives() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const drives = [];
    for (const l of letters) {
      try {
        if (fs.existsSync(l + ':\\')) {
          drives.push({ name: `${l}:`, path: `${l}:\\`, isDrive: true });
        }
      } catch (_) {}
    }
    return drives;
  }

  start() {
    return new Promise((resolve, reject) => {
      if (this.server) return resolve(this.port);

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err) => {
        this.running = false;
        reject(err);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        this.running = true;
        resolve(this.port);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.server) {
        this.running = false;
        return resolve();
      }
      this.server.close(() => {
        this.server = null;
        this.running = false;
        resolve();
      });
    });
  }

  resolveTarget(targetPath) {
    if (this.rootMode === 'custom') {
      const cleanRel = path.normalize(targetPath || '').replace(/^(\.\.[/\\])+/, '');
      const res = path.join(this.customPath, cleanRel);
      return res.startsWith(path.resolve(this.customPath)) ? res : this.customPath;
    }

    // Drives Mode: targetPath can be '' (Root Drives List) or a drive path like 'C:/Folder'
    if (!targetPath || targetPath === '/' || targetPath === '.') {
      return ''; // Root
    }

    // Normalize forward slashes and remove leading slash if any
    let clean = targetPath.replace(/\\/g, '/').replace(/^\/+/, '');
    // If it starts with 'C/' or 'C:'
    const m = clean.match(/^([a-zA-Z])(?::|\/|$)(.*)$/);
    if (m) {
      const drive = m[1].toUpperCase();
      const rest = (m[2] || '').replace(/^\/+/, '');
      return path.join(`${drive}:\\`, rest);
    }
    return path.normalize(clean);
  }

  handleRequest(req, res) {
    // Optional Authentication
    if (this.requireAuth && this.username) {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Nova Island Share"' });
        return res.end('Authentication required');
      }
      const [u, p] = Buffer.from(authHeader.split(' ')[1] || '', 'base64').toString().split(':');
      if (u !== this.username || (this.password && p !== this.password)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Forbidden');
      }
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      return res.end();
    }

    // Static Web UI
    if (pathname === '/' || pathname === '/index.html') {
      return this.serveStatic(res, path.join(__dirname, 'site', 'share', 'index.html'));
    }
    if (pathname === '/share.css') {
      return this.serveStatic(res, path.join(__dirname, 'site', 'share', 'share.css'));
    }
    if (pathname === '/share.js') {
      return this.serveStatic(res, path.join(__dirname, 'site', 'share', 'share.js'));
    }

    // API: Server Config & Root Info
    if (pathname === '/api/info' && req.method === 'GET') {
      return this.sendJson(res, 200, {
        rootMode: this.rootMode,
        readOnly: this.readOnly,
        customPath: this.customPath,
        system: os.platform(),
      });
    }

    // API: List Files / Drives
    if (pathname === '/api/files' && req.method === 'GET') {
      const dirParam = parsedUrl.searchParams.get('dir') || '';
      const resolved = this.resolveTarget(dirParam);

      // Root Drives List
      if (!resolved && this.rootMode === 'drives') {
        const drives = ShareWebServer.getDrives();
        return this.sendJson(res, 200, {
          isRoot: true,
          currentPath: '',
          readOnly: this.readOnly,
          files: drives.map((d) => ({
            name: d.name,
            isDir: true,
            isDrive: true,
            size: 0,
            mtime: Date.now(),
          })),
        });
      }

      if (!fs.existsSync(resolved)) {
        return this.sendJson(res, 404, { error: 'Path not found' });
      }

      try {
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        const files = entries.map((e) => {
          let stat = { size: 0, mtimeMs: 0 };
          try {
            stat = fs.statSync(path.join(resolved, e.name));
          } catch (_) {}
          return {
            name: e.name,
            isDir: e.isDirectory(),
            size: stat.size,
            mtime: stat.mtimeMs,
          };
        });

        return this.sendJson(res, 200, {
          isRoot: false,
          currentPath: dirParam,
          readOnly: this.readOnly,
          files,
        });
      } catch (err) {
        return this.sendJson(res, 500, { error: err.message });
      }
    }

    // API: Create new directory (mkdir)
    if (pathname === '/api/mkdir' && req.method === 'POST') {
      if (this.readOnly) return this.sendJson(res, 403, { error: 'Read only mode' });
      this.readJsonBody(req, (data) => {
        const target = this.resolveTarget(path.join(data.dir || '', data.name || ''));
        try {
          if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
          this.sendJson(res, 200, { success: true });
        } catch (err) {
          this.sendJson(res, 500, { error: err.message });
        }
      });
      return;
    }

    // API: Rename
    if (pathname === '/api/rename' && req.method === 'POST') {
      if (this.readOnly) return this.sendJson(res, 403, { error: 'Read only mode' });
      this.readJsonBody(req, (data) => {
        const oldFull = this.resolveTarget(data.oldPath || '');
        const parentDir = path.dirname(oldFull);
        const newFull = path.join(parentDir, path.basename(data.newName || ''));
        try {
          fs.renameSync(oldFull, newFull);
          this.sendJson(res, 200, { success: true });
        } catch (err) {
          this.sendJson(res, 500, { error: err.message });
        }
      });
      return;
    }

    // API: Delete (Single or Batch)
    if (pathname === '/api/delete' && req.method === 'POST') {
      if (this.readOnly) return this.sendJson(res, 403, { error: 'Read only mode' });
      this.readJsonBody(req, (data) => {
        const items = Array.isArray(data.paths) ? data.paths : [data.path];
        try {
          for (const p of items) {
            const target = this.resolveTarget(p || '');
            if (fs.existsSync(target)) {
              const stat = fs.statSync(target);
              if (stat.isDirectory()) {
                fs.rmSync(target, { recursive: true, force: true });
              } else {
                fs.unlinkSync(target);
              }
            }
          }
          this.sendJson(res, 200, { success: true });
        } catch (err) {
          this.sendJson(res, 500, { error: err.message });
        }
      });
      return;
    }

    // API: Move / Cut (Batch support)
    if (pathname === '/api/move' && req.method === 'POST') {
      if (this.readOnly) return this.sendJson(res, 403, { error: 'Read only mode' });
      this.readJsonBody(req, (data) => {
        const destDir = this.resolveTarget(data.destDir || '');
        const items = Array.isArray(data.paths) ? data.paths : [data.path];
        try {
          for (const p of items) {
            const src = this.resolveTarget(p);
            const dest = path.join(destDir, path.basename(src));
            fs.renameSync(src, dest);
          }
          this.sendJson(res, 200, { success: true });
        } catch (err) {
          this.sendJson(res, 500, { error: err.message });
        }
      });
      return;
    }

    // API: Upload (Multipart parser)
    if (pathname === '/api/upload' && req.method === 'POST') {
      if (this.readOnly) return this.sendJson(res, 403, { error: 'Read only mode' });
      this.handleUpload(req, res);
      return;
    }

    // API: Download Folder as ZIP
    if (pathname === '/api/zip' && req.method === 'GET') {
      const dirParam = parsedUrl.searchParams.get('dir') || '';
      const fullDir = this.resolveTarget(dirParam);
      const folderName = path.basename(fullDir) || 'NovaShare';

      try {
        const zip = new FastZip();
        zip.addFolderRecursive(fullDir);
        const zipBuf = zip.toBuffer();

        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(folderName)}.zip"`,
          'Content-Length': zipBuf.length
        });
        return res.end(zipBuf);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('ZIP error: ' + err.message);
      }
    }

    // Raw file streaming / download
    if (pathname.startsWith('/raw/')) {
      const relPath = decodeURIComponent(pathname.slice(5));
      const fullPath = this.resolveTarget(relPath);
      const isDownload = parsedUrl.searchParams.get('download') === '1';
      return this.streamFile(req, res, fullPath, isDownload);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  sendJson(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  }

  readJsonBody(req, cb) {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      try {
        cb(JSON.parse(body || '{}'));
      } catch {
        cb({});
      }
    });
  }

  serveStatic(res, filePath) {
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('File Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  }

  streamFile(req, res, filePath, isDownload) {
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('File Not Found');
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Cannot stream directory');
    }

    const total = stat.size;
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const filename = path.basename(filePath);

    // Range support
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

      if (start >= total || end >= total) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        return res.end();
      }

      const chunksize = end - start + 1;
      const headers = {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mime,
      };
      if (isDownload) {
        headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`;
      }

      res.writeHead(206, headers);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      const headers = {
        'Content-Length': total,
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
      };
      if (isDownload) {
        headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`;
      }
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  }

  handleUpload(req, res) {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) {
      return this.sendJson(res, 400, { error: 'No boundary in multipart upload' });
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      try {
        const parts = this.parseMultipart(buffer, boundary);
        let targetDir = '';
        let fileSaved = false;

        const dirPart = parts.find((p) => p.name === 'dir');
        if (dirPart) targetDir = dirPart.data.toString('utf8').trim();
        const uploadFolder = this.resolveTarget(targetDir);
        if (uploadFolder && !fs.existsSync(uploadFolder)) {
          fs.mkdirSync(uploadFolder, { recursive: true });
        }

        for (const part of parts) {
          if (part.filename && uploadFolder) {
            const dest = path.join(uploadFolder, path.basename(part.filename));
            fs.writeFileSync(dest, part.data);
            fileSaved = true;
          }
        }

        this.sendJson(res, 200, { success: true, saved: fileSaved });
      } catch (err) {
        this.sendJson(res, 500, { error: err.message });
      }
    });
  }

  parseMultipart(buffer, boundary) {
    const parts = [];
    const sep = Buffer.from('--' + boundary);
    let start = buffer.indexOf(sep);

    while (start !== -1) {
      start += sep.length;
      if (buffer[start] === 45 && buffer[start + 1] === 45) break;
      if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

      const nextSep = buffer.indexOf(sep, start);
      if (nextSep === -1) break;

      let partBuf = buffer.slice(start, nextSep);
      if (partBuf[partBuf.length - 2] === 13 && partBuf[partBuf.length - 1] === 10) {
        partBuf = partBuf.slice(0, partBuf.length - 2);
      }

      const headerEnd = partBuf.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const headersStr = partBuf.slice(0, headerEnd).toString('utf8');
        const data = partBuf.slice(headerEnd + 4);

        const nameMatch = headersStr.match(/name="([^"]+)"/);
        const filenameMatch = headersStr.match(/filename="([^"]+)"/);

        parts.push({
          name: nameMatch ? nameMatch[1] : null,
          filename: filenameMatch ? filenameMatch[1] : null,
          data: data,
        });
      }

      start = nextSep;
    }
    return parts;
  }
}

module.exports = ShareWebServer;
