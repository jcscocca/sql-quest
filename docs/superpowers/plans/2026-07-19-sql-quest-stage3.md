# SQL Quest Stage 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship full Stage 3 — Shaping, Combining, Analyst Power, and Boss Arenas regions (~111 new exercises across 21 new skills) plus the Yu-Gi-Oh, Movies, and Seattle 311 worlds, with the app generalized for multi-world collection.

**Architecture:** Phase A generalizes the app (world-tagged collection entries with catch-time labels — removing the collection page's engine dependency; Home world panel; harness entity generalization). Phase B adds three world builders + a Pokémon `type_matchups` table. Phase C authors the four regions (content-by-criteria per the established pipeline, each region its own reviewed task). Phase D extends E2E and closes the gate. After Phase B the app is fully multi-world; each Phase C task ships a playable region.

**Tech Stack:** unchanged. New data sources: YGOPRODeck card dump (JSON API, cached), MovieLens ml-latest-small (grouplens.org zip), Seattle 311 via SODA CSV export.

**Repo:** `/Users/jscocca/Repos/sql-learning-app`, branch `stage-3` off main. Conventions carry over: plan/spec byte-sync, banks append-only through `npm run validate`, computed decimals pin rounding, sticky completion, additive v1 progress schema with `normalize()` migrations.

**Spec sync note:** the spec's Movies source says "IMDb non-commercial TSVs" — Task B3 switches to MovieLens ml-latest-small (IMDb dumps are ~180MB per file; MovieLens is 1MB, stable, and relational) and updates the spec table accordingly.

---

## File structure

```
src/lib/content.ts                 entity gains labelColumn?; Region gains world?
src/lib/progress.ts                collection: CollectionEntry[] {world,name,label} + migration (TDD)
src/lib/catches.ts                 unchanged (works on names)
src/components/ExerciseScreen.tsx  catch-time label lookup; addCatches(world, entries)
src/components/CollectionScreen.tsx pure store render, grouped by world, no engine
src/components/HomeScreen.tsx      active-world panel
src/App.tsx                        world panel data
src/styles.css                     world panel, world section headers, slugified tile classes
scripts/build-pokemon-world.ts     + type_matchups table
scripts/build-yugioh-world.ts      NEW
scripts/build-movies-world.ts      NEW
scripts/build-seattle311-world.ts  NEW
scripts/validate-content.ts        entity-based collectible check (per world); slug guard
public/worlds/{yugioh,movies,seattle311}/  parquet + schema.json (committed)
public/content/skills.json         4 new regions, 21 skills
public/content/exercises/*.json    21 new banks (111 exercises)
e2e/smoke.spec.ts                  + seeded multi-region flow, collection grouping
```

## Curriculum map (authoritative for Phase C)

| Region | Skill id | Name | World | Requires |
|---|---|---|---|---|
| shaping | group-by | GROUP BY | pokemon | aggregates |
| shaping | having | HAVING | pokemon | group-by |
| shaping | case-when | CASE Expressions | yugioh | group-by |
| shaping | string-functions | String Functions | yugioh | case-when |
| shaping | null-handling | NULL Handling | yugioh | having, case-when |
| combining | inner-join | INNER JOIN | yugioh | null-handling |
| combining | left-join | LEFT JOIN | yugioh | inner-join |
| combining | self-join | Self Joins | pokemon | inner-join |
| combining | set-operations | Set Operations | yugioh | left-join |
| combining | subqueries | Subqueries | yugioh | left-join |
| combining | correlated-subqueries | Correlated Subqueries | yugioh | subqueries, self-join |
| analyst | cte | CTEs | movies | correlated-subqueries |
| analyst | window-ranking | Window Ranking | movies | cte |
| analyst | window-offsets | Window Offsets | seattle311 | window-ranking |
| analyst | window-frames | Window Frames | seattle311 | window-ranking |
| analyst | recursive-cte | Recursive CTEs | pokemon | cte |
| boss | arena-yugioh | Arena: Duelist Analytics | yugioh | recursive-cte, window-frames, window-offsets |
| boss | arena-movies | Arena: Studio Greenlight | movies | recursive-cte, window-frames, window-offsets |
| boss | arena-seattle | Arena: City Dispatch | seattle311 | recursive-cte, window-frames, window-offsets |

Region display worlds (`Region.world`): shaping→yugioh, combining→yugioh, analyst→movies, boss→seattle311.

---

### Task A1: Multi-world collection entries (TDD)

**Files:**
- Modify: `src/lib/content.ts`, `src/lib/progress.ts`, `src/components/ExerciseScreen.tsx`, `src/components/CollectionScreen.tsx`, `scripts/validate-content.ts`
- Test: `src/lib/progress.test.ts`

- [ ] **Step 1: Types.** In `src/lib/content.ts`: `entity?: { table: string; column: string; labelColumn?: string }`; `Region` gains `world?: string`.

- [ ] **Step 2: Failing tests.** In `src/lib/progress.test.ts`, update the `beforeEach` state (collection stays `[]`) and REPLACE the two collection-related tests (`addCatches unions...`, `export round-trips...`) with the versions below, and add the migration test. `CollectionEntry` is imported from `./progress`.

```ts
test('addCatches tags entries with world and label, deduping by world+name', () => {
  const first = useProgress.getState().addCatches('pokemon', [
    { name: 'pikachu', label: 'electric' },
    { name: 'mew', label: 'psychic' },
  ])
  expect(first.map(e => e.name)).toEqual(['pikachu', 'mew'])
  const second = useProgress.getState().addCatches('pokemon', [
    { name: 'mew', label: 'psychic' },
    { name: 'eevee', label: 'normal' },
  ])
  expect(second.map(e => e.name)).toEqual(['eevee'])
  const yugi = useProgress.getState().addCatches('yugioh', [{ name: 'mew', label: 'Effect Monster' }])
  expect(yugi.length).toBe(1)
  expect(useProgress.getState().collection.length).toBe(4)
})

test('legacy string collection entries migrate to pokemon-world entries', async () => {
  const { set: idbSet } = await import('idb-keyval')
  await idbSet('sql-quest-progress', {
    version: 1,
    xp: 10,
    streak: { count: 1, lastDay: '2026-07-18' },
    skills: {},
    collection: ['pikachu', 'mew'],
    badges: [],
  })
  await useProgress.getState().hydrate()
  expect(useProgress.getState().collection).toEqual([
    { world: 'pokemon', name: 'pikachu', label: '' },
    { world: 'pokemon', name: 'mew', label: '' },
  ])
})

test('export round-trips collection entries, badges, and schedules', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 1)
  useProgress.getState().addCatches('pokemon', [{ name: 'pikachu', label: 'electric' }])
  useProgress.getState().awardBadge('select-basics')
  const json = exportState(useProgress.getState())
  useProgress.setState({ version: 1, xp: 0, streak: { count: 0, lastDay: '' }, skills: {}, collection: [], badges: [], hydrated: true })
  useProgress.getState().importState(JSON.parse(json) as ProgressState)
  const s = useProgress.getState()
  expect(s.collection).toEqual([{ world: 'pokemon', name: 'pikachu', label: 'electric' }])
  expect(s.badges).toEqual(['select-basics'])
})
```

- [ ] **Step 3: Verify fail**, then implement in `src/lib/progress.ts`:

```ts
export interface CollectionEntry {
  world: string
  name: string
  label: string
}
```
`ProgressState.collection: CollectionEntry[]`. In `normalize()`, migrate legacy entries:

```ts
  const collection: CollectionEntry[] = Array.isArray(s.collection)
    ? s.collection.map(e =>
        typeof e === 'string' ? { world: 'pokemon', name: e, label: '' } : (e as CollectionEntry),
      )
    : []
```
(and use `collection` in the returned object). `addCatches` becomes:

```ts
  addCatches(world, entries) {
    if (entries.length === 0) return []
    const s = get()
    const fresh = entries.filter(e => !s.collection.some(c => c.world === world && c.name === e.name))
    if (fresh.length === 0) return []
    const tagged = fresh.map(e => ({ world, name: e.name, label: e.label }))
    const next: ProgressState = { ...dataOf(s), collection: [...s.collection, ...tagged] }
    set(next)
    persist(next)
    return tagged
  },
```
with store-interface signature `addCatches(world: string, entries: { name: string; label: string }[]): CollectionEntry[]`.

- [ ] **Step 4: ExerciseScreen catch-time labels.** In the catch block (success path), after computing `caught` names via `pickCatches`, resolve labels with one query when `schema.entity.labelColumn` exists, then call the new signature:

```tsx
            const names = pickCatches(user, nameSet, owned, ex.collectibles ?? [])
            let entries = names.map(n => ({ name: n, label: '' }))
            if (names.length > 0 && schema.entity.labelColumn) {
              const list = names.map(n => `'${n.replace(/'/g, "''")}'`).join(', ')
              const lr = await runQuery(
                `SELECT ${schema.entity.column}, ${schema.entity.labelColumn} FROM ${schema.entity.table} WHERE ${schema.entity.column} IN (${list})`,
              )
              const labels = new Map(lr.rows.map(r => [String(r[0]), String(r[1] ?? '')]))
              entries = names.map(n => ({ name: n, label: labels.get(n) ?? '' }))
            }
            const tagged = useProgress.getState().addCatches(skill.world, entries)
            caught = tagged.map(t => t.name)
