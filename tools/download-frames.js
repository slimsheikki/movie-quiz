// STAGE 3 — download N evenly-spread frames per film to images/<slug>/N.jpg, record local paths.
// Concurrent: a pool of films download in parallel (static image assets; polite cap).
const fs = require('fs');
const path = require('path');
const C = require('./config');
const cache = require('./lib/cache');
const { parseArgs } = require('./lib/args');

const N = Math.min(C.frames.max, Math.max(C.frames.min, C.frames.count));
// film-grab tarpits CONCURRENT connections from a repeat IP (accepts, never responds), but serves
// strictly-serial requests fine. So default to 1 (fully serial) + a politeness delay between fetches.
const CONCURRENCY = +(process.env.FG_DOWNLOAD_CONCURRENCY || 1);
const IMG_DELAY_MS = +(process.env.FG_IMAGE_DELAY_MS || C.delays.filmgrabImageMs || 150);

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

const FETCH_TIMEOUT_MS = +(process.env.FG_FETCH_TIMEOUT_MS || 15000);

// FILM-GRAB's scraped frameUrls carry HTML entities (e.g. Child&#039;s_Play → apostrophe). Left
// encoded, the server answers 200 with an HTML error page (not an image), so the content-type
// check fails and the film silently gets 0 frames. Decode the common ones back to literal chars.
function decodeEntities(s) {
  return s
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&quot;|&#0*34;/gi, '"')
    .replace(/&#0*38;|&amp;/gi, '&')   // do &amp; last so we don't double-decode
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

async function fetchImage(url, dest, referer) {
  for (let a = 0; a <= C.retry.max; a++) {
    // Per-request timeout: a stalled connection would otherwise hang forever (no default fetch
    // timeout), never retrying. AbortController forces it to fail → retry. Also matters because
    // film-grab tarpits CONCURRENT connections — run serially (CONCURRENCY=1) to avoid that.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(encodeURI(decodeEntities(url)), { headers: { 'User-Agent': C.UA, Referer: referer }, signal: ctrl.signal });
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
    } finally {
      clearTimeout(timer);
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
    if (IMG_DELAY_MS) await new Promise((r) => setTimeout(r, IMG_DELAY_MS)); // politeness between fetches
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

  // --batch=N --batches=M: split the parked ("matched but no frames yet") films into M equal,
  // contiguous slices and process slice N (1-based). The batch plan is FROZEN to disk on first
  // use (batch-plan.json: { batches, slugs:[[…batch1…],…] }) from the parked set at that moment,
  // sorted by slug. Frozen so membership stays stable no matter the run order or partial
  // completion — after batch 1 downloads its films, they leave the live parked set, but the
  // plan still knows which slugs belong to batches 2–5. Delete the file to re-plan from scratch.
  if (opts.batch && opts.batches) {
    const planPath = path.join(C.paths.data, 'batch-plan.json');
    let plan = cache.readJSON(planPath, null);
    if (!plan || plan.batches !== opts.batches) {
      const parked = all
        .filter((m) => existingFrames(m.slug).length < C.frames.min)
        .map((m) => m.slug)
        .sort((a, b) => a.localeCompare(b));
      const M = opts.batches, size = Math.ceil(parked.length / M);
      plan = { batches: M, slugs: Array.from({ length: M }, (_, i) => parked.slice(i * size, (i + 1) * size)) };
      cache.writeJSON(planPath, plan);
      console.log(`Froze batch plan: ${parked.length} parked films across ${M} batches → ${planPath}`);
    }
    const n = Math.max(1, Math.min(opts.batches, opts.batch));
    const slugs = new Set(plan.slugs[n - 1] || []);
    work = all.filter((m) => slugs.has(m.slug));
    console.log(`Batch ${n}/${opts.batches}: ${work.length} films.`);
  }

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
  run({ slugs: a.slugs, limit: a.limit, resume: a.resume, batch: a.batch, batches: a.batches }).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { run };
