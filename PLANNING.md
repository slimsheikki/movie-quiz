# Ciné Quiz — Project Planning & Handoff

> **Resuming in a new conversation?** Read this file. All work is on disk — resetting the chat loses
> only conversation context, not the project. Project root: `/Users/samywilkman/CLAUDE/movie-quiz/`

---

## 1. What it is
A buildless, single-file web game: guess a film from one FILM-GRAB still via 4 multiple-choice answers.
Race a per-stage bar through five difficulty stages (Easy → Medium → Hard → Very Hard → Cinephile).
Vintage "ADMIT ONE" cinema-ticket aesthetic, mint-green-on-black. Built for the user's girlfriend (a cinephile)
to play on a laptop; also works on mobile.

## 2. Run & verify
```bash
cd /Users/samywilkman/CLAUDE/movie-quiz
python3 -m http.server 8000      # → open http://localhost:8000  (maximize window = desktop layout)
```
- Double-clicking `index.html` also works offline.
- **Cache gotcha:** the game loads `data/movies.js?v=N` via a versioned `<script>` tag. After regenerating
  `data/movies.js`, bump the `?v=` number in `index.html` (currently `v=2`) so the browser reloads it.
  When testing via preview, navigate with `?v='+Date.now()` to bust `index.html` itself.

## 3. File map
- `index.html` — **the entire game** (HTML + CSS + vanilla JS, zero deps). All game logic lives here.
- `data/movies.js` — generated manifest: `const MOVIES = [{title,year,director,country[],difficulty,decoys[],frames[]}]`
  (`decoys` are legacy/unused now — decoys are randomized at runtime). Also `module.exports` for Node.
- `data/movies.placeholder.js` — original 10-film placeholder (SVG scenes), kept as backup.
- `images/<slug>/1.jpg…3.jpg` — real FILM-GRAB frames.
- `tools/` — offline acquisition pipeline (Node, zero deps, never shipped). See §7.
- `.claude/launch.json` — preview dev-server config.

## 4. Current state (data)
- **3,784 films live**: **2,750 core** (always on) + **1,034 obscure** (gated by the obscurity slider, routed only
  into Very Hard 417 / Cinephile 617, tagged `obscure:true` + `obs` 0–100). At slider 0 only the 2,750 core play,
  so the default game = the curated set. **~13,500 frames**. Each film's `frames[0]` is the
  FILM-GRAB **featured image** (`images/<slug>/0.jpg`, the representative hero still shown in-game), followed by
  the Phase-3-pruned frames as backups. 4 films (Paddington, Foxcatcher, Selma, Asteroid City) kept old frames
  because the featured image showed the title. Total tiers (core+obscure):
  `easy 550 · medium 688 · hard 687 · veryhard 967 · cinephile 892`; core-only (slider 0): `easy 550 · medium 688 ·
  hard 687 · veryhard 550 · cinephile 275`. (`?v=10`.) Manifest carries `tmdbId` per film (Letterboxd links).
  Pipeline: `curate → fetch-featured → analyze-frames → prune-frames --apply → set-primary`.
- **Whole FILM-GRAB catalog now ingested (2026-06-22):** the 1,854 previously-parked matched films were downloaded
  in 5 batches via `download-frames.js --batch=N --batches=5` and run through the full pipeline. Every matched film
  (3,873) has frames; 3,785 survive curation (7 dropped for missing rating, rest collapse under same-title dedup).
