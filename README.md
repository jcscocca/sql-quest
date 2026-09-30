# ⚡ SQL Quest

A single-player coding trainer: a Duolingo-style skill tree with multiple
learning **tracks** that share one XP / streak / badge / spaced-review
backbone, all in-browser with no accounts.

- **SQL** (the original) — a real SQL engine (DuckDB-WASM) over datasets worth
  caring about: 142 exercises across five regions (Foundations, Shaping,
  Combining, Analyst Power, Boss Arenas) and four worlds (Pokémon, Yu-Gi-Oh!,
  Digimon, Seattle 311). Correct queries catch the entities they return into a
  collection with real sprite/card art.
- **JavaScript** & **Python** — implement a named function verified by
  in-language test cases (each test is an `{expr, expect}` pair, or `expr` +
  `raises`, evaluated and compared inside the runtime — a Web Worker for JS,
  Pyodide for Python; exercises that mandate a technique, like recursion or
  reduce, enforce it with an AST check on the submission). ~130 exercises
  each across five regions: Foundations,
  Arrays/Lists & Iteration, Objects/Dicts/Maps & Sets, Functions & Classes, and
  Applied Data — grounded capstones over inline Pokémon / Yu-Gi-Oh! / Seattle 311
  datasets (shown in a per-exercise data panel). Pyodide is served from the
  app's own origin, so Python has no CDN dependency either.

Daily Review resurfaces rusty skills from every track on an expanding
schedule — SQL and code drills alike. All tracks share the same backbone:
SQL implements the full `Track` interface in `src/lib/tracks/`, the code
tracks the narrower run/check pair. See
`docs/superpowers/specs/2026-07-22-multi-track-platform-design.md` for the
multi-track design and `2026-07-18-sql-learning-app-design.md` for the
original SQL trainer.

## Run it

Live: https://jcscocca.github.io/sql-quest/ (deployed from main by GitHub Actions)

The app is an installable PWA: the shell precaches on first visit, and engines,
worlds, and sprites are cached as you use them — after that it works offline.

    npm install
    npm run dev        # → http://localhost:5173

## Develop

    npm test           # unit tests (comparator, XP, errors, progress, tracks, JS/Python runtimes, components)
    npm run lint       # Biome (typescript-eslint doesn't support TS 7 yet)
    npm run e2e        # Playwright smoke tests
    npm run validate   # content gate: executes every exercise — SQL on DuckDB, JS in Node, Python in Pyodide
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
