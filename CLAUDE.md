# SQL Quest — agent notes

Single-player coding trainer (SQL / JavaScript / Python tracks) — React 19 + Vite,
all in-browser, no backend. See README.md for the product overview and
docs/superpowers/specs/ for per-feature design docs.

## Commands

- `npm test` — unit tests (vitest, node env; component tests use a per-file jsdom pragma)
- `npm run lint` — Biome (linting; the repo intentionally has no formatter pass)
- `npm run e2e` — Playwright smoke suite
- `npm run validate` — content gate: executes every exercise (SQL on DuckDB, JS in Node, Python in Pyodide). **Must pass before committing content changes.**
- `npm run build` — typecheck (`tsc --noEmit`) + production build

## Architecture

- Tracks plug into one XP/streak/badge/review backbone via the `Track` interface
  in `src/lib/tracks/`. Adding a track means implementing that interface — the
  backbone (`progress.ts`, `xp.ts`, `review.ts`) should not need changes.
- Runtimes: DuckDB-WASM bundled locally (`src/lib/duckdb.ts`), JS in a Web Worker
  (`js-worker.ts`), Python via Pyodide served from `/pyodide/` on our own origin
  (`py-worker.ts` — do not reintroduce a CDN fetch; the app is offline-capable).
- Content is data, not code: `public/content/skills.json` (tree),
  `public/content/exercises/<skill>.json` (banks, **append-only** — never renumber
  or remove existing exercise ids), `public/worlds/<world>/` (Parquet + schema).
  Adding content must never require app-code changes.
- Progress lives in IndexedDB (idb-keyval); tests use fake-indexeddb.

## Conventions

- TypeScript strict; no semicolons, single quotes, 2-space indent (match what's there).
- Smallest diff that works; comment density in this repo is low and deliberate.
- Conventional-commit subjects (`fix:`, `feat:`, `test:`, `docs:`).
- CI (.github/workflows/deploy.yml) gates deploys on unit tests + validate + build.
