// PHASE A — fetch each film's FILM-GRAB "featured" image (the large hero still at the top of
// its page = og:image / wp-post-image) and save it as images/<slug>/0.jpg, the primary frame.
// URLs come from the already-cached HTML pages (offline); only the image bytes hit the network.
//
//   node fetch-featured.js          # download missing featured images (resumable)
//   node fetch-featured.js --dry    # just extract/report URLs, download nothing
//
// Politeness: low concurrency + retries (film-grab.com throttles). Writes data/featured.json.
const fs = require('fs');
const path = require('path');
const C = require('./config');

// Serial by default: film-grab tarpits CONCURRENT connections (see download-frames.js). 1 + a delay.
const CONCURRENCY = +(process.env.FG_DOWNLOAD_CONCURRENCY || 1);
const IMG_DELAY_MS = +(process.env.FG_IMAGE_DELAY_MS || C.delays.filmgrabImageMs || 150);
const FETCH_TIMEOUT_MS = +(process.env.FG_FETCH_TIMEOUT_MS || 15000);
const PAGES = path.join(C.paths.data, 'cache', 'pages');
const MAP = path.join(C.paths.data, 'featured.json');

// og:image URLs carry HTML entities (e.g. &#039; for apostrophe); left encoded the server answers
// 200 with an HTML page (not an image) and the film silently gets no featured still. Decode them.
function decodeEntities(s) {
  return s
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&quot;|&#0*34;/gi, '"')
    .replace(/&#0*38;|&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function liveSlugMap() {
  const MOVIES = require(C.paths.manifest);
  const matched = require(C.paths.matched);
  const byTY = new Map(matched.map((m) => [(m.title || '').toLowerCase() + '|' + m.year, m.slug]));
  const out = [];
  for (const m of MOVIES) {
    const slug = byTY.get((m.title || '').toLowerCase() + '|' + m.year);
    if (slug) out.push({ slug, title: m.title });
  }
  return out;
}

function featuredURL(slug) {
  const f = path.join(PAGES, slug + '.html');
  if (!fs.existsSync(f)) return null;
  const html = fs.readFileSync(f, 'utf8');
  const og = html.match(/<meta\s+property="og:image"[^>]*content="([^"]+)"/i);
  if (og) return og[1];
  const wp = html.match(/src="([^"]+)"[^>]*class="[^"]*wp-post-image/i);
  return wp ? wp[1] : null;
}

function localPath(slug) { return path.join(C.paths.images, slug, '0.jpg'); }

async function fetchImage(url, dest) {
  for (let a = 0; a <= C.retry.max; a++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(encodeURI(decodeEntities(url)), { headers: { 'User-Agent': C.UA, Referer: C.FILMGRAB_BASE + '/' }, signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const ct = r.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) throw new Error('not-image (' + ct + ')');
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error('too-small');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      return buf.length;
    } catch (e) {
      if (a < C.retry.max) await new Promise((res) => setTimeout(res, 500 * 2 ** a + Math.random() * 300));
      else throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function run({ dry = false } = {}) {
  const films = liveSlugMap();
  const map = fs.existsSync(MAP) ? JSON.parse(fs.readFileSync(MAP, 'utf8')) : {};
  let noURL = 0;
  const todo = [];
  for (const { slug } of films) {
    const url = featuredURL(slug);
    if (!url) { noURL++; map[slug] = { url: null, ok: false, reason: 'no-og-image' }; continue; }
    const have = fs.existsSync(localPath(slug)) && fs.statSync(localPath(slug)).size > 5000;
    map[slug] = { url, ok: have, bytes: have ? fs.statSync(localPath(slug)).size : 0 };
    if (!have) todo.push({ slug, url });
  }
  console.log(`${films.length} live films · ${noURL} without og:image · ${films.length - noURL - todo.length} already downloaded · ${todo.length} to fetch`);
  if (dry) { fs.writeFileSync(MAP, JSON.stringify(map, null, 2)); console.log('--dry: wrote URL map only.'); return map; }
  if (!todo.length) { fs.writeFileSync(MAP, JSON.stringify(map, null, 2)); console.log('Nothing to download.'); return map; }

  let done = 0, ok = 0, fail = 0;
  const t0 = Date.now();
  let idx = 0;
  async function worker() {
    while (idx < todo.length) {
      const { slug, url } = todo[idx++];
      try {
        const bytes = await fetchImage(url, localPath(slug));
        map[slug] = { url, ok: true, bytes };
        ok++;
      } catch (e) {
        map[slug] = { url, ok: false, reason: e.message };
        fail++;
      }
      done++;
      if (done % 25 === 0 || done === todo.length) {
        fs.writeFileSync(MAP, JSON.stringify(map, null, 2));
        const rate = done / ((Date.now() - t0) / 1000);
        console.log(`  ${done}/${todo.length}  ok:${ok} fail:${fail}  (${rate.toFixed(1)}/s)`);
      }
      if (IMG_DELAY_MS) await new Promise((r) => setTimeout(r, IMG_DELAY_MS)); // politeness between fetches
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  fs.writeFileSync(MAP, JSON.stringify(map, null, 2));
  console.log(`\nDone. ok:${ok} fail:${fail} → images/<slug>/0.jpg · map → ${path.relative(C.paths.root, MAP)}`);
  if (fail) console.log('Re-run to retry failures (resumable).');
  return map;
}

if (require.main === module) run({ dry: process.argv.includes('--dry') }).catch((e) => { console.error(e); process.exit(1); });
module.exports = { run, featuredURL, MAP };
