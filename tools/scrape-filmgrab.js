// STAGE 1 — enumerate FILM-GRAB via sitemaps, then extract title/year/director/frame URLs per film.
//   -> tools/data/filmlist.json  (all film page URLs)
//   -> tools/data/films.json     (per-film extracted data)
const fs = require('fs');
const path = require('path');
const C = require('./config');
const http = require('./lib/http');
const cache = require('./lib/cache');
const { decodeEntities } = require('./lib/text');
const { parseArgs } = require('./lib/args');

const FILM_RE = /^https:\/\/film-grab\.com\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+\/$/;

async function enumerate() {
  const seen = new Set(), films = new Set();
  const queue = [C.FILMGRAB_BASE + '/sitemap.xml'];
  while (queue.length) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    let xml;
    try { xml = await http.getText(u, { delayMs: C.delays.filmgrabPageMs }); }
    catch (e) { console.warn('  sitemap fail', u, e.message); continue; }
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    for (const loc of locs) {
      if (FILM_RE.test(loc)) films.add(loc);
      else if (/sitemap[^/]*\.xml$/i.test(loc)) queue.push(loc);
    }
    console.log(`  ${u.split('/').pop()} → ${films.size} films so far`);
  }
  return [...films].sort();
}

function extractFilm(html, url) {
  const slug = url.replace(/\/$/, '').split('/').pop();

  const tm = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  const title = tm ? decodeEntities(tm[1].replace(/<[^>]+>/g, '').trim()) : null;

  const ym = html.match(/Year:\s*<a[^>]*>\s*(\d{4})\s*<\/a>/i);
  const year = ym ? +ym[1] : null;

  let director = null;
  const dm = html.match(/Director[^<]*<\/span>\s*:?\s*([\s\S]*?)<\/p>/i);
  if (dm) {
    const links = [...dm[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((x) => decodeEntities(x[1].trim()));
    if (links.length) director = links.join(', ');
  }

  const frameUrls = [...html.matchAll(/<a class="bwg-a bwg_lightbox"[^>]*href="([^"]+)"/g)]
    .map((m) => m[1].replace(/&#0?38;/g, '&').replace(/\?bwg=\d+.*$/, ''));

  return { slug, url, title, year, director, frameUrls };
}

function selectWorkingSet(filmlist, opts) {
  if (opts.slugs) return filmlist.filter((f) => opts.slugs.includes(f.slug));
  if (opts.limit) return filmlist.slice(0, opts.limit);
  return filmlist;
}

async function run(opts = {}) {
  fs.mkdirSync(path.join(C.paths.cache, 'pages'), { recursive: true });
  fs.mkdirSync(C.paths.logs, { recursive: true });

  // 1. enumeration (cached)
  let filmlist = cache.readJSON(C.paths.filmlist);
  if (!filmlist || opts.reenumerate) {
    console.log('Enumerating films from sitemaps…');
    const urls = await enumerate();
    filmlist = urls.map((url) => ({ url, slug: url.replace(/\/$/, '').split('/').pop() }));
    cache.writeJSON(C.paths.filmlist, filmlist);
    console.log(`Enumerated ${filmlist.length} film pages.`);
    if (filmlist.length < 3500 || filmlist.length > 6000)
      console.warn(`⚠ film count ${filmlist.length} outside expected ~4500 — sitemap structure may have changed.`);
  } else {
    console.log(`Using cached filmlist (${filmlist.length} films).`);
  }
  if (opts.enumerateOnly) return filmlist;

  // 2. per-film extraction
  const set = selectWorkingSet(filmlist, opts);
  const films = cache.readJSON(C.paths.films, []);
  const bySlug = new Map(films.map((f) => [f.slug, f]));
  const errors = cache.readJSON(path.join(C.paths.logs, 'errors.json'), []);
  console.log(`Scraping ${set.length} film pages…`);

  let done = 0;
  for (const { url, slug } of set) {
    done++;
    if (opts.resume && bySlug.has(slug) && bySlug.get(slug).frameUrls?.length) continue;

    const cacheP = path.join(C.paths.cache, 'pages', slug + '.html');
    let html = cache.exists(cacheP) ? fs.readFileSync(cacheP, 'utf8') : null;
    try {
      if (!html) {
        html = await http.getText(url, { delayMs: C.delays.filmgrabPageMs });
        fs.writeFileSync(cacheP, html);
      }
      const film = extractFilm(html, url);
      if (!film.title || !film.frameUrls.length) throw new Error('no title or frames');
      bySlug.set(slug, film);
      if (done % 25 === 0 || set.length <= 30)
        console.log(`  [${done}/${set.length}] ${film.title} (${film.year || '?'}) — ${film.frameUrls.length} frames`);
    } catch (e) {
      console.warn(`  ✗ ${slug}: ${e.message}`);
      errors.push({ stage: 'scrape', slug, url, reason: e.message });
    }
    if (done % 20 === 0) cache.writeJSON(C.paths.films, [...bySlug.values()]);
  }

  cache.writeJSON(C.paths.films, [...bySlug.values()]);
  cache.writeJSON(path.join(C.paths.logs, 'errors.json'), errors);
  console.log(`Stage 1 done. films.json has ${bySlug.size} films. ${errors.length} errors logged.`);
  return [...bySlug.values()];
}

if (require.main === module) {
  const a = parseArgs();
  run({ slugs: a.slugs, limit: a.limit, resume: a.resume, enumerateOnly: a['enumerate-only'], reenumerate: a.reenumerate })
    .catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { run, extractFilm, enumerate };
