// Lightweight pure-JS ZIP archive builder (Store mode / Deflate compatible)
// Used to download folders on-the-fly without native external modules.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 Table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

class FastZip {
  constructor() {
    this.files = [];
  }

  addFile(relativePath, buffer) {
    const cleanPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const crc = crc32(buffer);
    this.files.push({
      path: cleanPath,
      data: buffer,
      crc: crc,
      size: buffer.length
    });
  }

  addFolderRecursive(rootPath, currentRel = '') {
    const dir = path.join(rootPath, currentRel);
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const ent of entries) {
      const entRel = currentRel ? path.join(currentRel, ent.name) : ent.name;
      const full = path.join(rootPath, entRel);
      if (ent.isDirectory()) {
        this.addFolderRecursive(rootPath, entRel);
      } else if (ent.isFile()) {
        try {
          const buf = fs.readFileSync(full);
          this.addFile(entRel, buf);
        } catch (e) {
          // Skip unreadable files
        }
      }
    }
  }

  toBuffer() {
    const localHeaders = [];
    const cdHeaders = [];
    let offset = 0;

    for (const f of this.files) {
      const nameBuf = Buffer.from(f.path, 'utf8');

      // Local file header (30 bytes + name length)
      const lh = Buffer.alloc(30 + nameBuf.length);
      lh.writeUInt32LE(0x04034b50, 0); // signature
      lh.writeUInt16LE(20, 4);         // version needed (2.0)
      lh.writeUInt16LE(0x0800, 6);     // flags (UTF-8 enabled)
      lh.writeUInt16LE(0, 8);          // compression (0 = store)
      lh.writeUInt16LE(0, 10);         // time
      lh.writeUInt16LE(0, 12);         // date
      lh.writeUInt32LE(f.crc, 14);     // crc32
      lh.writeUInt32LE(f.size, 18);    // compressed size
      lh.writeUInt32LE(f.size, 22);    // uncompressed size
      lh.writeUInt16LE(nameBuf.length, 26);
      lh.writeUInt16LE(0, 28);         // extra field len
      nameBuf.copy(lh, 30);

      localHeaders.push(lh, f.data);

      // Central directory header (46 bytes + name length)
      const cd = Buffer.alloc(46 + nameBuf.length);
      cd.writeUInt32LE(0x02014b50, 0); // signature
      cd.writeUInt16LE(20, 4);         // version made by
      cd.writeUInt16LE(20, 6);         // version needed
      cd.writeUInt16LE(0x0800, 8);     // flags (UTF-8)
      cd.writeUInt16LE(0, 10);         // compression
      cd.writeUInt16LE(0, 12);         // time
      cd.writeUInt16LE(0, 14);         // date
      cd.writeUInt32LE(f.crc, 16);     // crc32
      cd.writeUInt32LE(f.size, 20);    // compressed size
      cd.writeUInt32LE(f.size, 24);    // uncompressed size
      cd.writeUInt16LE(nameBuf.length, 28);
      cd.writeUInt16LE(0, 30);         // extra len
      cd.writeUInt16LE(0, 32);         // comment len
      cd.writeUInt16LE(0, 34);         // disk start
      cd.writeUInt16LE(0, 36);         // internal attrs
      cd.writeUInt32LE(0, 38);         // external attrs
      cd.writeUInt32LE(offset, 42);    // relative offset of local header
      nameBuf.copy(cd, 46);

      cdHeaders.push(cd);
      offset += lh.length + f.data.length;
    }

    const cdStart = offset;
    const cdSize = cdHeaders.reduce((sum, h) => sum + h.length, 0);

    // End of central directory record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);              // number of this disk
    eocd.writeUInt16LE(0, 6);              // disk where cd starts
    eocd.writeUInt16LE(this.files.length, 8);  // total entries this disk
    eocd.writeUInt16LE(this.files.length, 10); // total entries
    eocd.writeUInt32LE(cdSize, 12);        // size of central directory
    eocd.writeUInt32LE(cdStart, 16);       // offset of start of cd
    eocd.writeUInt16LE(0, 20);             // zip comment length

    return Buffer.concat([...localHeaders, ...cdHeaders, eocd]);
  }
}

module.exports = FastZip;

