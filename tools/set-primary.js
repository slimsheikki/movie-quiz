// PHASE A — make each film's FILM-GRAB featured image (images/<slug>/0.jpg) its PRIMARY frame.
// Prepends 0.jpg to the film's frames[] so the game shows it as the guess image. Safety: if the
// featured image's OCR text reveals the title (vision.json), we DON'T promote it — keep existing
// frames so we never hand the answer away. Run AFTER fetch-featured.js + analyze-frames.js.
//
//   node set-primary.js          # rewrite data/movies.js
//   node set-primary.js --dry    # report only
const fs = require('fs');
const path = require('path');
const C = require('./config');
const { titleVisible } = require('./prune-frames.js');

function run({ dry = false } = {}) {
  const MOVIES = require(C.paths.manifest);
  const matched = require(C.paths.matched);
  const featured = JSON.parse(fs.readFileSync(path.join(C.paths.data, 'featured.json'), 'utf8'));
  const vision = JSON.parse(fs.readFileSync(path.join(C.paths.data, 'vision.json'), 'utf8'));
  const slugByTY = new Map(matched.map((m) => [(m.title || '').toLowerCase() + '|' + m.year, m.slug]));

  let promoted = 0, titleSkip = 0, noFeatured = 0, already = 0;
  const skipped = [];
  const out = MOVIES.map((m) => {
    const slug = slugByTY.get((m.title || '').toLowerCase() + '|' + m.year);
    const rel = slug ? `images/${slug}/0.jpg` : null;
    const frames = (m.frames || []).filter((f) => f !== rel);   // avoid dupes if re-run
    const have = slug && featured[slug] && featured[slug].ok &&
      fs.existsSync(path.join(C.paths.root, rel));
    if (!have) { noFeatured++; return { ...m, frames }; }
    const titleShown = titleVisible(m.title, (vision[rel] || {}).text);
    if (titleShown) { titleSkip++; skipped.push({ title: m.title, ocr: (vision[rel] || {}).text || [] }); return { ...m, frames }; }
    if ((m.frames || [])[0] === rel) already++;
    promoted++;
    return { ...m, frames: [rel, ...frames] };   // featured first = primary
  });

  const counts = out.reduce((a, f) => ((a[f.difficulty] = (a[f.difficulty] || 0) + 1), a), {});
  const totalFrames = out.reduce((s, f) => s + f.frames.length, 0);
  console.log(`Films: ${out.length}`);
  console.log(`  featured promoted to primary: ${promoted}${already ? ` (${already} already were)` : ''}`);
  console.log(`  skipped — featured shows title (OCR): ${titleSkip}`);
  console.log(`  skipped — no featured image: ${noFeatured}`);
  console.log(`  total frames now: ${totalFrames}`);
  if (skipped.length) {
    console.log('\n  Featured images that reveal the title (kept old frames instead):');
    for (const s of skipped) console.log(`    "${s.title}"  ←  ${s.ocr.join(' | ').slice(0, 80)}`);
  }

  if (dry) { console.log('\n--dry: no file written.'); return out; }

  const banner = `// AUTO-GENERATED — curate.js → prune-frames.js → set-primary.js. Do not edit by hand.\n` +
    `// ${out.length} films · ${JSON.stringify(counts)} · frames ${totalFrames} · frames[0] = FILM-GRAB featured\n`;
  fs.writeFileSync(C.paths.manifest,
    `const MOVIES = ${JSON.stringify(out, null, 2)};\n` +
    `if (typeof module !== "undefined") module.exports = MOVIES;\n`);
  console.log(`\nWrote → ${path.relative(C.paths.root, C.paths.manifest)}. Bump ?v= in index.html.`);
  return out;
}

if (require.main === module) run({ dry: process.argv.includes('--dry') });
module.exports = { run };
