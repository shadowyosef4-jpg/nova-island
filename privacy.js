// Microphone / camera in use, like the privacy dots on a Mac or iPhone. Windows records every
// app's access under CapabilityAccessManager\ConsentStore; an app is using the device right now
// when its LastUsedTimeStop is 0. Read with reg.exe.
const { execFile } = require('child_process');

const BASE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore';
const DEVICES = { mic: 'microphone', cam: 'webcam' };
const POLL_MS = 2000;

const NAMES = {
  chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', brave: 'Brave', opera: 'Opera', vivaldi: 'Vivaldi',
  teams: 'Teams', 'ms-teams': 'Teams', zoom: 'Zoom', discord: 'Discord', slack: 'Slack', skype: 'Skype',
  obs64: 'OBS', obs: 'OBS', telegram: 'Telegram', whatsapp: 'WhatsApp', windowscamera: 'Camera',
  windowssoundrecorder: 'Sound Recorder', soundrec: 'Sound Recorder', electron: 'Electron',
  screensketch: 'Snipping Tool', 'loom-recorder-production': 'Loom', rundll32: 'Windows',
  immersivecontrolpanel: 'Settings', 'adobe audition cc': 'Adobe Audition',
};

let send = () => {};
let enabled = true;
let timer = null;
let last = '';

// "C:#Program Files#Google#Chrome#Application#chrome.exe" or "Microsoft.WindowsCamera_8wekyb3d8bbwe"
function appName(key) {
  const leaf = key.split('\\').pop();
  const raw = leaf.includes('#')
    ? leaf.split('#').pop().replace(/\.exe$/i, '')
    : leaf.split('_')[0].split('.').pop();
  return NAMES[raw.toLowerCase()] || raw.charAt(0).toUpperCase() + raw.slice(1);
}

// Parses `reg query <key> /s /v LastUsedTimeStop` output into the apps using the device now.
function parse(out) {
  const apps = new Set();
  let key = '';
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('HKEY_')) key = line.trim();
    else if (/^\s+LastUsedTimeStop\s+REG_QWORD\s+0x0\s*$/.test(line) && key) apps.add(appName(key));
  }
  return [...apps];
}

function query(device) {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', `${BASE}\\${device}`, '/s', '/v', 'LastUsedTimeStop'], { windowsHide: true, timeout: 5000 },
      (_err, stdout) => resolve(parse(String(stdout || ''))));
  });
}

async function poll() {
  clearTimeout(timer);
  if (!enabled) return;
  const [mic, cam] = await Promise.all([query(DEVICES.mic), query(DEVICES.cam)]);
  const state = { mic, cam };
  const key = JSON.stringify(state);
  if (key !== last && enabled) {
    last = key;
    send('privacy', state);
  }
  timer = setTimeout(poll, POLL_MS);
}

function setEnabled(on) {
  if (on === enabled) return;
  enabled = on;
  last = '';
  if (on) poll();
  else {
    clearTimeout(timer);
    send('privacy', { mic: [], cam: [] });
  }
}

function start(sender, on = true) {
  send = sender;
  enabled = on;
  if (on) poll();
}

module.exports = { start, setEnabled, parse, appName };
