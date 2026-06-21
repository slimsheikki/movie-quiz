// One-off correction of wrong TMDb matches (FILM-GRAB page ≠ assigned film). Each slug below was
// matched to the wrong TMDb film (usually same franchise/title); here we point it at the correct id
// and refresh its metadata from TMDb. Preserves slug/frameUrls/frames/altTitles. Then re-run the
// pipeline: curate → fetch-featured → analyze-frames → prune-frames --apply → set-primary.
//
//   node fix-matches.js          # patch matched.json
//   node fix-matches.js --dry    # show what would change
const fs = require('fs');
const C = require('./config');

// slug → correct TMDb id (verified by director against the FILM-GRAB page)
const FIXES = {
  'blade-runner-2049': 335984, // was matched to Blade Runner (1982)
  'shame-2': 26372,            // Bergman's Shame (1968), was → Shame (2011)
  'the-silence': 11506,        // Bergman's The Silence (1963), was → The Silence (2019)
  'the-return': 11190,         // Zvyagintsev's The Return (2003), was → The Return (2006)
  'spider': 9613,              // Cronenberg's Spider (2002), was → Spider-Man (2002)
  'love': 54320,               // Eubank's Love (2011), was → Love (2015)
};

const AUTH = { Authorization: 'Bearer ' + C.TMDB_BEARER, accept: 'application/json' };

async function details(id) {
  const r = await fetch(`${C.TMDB_BASE}/movie/${id}?append_to_response=credits`, { headers: AUTH });
  if (!r.ok) throw new Error(`TMDb ${id}: HTTP ${r.status}`);
  return r.json();
}

async function run({ dry = false } = {}) {
  const matched = JSON.parse(fs.readFileSync(C.paths.matched, 'utf8'));
  const bySlug = new Map(matched.map((m) => [m.slug, m]));

  for (const [slug, id] of Object.entries(FIXES)) {
    const film = bySlug.get(slug);
    if (!film) { console.warn(`  ! slug not found: ${slug}`); continue; }
    const d = await details(id);
    const director = (d.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name).join(', ') || null;
    const next = {
      tmdbId: d.id,
      title: d.title,
      year: +(d.release_date || '').slice(0, 4) || film.year,
      director,
      country: (d.production_countries || []).map((c) => c.name),
      genres: (d.genres || []).map((g) => g.name),
      genreIds: (d.genres || []).map((g) => g.id),
      original_language: d.original_language,
      vote_count: d.vote_count,
      vote_average: d.vote_average,
      popularity: d.popularity,
    };
    console.log(`  ${slug}: "${film.title}" (${film.year}, id ${film.tmdbId}) → "${next.title}" (${next.year}, id ${next.tmdbId}) dir=${director}`);
    if (!dry) Object.assign(film, next);   // keep slug, frameUrls, frames, altTitles
  }

  if (dry) { console.log('\n--dry: matched.json not written.'); return; }
  fs.writeFileSync(C.paths.matched, JSON.stringify(matched, null, 2));
  console.log(`\nPatched → ${C.paths.matched}. Now re-run: curate → fetch-featured → analyze-frames → prune-frames --apply → set-primary.`);
}

if (require.main === module) run({ dry: process.argv.includes('--dry') }).catch((e) => { console.error(e); process.exit(1); });
module.exports = { run, FIXES };
