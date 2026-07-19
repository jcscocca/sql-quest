# SQL Quest — Design Spec

**Date:** 2026-07-18
**Status:** Approved design, pre-implementation
**Working title:** SQL Quest (directory: `sql-learning-app`)

## What this is

A single-user, desktop-web SQL trainer for Jacob — a data analyst/engineer who wants ground-up SQL fluency (fundamentals through window functions) in an engaging, game-shaped package. Duolingo-style skill tree and progression mechanics wrapped around a real SQL editor running real queries against datasets he actually finds fun: Pokémon, Yu-Gi-Oh, movies/music, and civic open data.

**Success looks like:** regular (near-daily) practice sessions that stick, and — the real goal — translating business questions into multi-step SQL at work without freezing or constant googling.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Skill gap | All areas: fundamentals, joins/subqueries, window functions/CTEs, real-world fluency |
| Engagement hooks | Game mechanics (XP, streaks, unlocks) + genuinely interesting data |
| Data domains | Nerdy franchises (Pokémon, Yu-Gi-Oh, Digimon), civic/open data, movies/music/pop culture |
| Platform | Desktop web, real typing in a proper SQL editor (no mobile/tap-to-build) |
| Dialect | Generic/transferable — DuckDB (Postgres-flavored) chosen for zero-backend practicality |
| Content strategy | Hybrid: hand-designed curriculum skeleton, AI-pre-generated exercise banks, static at runtime |
| Progression | Skill tree with unlocks + mastery decay and spaced-repetition review |
| Architecture | Approach A: fully static client-side app, built in MVP-sized stages |
| Exercise screen | IDE-style layout (Option A): prompt/hints/schema left, editor+results right |

## Game design

### Skill tree

Five regions of skill nodes with unlock edges:

1. **Foundations** — SELECT, WHERE, ORDER BY/LIMIT, DISTINCT, basic aggregates
2. **Shaping** — GROUP BY/HAVING, CASE, string/date functions, NULL handling
3. **Combining** — inner/left/self joins, set operations, subqueries, correlated subqueries
4. **Analyst Power** — CTEs, window functions (ranking, offsets, frames), recursive CTEs
5. **Boss Arenas** — multi-step real-business questions mixing everything

### Lesson anatomy

Each skill node: short concept intro with a runnable example → 6–10 exercises in the editor → wrap-up explanation.

- **Checking is results-diff**: the user's query and a hidden reference query both execute in DuckDB; matching result sets = correct. Order-insensitive unless the skill under test is ORDER BY. Column order-insensitive; float tolerance; NULL-aware.
- **Hint ladder**: 3 steps (nudge → relevant syntax → full walkthrough), costs XP to use.

### Mastery + spaced repetition (mechanics finalized 2026-07-19)

- Each skill has mastery 0–5 plus SM-2-lite scheduling state: `interval` (days) and `due` (date). Completing a node sets mastery 3, interval 2, due = today + 2. Skills completed before scheduling existed are backfilled (interval 2, due immediately) on first load.
- A skill past `due` is rusty: its **displayed** mastery drops one level when it comes due, then one more per full overdue interval (floor 1). Stored mastery only changes on review — decay is pressure, not punishment.
- **Daily Review** assembles up to 8 exercises from the most-overdue skills, round-robin so no skill dominates, taking at most 2 exercises per skill per session, re-serving exercises from their banks (mixing worlds once more exist). Reviewing a skill successfully (its session exercises correct without hints): mastery +1 (max 5), interval ×2 (cap 30 days), due = today + interval. Failing or leaning on hints: mastery −1 (min 1), interval resets to 2. Review solves award reduced XP (base 5) and count toward the streak; XP banks per drill, while mastery outcomes apply only when the session completes — abandoning mid-session keeps the XP but leaves the skill due. This is the retention engine — the app is a gym, not just a course.

### XP, streaks, collection

