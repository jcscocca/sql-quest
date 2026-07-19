# World Swap: Drop Movies, Add Digimon — Design Spec

**Date:** 2026-07-19
**Status:** Approved design, pre-implementation
**Sequencing:** lands before the collection-sprites project (`2026-07-19-collection-sprites-design.md`), whose Digimon sprite pack depends on this world existing.

## What this is

The app's final world lineup becomes Pokémon, Yu-Gi-Oh, and Digimon (the franchise collection worlds) plus Seattle 311 (the data-only civic world for date/time-series skills). Movies is removed entirely; Digimon takes over exactly the three curriculum slots Movies held: `cte`, `window-ranking`, and the third Boss Arena.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Lineup | Pokémon, Yu-Gi-Oh, Digimon + Seattle 311 kept as data-only (only real time-series data; never on the collection page) |
| Digimon source | DAPI (digi-api.com) — 1,488 Digimon, Wikimon-sourced, per-Digimon detail records with levels/types/attributes/release year/evolution links and images |
| Digimon footprint | Movies' exact slots only: `cte`, `window-ranking`, `arena-movies`→`arena-digimon` (17 exercises reauthored). Finished regions untouched. |
| recursive-cte | Stays on Pokémon's clean `evolves_from` tree. Digimon's evolution data is a dense many-to-many graph with cycles — used for joins/CTE material, not recursion, to avoid timeout-prone exercises. |
| Entity label | `labelColumn: attribute` (Vaccine/Virus/Data/Free) for tile tints |
| Old progress | Kept: XP, streaks, mastery/completion on `cte`/`window-ranking` (skill ids stable). Movies collection entries dropped by a load-time migration. |

## Components

### 1. Digimon world builder — `scripts/build-digimon-world.ts`

- Fetch the DAPI list endpoint page by page, then each Digimon's detail record (`/api/v1/digimon/<id>`) once into `data-src/digimon/<id>.json` — skip-if-exists, throttled (≤5 req/sec). ~1,488 records, small JSON each.
- Transform (in JS, then DuckDB `read_json_auto` → Parquet, matching the Yu-Gi-Oh builder's pattern) into `public/worlds/digimon/`:
  - **`digimon`** — id BIGINT, name VARCHAR, level VARCHAR, type VARCHAR, attribute VARCHAR, x_antibody BOOLEAN, release_year BIGINT. DAPI returns levels/types/attributes as arrays; take the first entry, NULL when empty. `releaseDate` → release_year (BIGINT year, NULL when absent).
  - **`evolutions`** — from_id, from_name, to_id, to_name, condition. One directed edge per `nextEvolutions` entry; `''` conditions → NULL. Edges whose target id has no digimon row are dropped (log the count).
- `schema.json`: world `digimon`, display name `Digimon`, entity `{ table: 'digimon', column: 'name', labelColumn: 'attribute' }`, both tables' columns documented.
- Sanity checks printed by the builder: total row counts; Agumon exists as a Child-level Vaccine Reptile; an Agumon → Greymon edge exists; release_year min is 1997 and max is ≥ 2015.

### 2. Curriculum changes

- `skills.json`: Analyst Power region `world: movies` → `digimon`; `cte` and `window-ranking` get `world: digimon` and freshly authored lessons (intro teaching against real digimon/evolutions columns, runnable `exampleSql`, wrapUp bridging onward). `arena-movies` becomes `arena-digimon` (name, world, lesson) with the same `requires`.
- New banks, authored through the harness under the Stage 3 binding rules (6 per skill, arena 5, globally unique ids — arena ids `ad-*`):
  - **cte** (6): multi-step CTEs over digimon + evolutions — e.g. per-level attribute counts feeding a filter, evolution fan-out via a CTE then join, staged filtering of X-Antibody lines.
  - **window-ranking** (6): RANK/DENSE_RANK/ROW_NUMBER/NTILE over release_year within level, level populations, evolution out-degree — real numeric ordering via release_year and counts.
  - **arena-digimon** (5): multi-step business-style questions mixing joins, CTEs, and windows over the evolution graph (dynamic catching stays active; the arena badge remains the primary prize).
- Exercise XP follows the established region scale (Analyst Power levels, arena 20).
- `styles.css` gains tile colors for the digimon labels (`type-vaccine`, `type-virus`, `type-data`, `type-free`, `type-variable`) in the existing type-color section, so digimon catches render tinted text tiles from day one (the sprite project restyles tiles later).

### 3. Movies removal + progress migration

- Delete: `public/worlds/movies/`, `data-src/movies*` (the MovieLens zip and extraction), `scripts/build-movies-world.ts`, the `build:movies` package script, and the old `cte`/`window-ranking`/`arena-movies` banks (replaced in place for the two skills; `arena-movies.json` removed, `arena-digimon.json` added).
- Progress migration (load-time, additive schema — version unchanged, consistent with prior migrations): drop collection entries with `world === 'movies'`; leave everything else intact. Stale solved-exercise ids inside skill state are inert and need no cleanup. `arena-movies` skill state, if any, is dropped with its skill (id disappears from the curriculum; the migration also removes that orphaned skill entry to keep exports clean).
- Spec sync: the master design spec's world table row for Movies is replaced by Digimon (source, tables, entity); README's region/world paragraph updated.

## Error handling

- Builder: DAPI fetch failures retry twice, then BLOCKED report — no synthetic data, matching the Seattle 311 rule.
- Migration: purely subtractive; export/import round-trips the migrated shape.

## Testing

- Unit: migration test — a seeded save with movies collection entries and `arena-movies` skill state loads with both gone and everything else intact.
- Content gate: `npm run validate` green at 142 exercises (17 removed, 17 added); every new reference and hint-3 run through the real comparator (throwaway script, Stage 3 technique).
- e2e: suite stays green; any test referencing movies content (to be confirmed during planning) is updated to digimon equivalents.
- Full gate: `npm test && npm run validate && npm run build && npm run e2e`.

## Out of scope

- Digimon sprites and all collection-page art (the collection-sprites project, which runs after this).
- Any change to Foundations/Shaping/Combining content, the review scheduler, or app machinery — this is a content + builder + migration project.
