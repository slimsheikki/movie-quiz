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

  // 2026-06-22 — found by detect-mismatches.js after the library expansion (director-verified):
  '8-12': 422,                          // Fellini's 8½ (1963), was → "1/2 8" (1995)
  'stereo': 33691,                      // Cronenberg's Stereo (1969), was → Stereo (2014)
  'the-hunchback-of-notre-dame': 18987, // Worsley silent (1923), was → Disney (1996)
  'i-spit-on-your-grave': 25239,        // Zarchi original "Day of the Woman" (1978), was → remake (2010)
  'the-touch': 105254,                  // Bergman's The Touch (1971), was → The Touch (2002)
  'butterfly': 170341,                  // Terayama's Butterfly (1974), was → Butterfly (1982)
  'laura': 192112,                      // Terayama's Laura (1974), was → Laura (1979)
  'the-golem': 2972,                    // Wegener (1920), was → The Golem (1915)
  'sugar': 17003,                       // Fleck/Boden's Sugar (2008), was → "Sugar!" (2017)
  'detective': 52710,                   // Godard's Détective (1985), was → The Detective (1968)
  'the-texas-chainsaw-massacre': 30497, // Hooper original (1974), was → remake (2003); fixes id collision
  'magic': 34193,                       // Attenborough's Magic (1978), was → Magic (2020)
  'a-time-to-love-and-a-time-to-die': 45999, // Hou's The Time to Live and the Time to Die (1985), was → Sirk (1958)
  'boy': 39356,                         // Waititi's Boy (2010), was → The Boy (2016)
  'the-day-after': 451957,              // Hong Sang-soo's The Day After (2017), was → The Day After (1983)
  'education': 1581650,                 // McQueen's Small Axe: Education (2020), was → An Education (2009)
  'the-toxic-avenger': 338969,          // Macon Blair's remake (2023, TMDb "Unrated"), was → original (1984)
};

// Slugs to REMOVE entirely: their FILM-GRAB film has no TMDb *movie* entry (catalogued as TV), so
// there is no correct id — they were showing a wrong answer. Steve McQueen's Small Axe films.
const DROP = ['mangrove', 'lovers-rock', 'red-white-blue'];

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

  let out = matched;
  if (DROP.length) {
    const drop = new Set(DROP);
    const before = out.length;
    out = out.filter((m) => !drop.has(m.slug));
    console.log(`\n  dropped ${before - out.length} slug(s) with no TMDb movie entry: ${DROP.join(', ')}`);
  }

  if (dry) { console.log('\n--dry: matched.json not written.'); return; }
  fs.writeFileSync(C.paths.matched, JSON.stringify(out, null, 2));
  console.log(`\nPatched → ${C.paths.matched}. Now re-run: curate → fetch-featured → analyze-frames → prune-frames --apply → set-primary.`);
}

if (require.main === module) run({ dry: process.argv.includes('--dry') }).catch((e) => { console.error(e); process.exit(1); });
module.exports = { run, FIXES };
