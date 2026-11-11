// Pure Node.js FTP Server with Full Multi-Drive navigation, CRUD & Authentication
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

class FtpServer {
  constructor(options = {}) {
    this.port = options.port || 2121;
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
          drives.push(l);
        }
      } catch (_) {}
    }
    return drives;
  }

  start() {
    return new Promise((resolve, reject) => {
      if (this.server) return resolve(this.port);

      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
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

  resolveVirtual(virtPath) {
    // In 'custom' mode, paths are relative to this.customPath
    if (this.rootMode === 'custom') {
      const clean = path.normalize(virtPath || '/').replace(/^(\.\.[/\\])+/, '');
      return path.join(this.customPath, clean);
    }

    // In 'drives' mode:
    // '/' -> Virtual Root listing all drives (C, D, E...)
    // '/C' or '/C/' or '/C/Folder' -> Real Windows path 'C:\' or 'C:\Folder'
    let norm = (virtPath || '/').replace(/\\/g, '/');
    if (!norm.startsWith('/')) norm = '/' + norm;
    if (norm === '/') return '/'; // root

    const parts = norm.split('/').filter(Boolean);
    const driveLetter = parts[0].toUpperCase().replace(/:$/, '');
    const rest = parts.slice(1).join('/');
    return path.join(`${driveLetter}:\\`, rest);
  }

  toVirtual(realOrVirtPath) {
    if (this.rootMode === 'custom') {
      let rel = path.relative(this.customPath, realOrVirtPath).replace(/\\/g, '/');
      return rel ? '/' + rel : '/';
    }

    if (realOrVirtPath === '/') return '/';
    const driveMatch = realOrVirtPath.match(/^([a-zA-Z]):\\?(.*)$/);
    if (driveMatch) {
      const drive = driveMatch[1].toUpperCase();
      const rest = driveMatch[2].replace(/\\/g, '/').replace(/^\/+/, '');
      return rest ? `/${drive}/${rest}` : `/${drive}`;
    }
    return '/';
  }

  handleConnection(cmdSocket) {
    let currentVirt = '/';
    let authUser = null;
    let isAuthenticated = !this.requireAuth;
    let dataServer = null;
    let dataSocket = null;
    let renameFrom = null;

    const send = (code, msg) => {
      if (cmdSocket.writable) {
        cmdSocket.write(`${code} ${msg}\r\n`);
      }
    };

    send(220, 'Nova Island Advanced FTP Server Ready');

    let buffer = '';
    cmdSocket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let lineEnd;
      while ((lineEnd = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, lineEnd).trim();
        buffer = buffer.slice(lineEnd + 2);
        if (line) handleCommand(line);
      }
    });

    cmdSocket.on('close', () => {
      if (dataServer) dataServer.close();
      if (dataSocket) dataSocket.destroy();
    });

    const getDataSocket = () => {
      return new Promise((resolve) => {
        if (dataSocket) {
          const s = dataSocket;
          dataSocket = null;
          return resolve(s);
        }
        if (dataServer) {
          dataServer.once('connection', (s) => resolve(s));
        } else {
          resolve(null);
        }
      });
    };

    const handleCommand = async (line) => {
      const spaceIdx = line.indexOf(' ');
      const cmd = (spaceIdx === -1 ? line : line.slice(0, spaceIdx)).toUpperCase();
      const arg = spaceIdx === -1 ? '' : line.slice(spaceIdx + 1).trim();

      // Auth check
      if (this.requireAuth && !isAuthenticated && !['USER', 'PASS', 'QUIT'].includes(cmd)) {
        return send(530, 'Please login with USER and PASS');
      }

      switch (cmd) {
        case 'USER':
          authUser = arg;
          if (!this.requireAuth) {
            isAuthenticated = true;
            send(230, 'User logged in (no auth required)');
          } else {
            send(331, 'Password required for ' + authUser);
          }
          break;

        case 'PASS':
          if (!this.requireAuth || (authUser === this.username && arg === this.password)) {
            isAuthenticated = true;
            send(230, 'User logged in, access granted');
          } else {
            send(530, 'Authentication failed');
          }
          break;

        case 'SYST':
          send(215, 'UNIX Type: L8');
          break;

        case 'FEAT':
          cmdSocket.write('211-Features:\r\n UTF8\r\n SIZE\r\n211 End\r\n');
          break;

        case 'OPTS':
          if (arg.toUpperCase() === 'UTF8 ON') send(200, 'UTF8 set to on');
          else send(501, 'Option not supported');
          break;

        case 'PWD':
          send(257, `"${currentVirt}" is the current directory`);
          break;

        case 'TYPE':
          send(200, 'Type set to ' + arg);
          break;

        case 'PASV': {
          if (dataServer) dataServer.close();
          dataServer = net.createServer((sock) => {
            dataSocket = sock;
          });

          dataServer.listen(0, () => {
            const port = dataServer.address().port;
            const ip = cmdSocket.localAddress.replace(/::ffff:/, '');
            const ipParts = (ip === '127.0.0.1' || ip === '::1' ? '127.0.0.1' : ip).split('.');
            const p1 = Math.floor(port / 256);
            const p2 = port % 256;
            send(227, `Entering Passive Mode (${ipParts.join(',')},${p1},${p2})`);
          });
          break;
        }

        case 'CWD': {
          let nextVirt;
          if (arg.startsWith('/')) {
            nextVirt = path.posix.normalize(arg);
          } else {
            nextVirt = path.posix.normalize(path.posix.join(currentVirt, arg));
          }

          if (this.rootMode === 'drives' && nextVirt === '/') {
            currentVirt = '/';
            return send(250, 'Directory successfully changed to root');
          }

          const realTarget = this.resolveVirtual(nextVirt);
          if (fs.existsSync(realTarget) && fs.statSync(realTarget).isDirectory()) {
            currentVirt = nextVirt;
            send(250, 'Directory successfully changed');
          } else {
            send(550, 'Failed to change directory');
          }
          break;
        }

        case 'CDUP': {
          let nextVirt = path.posix.dirname(currentVirt);
          if (this.rootMode === 'drives' && currentVirt !== '/' && nextVirt === '.') nextVirt = '/';
          currentVirt = nextVirt;
          send(250, 'Directory successfully changed');
          break;
        }

        case 'LIST':
        case 'NLST': {
          send(150, 'Here comes the directory listing');
          const sock = await getDataSocket();
          if (!sock) {
            send(425, 'Cannot open data connection');
            break;
          }

          try {
            let out = '';
            // Drives root
            if (this.rootMode === 'drives' && currentVirt === '/') {
              const drives = FtpServer.getDrives();
              for (const d of drives) {
                if (cmd === 'NLST') {
                  out += `${d}\r\n`;
                } else {
                  out += `drwxr-xr-x 1 owner group 0 Jan 01 00:00 ${d}\r\n`;
                }
              }
            } else {
              const realDir = this.resolveVirtual(currentVirt);
              const files = fs.readdirSync(realDir, { withFileTypes: true });
              for (const f of files) {
                const full = path.join(realDir, f.name);
                let size = 0;
                let mtime = new Date();
                try {
                  const st = fs.statSync(full);
                  size = st.size;
                  mtime = st.mtime;
                } catch (_) {}

                if (cmd === 'NLST') {
                  out += `${f.name}\r\n`;
                } else {
                  const isDir = f.isDirectory();
                  const perms = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
                  const dateStr = mtime.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) + ' ' +
                                  mtime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                  out += `${perms} 1 owner group ${size} ${dateStr} ${f.name}\r\n`;
                }
              }
            }

            sock.write(out, 'utf8', () => {
              sock.end();
              send(226, 'Directory send OK');
              if (dataServer) dataServer.close();
            });
          } catch (err) {
            sock.destroy();
            send(550, 'List failed: ' + err.message);
          }
          break;
        }

        case 'SIZE': {
          const file = this.resolveVirtual(arg.startsWith('/') ? arg : path.posix.join(currentVirt, arg));
          if (fs.existsSync(file)) {
            send(213, fs.statSync(file).size.toString());
          } else {
            send(550, 'File not found');
          }
          break;
        }

        case 'RETR': {
          const file = this.resolveVirtual(arg.startsWith('/') ? arg : path.posix.join(currentVirt, arg));
          if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            send(550, 'File not found or is directory');
            break;
          }
          send(150, 'Opening binary mode data connection');
          const sock = await getDataSocket();
          if (!sock) {
            send(425, 'Cannot open data connection');
            break;
          }

          const stream = fs.createReadStream(file);
          stream.pipe(sock);
          stream.on('end', () => {
            send(226, 'Transfer complete');
            if (dataServer) dataServer.close();
          });
          stream.on('error', (err) => {
            send(550, 'Transfer failed: ' + err.message);
          });
          break;
        }

        case 'STOR': {
          if (this.readOnly) {
            send(550, 'Permission denied: server is read-only');
            break;
          }
          const file = this.resolveVirtual(arg.startsWith('/') ? arg : path.posix.join(currentVirt, arg));
          send(150, 'Ok to send data');
          const sock = await getDataSocket();
          if (!sock) {
            send(425, 'Cannot open data connection');
            break;
          }

          const stream = fs.createWriteStream(file);
          sock.pipe(stream);
          stream.on('finish', () => {
            send(226, 'Transfer complete');
            if (dataServer) dataServer.close();
          });
          stream.on('error', (err) => {
            send(550, 'Transfer failed: ' + err.message);
          });
          break;
        }

        case 'DELE': {
          if (this.readOnly) return send(550, 'Read-only mode');
          const file = this.resolveVirtual(arg.startsWith('/') ? arg : path.posix.join(currentVirt, arg));
          try {
            if (fs.existsSync(file)) fs.unlinkSync(file);
            send(250, 'File deleted');
          } catch (err) {
            send(550, 'Delete failed: ' + err.message);
          }
          break;
        }

        case 'RMD': {
          if (this.readOnly) return send(550, 'Read-only mode');
          const dir = this.resolveVirtual(arg.startsWith('/') ? arg : path.posix.join(currentVirt, arg));
          try {
            if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
            send(250, 'Directory removed');
          } catch (err) {
            send(550, 'Remove failed: ' + err.message);
          }
          break;
        }

        case 'MKD': {
          if (this.readOnly) return send(550, 'Read-only mode');
          const dir = this.resolveVirtual(arg.startsWith('/') ? arg : path.posix.join(currentVirt, arg));
          try {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            send(257, `"${arg}" directory created`);
          } catch (err) {
            send(550, 'Create directory failed: ' + err.message);
          }
          break;
        }

        case 'RNFR':
          if (this.readOnly) return send(550, 'Read-only mode');
          renameFrom = this.resolveVirtual(arg.startsWith('/') ? arg : path.posix.join(currentVirt, arg));
          send(350, 'Ready for RNTO');
          break;

        case 'RNTO':
          if (this.readOnly) return send(550, 'Read-only mode');
          if (!renameFrom) return send(503, 'Bad sequence of commands');
          const renameTo = this.resolveVirtual(arg.startsWith('/') ? arg : path.posix.join(currentVirt, arg));
          try {
            fs.renameSync(renameFrom, renameTo);
            renameFrom = null;
            send(250, 'Rename successful');
          } catch (err) {
            send(550, 'Rename failed: ' + err.message);
          }
          break;

        case 'QUIT':
          send(221, 'Goodbye');
          cmdSocket.end();
          break;

        default:
          send(502, 'Command not implemented');
          break;
      }
    };
  }
}

module.exports = FtpServer;
