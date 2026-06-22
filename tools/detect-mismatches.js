// Wrong-TMDb-match detector. Two independent sweeps over matched films that have frames:
//   A) multiple slugs sharing one tmdbId (a film matched twice / a same-title collision)
//   B) FILM-GRAB page "Year:" vs the assigned TMDb year differing by >= MIN_DELTA
// The FRAMES are always correct (they come from the FILM-GRAB page); a wrong match means the
// attached title/year/tmdbId is for a DIFFERENT film, so the game shows the right still but the
// wrong answer. Fix = correct the tmdbId in tools/fix-matches.js, re-run curate→…→set-primary.
//
//   node detect-mismatches.js            # report (delta >= 2)
//   node detect-mismatches.js --min=5    # only year gaps >= 5 (skip festival/release noise)
//
// Read-only. Writes a JSON report to tools/data/logs/mismatches.json.
const fs = require('fs');
const path = require('path');
const C = require('./config');

const MIN_DELTA = +((process.argv.find((a) => a.startsWith('--min=')) || '').split('=')[1] || 2);

function pageYear(slug) {
  const f = path.join(C.paths.data, 'cache', 'pages', slug + '.html');
  if (!fs.existsSync(f)) return null;
  const html = fs.readFileSync(f, 'utf8');
  const i = html.search(/Year:/i);
  if (i < 0) return null;
  // Strip tags from the chunk after "Year:" — the visible digits are the year (sometimes split
  // across <a> tags, e.g. "1"+"953"); the category/<year>/ HREF is a site tag, NOT the film year.
  const chunk = html.slice(i, i + 260).replace(/<[^>]*>/g, '').replace(/Year:\s*/i, '');
  const m = chunk.match(/\b((?:19|20)\d{2})\b/);
  return m ? +m[1] : null;
}

function run() {
  const matched = JSON.parse(fs.readFileSync(C.paths.matched, 'utf8'));
  const MOVIES = require(C.paths.manifest);
  const byTY = new Map(matched.map((m) => [(m.title || '').toLowerCase() + '|' + m.year, m]));
  const live = new Set();
  for (const m of MOVIES) { const mm = byTY.get((m.title || '').toLowerCase() + '|' + m.year); if (mm) live.add(mm.slug); }
  const withFrames = matched.filter((m) => m.frames && m.frames.length >= 2);

  // A — shared tmdbId
  const byId = new Map();
  for (const m of withFrames) { if (!m.tmdbId) continue; if (!byId.has(m.tmdbId)) byId.set(m.tmdbId, []); byId.get(m.tmdbId).push(m); }
  const collisions = [...byId.entries()].filter(([, a]) => a.length > 1)
    .map(([id, a]) => ({ tmdbId: id, slugs: a.map((m) => ({ slug: m.slug, title: m.title, year: m.year, live: live.has(m.slug) })) }));

  // B — page year vs assigned year
  const yearGaps = [];
  for (const m of withFrames) {
    const py = pageYear(m.slug);
    if (py && m.year && Math.abs(py - m.year) >= MIN_DELTA) {
      yearGaps.push({ slug: m.slug, title: m.title, assigned: m.year, page: py, delta: Math.abs(py - m.year), live: live.has(m.slug) });
    }
  }
  yearGaps.sort((a, b) => b.delta - a.delta);

  console.log(`=== A) shared tmdbId: ${collisions.length} collision(s) ===`);
  for (const c of collisions) console.log(`  id ${c.tmdbId}: ${c.slugs.map((s) => `${s.slug}${s.live ? '*' : ''} "${s.title}" (${s.year})`).join('  |  ')}`);
  console.log(`\n=== B) page-year vs assigned (Δ>=${MIN_DELTA}): ${yearGaps.length} (${yearGaps.filter((g) => g.live).length} live) ===`);
  for (const g of yearGaps) console.log(`  ${g.live ? '*' : ' '} ${g.slug}: "${g.title}" assigned=${g.assigned} page=${g.page} (Δ${g.delta})`);
  console.log('\n(* = live in game)');

  fs.mkdirSync(C.paths.logs, { recursive: true });
  const out = path.join(C.paths.logs, 'mismatches.json');
  fs.writeFileSync(out, JSON.stringify({ minDelta: MIN_DELTA, collisions, yearGaps }, null, 2));
  console.log(`\nReport → ${path.relative(C.paths.root, out)}`);
}

if (require.main === module) run();
module.exports = { run };
