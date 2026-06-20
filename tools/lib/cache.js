// Tiny atomic JSON read/write helpers (tmp + rename so an interrupted run never corrupts state).
const fs = require('fs');
const path = require('path');

function readJSON(p, def = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; }
}

function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

function exists(p) { return fs.existsSync(p); }

module.exports = { readJSON, writeJSON, exists };
