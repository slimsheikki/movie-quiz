// PHASE 3 (local) — apply Vision results to the manifest.
//   1. Drop frames whose OCR text reveals the movie's title (giveaways).
//   2. Prefer frames containing people.
//   3. Never drop a film below FLOOR frames (keep least-bad giveaway, flag for backfill).
//
//   node prune-frames.js            # REVIEW: print flagged frames + summary, write nothing
//   node prune-frames.js --apply    # rewrite data/movies.js and emit a report
//
// Reads the cache from analyze-frames.js (tools/data/vision.json).
const fs = require('fs');
const path = require('path');
const C = require('./config');

const FLOOR = 2;
const VISION = path.join(C.paths.data, 'vision.json');

// articles/short stopwords dropped from titles when extracting "significant" words
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'le', 'la', 'les', 'un', 'une', 'des', 'du',
  'der', 'die', 'das', 'il', 'lo', 'el', 'los', 'las', 'i', 'gli', 'to', 'in', 'on']);

const strip = (s) => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')   // drop accents
  .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function titleNeedle(title) {
  const words = strip(title).split(' ').filter((w) => w && !STOP.has(w));
  return { full: words.join(' '), words };
}

// Does the OCR text reveal this title? Strict: the article-stripped title must appear as a
// contiguous substring of the joined OCR text. Skip ultra-short titles (too many false hits).
function titleVisible(title, ocrText) {
  const { full } = titleNeedle(title);
  if (full.length < 3) return false;          // "up", "it", "m" → unsafe to match
  const hay = strip((ocrText || []).join(' '));
  if (!hay) return false;
  return hay.includes(full);
}

function run({ apply = false } = {}) {
  const vision = JSON.parse(fs.readFileSync(VISION, 'utf8'));
  const MOVIES = require(C.paths.manifest);

  const flagged = [];           // {title, frame, ocr}
  const droppedNoPerson = [];   // frames dropped purely for lacking people
  const backfill = [];          // films forced to keep a giveaway (need re-download later)
  let framesBefore = 0, framesAfter = 0;

  for (const m of MOVIES) {
    const frames = (m.frames || []).map((rel) => {
      const v = vision[rel] || {};
      return {
        rel,
        titleVis: titleVisible(m.title, v.text),
        hasPerson: (v.faces || 0) > 0 || (v.persons || 0) > 0,
        ocr: v.text || [],
      };
    });
    framesBefore += frames.length;

    for (const f of frames) if (f.titleVis) flagged.push({ title: m.title, frame: f.rel, ocr: f.ocr });

    // step 1 — drop giveaways, respecting the floor
    let kept = frames.filter((f) => !f.titleVis);
    const giveaways = frames.filter((f) => f.titleVis);
    if (kept.length < FLOOR && giveaways.length) {
      const need = FLOOR - kept.length;
      const addBack = [...giveaways].sort((a, b) => (b.hasPerson - a.hasPerson)).slice(0, need);
      kept = kept.concat(addBack);
      backfill.push({ title: m.title, keptGiveaways: addBack.map((f) => f.rel) });
    }

    // step 2 — prefer people (only if it keeps us at/above the floor)
    const withPeople = kept.filter((f) => f.hasPerson);
    if (withPeople.length >= FLOOR && withPeople.length < kept.length) {
      for (const f of kept) if (!f.hasPerson) droppedNoPerson.push({ title: m.title, frame: f.rel });
      kept = withPeople;
    }

    // preserve original frame order
    const keptSet = new Set(kept.map((f) => f.rel));
    m._newFrames = frames.filter((f) => keptSet.has(f.rel)).map((f) => f.rel);
    framesAfter += m._newFrames.length;
  }

  // ---- report ----
  console.log(`Films: ${MOVIES.length} · frames ${framesBefore} → ${framesAfter} (−${framesBefore - framesAfter})`);
  console.log(`Title-giveaway frames flagged: ${flagged.length}`);
  console.log(`Person-less frames dropped (had people alternatives): ${droppedNoPerson.length}`);
  console.log(`Films forced to keep a giveaway (floor=${FLOOR}, flag for backfill): ${backfill.length}`);

  console.log(`\n--- flagged title-giveaway frames (title ⟵ OCR) ---`);
  for (const f of flagged) {
    const snip = f.ocr.join(' | ').slice(0, 90);
    console.log(`  "${f.title}"  ${f.frame}\n      OCR: ${snip}`);
  }

  if (!apply) {
    console.log(`\nREVIEW only — no file written. Re-run with --apply once the matches look right.`);
    return { flagged, backfill };
  }

  // write report + rewrite manifest
  const report = { framesBefore, framesAfter, flagged, droppedNoPerson, backfill };
  const reportPath = path.join(C.paths.logs, 'prune-frames.json');
  fs.mkdirSync(C.paths.logs, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const out = MOVIES.map((m) => ({
    title: m.title, year: m.year, director: m.director,
    country: m.country, difficulty: m.difficulty, decoys: [], frames: m._newFrames,
  }));
  const counts = out.reduce((a, f) => ((a[f.difficulty] = (a[f.difficulty] || 0) + 1), a), {});
  const banner = `// AUTO-GENERATED — curate.js then prune-frames.js. Do not edit by hand.\n` +
    `// ${out.length} films · ${JSON.stringify(counts)} · frames ${framesAfter}\n`;
  fs.writeFileSync(C.paths.manifest,
    `const MOVIES = ${JSON.stringify(out, null, 2)};\n` +
    `if (typeof module !== "undefined") module.exports = MOVIES;\n`);

  console.log(`\nApplied → ${path.relative(C.paths.root, C.paths.manifest)}`);
  console.log(`Report  → ${path.relative(C.paths.root, reportPath)}`);
  console.log('Remember to bump ?v= in index.html.');
  return report;
}

if (require.main === module) run({ apply: process.argv.includes('--apply') });
module.exports = { run, titleVisible };