- **Match corrections (`tools/fix-matches.js` + `tools/detect-mismatches.js`):** FILM-GRAB pages matched to the wrong
  TMDb film (same title/franchise, or original-vs-remake). **`detect-mismatches.js`** runs the two detector sweeps:
  (a) multiple slugs sharing one `tmdbId`, (b) FILM-GRAB page "Year:" (the VISIBLE year text — the `category/<year>/`
  HREF is a site tag, not the film year) vs assigned year differing by ≥N (`--min=`). Findings → `logs/mismatches.json`.
  `fix-matches.js` holds a `slug → correct tmdbId` map (`FIXES`) + a `DROP` list (slugs with no TMDb *movie* entry).
  - **Round 1 (pre-expansion):** 6 fixes — blade-runner-2049 (→2049 2017), shame-2 (→Bergman 1968), the-silence
    (→Bergman 1963), the-return (→Zvyagintsev 2003), spider (→Cronenberg), love (→Eubank 2011).
  - **Round 2 (2026-06-22, post-expansion):** 17 director-verified fixes incl. 8-12 (→Fellini's 8½), stereo
    (→Cronenberg), the-hunchback-of-notre-dame (→Worsley 1923), the-texas-chainsaw-massacre (→Hooper 1974, also
    fixed the lone tmdbId collision), detective (→Godard 1985), boy (→Waititi 2010), the-day-after (→Hong 2017),
    i-spit-on-your-grave/magic/the-toxic-avenger (original↔remake swaps), etc. **Dropped 4** Steve McQueen *Small
    Axe* films (mangrove, lovers-rock, red-white-blue explicitly; education auto-filtered for 0 votes) — TMDb
    catalogs them as TV episodes, so no movie id / no vote data. Re-run `detect-mismatches.js` after any expansion.
- **The 1,854 parked films are DONE** (downloaded + integrated, see above). The only films still outside the game:
  ~168 titles in `tools/data/logs/unmatched.json` (foreign/ambiguous) — could get manual TMDb overrides.
- **FILM-GRAB download gotchas (learned the hard way — NOT a simple IP throttle):**
  1. **Concurrent tarpit:** film-grab accepts CONCURRENT connections from a repeat IP then stalls the response
     forever (no 429, no reset — the socket just hangs). This is what looked like "throttling" before. **Serial
     access (concurrency 1) works flawlessly** — all 1,854 + 1,802 featured fetched at ~1/s with 0 failures.
     `download-frames.js` & `fetch-featured.js` now default `FG_DOWNLOAD_CONCURRENCY=1` + a per-fetch
     `AbortController` timeout (`FG_FETCH_TIMEOUT_MS`, 15s) so a stalled socket aborts→retries instead of deadlocking.
  2. **HTML-entity URLs:** scraped frame/og:image URLs carry entities (e.g. `Child&#039;s_Play` → apostrophe).
     Left encoded the server returns 200 with an HTML page (not an image), so the film silently gets 0 frames.
     Both scripts now `decodeEntities()` before fetching. (Only ~17 films hit this, but they failed invisibly.)
  - `tools/data/batch-plan.json` freezes the 5-way split so `--batch=N` is stable across runs; delete it to re-plan.

## 5. Game architecture (all in `index.html`)
- **State:** `S = { stage:0, progress:0, streak:0, round:null, seen:[], lastChoices:null }`. `seen` = every film
  shown this game; `lastChoices` = prior round's 4 answer titles (so no option repeats back-to-back).
- **`BANDS[]`** — per-stage config: `{key,name,goal:1000,pMax,pMin,T,sting,color}`. Single source of truth for tuning.
- **`ACTIVE`** — the stages actually played this game (a subset of `BANDS`, in order), chosen via the menu's
  stage-select chips. `S.stage` indexes `ACTIVE`. All game logic (progression, ladder, win, relegation, theming)
  uses `ACTIVE`; only the chip builder and `ACTIVE` derivation read `BANDS` directly.
- **Obscurity slider** — module var `obscurity` (0–100, locked from the menu slider at `enterCinema`, default 0).
  `eligible(m) = !m.obscure || (obscurity>0 && m.obs<=obscurity)`. `pickMovie` + `makeChoices` (decoys) filter
  Very Hard / Cinephile pools through it, so answer **and** wrong options scale together. At 0, only core films →
  default game unchanged. Easy/Medium/Hard have no obscure films, so they're unaffected at any level.
- **Progression (current rules):**
  - Every stage fills a **1000-point bar**. Clear it → promote, bar carries overflow into next stage.
  - **Diminishing points-per-answer** so later stages take longer: Easy ~240/answer (~4–5 answers) …
    Cinephile ~75/answer (~15+). Whole game ≈ 45–65 rounds (~15–25 min).
  - **Speed matters:** pot decays from `pMax`→`pMin` over `T` seconds; answer fast = more.
  - **Streak bonus:** `×(1 + 0.05·min(streak,4))`.
  - **Relegation:** a wrong answer subtracts `sting`; if `progress < 0` you **fall back a stage**
    (land near the top of the previous stage, carrying the deficit). Easy is the floor.
- **Answers:** `makeChoices(movie, band, avoid)` builds 3 **random decoys every round** from the **same tier +
  similar era (±15y)** — fair but never the same set twice. `avoid` = last round's 4 titles, so **no answer option
  repeats back-to-back** (relaxes only if a tier is too small to fill 3, which never happens at current sizes).
  `pickMovie()` excludes `S.seen` → **no movie repeats within a game**.
- **Frame draw:** each round shows `movie.frames[0]` — the FILM-GRAB featured still (representative image), not
  a random frame. Canvas `draw()` **letterboxes** the still (contain) so aspect ratio is preserved (no squeezing).

## 6. Design system
- Palette: bg `#0a0c0c`, ink `#0a0c0c`, default green `#c6f0c0`. `--good #147a3a`, `--bad #b3261e`.
- **Per-stage pastel palettes** (whole UI recolors per stage): easy mint `#c6f0c0` · medium butter `#efe6a0`
  · hard apricot `#f2cb9f` · veryhard rose `#efb1ab` · cinephile lilac `#cdbef0`.
  `--stock` + `--cyan` are set to the current stage color each round.
- Fonts: `--cond` (Arial Narrow stack, uppercase chrome) + `--serif` (Georgia, film titles & answers).
- Ticket motif: `.stock` surfaces get scalloped edges via JS-built `.scallop` arch rows (top/bottom for cards,
  left/right `.sideways` for the rank ladder). Dashed `.perf` separators, serial number, footer.
- **Confetti:** tiny movie-ticket pieces (`.confetti-ticket`) burst on promotion (`confettiBurst`); bigger on win.
  Respects `prefers-reduced-motion`.

## 7. Layouts & interactions
- **Desktop (`@media min-width:1000px`)** — "projection/auditorium": full-width marquee (rank ladder) on top,
  giant letterboxed still as hero on black, 4 numbered "seat" choices in a row. Keyboard: **1–4** answer, **Enter** next.
- **Mobile (`@media max-width:999px`)** — fits **one screen, no scroll**: compact rank bar + letterboxed frame +
  pot + **2×2 answer grid**. ADMIT ONE/Nº stub, hint, and footer hidden to save space. Reveal popup tuned to fit.
  The game ticket sizes to its content (`flex:0 1 auto` + `margin:auto 0`) and centres vertically rather than
  stretching full-height — generous element padding/gaps, balanced dark margins above/below.
- **Menu:** the ENTER CINEMA ticket **tears in half** (jagged clip-path) to start.
- **Reveal popup:** shows the movie image + Correct/Wrong + ±points + title/year/director + Letterboxd link + **NEXT** button. (Country removed.)

## 8. Data pipeline (`tools/`)
Stages (run via `node run-all.js` or individually): `scrape-filmgrab.js` → `match-tmdb.js` →
`download-frames.js` → `build-manifest.js`. Resumable & cached (HTML pages, TMDb JSON, discover).
- `tools/.env` holds TMDb creds + politeness (`FG_DOWNLOAD_CONCURRENCY=1` — serial; see §4 gotchas — plus
  `FG_IMAGE_DELAY_MS=400`).
- **Enumeration:** FILM-GRAB sitemaps → ~4,051 film pages. **Matching:** title+year+popularity scoring vs TMDb.
- **Difficulty:** percentile of TMDb `vote_count` across the matched library.
- **Whole catalog downloaded (2026-06-22):** nothing parked remains. To re-pull or extend, `download-frames.js`
  supports `--batch=N --batches=M` (frozen plan in `tools/data/batch-plan.json`) and `--slugs=a,b,c` / `--limit=N`.

## 9. Gotchas
- `MOVIES` is a global from `data/movies.js` (a classic `<script>`, not a module).
- Canvas internal size is fixed 640×360; CSS scales it — keep the framewrap 16:9 so the canvas isn't distorted
  (the letterbox handles non-16:9 stills inside).
- film-grab **tarpits CONCURRENT** downloads (hangs the socket, no error) — keep `FG_DOWNLOAD_CONCURRENCY=1`. See §4.
- Scraped URLs carry HTML entities (`&#039;` etc.) — both download scripts `decodeEntities()` before fetching. See §4.

## 10. Backlog (agreed phased plan)
**Working protocol:** for each task → review, summarize, ask **Y/N**, then do it. Heavy image work runs
*after* the library is finalized (don't process images for films we'll cut).

- **Phase 1 — DONE:** NEXT rename · image in reveal popup · letterbox (no squeeze) · mobile one-screen ·
  no-repeat-per-game · reveal popup sizing fix.
- **Phase 2 — DONE (library curation):** `tools/curate.js` (network-free; reads `matched.json`) → 2,019 → **1,531**.
  Inclusion floor `vote_count ≥ 200 && vote_average > 0` (−473) · dedup same-title keeping highest vote_count
  i.e. "most seen" (−15; manual override keeps *Funny Games 1997* over the 2008 remake) · re-tier by blended
  `0.6·z(log vote_count) + 0.4·z(vote_average)` (rewards acclaim, not just popularity). `node curate.js [--dry]`.
  Also fixed: **no answer option repeats back-to-back** (see §5). Same-title films are collapsed because two
  identical answer options would be unanswerable.
- **Phase 3 — Image processing (local part DONE):** OCR + face/person detection over all frames via Apple's
  **Vision framework** — zero deps (`tools/vision.swift` → compiled `vision-bin`, gitignored; never shipped).
  `node analyze-frames.js` caches per-frame results to `tools/data/vision.json` (resumable, ~16 frames/s).
  `node prune-frames.js` (review by default; `--apply` to write) drops **title-giveaway frames** (9 found —
  strict OCR match, skips ultra-short titles) and **person-less frames** where the film keeps ≥2 with people,
  honoring a floor of 2. Report → `tools/data/logs/prune-frames.json`.
  - **Featured/primary image — DONE (this was the "thumbnail" task, reinterpreted).** Each film's FILM-GRAB
    **featured image** (the large hero still at the top of its page = `og:image`) is downloaded as
    `images/<slug>/0.jpg` and set as the primary frame shown in-game — these are hand-picked to represent the film,
    unlike our random samples. Pipeline: `node fetch-featured.js` (URLs read from cached pages = offline; only image
    bytes hit film-grab.com; concurrency 3, resumable, → `data/featured.json`) → `node analyze-frames.js` (now also
    OCR-checks each `0.jpg`) → `node set-primary.js` (prepends `0.jpg` to `frames[]`; skips promotion if OCR shows
    the title). Result: 1,531/1,531 downloaded (0 fail), 1,529 promoted, 2 fell back (Paddington, Foxcatcher).
- **Phase 4 — Features:**
  - **Letterboxd link on reveal — DONE.** `#rvLb` anchor in the reveal popup → `letterboxd.com/tmdb/<tmdbId>`
    (`target=_blank`; auto-opens the app on mobile via universal links). Hidden if a film lacks `tmdbId`.
    Required adding `tmdbId` to the manifest (now emitted by `curate.js` + `prune-frames.js`).
  - **Difficulty-select menu — DONE.** Five color-coded `.schip` toggles under the menu ticket ("Choose your
    stages"), each styled as a **mini movie ticket** (CSS radial-gradient notched ends + dashed `.perf` +
    a circular `.tick` stub that fills when on). Default all on, ≥1 always enforced. All five sit on **one row**
    (natural-width chips; on narrow phones `@media(max-width:560px)` drops the perforation + shrinks the font to fit). `enterCinema()` locks the selection into `ACTIVE` (a subset of
    `BANDS`) and resets `S`. The whole game now indexes `ACTIVE`, not `BANDS`: ladder shows only chosen stages
    ("Stage 1 / N"), win fires on clearing the last active stage, relegation falls back within `ACTIVE`, and the
    win screen themes/labels to the final active stage. `BANDS` stays the master tuning config + menu source.
  - **Obscurity slider — DONE.** Range input under the chips (0–100%, default 0). Sliding up surfaces rarer films
    in Very Hard & Cinephile only. Data: `curate.js` keeps sub-floor films (was dropping 467) tagged `obscure`+`obs`
    (within-pool obscurity percentile); runtime `eligible()` gates them by the slider. See §5. Builds on the current
    library; the parked-1,854 expansion (B) would deepen the obscure pool automatically.

## 11. Verification habit
After UI changes, verify in the browser preview at desktop (1440×900) **and** mobile (375×667 + a taller phone),
check `preview_console_logs` for errors, and confirm no horizontal scroll / clipping.

## 12. Shared online leaderboard (PLANNED — not built yet)
**Goal:** a shared, persistent high-score board for the GitHub Pages site (live at `slimsheikki.github.io`).
GitHub Pages is **static** (can't store data), so scores live in a free hosted DB the page reaches over plain
HTTPS `fetch` — **no SDK**, keeping the zero-dep/buildless ethos. Chosen backend: **Supabase** (free tier, Postgres
+ auto REST/PostgREST). Firebase Firestore is a viable alternative; Supabase picked for the plain-REST simplicity.

### Decisions still open (confirm with user before building)
- **Score metric** — the game has **no cumulative score today** (each stage resets its 1000 bar on promotion).
  Need to add a running total. *Recommended:* `S.total` = sum of every `delta` earned across the run; rank by that,
  show name + ✦ if they reached Cinephile. (Alternatives: fastest win / fewest rounds; highest stage reached.)
- **Comparability** — stages + obscurity are toggleable, so runs aren't equal. Either (a) only submit "full runs"
  (all 5 stages, obscurity 0), or (b) store the config per row and show it. *Lean (a) for a clean board.*
- **Name entry** — prompt on the win screen; prefill from `localStorage('cq_name')`.

### One-time setup (user's part — needs a Supabase account, ~10 min)
1. supabase.com → new free project. From Settings → API copy **Project URL** + **anon/publishable key**
   (both are public-safe by design; the anon key is meant to ship in client code).
2. SQL editor — create the table:
   ```sql
   create table scores (
     id bigint generated always as identity primary key,
     name text not null,
     score int not null,
     won boolean default false,
     reached text,            -- highest stage reached
     obscurity int default 0,
     created_at timestamptz default now()
   );
   ```
3. Enable **Row Level Security** + two policies: anon **SELECT** (read board) and anon **INSERT** (submit).
   Optional `CHECK (score between 0 and <sane_max>)` + `length(name) <= 24` to blunt obvious fakes.
4. (Optional, later) a Supabase **Edge Function** to validate scores server-side = real anti-cheat.

### Client wiring (in `index.html`, plain `fetch`, zero deps)
- Constants near top of the game script: `const SUPA_URL="https://<proj>.supabase.co", SUPA_KEY="<anon key>";`
- **Submit (on win):** `POST ${SUPA_URL}/rest/v1/scores`
  headers `{ apikey:SUPA_KEY, Authorization:"Bearer "+SUPA_KEY, "Content-Type":"application/json", Prefer:"return=minimal" }`
  body `JSON.stringify({ name, score, won, reached, obscurity })`.
- **Read top:** `GET ${SUPA_URL}/rest/v1/scores?select=name,score,won,reached&order=score.desc&limit=20`
  (same `apikey`/`Authorization` headers).
- **In-game:** track `S.total += delta` on each correct answer (add to `answer()`); reset in the new-game/again paths
  alongside `S.stage=0` etc.
- **UI:** a "Hall of Fame" list on the win screen (and optionally the menu); a name `<input>` on the win screen.
  Bump `?v=` only if `data/movies.js` changes (leaderboard is index.html-only, no data change).

### Caveats
- The anon key + direct browser INSERT means scores are **spoofable by a technical user** — acceptable for a game
  shared with friends/family; RLS + CHECK stop casual abuse; Edge Function = true anti-cheat if ever wanted.
- Supabase allows browser origins (CORS) by default — no extra config for GitHub Pages.

## 13. Session handoff (as of this conversation)
Everything below is **DONE** locally (`data/movies.js?v=10`); **commit + push to deploy** to `slimsheikki.github.io`:
- Phases 1–4 complete (see §10). **Library expansion DONE (2026-06-22):** the whole FILM-GRAB catalog is now in the
  game — **3,784 films** (2,750 core + 1,034 obscure), ~13,500 frames, `frames[0]` = FILM-GRAB featured image.
  Manifest carries `tmdbId`, `obscure`, `obs`. The 1,854 parked films were downloaded (5 batches) + run through the
  full pipeline. Two real bugs found & fixed along the way (concurrent tarpit, HTML-entity URLs — see §4 gotchas).
- **Wrong-match re-sweep DONE (2026-06-22):** `tools/detect-mismatches.js` (new, reusable) found post-expansion
  mismatches → **17 director-verified fixes + 4 Small Axe drops** applied + pipeline re-run. 0 duplicate tmdbIds
  remain. See §4 "Match corrections". (Re-run the detector after any future expansion.)
- **Mobile menu-tear fix:** difficulty chips + obscurity slider now fade out with the ticket instead of lingering
  ~0.5s (CSS `#menuOv.ripping .stagepick/.obscurity{opacity:0}`).
- **Difficulty chips** on one row; **obscurity slider** (0–100%); **country removed** from reveal popup;
  mobile game card content-sized + centered.

**Pipeline order (full rebuild):** `node curate.js` → `node fetch-featured.js` → `node analyze-frames.js`
→ `node prune-frames.js --apply` → `node set-primary.js`, then bump `?v=` in `index.html`. (All resumable/cached;
`download-frames`/`fetch-featured` hit the network — **run serial**, ~1/s, 0 failures last run.)

**Next candidate tasks (not started):**
- **Leaderboard** (§12) — decide score metric + comparability, then build (mostly index.html; Supabase setup needs user).
- **~168 unmatched titles** (`tools/data/logs/unmatched.json`) — manual TMDb overrides to pull in the last stragglers.
- **Low-priority match cleanup:** `the-secret-son` (Garrel, not live) left unfixed; a long tail of Δ2–4 page-vs-assigned
  year gaps in `logs/mismatches.json` is mostly festival-vs-release noise (verify before touching).
