// Central config for the acquisition pipeline. Loads tools/.env (no dotenv dep).
const fs = require('fs');
const path = require('path');

(function loadEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    // strip a trailing " # comment" but keep '#' that's part of a value (none of ours have it)
    const val = m[2].replace(/\s+#.*$/, '').trim();
    if (process.env[key] === undefined) process.env[key] = val;
  }
})();

const root = path.join(__dirname, '..');

module.exports = {
  TMDB_BEARER: process.env.TMDB_BEARER || process.env.TMDB_V4_TOKEN,
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  TMDB_BASE: 'https://api.themoviedb.org/3',
  FILMGRAB_BASE: 'https://film-grab.com',
  UA: process.env.FG_USER_AGENT ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) movie-quiz-builder/1.0',

  delays: {
    filmgrabPageMs: +(process.env.FG_REQUEST_DELAY_MS || 1500),
    filmgrabImageMs: 150,
    tmdbMs: +(process.env.TMDB_REQUEST_DELAY_MS || 80),
  },
  retry: { max: 4, baseMs: 800 },

  frames: { count: +(process.env.FG_FRAMES_PER_FILM || 3), min: 2, max: 4 },

  paths: {
    root,
    images: path.join(root, 'images'),
    manifest: path.join(root, 'data', 'movies.js'),
    placeholder: path.join(root, 'data', 'movies.placeholder.js'),
    data: path.join(__dirname, 'data'),
    cache: path.join(__dirname, 'data', 'cache'),
    logs: path.join(__dirname, 'data', 'logs'),
    filmlist: path.join(__dirname, 'data', 'filmlist.json'),
    films: path.join(__dirname, 'data', 'films.json'),
    matched: path.join(__dirname, 'data', 'matched.json'),
  },

  match: { accept: 0.55, margin: 0.04, weights: { title: 0.62, year: 0.23, pop: 0.15 }, junkPenalty: 0.10 },

  decoys: { eraBand: 5, voteFloor: 50, voteFraction: 0.05, voteCapMult: 4, poolTop: 12, obscureFloor: 10 },

  // percentile cut points (by vote_count across the whole matched library); most-voted = easiest
  tiers: [
    { key: 'easy', min: 0.80 },
    { key: 'medium', min: 0.55 },
    { key: 'hard', min: 0.30 },
    { key: 'veryhard', min: 0.10 },
    { key: 'cinephile', min: 0 },
  ],
};
