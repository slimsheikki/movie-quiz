// PHASE 2 — Library curation (network-free). Reads matched.json, deduplicates remakes/alt-cuts,
// re-tiers the core library by a blended popularity+acclaim score, and emits data/movies.js.
//
// Obscurity: films BELOW the inclusion floor aren't dropped — they're kept as an "obscure" pool
// routed only into Very Hard / Cinephile and tagged with `obs` (0=least … 100=most obscure) +
// `obscure:true`. The runtime obscurity slider gates them; at slider 0 they never appear, so the
// default game = exactly the floor-passing core. Core tiers are unchanged (percentile over core only).
//
//   node curate.js [--dry]
const fs = require('fs');
const path = require('path');
const C = require('./config');
const T = require('./lib/text');

const FLOOR_VOTES = 200;          // inclusion floor for the CORE (always-on) library
const W_VOTES = 0.6, W_RATING = 0.4;   // blend weights for core re-tiering
const VH_VS_CINE_VOTES = 100;     // obscure split: vc>=100 → Very Hard, else Cinephile
const KEEP_OVERRIDE = new Set(['funny-games-2']); // prefer 1997 original over 2008 remake
const DROP_OVERRIDE = new Set(['funny-games']);

const norm = (t) => T.norm(t);
const tierFor = (p) => { for (const t of C.tiers) if (p >= t.min) return t.key; return 'cinephile'; };

function run({ dry = false } = {}) {
  const all = JSON.parse(fs.readFileSync(C.paths.matched, 'utf8'));
  const withFrames = all.filter((m) => (m.frames || []).length >= C.frames.min);
  const start = withFrames.length;

  // partition by the core inclusion floor (broken metadata, vote_average==0, is excluded entirely)
  const rated = withFrames.filter((f) => f.vote_average > 0 && f.vote_count > 0);
  const isCore = (f) => f.vote_count >= FLOOR_VOTES;

  // dedup by normalized title across the WHOLE rated set (core beats obscure on vote_count, so
  // a title shared by a core + an obscure film keeps the core one — no duplicate answer options).
  const groups = new Map();
  for (const f of rated) {
    const k = norm(f.title);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const survivors = [];
  for (const [, group] of groups) {
    let keep = group.find((f) => KEEP_OVERRIDE.has(f.slug));
    if (!keep) keep = group.filter((f) => !DROP_OVERRIDE.has(f.slug))
      .sort((a, b) => b.vote_count - a.vote_count)[0] || group[0];
    survivors.push(keep);
  }

  const core = survivors.filter(isCore);
  const obscure = survivors.filter((f) => !isCore(f));

  // CORE re-tier by blended z(log vote_count) + z(vote_average) — unchanged from before
  const stats = (arr) => {
    const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
    const sd = Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length) || 1;
    return { mean, sd };
  };
  const sv = stats(core.map((f) => Math.log(f.vote_count)));
  const sr = stats(core.map((f) => f.vote_average));
  core.forEach((f) => {
    f._score = W_VOTES * ((Math.log(f.vote_count) - sv.mean) / sv.sd) + W_RATING * ((f.vote_average - sr.mean) / sr.sd);
  });
  const coreSorted = [...core].sort((a, b) => a._score - b._score);
  const n = coreSorted.length;
  coreSorted.forEach((f, i) => { f.difficulty = tierFor(n <= 1 ? 1 : i / (n - 1)); f.obscure = false; });

  // OBSCURE pool → Very Hard / Cinephile by vote_count; obs = obscurity percentile WITHIN the
  // obscure pool (0 = least obscure extra … 100 = most). The runtime slider V gates them:
  // a film is eligible iff !obscure OR (V>0 && obs<=V) — so V=0 hides every obscure film and the
  // default game is exactly the core. Core films carry no obs (always eligible).
  obscure.forEach((f) => { f.difficulty = f.vote_count >= VH_VS_CINE_VOTES ? 'veryhard' : 'cinephile'; f.obscure = true; });
  const obsSorted = [...obscure].sort((a, b) => b.vote_count - a.vote_count); // most-voted (least obscure) first
  const m = obsSorted.length;
  obsSorted.forEach((f, i) => { f.obs = m <= 1 ? 0 : Math.round((100 * i) / (m - 1)); });

  // emit
  const tierOrder = { easy: 0, medium: 1, hard: 2, veryhard: 3, cinephile: 4 };
  const out = [...coreSorted, ...obscure]
    .map((f) => {
      const o = { title: f.title, year: f.year, director: f.director, tmdbId: f.tmdbId,
        country: f.country, difficulty: f.difficulty, decoys: [], frames: f.frames };
      if (f.obscure) { o.obscure = true; o.obs = f.obs; }   // obscurity gating metadata (extras only)
      return o;
    })
    .sort((a, b) => (tierOrder[a.difficulty] - tierOrder[b.difficulty]) || a.title.localeCompare(b.title));

  const counts = out.reduce((a, f) => ((a[f.difficulty] = (a[f.difficulty] || 0) + 1), a), {});
  const obsCounts = out.filter((f) => f.obscure).reduce((a, f) => ((a[f.difficulty] = (a[f.difficulty] || 0) + 1), a), {});

  console.log(`Started with ${start} films (>=${C.frames.min} frames, ${withFrames.length - rated.length} dropped: no rating)`);
  console.log(`  core (vc≥${FLOOR_VOTES}): ${core.length}  ·  obscure pool (vc<${FLOOR_VOTES}): ${obscure.length}`);
  console.log(`  = ${out.length} films  ${JSON.stringify(counts)}`);
  console.log(`  obscure split: ${JSON.stringify(obsCounts)}`);

  if (dry) { console.log('\n--dry: no file written.'); return out; }

  const banner = `// AUTO-GENERATED by tools/curate.js — do not edit by hand.\n` +
    `// ${out.length} films · ${JSON.stringify(counts)} · obscure ${JSON.stringify(obsCounts)}\n`;
  const body = `const MOVIES = ${JSON.stringify(out, null, 2)};\n` +
    `if (typeof module !== "undefined") module.exports = MOVIES;\n`;
  fs.mkdirSync(path.dirname(C.paths.manifest), { recursive: true });
  fs.writeFileSync(C.paths.manifest, banner + body);
  console.log(`\nWrote → ${path.relative(C.paths.root, C.paths.manifest)}`);
  console.log('Remember to bump ?v= in index.html.');
  return out;
}

if (require.main === module) run({ dry: process.argv.includes('--dry') });
module.exports = { run };
