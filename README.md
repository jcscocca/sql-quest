# ⚡ SQL Quest

A single-player coding trainer: a Duolingo-style skill tree with multiple
learning **tracks** that share one XP / streak / badge / spaced-review
backbone, all in-browser with no accounts.

- **SQL** (the original) — a real SQL engine (DuckDB-WASM) over datasets worth
  caring about: 142 exercises across five regions (Foundations, Shaping,
  Combining, Analyst Power, Boss Arenas) and four worlds (Pokémon, Yu-Gi-Oh!,
  Digimon, Seattle 311). Correct queries catch the entities they return into a
  collection with real sprite/card art; Daily Review resurfaces rusty SQL
  skills on an expanding schedule.
- **Systems Design** — decision drills and guided case-builds grounded in
  public-sector / police data engineering (CAD ingestion, ALPR retention,
  CJIS, NIBRS). Multiple-choice answer-check; no code execution.
- **JavaScript** & **Python** — implement a named function; it runs in-browser
  (a Web Worker for JS, Pyodide for Python) against test cases. Python fetches
  Pyodide from a CDN on first run (the app's only online dependency).

Every subject plugs into the same backbone through a `Track` interface
(`src/lib/tracks/`). See
`docs/superpowers/specs/2026-07-22-multi-track-platform-design.md` for the
multi-track design and `2026-07-18-sql-learning-app-design.md` for the
original SQL trainer.

## Run it

Live: https://jcscocca.github.io/sql-quest/ (deployed from main by GitHub Actions)

    npm install
    npm run dev        # → http://localhost:5173

## Develop

    npm test           # unit tests (comparator, XP, errors, progress)
    npm run e2e        # Playwright smoke tests
    npm run validate   # content gate: verifies every exercise against DuckDB
    npm run build      # typecheck + production build

## Content

- `public/content/skills.json` — curriculum tree (regions → skills → lessons)
- `public/content/exercises/<skill>.json` — exercise banks (append-only)
- `public/worlds/<world>/` — Parquet data + schema.json per world
- `npm run build:world` — rebuild the Pokémon world from PokéAPI CSV dumps
- `public/sprites/<world>/` — bundled tile art + name→file manifest;
  `npm run build:sprites` rebuilds (append-only; validate enforces coverage)

Adding content never requires app-code changes. All content must pass
`npm run validate` before committing. Sprite and card art is sourced from
fan databases (PokéAPI sprites, YGOPRODeck card images, DAPI) for personal,
non-commercial use.

## Progress

Stored in IndexedDB (no accounts). Export/Import buttons on the home screen
back up progress as JSON.

**Free roam** — a header toggle that opens every skill regardless of prerequisites, for
practice outside the progression order. Off by default. It only changes what you can open:
anything you actually solve in a roamed skill still earns XP, can complete the node, and
enters the Daily Review rotation exactly as it would in order.
