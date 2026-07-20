# ⚡ SQL Quest

A single-player SQL trainer: Duolingo-style skill tree over a real SQL engine
(DuckDB-WASM, fully in-browser) querying datasets worth caring about. The
142-exercise curriculum spans five regions — Foundations, Shaping, Combining,
Analyst Power, and Boss Arenas — across four worlds (Pokémon, Yu-Gi-Oh!,
Digimon, Seattle 311), from SELECT basics through joins, subqueries, and
window functions to multi-step Boss Arena challenges. Daily Review resurfaces
rusty skills on an expanding schedule, and correct queries catch the entities
they return into a collection you build across every world — with real
sprites and card art on the tiles. See
`docs/superpowers/specs/2026-07-18-sql-learning-app-design.md` for the full
design.

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
