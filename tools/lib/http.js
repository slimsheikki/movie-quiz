// fetch wrapper: per-host throttle, retry with exponential backoff, text/json/binary helpers.
const fs = require('fs');
const path = require('path');
const C = require('../config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const last = {};

function hostOf(u) { try { return new URL(u).host; } catch { return 'x'; } }

async function throttle(host, delayMs) {
  if (!delayMs) return;
  const wait = (last[host] || 0) + delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  last[host] = Date.now();
}

async function req(url, { headers = {}, delayMs = 0, method = 'GET' } = {}) {
  const host = hostOf(url);
  let err;
  for (let attempt = 0; attempt <= C.retry.max; attempt++) {
    await throttle(host, delayMs);
    try {
      const res = await fetch(url, { method, headers: { 'User-Agent': C.UA, ...headers } });
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      return res;
    } catch (e) {
      err = e;
      if (attempt < C.retry.max) await sleep(C.retry.baseMs * 2 ** attempt + Math.random() * 300);
    }
  }
  throw err;
}

async function getText(url, opts) {
  const r = await req(url, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.text();
}

async function getJSON(url, opts) {
  const r = await req(url, opts);
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('HTTP ' + r.status + ' ' + url + ' ' + t.slice(0, 140));
  }
  return r.json();
}

async function download(url, dest, opts) {
  const r = await req(url, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const ct = r.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) throw new Error('not-image (' + ct + ')');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000) throw new Error('too-small (' + buf.length + 'B)');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

module.exports = { getText, getJSON, download, sleep };
