// STAGE 3 — download N evenly-spread frames per film to images/<slug>/N.jpg, record local paths.
// Concurrent: a pool of films download in parallel (static image assets; polite cap).
const fs = require('fs');
const path = require('path');
const C = require('./config');
const cache = require('./lib/cache');
const { parseArgs } = require('./lib/args');

const N = Math.min(C.frames.max, Math.max(C.frames.min, C.frames.count));
const CONCURRENCY = +(process.env.FG_DOWNLOAD_CONCURRENCY || 6);

function frameOrder(urls) {
  const M = urls.length;
  if (M <= N) return urls.slice();
  const picks = [], idx = new Set();
  for (let i = 0; i < N; i++) { const k = Math.round((i * (M - 1)) / (N - 1)); picks.push(urls[k]); idx.add(k); }
  return [...picks, ...urls.filter((_, k) => !idx.has(k))];
}

function existingFrames(slug) {
  const out = [];
  for (let i = 1; i <= C.frames.max; i++) {
    const p = path.join(C.paths.images, slug, i + '.jpg');
    if (fs.existsSync(p) && fs.statSync(p).size > 5000) out.push(`images/${slug}/${i}.jpg`);
  }
  return out;
}

async function fetchImage(url, dest, referer) {
  for (let a = 0; a <= C.retry.max; a++) {
    try {
      const r = await fetch(encodeURI(url), { headers: { 'User-Agent': C.UA, Referer: referer } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const ct = r.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) throw new Error('not-image (' + ct + ')');
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error('too-small');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      return buf.length;
    } catch (e) {
      if (a < C.retry.max) await new Promise((res) => setTimeout(res, 400 * 2 ** a + Math.random() * 200));
      else throw e;
    }
  }
}

async function downloadFilm(film) {
  const have = existingFrames(film.slug);
  if (have.length >= C.frames.min) return have;   // already playable — don't re-fetch for a marginal extra frame
  const order = frameOrder(film.frameUrls || []);
  const frames = [];
  let local = 1;
  for (const url of order) {
    if (frames.length >= N) break;
    try {
      await fetchImage(url, path.join(C.paths.images, film.slug, local + '.jpg'), film.url || C.FILMGRAB_BASE);
      frames.push(`images/${film.slug}/${local}.jpg`);
      local++;
    } catch { /* try next source frame */ }
  }
  return frames;
}

async function mapPool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
  }));
}

async function run(opts = {}) {
  fs.mkdirSync(C.paths.logs, { recursive: true });
  const all = cache.readJSON(C.paths.matched, []);
  const bySlug = new Map(all.map((m) => [m.slug, m]));
  let work = all;
  if (opts.slugs) work = all.filter((m) => opts.slugs.includes(m.slug));
  if (opts.limit) work = work.slice(0, opts.limit);

  const errors = cache.readJSON(path.join(C.paths.logs, 'errors.json'), []);
  console.log(`Downloading ${N} frames each for ${work.length} films (concurrency ${CONCURRENCY})…`);

  let done = 0, downloaded = 0;
  await mapPool(work, CONCURRENCY, async (film) => {
    const frames = await downloadFilm(film);
    bySlug.get(film.slug).frames = frames;
    done++;
    if (frames.length < C.frames.min) errors.push({ stage: 'frames', slug: film.slug, reason: `only ${frames.length} frames` });
    else downloaded++;
    if (done % 100 === 0) {
      cache.writeJSON(C.paths.matched, [...bySlug.values()]);
      console.log(`  [${done}/${work.length}] ok=${downloaded}`);
    }
  });

  cache.writeJSON(C.paths.matched, [...bySlug.values()]);
  cache.writeJSON(path.join(C.paths.logs, 'errors.json'), errors);
  const ok = [...bySlug.values()].filter((m) => (m.frames || []).length >= C.frames.min).length;
  console.log(`Stage 3 done. ${ok}/${bySlug.size} films have ≥${C.frames.min} frames on disk.`);
  return [...bySlug.values()];
}

if (require.main === module) {
  const a = parseArgs();
  run({ slugs: a.slugs, limit: a.limit, resume: a.resume }).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { run };
