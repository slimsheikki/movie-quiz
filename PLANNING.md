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
- **1,531 films live** (curated from 2,019 — see Phase 2). **5,485 frames**: each film's `frames[0]` is now the
  FILM-GRAB **featured image** (`images/<slug>/0.jpg`, the representative hero still shown in-game), followed by
  the Phase-3-pruned frames as backups. 1,529 films got a featured primary; 2 (Paddington, Foxcatcher) kept old
  frames because the featured image showed the title. Tiers: `easy 307 · medium 382 · hard 383 · veryhard 306 ·
  cinephile 153`. (`?v=6`.) Manifest carries `tmdbId` per film (Letterboxd links).
- **1,854 more films** are matched in TMDb (`tools/data/matched.json`) but frames NOT downloaded —
  film-grab.com throttled our IP under sustained downloading. Resumable later (§7).
- ~168 titles in `tools/data/logs/unmatched.json` (foreign/ambiguous) — could get manual TMDb overrides.

## 5. Game architecture (all in `index.html`)
- **State:** `S = { stage:0, progress:0, streak:0, round:null, seen:[], lastChoices:null }`. `seen` = every film
  shown this game; `lastChoices` = prior round's 4 answer titles (so no option repeats back-to-back).
- **`BANDS[]`** — per-stage config: `{key,name,goal:1000,pMax,pMin,T,sting,color}`. Single source of truth for tuning.
- **`ACTIVE`** — the stages actually played this game (a subset of `BANDS`, in order), chosen via the menu's
  stage-select chips. `S.stage` indexes `ACTIVE`. All game logic (progression, ladder, win, relegation, theming)
  uses `ACTIVE`; only the chip builder and `ACTIVE` derivation read `BANDS` directly.
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
- **Menu:** the ENTER CINEMA ticket **tears in half** (jagged clip-path) to start.
- **Reveal popup:** shows the movie image + Correct/Wrong + ±points + title/year/director/country + **NEXT** button.

## 8. Data pipeline (`tools/`)
Stages (run via `node run-all.js` or individually): `scrape-filmgrab.js` → `match-tmdb.js` →
`download-frames.js` → `build-manifest.js`. Resumable & cached (HTML pages, TMDb JSON, discover).
- `tools/.env` holds TMDb creds + politeness (`FG_DOWNLOAD_CONCURRENCY=3` for gentle resume).
- **Enumeration:** FILM-GRAB sitemaps → ~4,051 film pages. **Matching:** title+year+popularity scoring vs TMDb.
- **Difficulty:** percentile of TMDb `vote_count` across the matched library.
- **To finish the parked 1,854** (after throttle cooldown):
  `cd tools && node download-frames.js && node build-manifest.js` then bump `?v=` in `index.html`.

## 9. Gotchas
- `MOVIES` is a global from `data/movies.js` (a classic `<script>`, not a module).
- Canvas internal size is fixed 640×360; CSS scales it — keep the framewrap 16:9 so the canvas isn't distorted
  (the letterbox handles non-16:9 stills inside).
- film-grab throttles sustained concurrent downloads — keep concurrency low on resume.

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
    a circular `.tick` stub that fills when on). Default all on, ≥1 always enforced. `enterCinema()` locks the selection into `ACTIVE` (a subset of
    `BANDS`) and resets `S`. The whole game now indexes `ACTIVE`, not `BANDS`: ladder shows only chosen stages
    ("Stage 1 / N"), win fires on clearing the last active stage, relegation falls back within `ACTIVE`, and the
    win screen themes/labels to the final active stage. `BANDS` stays the master tuning config + menu source.

## 11. Verification habit
After UI changes, verify in the browser preview at desktop (1440×900) **and** mobile (375×667 + a taller phone),
check `preview_console_logs` for errors, and confirm no horizontal scroll / clipping.
