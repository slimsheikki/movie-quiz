// Orchestrator: runs stages 1→4 in order. Honors --slugs, --limit, --resume.
//   node run-all.js                         # full pipeline, all films
//   node run-all.js --limit=15 --resume     # first 15 films, skip cached work
//   node run-all.js --slugs=parasite,oldboy # specific films
const C = require('./config');
const { parseArgs } = require('./lib/args');

async function main() {
  const a = parseArgs();
  const opts = { slugs: a.slugs, limit: a.limit, resume: a.resume };

  console.log('\n=== STAGE 1: scrape FILM-GRAB ===');
  await require('./scrape-filmgrab').run(opts);

  console.log('\n=== STAGE 2: match TMDb ===');
  await require('./match-tmdb').run(opts);

  console.log('\n=== STAGE 3: download frames ===');
  await require('./download-frames').run(opts);

  console.log('\n=== STAGE 4: build manifest ===');
  await require('./build-manifest').run(opts);

  console.log('\n✓ Pipeline complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
