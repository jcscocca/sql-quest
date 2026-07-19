# ⚡ SQL Quest

A single-player SQL trainer: Duolingo-style skill tree over a real SQL engine
(DuckDB-WASM, fully in-browser) querying datasets worth caring about — starting
with Pokémon. See `docs/superpowers/specs/2026-07-18-sql-learning-app-design.md`
for the full design.

## Run it

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

Adding content never requires app-code changes. All content must pass
`npm run validate` before committing.

## Progress

Stored in IndexedDB (no accounts). Export/Import buttons on the home screen
back up progress as JSON.
