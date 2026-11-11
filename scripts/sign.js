// Signs what the Nova team publishes, with AmerTech's private key (keys/, never on GitHub):
//   node scripts/sign.js news                          every item in news.json
//   node scripts/sign.js plugin <manifest.json> <dir>  a plugin -> <dir>/<id>-<version>.nvp
//   node scripts/sign.js catalog <plugins.json> <nvp…>  the plugin list, with each file's size,
//                                                       checksum and release link (also copied
//                                                       to plugins-catalog.json, inside the app)
// The app checks every signature with the public key in signing.js.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { canonical, verify } = require('../signing');

const root = path.join(__dirname, '..');
const keyFile = path.join(root, 'keys', 'nova-signing-private.pem');
if (!fs.existsSync(keyFile)) {
  console.error(`No private key at ${keyFile}`);
  process.exit(1);
}
const key = crypto.createPrivateKey(fs.readFileSync(keyFile));
const sign = (obj) => {
  const sig = crypto.sign(null, Buffer.from(canonical(obj)), key).toString('base64');
  if (!verify(obj, sig)) throw new Error('the private key does not match the public key in signing.js');
  return sig;
};
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, v) => fs.writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'news') {
  const file = path.join(root, 'news.json');
  const items = readJson(file).map(({ sig, ...item }) => ({ ...item, sig: sign(item) }));
  writeJson(file, items);
  console.log(`news.json: ${items.length} item(s) signed`);
} else if (cmd === 'plugin') {
  const [manifestFile, outDir] = args;
  const manifest = readJson(manifestFile);
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${manifest.id}-${manifest.version}.nvp`);
  fs.writeFileSync(out, JSON.stringify({ manifest, sig: sign(manifest) }));
  console.log(`${out}: ${fs.statSync(out).size} bytes`);
} else if (cmd === 'catalog') {
  const [catalogFile, ...nvps] = args;
  const cat = readJson(catalogFile);
  for (const f of nvps) {
    const buf = fs.readFileSync(f);
    const { manifest } = JSON.parse(buf.toString('utf8'));
    const entry = cat.plugins.find((p) => p.id === manifest.id);
    if (!entry) throw new Error(`${manifest.id} is not in ${catalogFile}`);
    const tag = `${manifest.id}-${manifest.version}`;
    Object.assign(entry, {
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      size: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      url: `https://github.com/NOVA-TECH-KIT/nova-island-plugins/releases/download/${tag}/${tag}.nvp`,
    });
  }
  cat.sig = sign({ plugins: cat.plugins });
  writeJson(catalogFile, cat);
  // the copy that ships inside the app, so Settings > Plugins lists them even offline
  writeJson(path.join(root, 'plugins-catalog.json'), cat);
  console.log(`${catalogFile}: ${cat.plugins.length} plugin(s) signed (and plugins-catalog.json)`);
} else {
  console.error('usage: node scripts/sign.js news | plugin <manifest.json> <dir> | catalog <plugins.json> <nvp…>');
  process.exit(1);
}