- XP per exercise; bonus for hint-free solves. Daily streak counter.
- **Collection mechanic (capped dynamic + authored, finalized 2026-07-19)**: on each exercise's FIRST correct solve, up to 3 random *new* Pokémon appearing in the user's actual result rows are caught (values matched against the world's name list), plus any authored `collectibles` bonuses. Re-solves and review solves don't catch — collection growth comes from progression and new content. Node completion awards a skill badge; completing a region awards a region badge.
- **Collection page**: reached via the header collection count — grid of caught Pokémon as type-colored text tiles plus the badge shelf. No sprites (remote images would break offline; bundled sprites are a possible Stage 3 flourish).
- **Node-complete moment**: solving a bank's final exercise shows a completion card — badge earned, the skill's `lesson.wrapUp` text, catches from this node — instead of bouncing straight to Home.

### Worlds (Stage 3 mapping finalized 2026-07-19)

Datasets are "worlds": each region introduces one, and access is gated purely by skill unlock edges (the world panel on Home is informational — skills are the gate). Digimon is a candidate later world (same builder pattern).

| World | Region | Source | Tables | Entity (catching) |
|---|---|---|---|---|
| Pokémon | Foundations (live) | PokéAPI CSVs | pokemon; + `type_matchups` added in Stage 3 for joins | pokemon.name |
| Yu-Gi-Oh | Shaping | YGOPRODeck static card dump | cards, card_sets, banlist | cards.name |
| Movies | Combining | MovieLens ml-latest-small | movies, people, roles | movies.title |
| Seattle 311 | Analyst Power | Seattle SODA CSV export | requests | none (no catching civic complaints) |

Regions may use ANY earlier-unlocked world in exercises (e.g., Combining self-joins on pokemon.evolves_from; Analyst Power recursive CTEs on evolution chains). `entity` gains an optional `labelColumn` (pokemon: type1; yugioh: card type; movies: genre) so the collection page can tile any world; the collection groups by world. Harness collectible checks resolve against each world's declared entity rather than a hardcoded table.

## Architecture

Fully static client-side app. No server, no accounts, no runtime costs.

- **App**: React + TypeScript + Vite SPA. Deployable to static hosting or run locally.
- **SQL engine**: DuckDB-WASM in a web worker. Loads world data from Parquet.
- **Editor**: CodeMirror 6, SQL highlighting, schema-aware autocomplete fed from the active world.
- **Content is data, not code**:
  - Per world: Parquet files + `schema.json` (table/column descriptions for the sidebar/autocomplete).
  - Curriculum: `skills.json` (tree, unlock edges, region metadata).
  - Per skill: exercise bank JSON (`exercises/<skill-id>.json`) — prompt, reference SQL, hint ladder, XP value, collectible award IDs, world ID.
  - The app is a generic player for this content; new worlds/skills require zero app-code changes.
- **Progress**: IndexedDB (mastery, review schedule, XP, streak, collection, solve history). Versioned schema with migrations. JSON export/import backup.

### Data flow

Pick node → lazy-load world Parquet into DuckDB → render exercise → **Run** executes user SQL (read-only, 5s timeout) and shows result grid → **Submit** results-diffs against cached reference output → success updates mastery/XP/collection and schedules future review.

## Content pipeline (repo scripts, run in Claude Code sessions)

1. **Dataset builders** — one script per world: PokéAPI, YGOPRODeck, Socrata export for civic; the exact movies/music source (TMDB, MusicBrainz, or similar free dump) gets chosen when that world is built in Stage 3. Output Parquet + `schema.json`. Built datasets are committed for reproducibility.
2. **Curriculum skeleton** — `skills.json` drafted by hand (Claude drafts, Jacob reviews once). Pedagogy order is deliberate, not generated.
3. **Exercise generation** — per skill × world, Claude authoring sessions generate banks in batches: real-question prompts, reference SQL, hints, collectible awards. Jacob spot-reviews samples, not every item. Exercises whose answer is a computed decimal must specify the rounding in the prompt and apply it in the reference SQL (the comparator only tolerates representation noise, not rounding differences).
4. **Validation harness** — Node script: loads every world into DuckDB, runs every reference SQL (must succeed, non-empty, deterministic), verifies hint snippets parse and collectible IDs exist. Gates all content changes.
5. **Regeneration** — banks are append-only; top up any skill's bank with a new authoring session + harness run.

## UI

### Home screen

Header (streak · XP · collection count) / Daily Review callout with rusty-skill summary and time estimate / skill-tree regions with node states (done ✓ / active ▶ / locked 🔒) / active-world panel showing unlock status of other worlds.

### Exercise screen (IDE style)

- **Left panel**: exercise prompt (N of M), hint ladder, schema browser (expandable tables/columns).
- **Right**: editor (top) with Run/Submit, result grid (bottom).
- Rationale: always-visible schema trains schema-reading, which is half of real-world query writing.

## Error handling

- **SQL errors are the product**: translation layer for common beginner errors (unknown column → show that table's actual columns; aggregation errors → plain-language GROUP BY rule). Raw DuckDB error remains visible beneath the translation.
- **Runaway queries**: 5s timeout → kill and restart the DuckDB worker. Result grid caps at 500 rows with truncation notice.
- **Mutation safety**: DDL/DML rejected pre-execution; worlds reloadable from Parquet.
- **Progress safety**: write-after-every-solve, versioned IndexedDB schema + migrations, JSON export/import.
- **Content-load failures**: retry with visible error state; app never white-screens on a missing Parquet.

## Testing

- **Content**: validation harness (above) is the primary gate; runs before content merges.
- **Unit, test-first**: results-diff comparator (row/column order, float tolerance, NULLs) and mastery/decay scheduler (decay math, Daily Review selection).
- **E2E (Playwright)**: solve-an-exercise happy path; wrong answer → hint ladder; node completion → collection update; Daily Review assembly.

## Build stages

1. **Stage 1 (MVP)**: Pokémon world + Foundations region, full exercise loop with results-diff, hints, XP/streak, IndexedDB progress. No review scheduler yet.
2. **Stage 2**: mastery decay + Daily Review (SM-2-lite mechanics above); collection page + badges with capped dynamic catching; node-complete moment with lesson wrap-ups (deferred from Stage 1; `lesson.wrapUp` authored for all 5 Foundations skills); Foundations bank top-up to 6–8 exercises per skill via authoring sessions through the validation harness. Progress schema stays version 1 — all new fields additive with defaults so Stage 1 saves survive untouched.
3. **Stage 3**: all remaining regions and worlds. Curriculum: **Shaping** (group-by, having, case-when, string-functions, null-handling — Pokémon + Yu-Gi-Oh), **Combining** (inner-join, left-join, self-join, set-operations, subqueries, correlated-subqueries — Yu-Gi-Oh + Pokémon), **Analyst Power** (cte, window-ranking, window-offsets, window-frames, recursive-cte — Movies + Seattle 311 + Pokémon evolution chains), **Boss Arenas** (three arena skills, one per new world; 4–6 multi-step business questions each, standard exercise mechanics — no new app machinery). Each skill: lesson intro + example + wrapUp, 6-exercise bank through the harness. App work: Home active-world panel, collection page world grouping via entity.labelColumn, harness generalization. First skill of each region requires the prior region's final skills (unlock edges in skills.json).
4. **Later (optional)**: "Ask Claude about my query" button (bring-your-own-key, style feedback on correct-but-clunky SQL) — additive, no architecture change.

## Out of scope

- Accounts, sync, multi-user, leaderboards
- Mobile/touch exercise modes
- Live AI generation at runtime (only the optional later feedback button)
- Narrative/story campaign, timed challenges