```
(`owned` becomes `new Set(useProgress.getState().collection.filter(c => c.world === skill.world).map(c => c.name))`; `nameSet` is the existing `names` variable — rename locals as needed so nothing shadows.)

- [ ] **Step 5: CollectionScreen goes engine-free.** Replace the component body: no loadWorld/runQuery/types state; group `collection` by `world`, render a section per world (heading = world id capitalized) with tiles using `entry.label` and className `type-${slugify(entry.label)}` where `slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'unknown'` (module-local helper). Keep badge shelf as-is.

- [ ] **Step 6: Harness generalization.** In `scripts/validate-content.ts`, replace the hardcoded pokemon collectible lookup: resolve each exercise's skill → world → schema.entity and check `SELECT 1 FROM ${entity.table} WHERE ${entity.column} = '...'`; if the world has no entity, any `collectibles` field is a failure (`${tag}: world has no entity, collectibles not allowed`). The world schemas are already loaded in the worlds map — extend it to store the parsed schema per world id.

- [ ] **Step 7: Verify** — progress suite green (updated + new tests), `npm test` all green (expect 74: 71 − 2 replaced + 2 replacements + 3 new... run and record the true count; update Phase D references), `npm run build`, `npm run validate`, browser: solve a fresh exercise → catch chip; collection page shows the Pokémon section with labeled tiles WITHOUT loading the engine (verify no wasm fetch in the network log on that page).

- [ ] **Step 8: Commit** — `feat: world-tagged collection with catch-time labels`

---

### Task A2: Home world panel + styles

**Files:**
- Modify: `src/components/HomeScreen.tsx`, `src/App.tsx`, `src/styles.css`, `src/lib/content.ts` (Region.world already added in A1)

- [ ] **Step 1:** HomeScreen props gain `worlds: { name: string; regionName: string; state: 'active' | 'unlocked' | 'locked' }[]`. Render a panel after the review callout: a `.world-panel` div listing each world (`🌍 {name}` + `{regionName}` + state icon ▶/✓/🔒). App computes it: for each region with a `world`, state = 'active' if any of its skills is unlocked-but-incomplete, 'unlocked' if all complete, 'locked' otherwise (reuse the unlock derivation used for nodes). Pokémon (Foundations) is always first.
- [ ] **Step 2:** styles.css: `.world-panel` (bordered card, row list), `.world-row` flex with muted region name. Also append the upcoming-worlds tile palette to the Task 10-era type-color section (sanctioned scope from A1's review — pre-seeds Yu-Gi-Oh/Movies tile colors ahead of Phase C):

```css
.type-effect-monster { border-left-color: #d97706; }
.type-normal-monster { border-left-color: #eab308; }
.type-fusion-monster { border-left-color: #8b5cf6; }
.type-synchro-monster { border-left-color: #e5e7eb; }
.type-xyz-monster { border-left-color: #1f2937; }
.type-link-monster { border-left-color: #2563eb; }
.type-ritual-monster { border-left-color: #38bdf8; }
.type-spell-card { border-left-color: #10b981; }
.type-trap-card { border-left-color: #be185d; }
.type-action { border-left-color: #ef4444; }
.type-adventure { border-left-color: #f59e0b; }
.type-animation { border-left-color: #f472b6; }
.type-comedy { border-left-color: #fbbf24; }
.type-crime { border-left-color: #6b7280; }
.type-documentary { border-left-color: #14b8a6; }
.type-drama { border-left-color: #a78bfa; }
.type-horror { border-left-color: #111827; }
.type-romance { border-left-color: #fb7185; }
.type-sci-fi { border-left-color: #22d3ee; }
.type-thriller { border-left-color: #64748b; }
```
- [ ] **Step 3:** Verify build/tests/browser (panel renders; with only Foundations content it shows Pokémon only until Phase C adds regions — confirm graceful empty behavior for regions without `world`).
- [ ] **Step 4:** Commit — `feat: home world panel`

---

### Task B1: Pokémon type_matchups table

**Files:**
- Modify: `scripts/build-pokemon-world.ts`; regenerate `public/worlds/pokemon/{pokemon.parquet,type_matchups.parquet,schema.json}`

- [ ] **Step 1:** Add `type_efficacy.csv` and `types.csv` (already fetched) to the builder; build `type_matchups`: `attacker_type` (name), `defender_type` (name), `multiplier` (damage_factor / 100.0 → 0.0/0.5/1.0/2.0). Add the table + COPY + schema.json entry (columns documented; multiplier DOUBLE). Keep table order [pokemon, type_matchups] in schema.json. Also add `labelColumn: 'type1'` to the pokemon entity (reconciles the A1 tile-color regression — new catches get type labels again; pre-labelColumn entries keep their empty label, acceptable).
- [ ] **Step 2:** `npm run build:world`; pokemon.parquet must be byte-identical; new parquet ~small. `npm run validate` green (loader iterates schema tables — verify the new table loads).
- [ ] **Step 3:** Sanity: `multiplier=2.0` for (water→fire); 18×18=324 rows.
- [ ] **Step 4:** Commit — `feat: pokemon type matchup table for join exercises`

---

### Task B2: Yu-Gi-Oh world builder

**Files:**
- Create: `scripts/build-yugioh-world.ts`; output `public/worlds/yugioh/{cards,card_sets,banlist}.parquet + schema.json`
- Modify: `package.json` (script `build:yugioh`)

- [ ] **Step 1:** Builder: fetch `https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes` once into `data-src/yugioh/cardinfo.json` (skip if exists; ~50MB JSON). Transform in JS to three JSON-line files in data-src, then DuckDB `read_json_auto` → tables:
  - `cards`: id, name, type, race, attribute (NULL for spells/traps), atk, def (NULL where absent), level (NULL), archetype (NULL). Exclude token/skill card types.
  - `card_sets`: card_id, set_name, set_code, rarity (explode each card's `card_sets` array; cards without sets → no rows).
  - `banlist`: card_id, format ('tcg'/'ocg'), status ('Banned'/'Limited'/'Semi-Limited') from `banlist_info` (only cards present on a list).
  Schema.json: descriptions per column; `entity: { table: 'cards', column: 'name', labelColumn: 'type' }`.
- [ ] **Step 2:** Run; report row counts (cards ~12–13k, card_sets ~40k+, banlist hundreds). Sanity: 'Dark Magician' exists with race 'Spellcaster'; banlist has Banned entries in tcg; NULL atk for a known Spell Card.
- [ ] **Step 3:** `npm run validate` green (harness loads new world only once skills reference it — it loads worlds from skills.json usage; until Phase C, validate won't load yugioh. Add a temporary standalone check in the builder itself: after COPY, run one sanity query per table and print counts).
- [ ] **Step 4:** Commit builder + outputs — `feat: Yu-Gi-Oh world (cards, sets, banlist)`

---

### Task B3: Movies world builder (MovieLens)

**Files:**
- Create: `scripts/build-movies-world.ts`; output `public/worlds/movies/{movies,ratings,tags}.parquet + schema.json`
- Modify: `package.json` (script `build:movies`); spec sync (Movies source row → "MovieLens ml-latest-small")

- [ ] **Step 1:** Fetch `https://files.grouplens.org/datasets/movielens/ml-latest-small.zip` to data-src (skip if exists), `execSync('unzip -o ...')`. Tables:
  - `movies`: movie_id, title (year stripped), year (parsed from title suffix `(YYYY)`; NULL if absent), genre1, genre2 (first two of the pipe-split genres; '(no genres listed)' → NULLs).
  - `ratings`: movie_id, avg_rating (ROUND(AVG(rating),2)), num_ratings, first_rated (MIN year), last_rated (MAX year) — aggregated from ratings.csv (timestamps → years).
  - `tags`: movie_id, tag, tag_count — aggregated from tags.csv, top tags per movie.
  Entity: `{ table: 'movies', column: 'title', labelColumn: 'genre1' }`.
- [ ] **Step 2:** Run + sanity: 'Toy Story' 1995 Adventure; ratings join returns plausible avg for a known film; ~9.7k movies. Builder prints per-table counts.
- [ ] **Step 3:** Spec sync (source cell) + commit — `feat: Movies world from MovieLens`

---

### Task B4: Seattle 311 world builder

**Files:**
- Create: `scripts/build-seattle311-world.ts`; output `public/worlds/seattle311/{requests.parquet,schema.json}`
- Modify: `package.json` (script `build:seattle311`)

- [ ] **Step 1:** Fetch CSV export from Seattle's open-data SODA endpoint for the Customer Service Requests dataset (find the current resource id on data.seattle.gov at execution time; the builder hardcodes it with a comment naming the dataset): `https://data.seattle.gov/resource/<id>.csv?$limit=350000&$order=created_date DESC (limit raised from 50k: recent intake is ~325k rows/year and the span sanity check requires ≥365 days)` → data-src (skip if exists). Table `requests`: request_id, service_request_type, department, created_date (DATE), neighborhood, status. (closed_date was planned but the source has no closure field — omitted rather than fabricated; status carries open/closed semantics qualitatively.) Compute nothing else — date functions/windows are the learner's job. No entity (schema.json omits it).
- [ ] **Step 2:** Run + sanity: ≥40k rows, plausible type/department distributions, dates span ≥1 year (needed for window/date exercises). Builder prints counts + date range. If the resource id can't be located or the fetch fails, report BLOCKED with what was tried — do NOT substitute synthetic data.
- [ ] **Step 3:** Commit — `feat: Seattle 311 world`

---

### Tasks C1–C4: Region content (one task per region, sequential)

Each region task follows the SAME structure — listed once here, executed per region with the curriculum map above:

- [ ] **Step 1: skills.json** — add the region `{ id, name, world, skills: [...] }` with every skill from the curriculum map (ids/names/worlds/requires exactly as tabled). Each skill's `lesson`: intro (3–5 sentences teaching the concept against its world's actual tables, naming real columns), `exampleSql` (runnable against that world), `wrapUp` (2–3 sentences, the takeaway + bridge to the next skill). Authored fresh; the Foundations lessons are the style anchor.
- [ ] **Step 2: banks** — 6 exercises per skill (Boss Arenas: 5 per arena), authored per the binding rules (Stage 2 Task 11's 8 rules apply verbatim, plus):
  - Exercises may use any world whose region is at-or-before this one; each exercise's SQL must run against ITS declared world.
  - Joins/subqueries/windows must be REAL analytical questions ("Which archetypes have banned cards in TCG but not OCG?" — set-operations; "rank movies within genre1 by avg_rating" — window-ranking; "daily request-volume trends and rolling averages by department" — window-offsets/frames on seattle311. NOTE: the real dataset has NO closure-date field (verified against the source; fabrication refused) — days-to-close exercises are impossible; author time-series windows over created_date instead: LAG/LEAD across day/week buckets, rolling counts, department/neighborhood partitions).
  - Boss Arena exercises are multi-step narratives: the prompt states a business goal and constraints; reference SQL may be 10–20 lines; hints outline the decomposition (nudge names the steps; syntax shows the skeleton; full answer complete). xp 20 each.
  - Window/date results: pin ordering (orderMatters with full tiebreakers) OR make the result a stable aggregate; NEVER depend on row order of an unordered window result.
  - seattle311 has no entity → NO collectibles on its exercises (harness enforces).
  - Exercise ids must be globally unique across all banks — enforced by the harness (C3 review: window-frames ids renamed `wf-*` → `wfr-*`; `wf-*` belongs to where-filtering).
  - Data-authenticity note for authors: yugioh banlist statuses are 'Forbidden'/'Limited'/'Semi-Limited' (the API never says 'Banned'); reference SQL must use the real values.
- [ ] **Step 3: verify** — `npm run validate` green with the growing exercise count (C1: 61 — gb-7 added in review, C2: 97, C3: 127, C4: 142); run every reference + hint-3 through the real comparator (throwaway script, like Stage 2 Task 11); `npm test` and `npm run build` unchanged-green; browser spot-check: open the region's first skill, solve one exercise for real, confirm the world loads and (where entity exists) catches work.
- [ ] **Step 4: commit** — `feat: <Region> region (<n> skills, <m> exercises)`

Content review after EACH region task (adversarial pedagogy pass, same brief as Stage 2 Task 11's review) before the next region begins.

---

### Task D1: E2E additions

**Files:**
- Modify: `e2e/smoke.spec.ts`

- [ ] **Step 1:** Two tests: (1) seed a save with Foundations+Shaping fully complete (skills from the curriculum map, `completed: true, mastery: 3, interval: 2, due: '2026-07-01'` NOT needed — use future due `2099-01-01` to suppress the review callout) → Home shows Combining's first node (INNER JOIN) unlocked and the world panel listing Yu-Gi-Oh as active → open inner-join, lesson intro shows, Start exercises, solve the first exercise via hint-3 parsing (same technique as the review e2e), expect success + a Caught chip (yugioh entity exists). (2) Seed a collection with entries from two worlds `[{world:'pokemon',name:'pikachu',label:'electric'},{world:'yugioh',name:'Dark Magician',label:'Normal Monster'}]` → collection page shows two world section headings and both tiles.
- [ ] **Step 2:** `npm run e2e` → 7/7. Commit — `test: e2e for multi-world unlock and collection grouping`

### Task D2: README + final gate

- [ ] **Step 1:** README: replace the feature paragraph's region/world description to cover all five regions and four worlds (2–3 sentences, factual).
- [ ] **Step 2:** Full gate: `npm test && npm run validate && npm run build && npm run e2e` (expect: unit count recorded in A1 / 142 exercises across 4 worlds / build / 7 e2e).
- [ ] **Step 3:** Commit — `docs: Stage 3 features in README`

---

## Plan self-review notes

- **Spec coverage**: world table + region curriculum + unlock edges ✓ (map + C1–C4); entity.labelColumn + world-grouped collection ✓ (A1); Home world panel ✓ (A2); harness entity generalization + no-entity-no-collectibles ✓ (A1/C rules); type_matchups for joins ✓ (B1); MovieLens spec sync ✓ (B3); Boss Arenas as standard mechanics ✓ (C4); Stage 1/2 saves migrate (collection string→entry) ✓ (A1).
- **Known judgment calls**: DATE/TIMESTAMP columns are converted to ISO strings at extraction — date-heavy results read naturally and comparator sides stay consistent; catch labels resolved at catch time (collection page engine-free; migrated legacy entries carry empty labels); world panel is informational only — skills gate access; region unlock chains via requires edges exactly as tabled; MovieLens over IMDb for size/stability; 311 capped at 50k recent rows. Region XP escalates with difficulty — Shaping runs 15–18 (Foundations 10–15); later regions may go higher; Boss Arenas 20. Dynamic catching stays active in arenas — a boss query whose result happens to contain an entity name awards it (the mechanic being true to itself); the no-collectibles rule governs authored awards only, and the arena badge remains the primary prize.
- **Risks flagged for execution**: YGOPRODeck payload size (cache + JSON-lines transform), Seattle dataset resource-id discovery (builder BLOCKED rather than synthetic data), ratings/date determinism in window exercises (rule added above).
