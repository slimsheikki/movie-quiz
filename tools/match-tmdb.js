// STAGE 2 — match each scraped film to TMDb, enrich with metadata.  -> tools/data/matched.json
const path = require('path');
const fs = require('fs');
const C = require('./config');
const http = require('./lib/http');
const cache = require('./lib/cache');
const T = require('./lib/text');
const { parseArgs } = require('./lib/args');

const AUTH = { Authorization: 'Bearer ' + C.TMDB_BEARER, accept: 'application/json' };
const tmdb = (pathQuery) => http.getJSON(C.TMDB_BASE + pathQuery, { headers: AUTH, delayMs: C.delays.tmdbMs });

async function search(q) {
  const data = await tmdb('/search/movie?query=' + encodeURIComponent(q));
  return data.results || [];
}

function scoreCandidate(film, q, c) {
  const tScore = Math.max(T.sim(q, c.title || ''), T.sim(q, c.original_title || ''));
  const cYear = +((c.release_date || '').slice(0, 4)) || null;
  let yScore;
  if (!film.year) yScore = 0.5;
  else if (cYear === film.year) yScore = 1;
  else yScore = Math.max(0, 1 - Math.abs((cYear || 0) - film.year) / 10);
  const pScore = Math.log10(1 + (c.vote_count || 0)) / 5;
  let total = C.match.weights.title * tScore + C.match.weights.year * yScore + C.match.weights.pop * pScore;
  if (T.norm(c.title || '') !== T.norm(q) && /making of|behind the scenes|anniversary edition|\bdocumentary\b/i.test(c.title || ''))
    total -= C.match.junkPenalty;
  return { id: c.id, title: c.title, year: cYear, vote_count: c.vote_count, total, tScore, yScore };
}

async function matchFilm(film) {
  let q = T.unreverseArticle(film.title || '');
  const [q2, ty] = T.stripTrailingYear(q);
  q = q2;
  film.year = film.year || ty || null;

  let results = await search(q);
  if (!results.length) results = await search(T.foldAccents(q));
  if (!results.length) return { flag: 'NO_MATCH' };

  const scored = results.slice(0, 10).map((c) => scoreCandidate(film, q, c)).sort((a, b) => b.total - a.total);
  const best = scored[0], runner = scored[1] || { total: 0 };
  const exact = results.filter((c) => T.norm(c.title) === T.norm(q) || T.norm(c.original_title || '') === T.norm(q));

  if (best.total >= C.match.accept &&
     (best.total - runner.total >= C.match.margin || (T.norm(best.title) === T.norm(q) && best.year === film.year)))
    return { id: best.id, best };
  if (exact.length === 1) return { id: exact[0].id, best };
  return { id: best.id, flag: 'low_confidence', best };
}

async function enrich(id) {
  const cacheP = path.join(C.paths.cache, 'tmdb', id + '.json');
  let d = cache.readJSON(cacheP);
  if (!d) { d = await tmdb(`/movie/${id}?append_to_response=credits,alternative_titles`); cache.writeJSON(cacheP, d); }
  const director = (d.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name).join(', ') || null;
  const altTitles = [...new Set([d.original_title, ...((d.alternative_titles?.titles || []).map((t) => t.title))].filter(Boolean))];
  return {
    tmdbId: id,
    title: d.title,
    year: +((d.release_date || '').slice(0, 4)) || null,
    director,
    country: (d.production_countries || []).map((c) => c.name),
    genres: (d.genres || []).map((g) => g.name),
    genreIds: (d.genres || []).map((g) => g.id),
    original_language: d.original_language,
    vote_count: d.vote_count,
    vote_average: d.vote_average,
    popularity: d.popularity,
    altTitles,
  };
}

async function run(opts = {}) {
  if (!C.TMDB_BEARER) throw new Error('TMDB_BEARER missing from tools/.env');
  fs.mkdirSync(path.join(C.paths.cache, 'tmdb'), { recursive: true });
  fs.mkdirSync(C.paths.logs, { recursive: true });

  let films = cache.readJSON(C.paths.films, []);
  if (opts.slugs) films = films.filter((f) => opts.slugs.includes(f.slug));
  if (opts.limit) films = films.slice(0, opts.limit);

  const matched = cache.readJSON(C.paths.matched, []);
  const bySlug = new Map(matched.map((m) => [m.slug, m]));
  const unmatched = cache.readJSON(path.join(C.paths.logs, 'unmatched.json'), []);
  console.log(`Matching ${films.length} films to TMDb…`);

  let done = 0;
  for (const film of films) {
    done++;
    if (opts.resume && bySlug.has(film.slug)) continue;
    try {
      const m = await matchFilm(film);
      if (m.flag === 'NO_MATCH' || m.flag === 'low_confidence') {
        unmatched.push({ slug: film.slug, title: film.title, year: film.year, flag: m.flag, guessedId: m.id || null, guessedTitle: m.best?.title || null });
        console.warn(`  ? ${film.title} (${film.year || '?'}) → ${m.flag}${m.best ? ' (guess: ' + m.best.title + ' ' + m.best.year + ')' : ''}`);
        continue;
      }
      const meta = await enrich(m.id);
      bySlug.set(film.slug, { slug: film.slug, ...meta, frameUrls: film.frameUrls });
      if (done % 25 === 0 || films.length <= 30)
        console.log(`  [${done}/${films.length}] ${meta.title} (${meta.year}) — ${meta.director} — ${meta.vote_count} votes`);
    } catch (e) {
      console.warn(`  ✗ ${film.slug}: ${e.message}`);
      unmatched.push({ slug: film.slug, title: film.title, flag: 'error', reason: e.message });
    }
    if (done % 20 === 0) cache.writeJSON(C.paths.matched, [...bySlug.values()]);
  }

  cache.writeJSON(C.paths.matched, [...bySlug.values()]);
  cache.writeJSON(path.join(C.paths.logs, 'unmatched.json'), unmatched);
  console.log(`Stage 2 done. matched.json has ${bySlug.size} films. ${unmatched.length} unmatched/flagged.`);
  return [...bySlug.values()];
}

if (require.main === module) {
  const a = parseArgs();
  run({ slugs: a.slugs, limit: a.limit, resume: a.resume }).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { run, matchFilm, enrich };
