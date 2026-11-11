// Nova Share Manager with Drives / Custom root mode and full security options
const os = require('os');
const path = require('path');
const ShareWebServer = require('./share-server');
const FtpServer = require('./ftp-server');
const QRCode = require('./share-qr');
const features = require('./features');

let webInstance = null;
let ftpInstance = null;
let changeListeners = [];

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  const WIFI_NAME = /wi-?fi|wlan|wireless/i;

  let chosenIp = '127.0.0.1';
  let bestScore = 0;

  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) {
        const score = WIFI_NAME.test(name) ? 2 : 1;
        if (score > bestScore) {
          bestScore = score;
          chosenIp = a.address;
        }
      }
    }
  }
  return chosenIp;
}

function getShareFolder() {
  const f = features.get();
  return f.shareFolder || path.join(os.homedir(), 'Downloads');
}

function getStatus() {
  const ip = getLocalIp();
  const f = features.get();
  const webPort = f.sharePortWeb || 5050;
  const ftpPort = f.sharePortFtp || 2121;
  const webUrl = `http://${ip}:${webPort}`;
  const ftpUrl = `ftp://${ip}:${ftpPort}`;

  let qrDataUrl = '';
  if (webInstance && webInstance.running) {
    qrDataUrl = QRCode.generateDataUrl(webUrl);
  }

  return {
    webRunning: !!(webInstance && webInstance.running),
    ftpRunning: !!(ftpInstance && ftpInstance.running),
    ip,
    webPort,
    ftpPort,
    webUrl,
    ftpUrl,
    qrDataUrl,
    rootMode: f.shareRootMode || 'drives', // 'drives' or 'custom'
    shareFolder: getShareFolder(),
    readOnly: !!f.shareReadOnly,
    requireAuth: !!f.shareAuth,
    username: f.shareUser || 'nova',
    password: f.sharePass || '',
  };
}

function notify() {
  const s = getStatus();
  changeListeners.forEach((fn) => {
    try { fn(s); } catch (_) {}
  });
}

async function startWeb() {
  if (webInstance && webInstance.running) return getStatus();
  const f = features.get();
  webInstance = new ShareWebServer({
    port: f.sharePortWeb || 5050,
    rootMode: f.shareRootMode || 'drives',
    customPath: getShareFolder(),
    readOnly: !!f.shareReadOnly,
    requireAuth: !!f.shareAuth,
    username: f.shareUser || 'nova',
    password: f.sharePass || '',
  });
  await webInstance.start();
  notify();
  return getStatus();
}

async function stopWeb() {
  if (!webInstance) return getStatus();
  await webInstance.stop();
  webInstance = null;
  notify();
  return getStatus();
}

async function startFtp() {
  if (ftpInstance && ftpInstance.running) return getStatus();
  const f = features.get();
  ftpInstance = new FtpServer({
    port: f.sharePortFtp || 2121,
    rootMode: f.shareRootMode || 'drives',
    customPath: getShareFolder(),
    readOnly: !!f.shareReadOnly,
    requireAuth: !!f.shareAuth,
    username: f.shareUser || 'nova',
    password: f.sharePass || '',
  });
  await ftpInstance.start();
  notify();
  return getStatus();
}

async function stopFtp() {
  if (!ftpInstance) return getStatus();
  await ftpInstance.stop();
  ftpInstance = null;
  notify();
  return getStatus();
}

function onChange(fn) {
  changeListeners.push(fn);
}

module.exports = {
  getStatus,
  startWeb,
  stopWeb,
  startFtp,
  stopFtp,
  onChange,
  getLocalIp,
  getShareFolder,
};
