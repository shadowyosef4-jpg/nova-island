// Error log: console.error / console.warn of the main process (the island forwards its own
// errors there too) plus crashes, appended to nova.log in the data folder. Kept under ~1 MB.
// Nothing private goes in: no clipboard text, no calendar link, no file contents.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const MAX_BYTES = 1024 * 1024;
let file = null;

function write(level, args) {
  if (!file) return;
  const line = `${new Date().toISOString()} ${level} ${args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.old`);
    fs.appendFileSync(file, line);
  } catch {}
}

function init() {
  file = path.join(app.getPath('userData'), 'nova.log');
  for (const level of ['error', 'warn']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      write(level.toUpperCase(), args);
    };
  }
  process.on('uncaughtException', (err) => write('CRASH', [err]));
  process.on('unhandledRejection', (err) => write('REJECT', [err]));
  write('INFO', [`start ${app.getVersion()} electron ${process.versions.electron} ${os.type()} ${os.release()}`]);
}

const logPath = () => file;
const info = (...args) => write('INFO', args);

// Short report to paste in a message: versions, state, and the last lines of the log.
function report(extra = {}) {
  let tail = '';
  try {
    tail = fs.readFileSync(file, 'utf8').split('\n').slice(-60).join('\n');
  } catch {}
  return [
    `Nova Island ${app.getVersion()} (${app.isPackaged ? 'installed' : 'dev'})`,
    `Electron ${process.versions.electron} · Chrome ${process.versions.chrome}`,
    `Windows ${os.release()} · ${os.arch()} · ${Math.round(os.totalmem() / 1e9)} GB`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`),
    '',
    '--- last log lines ---',
    tail,
  ].join('\n');
}

module.exports = { init, logPath, report, info };
