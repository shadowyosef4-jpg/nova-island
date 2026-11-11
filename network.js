// Network companion: is there a link (Wi-Fi / cable), and does it actually reach the internet.
// The link comes from the adapters' names only: reading the Wi-Fi network name (netsh) counts as
// a location request on Windows 11, so it is never read. The internet check is Windows' own
// connectivity probe, tried only every 15 s (every 5 s while offline, to notice the return fast).
const os = require('os');

const PROBE = 'http://www.msftconnecttest.com/connecttest.txt';
const LINK_MS = 5000;
const WIFI_NAME = /wi-?fi|wlan|wireless/i;

let send = () => {};
let enabled = true;
let timer = null;
let state = { link: 'none', internet: null, since: Date.now() };
let lastProbe = 0;
const backListeners = []; // called when the internet comes back
const onBack = (fn) => backListeners.push(fn);

// 'wifi' / 'ethernet' / 'none': any adapter with a real IPv4 address is up (Wi-Fi wins)
function linkKind() {
  let kind = 'none';
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    const up = (addrs || []).some((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'));
    if (!up) continue;
    if (WIFI_NAME.test(name)) return 'wifi';
    kind = 'ethernet';
  }
  return kind;
}

async function probe() {
  try {
    const r = await fetch(PROBE, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    return r.ok && (await r.text()).startsWith('Microsoft Connect Test');
  } catch {
    return false;
  }
}

async function poll() {
  clearTimeout(timer);
  if (!enabled) return;
  const link = linkKind();
  let internet = state.internet;
  const offline = internet === false || link === 'none';
  if (link === 'none') internet = false;
  else if (Date.now() - lastProbe > (offline ? 5000 : 15000) || link !== state.link) {
    lastProbe = Date.now();
    internet = await probe();
  }
  const changed = link !== state.link || internet !== state.internet;
  const prev = state;
  state = { link, internet, since: changed ? Date.now() : state.since };
  if (changed) send('network', { ...state, prev });
  if (changed && prev.internet === false && internet) backListeners.forEach((fn) => fn());
  timer = setTimeout(poll, LINK_MS);
}

function setEnabled(on) {
  if (on === enabled) return;
  enabled = on;
  if (on) poll();
  else clearTimeout(timer);
}

function start(sender, on = true) {
  send = sender;
  enabled = on;
  if (on) poll();
}

module.exports = { start, setEnabled, onBack, snapshot: () => state };
