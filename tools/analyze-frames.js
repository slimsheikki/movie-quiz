// PHASE 3 (local) — run every frame through the native Vision binary and cache results.
// Zero deps. Resumable: skips frames already in tools/data/vision.json.
//
//   swiftc -O vision.swift -o vision-bin     # once (analyze-frames.js will do this if missing)
//   node analyze-frames.js                   # analyze all frames referenced by the live manifest
//
// Output cache: tools/data/vision.json  →  { "<relpath>": {text:[...], faces, persons} }
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const C = require('./config');

const BIN = path.join(__dirname, 'vision-bin');
const SRC = path.join(__dirname, 'vision.swift');
const CACHE = path.join(C.paths.data, 'vision.json');

function ensureBinary() {
  const stale = !fs.existsSync(BIN) ||
    fs.statSync(SRC).mtimeMs > fs.statSync(BIN).mtimeMs;
  if (stale) {
    console.log('Compiling vision.swift → vision-bin …');
    execFileSync('swiftc', ['-O', SRC, '-o', BIN], { stdio: 'inherit' });
  }
}

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; }
}

function frameList() {
  const MOVIES = require(C.paths.manifest);
  const set = new Set();
  for (const m of MOVIES) for (const f of (m.frames || [])) set.add(f);
  return [...set];
}

async function run() {
  ensureBinary();
  const cache = loadCache();
  const all = frameList();
  const todo = all.filter((rel) => !cache[rel]);
  console.log(`${all.length} frames · ${all.length - todo.length} cached · ${todo.length} to analyze`);
  if (!todo.length) { console.log('Nothing to do.'); return cache; }

  // Map manifest-relative paths (e.g. "images/foo/1.jpg") to absolute for the binary,
  // remembering the reverse so we key the cache by the manifest path.
  const absToRel = new Map();
  const absPaths = todo.map((rel) => {
    const abs = path.join(C.paths.root, rel);
    absToRel.set(abs, rel);
    return abs;
  });

  await new Promise((resolve, reject) => {
    const child = spawn(BIN, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    let buf = '', done = 0;
    const t0 = Date.now();
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        let obj; try { obj = JSON.parse(line); } catch { continue; }
        const rel = absToRel.get(obj.path) || obj.path;
        if (obj.error) { cache[rel] = { error: obj.error }; }
        else cache[rel] = { text: obj.text || [], faces: obj.faces || 0, persons: obj.persons || 0 };
        done++;
        if (done % 200 === 0 || done === todo.length) {
          fs.writeFileSync(CACHE, JSON.stringify(cache));
          const rate = done / ((Date.now() - t0) / 1000);
          console.log(`  ${done}/${todo.length}  (${rate.toFixed(1)}/s)`);
        }
      }
    });
    child.on('close', (code) => {
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      code === 0 ? resolve() : reject(new Error('vision-bin exited ' + code));
    });
    child.on('error', reject);
    for (const abs of absPaths) child.stdin.write(abs + '\n');
    child.stdin.end();
  });

  const errs = Object.values(cache).filter((v) => v.error).length;
  console.log(`Done → ${path.relative(C.paths.root, CACHE)}  (${errs} load/vision errors)`);
  return cache;
}

if (require.main === module) run().catch((e) => { console.error(e); process.exit(1); });
module.exports = { run, CACHE };
