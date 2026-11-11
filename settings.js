// Small JSON store in the app's userData folder.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function file(name) {
  return path.join(app.getPath('userData'), name);
}

function load(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function save(name, data) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(file(name), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[settings]', err.message);
  }
}

module.exports = { load, save };
