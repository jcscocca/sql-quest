# World Swap (Drop Movies, Add Digimon) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Movies world with a Digimon world (DAPI-sourced) in exactly Movies' three curriculum slots, and remove Movies entirely, per `docs/superpowers/specs/2026-07-19-world-swap-digimon-design.md`.

**Architecture:** New builder script fetches 1,488 Digimon detail records from DAPI into gitignored `data-src/digimon/`, transforms them via DuckDB into two committed Parquet tables (`digimon`, `evolutions`). `cte` and `window-ranking` skills flip to `world: digimon` with fresh banks under NEW id prefixes (`ctd-*`, `wrd-*` — reusing `cte-*`/`wr-*` would collide with stale solved-ids in existing saves and suppress first-solve XP/catches); `arena-movies` becomes `arena-digimon` (`ad-*`). A load-time migration inside `normalize()` drops movies collection entries, the orphaned `arena-movies` skill entry, and its badge.

**Tech Stack:** TypeScript + tsx scripts, `@duckdb/node-api`, DAPI (`digi-api.com/api/v1`), vitest, Playwright.

---

## File structure

- Create: `scripts/build-digimon-world.ts` — fetch/cache/transform/sanity-check, mirrors `build-yugioh-world.ts`
- Create: `public/worlds/digimon/{digimon.parquet, evolutions.parquet, schema.json}` (committed outputs)
- Create: `public/content/exercises/arena-digimon.json`; Replace contents: `cte.json`, `window-ranking.json`
- Modify: `package.json` (add `build:digimon`, remove `build:movies`), `public/content/skills.json`, `src/lib/progress.ts` (`normalize()`), `src/lib/progress.test.ts`, `src/styles.css` (palette), `README.md`, `docs/superpowers/specs/2026-07-18-sql-learning-app-design.md` (world table)
- Delete: `public/worlds/movies/`, `scripts/build-movies-world.ts`, `public/content/exercises/arena-movies.json` (plus `data-src/movies*`, untracked)

## Curriculum map (authoritative)

| Skill | New world | Ids | XP | Requires (unchanged) |
|---|---|---|---|---|
| cte | digimon | ctd-1…ctd-6 | 17,17,18,18,19,20 | correlated-subqueries |
| window-ranking | digimon | wrd-1…wrd-6 | 17,17,18,18,19,20 | cte |
| arena-digimon (replaces arena-movies, same position) | digimon | ad-1…ad-5 | 20 each | recursive-cte, window-frames, window-offsets |

Analyst Power region tag: `world: "movies"` → `"digimon"`. `window-offsets`, `window-frames`, `recursive-cte`, `arena-yugioh`, `arena-seattle` untouched.

---

### Task 1: Digimon world builder

**Files:**
- Create: `scripts/build-digimon-world.ts`
- Modify: `package.json:11-14` (scripts block)

- [ ] **Step 1: Write the builder.** Full content of `scripts/build-digimon-world.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'

const API = 'https://digi-api.com/api/v1/digimon'
const SRC = 'data-src/digimon'
const OUT = 'public/worlds/digimon'

interface ListPage {
  content: { id: number }[]
  pageable: { totalPages: number }
}
interface Detail {
  id: number
  name: string
  xAntibody: boolean
  levels?: { level: string }[]
  types?: { type: string }[]
  attributes?: { attribute: string }[]
  releaseDate?: string | number | null
  nextEvolutions?: { id: number | null; digimon: string; condition: string }[]
}

mkdirSync(`${SRC}/detail`, { recursive: true })
mkdirSync(OUT, { recursive: true })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchJson<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as T
    } catch (err) {
      if (attempt === 3) throw new Error(`BLOCKED: ${url} failed after 3 attempts: ${err}`)
      await sleep(1000 * attempt)
    }
  }
}

// --- 1. id list (paged; nextPage URLs from the API are malformed, so page manually) ---
const idsPath = `${SRC}/ids.json`
let ids: number[]
if (existsSync(idsPath)) {
  ids = JSON.parse(readFileSync(idsPath, 'utf8')) as number[]
  console.log(`${idsPath} already cached (${ids.length} ids), skipping list fetch`)
} else {
  ids = []
  const first = await fetchJson<ListPage>(`${API}?pageSize=100&page=0`)
  first.content.forEach(d => ids.push(d.id))
  for (let p = 1; p < first.pageable.totalPages; p++) {
    const page = await fetchJson<ListPage>(`${API}?pageSize=100&page=${p}`)
    page.content.forEach(d => ids.push(d.id))
    await sleep(200)
  }
  writeFileSync(idsPath, JSON.stringify(ids))
  console.log(`fetched ${ids.length} ids across ${first.pageable.totalPages} pages`)
}

// --- 2. detail records, one file per id, skip-if-exists, ≤5 req/sec ---
let fetched = 0
for (const id of ids) {
  const p = `${SRC}/detail/${id}.json`
  if (existsSync(p)) continue
  const d = await fetchJson<Detail>(`${API}/${id}`)
  writeFileSync(p, JSON.stringify(d))
  fetched++
  if (fetched % 100 === 0) console.log(`  …${fetched} details fetched`)
  await sleep(200)
}
console.log(`details: ${fetched} fetched now, ${ids.length - fetched} already cached`)

// --- 3. transform ---
const details = ids.map(id => JSON.parse(readFileSync(`${SRC}/detail/${id}.json`, 'utf8')) as Detail)

const digimonOut = details.map(d => ({
  id: d.id,
  name: d.name,
  level: d.levels?.[0]?.level ?? null,
  type: d.types?.[0]?.type ?? null,
  attribute: d.attributes?.[0]?.attribute ?? null,
  x_antibody: d.xAntibody,
  release_year: d.releaseDate != null && Number(d.releaseDate) > 0 ? Number(d.releaseDate) : null,
}))

const idSet = new Set(digimonOut.map(d => d.id))
const nameById = new Map(digimonOut.map(d => [d.id, d.name]))
const seenEdges = new Set<string>()
let droppedEdges = 0
const evoOut: { from_id: number; from_name: string; to_id: number; to_name: string; condition: string | null }[] = []
for (const d of details) {
  for (const e of d.nextEvolutions ?? []) {
    if (e.id == null || !idSet.has(e.id)) {
      droppedEdges++
      continue
    }
    const key = `${d.id}->${e.id}`
    if (seenEdges.has(key)) continue
    seenEdges.add(key)
    const condition = e.condition?.trim() ? e.condition.trim() : null
    evoOut.push({ from_id: d.id, from_name: d.name, to_id: e.id, to_name: nameById.get(e.id)!, condition })
  }
}
console.log(`transformed ${digimonOut.length} digimon, ${evoOut.length} evolution edges (${droppedEdges} dangling edges dropped)`)

const toJsonl = (rows: object[]) => rows.map(r => JSON.stringify(r)).join('\n') + '\n'
writeFileSync(`${SRC}/digimon.jsonl`, toJsonl(digimonOut))
writeFileSync(`${SRC}/evolutions.jsonl`, toJsonl(evoOut))

const db = await DuckDBInstance.create()
const conn = await db.connect()

await conn.run(`
CREATE TABLE digimon AS
SELECT * FROM read_json('${SRC}/digimon.jsonl', format = 'newline_delimited', columns = {
  id: 'BIGINT', name: 'VARCHAR', level: 'VARCHAR', type: 'VARCHAR',
  attribute: 'VARCHAR', x_antibody: 'BOOLEAN', release_year: 'BIGINT'
})
ORDER BY id
`)

await conn.run(`
CREATE TABLE evolutions AS
SELECT * FROM read_json('${SRC}/evolutions.jsonl', format = 'newline_delimited', columns = {
  from_id: 'BIGINT', from_name: 'VARCHAR', to_id: 'BIGINT', to_name: 'VARCHAR', condition: 'VARCHAR'
})
ORDER BY from_id, to_id
`)

for (const table of ['digimon', 'evolutions']) {
  await conn.run(`COPY ${table} TO '${OUT}/${table}.parquet' (FORMAT parquet)`)
  const reader = await conn.runAndReadAll(`SELECT COUNT(*) AS n FROM ${table}`)
  console.log(`wrote ${OUT}/${table}.parquet with ${reader.getRows()[0][0]} rows`)
}

const schema = {
  world: 'digimon',
  name: 'Digimon',
  entity: { table: 'digimon', column: 'name', labelColumn: 'attribute' },
  tables: [
    {
      name: 'digimon',
      description: 'One row per Digimon (Wikimon-sourced via DAPI)',
      columns: [
        { name: 'id', type: 'BIGINT', description: 'DAPI id' },
        { name: 'name', type: 'VARCHAR', description: 'Digimon name, e.g. Agumon' },
        { name: 'level', type: 'VARCHAR', description: "Primary evolution stage, e.g. 'Baby I', 'Child', 'Adult', 'Perfect', 'Ultimate' — NULL when unlisted" },
        { name: 'type', type: 'VARCHAR', description: "Primary type, e.g. 'Reptile', 'Machine' — NULL when unlisted" },
        { name: 'attribute', type: 'VARCHAR', description: "Primary attribute: 'Vaccine', 'Virus', 'Data', 'Free', or 'Variable' — NULL when unlisted" },
        { name: 'x_antibody', type: 'BOOLEAN', description: 'TRUE for X-Antibody variants' },
        { name: 'release_year', type: 'BIGINT', description: 'Year the Digimon debuted — NULL when unknown' },
      ],
    },
    {
      name: 'evolutions',
      description: 'Directed evolution edges (from one Digimon to a possible next form); a Digimon can have many rows in both directions',
      columns: [
        { name: 'from_id', type: 'BIGINT', description: 'References digimon.id (the earlier form)' },
        { name: 'from_name', type: 'VARCHAR', description: 'Name of the earlier form (denormalized for readable joins)' },
        { name: 'to_id', type: 'BIGINT', description: 'References digimon.id (the evolved form)' },
        { name: 'to_name', type: 'VARCHAR', description: 'Name of the evolved form' },
        { name: 'condition', type: 'VARCHAR', description: "Evolution requirement text, e.g. 'with Starmons' — NULL when unconditional" },
      ],
    },
  ],
}
writeFileSync(`${OUT}/schema.json`, JSON.stringify(schema, null, 2))
console.log(`wrote ${OUT}/schema.json`)

// --- sanity checks (standalone; the harness only loads this world once skills.json references it) ---
console.log('\n--- sanity checks ---')
const agu = await conn.runAndReadAll(`SELECT level, type, attribute FROM digimon WHERE name = 'Agumon'`)
const aguRow = agu.getRows()[0]
console.log(`Agumon: ${JSON.stringify(aguRow)}`)
if (!aguRow || aguRow[0] !== 'Child' || aguRow[1] !== 'Reptile' || aguRow[2] !== 'Vaccine')
  throw new Error('sanity check failed: Agumon missing or not Child/Reptile/Vaccine')

const edge = await conn.runAndReadAll(
  `SELECT COUNT(*) FROM evolutions WHERE from_name = 'Agumon' AND to_name = 'Greymon'`,
)
if (Number(edge.getRows()[0][0]) === 0) throw new Error('sanity check failed: no Agumon -> Greymon edge')
console.log('Agumon -> Greymon edge exists')

const yr = await conn.runAndReadAll(`SELECT MIN(release_year), MAX(release_year) FROM digimon`)
const [minY, maxY] = yr.getRows()[0].map(Number)
console.log(`release_year range: ${minY}–${maxY}`)
if (minY !== 1997 || maxY < 2015) throw new Error(`sanity check failed: release_year range ${minY}–${maxY}`)

console.log('\nall sanity checks passed')
```

- [ ] **Step 2: Wire the script.** In `package.json` scripts, after `"build:yugioh"`, add:

```json
"build:digimon": "tsx scripts/build-digimon-world.ts",
```

- [ ] **Step 3: Run it.** `npm run build:digimon` (first run fetches ~1,488 details at 5/sec ≈ 5–6 min). Expected output ends with `all sanity checks passed`; digimon rows ≈ 1,488; evolutions in the low thousands. If DAPI is unreachable it prints `BLOCKED: …` — report and stop, do NOT fabricate data. If a sanity check fails on real data (e.g. Agumon's primary attribute isn't literally 'Vaccine'), inspect with a one-off query, adjust the CHECK to the verified real value, and note it in the commit message — never adjust the data.

- [ ] **Step 4: Spot-check the graph is cyclic (documentation claim, informs authoring).** Run:

```bash
npx tsx -e "
import { DuckDBInstance } from '@duckdb/node-api'
const db = await DuckDBInstance.create(); const c = await db.connect()
await c.run(\"CREATE TABLE e AS SELECT * FROM 'public/worlds/digimon/evolutions.parquet'\")
const r = await c.runAndReadAll('SELECT COUNT(*) FROM e a JOIN e b ON a.from_id = b.to_id AND a.to_id = b.from_id')
console.log('2-cycles:', r.getRows()[0][0])
"
```

Record the count in the Task 3 authoring notes (any value ≥ 0 is fine; > 0 confirms recursion is off-limits for this world).

- [ ] **Step 5: Commit.**

```bash
git add scripts/build-digimon-world.ts package.json public/worlds/digimon
git commit -m "feat: Digimon world (digimon, evolutions) from DAPI"
```

---

### Task 2: Progress migration + tile palette

**Files:**
- Modify: `src/lib/progress.ts` (`normalize()`, currently ~line 68)
- Modify: `src/lib/progress.test.ts` (append test)
- Modify: `src/styles.css` (~lines 262-272, movies genre colors)

- [ ] **Step 1: Write the failing test.** Append to `src/lib/progress.test.ts` (after the legacy-string migration test, following its idb-seeding pattern):

```ts
test('movies world remnants are dropped on hydrate', async () => {
  const { set: idbSet } = await import('idb-keyval')
  await idbSet('sql-quest-progress', {
    version: 1,
    xp: 500,
    streak: { count: 3, lastDay: '2026-07-18' },
    skills: {
      cte: { solved: ['cte-1'], completed: true, mastery: 3, interval: 2, due: '2099-01-01' },
      'arena-movies': { solved: ['am-1'], completed: false, mastery: 0, interval: 2, due: '2099-01-01' },
    },
    collection: [
      { world: 'pokemon', name: 'pikachu', label: 'electric' },
      { world: 'movies', name: 'Toy Story', label: 'Adventure' },
    ],
    badges: ['cte', 'arena-movies'],
  })
  await useProgress.getState().hydrate()
  const s = useProgress.getState()
  expect(s.collection).toEqual([{ world: 'pokemon', name: 'pikachu', label: 'electric' }])
  expect(s.skills['arena-movies']).toBeUndefined()
  expect(s.skills['cte'].completed).toBe(true)
  expect(s.badges).toEqual(['cte'])
  expect(s.xp).toBe(500)
})
```

- [ ] **Step 2: Run it — must fail.** `npm test -- progress` → the new test FAILS (movies entry and arena-movies survive).

- [ ] **Step 3: Implement in `normalize()`.** In `src/lib/progress.ts`, extend `normalize()`: filter the migrated collection, drop the skill entry, filter badges:

```ts
function normalize(s: ProgressState): ProgressState {
  const today = todayString()
  const skills: Record<string, SkillProgress> = {}
  for (const [id, sp] of Object.entries(s.skills ?? {})) {
    if (id === 'arena-movies') continue
    skills[id] =
      sp.completed && (!sp.interval || !sp.due)
        ? { ...sp, interval: FIRST_INTERVAL, due: today }
        : sp
  }
  const collection: CollectionEntry[] = (Array.isArray(s.collection) ? s.collection : [])
    .map(e => (typeof e === 'string' ? { world: 'pokemon', name: e, label: '' } : (e as CollectionEntry)))
    .filter(e => e.world !== 'movies')
  return {
    ...s,
    skills,
    collection,
    badges: (Array.isArray(s.badges) ? s.badges : []).filter(b => b !== 'arena-movies'),
  }
}
```

- [ ] **Step 4: Run tests — all pass.** `npm test` → full unit suite green (existing count + 1).

- [ ] **Step 5: Palette swap.** In `src/styles.css`, delete the ten movies genre rules (`.type-action` through `.type-thriller`, currently lines ~262-272) and add in their place:

```css
.type-vaccine { border-left-color: #16a34a; }
.type-virus { border-left-color: #9333ea; }
.type-data { border-left-color: #0ea5e9; }
.type-free { border-left-color: #78716c; }
.type-variable { border-left-color: #f59e0b; }
```

- [ ] **Step 6: Commit.**

```bash
git add src/lib/progress.ts src/lib/progress.test.ts src/styles.css
git commit -m "feat: drop movies remnants on load, digimon tile palette"
```

---

### Task 3: Curriculum — skills.json + three banks

**Files:**
- Modify: `public/content/skills.json` (Analyst Power region + arena entry)
- Replace contents: `public/content/exercises/cte.json`, `public/content/exercises/window-ranking.json`
- Create: `public/content/exercises/arena-digimon.json`
- Delete: `public/content/exercises/arena-movies.json`

- [ ] **Step 1: skills.json.** Analyst Power region: `"world": "movies"` → `"world": "digimon"`. Skills `cte` and `window-ranking`: `"world": "digimon"` plus freshly authored `lesson` (intro 3–5 sentences teaching the concept against `digimon`/`evolutions`, naming real columns; runnable `exampleSql`; wrapUp 2–3 sentences bridging to the next skill — Foundations lessons are the style anchor). In Boss Arenas, replace the `arena-movies` skill object with id `arena-digimon`, name `Digimon Arena`, `world: "digimon"`, same `requires: ["recursive-cte", "window-frames", "window-offsets"]`, fresh lesson.

- [ ] **Step 2: Author the three banks.** New files' exercises follow the curriculum map above (ids/XP exactly as tabled). Binding rules — Stage 2's 8 verbatim:

1. Ids exactly as tabled (`ctd-*`, `wrd-*`, `ad-*` — NEVER reuse `cte-*`/`wr-*`/`am-*`; stale saves hold those ids).
2. Prompts are real questions about the Digimon data, pin the EXACT output columns by name, and are unambiguous — a careful learner following the prompt must produce the reference result.
3. `orderMatters: true` only when the prompt fully specifies ordering including a tiebreaker; reference SQL must be deterministic.
4. Computed decimals specify rounding in the prompt and apply it in the reference SQL.
5. Exactly 3 hints: conceptual nudge → syntax pointer → full fenced ```sql answer equivalent to the reference.
6. XP as tabled; difficulty ramps across each bank; exercises may use earlier-region concepts but nothing taught later.
7. `collectibles` on at most 2 exercises across the three banks; names must exist in `digimon.name`; thematically apt.
8. Coverage: cte — single CTE, multi-CTE chains, CTE feeding a join, CTE + aggregate + filter-on-aggregate; window-ranking — RANK, DENSE_RANK, ROW_NUMBER, NTILE, PARTITION BY variations, rank-then-filter (top-N per group via subquery/CTE).

Plus the Stage 3 rules that still bind:
- Each exercise's SQL runs against the digimon world only (both its tables are fair game).
- Real analytical questions: e.g. cte — "which levels' populations are dominated by Virus types", evolution fan-out via a CTE then join back for names; window-ranking — "rank each level's Digimon by debut year, earliest first", NTILE debut-year quartiles, top-3 most-branching Digimon per level via evolution out-degree.
- **NO recursive CTEs anywhere in these banks** — the evolution graph contains cycles (verified in Task 1 Step 4); recursion belongs to Pokémon's `recursive-cte` skill.
- Window results: pin ordering (orderMatters with full tiebreakers) or make the result a stable aggregate; never depend on row order of an unordered window result. NULL `release_year`/`level`/`attribute` rows must be explicitly included or excluded by the prompt (rule 2), not left ambiguous.
- Arena exercises are multi-step narratives (business goal + constraints; reference SQL may be 10–20 lines; hint 1 names the steps, hint 2 shows the real skeleton, hint 3 is the complete answer). xp 20.
- Data-authenticity: attribute values are 'Vaccine'/'Virus'/'Data'/'Free'/'Variable' (verify actual spellings against the built table before authoring); level values include 'Baby I'/'Baby II'/'Child'/'Adult'/'Perfect'/'Ultimate' — check real values, never guess.

- [ ] **Step 3: Delete the movies arena bank.** `git rm public/content/exercises/arena-movies.json` (its replacement `arena-digimon.json` is now referenced by skills.json).

- [ ] **Step 4: Validate.** `npm run validate` → `✓ 142 exercises validated across 4 world(s)` (17 removed, 17 added; movies world no longer referenced by any skill so the harness never loads it). Fix anything it names.

- [ ] **Step 5: Comparator dry-run.** Throwaway script (Stage 2/3 technique): for each new exercise, execute `referenceSql` and the fenced SQL from hint 3 via `@duckdb/node-api`, diff with `compareResults` honoring `orderMatters` — all 17 must match. Delete the script after.

- [ ] **Step 6: Browser spot-check.** `npm run dev` → open cte skill: lesson renders, first exercise solvable (paste hint-3 SQL), Digimon world loads, a catch fires with an attribute-tinted chip label. Also open arena-digimon and confirm the lesson + first prompt render.

- [ ] **Step 7: Commit.**

```bash
git add public/content/skills.json public/content/exercises
git commit -m "feat: Digimon curriculum (cte, window-ranking, arena-digimon)"
```

---

### Task 4: Movies removal

**Files:**
- Delete: `public/worlds/movies/`, `scripts/build-movies-world.ts`
- Modify: `package.json` (remove `build:movies` line)

- [ ] **Step 1: Delete tracked movies files.**

```bash
git rm -r public/worlds/movies scripts/build-movies-world.ts
rm -rf data-src/movies data-src/ml-latest-small* 2>/dev/null || true
```

(Adjust the `data-src` paths to whatever `build-movies-world.ts` actually used — check its `SRC` constant before deleting; `data-src` is untracked either way.)

- [ ] **Step 2: Remove the script entry.** Delete the `"build:movies"` line from `package.json`.

- [ ] **Step 3: Full local gate.** `npm test && npm run validate && npm run build` → all green (nothing loads movies anymore; the build has no references to it).

- [ ] **Step 4: Grep for stragglers.** `grep -ri "movies\|movielens" src scripts public/content e2e README.md` → expect ZERO hits (spec/plan docs are allowed to keep their history).

- [ ] **Step 5: Commit.**

```bash
git add -A
git commit -m "feat: remove Movies world"
```

---

### Task 5: Docs sync + full gate

**Files:**
- Modify: `README.md` (feature paragraph), `docs/superpowers/specs/2026-07-18-sql-learning-app-design.md` (worlds table + Stage 3 curriculum line)

- [ ] **Step 1: README.** Rewrite the intro paragraph's world list: four worlds are now Pokémon, Yu-Gi-Oh!, Digimon, Seattle 311; still 142 exercises across five regions. Keep it factual, 2–3 sentences of change at most.

- [ ] **Step 2: Master spec sync.** In the worlds table of `2026-07-18-sql-learning-app-design.md`, replace the Movies row with: Digimon | Analyst Power (cte, window-ranking) + Boss Arena | DAPI (digi-api.com) | digimon, evolutions | digimon.name. Update the Stage 3 curriculum sentence that names movies for Analyst Power accordingly, marked as a 2026-07-19 amendment (this doc's convention for finalized-later decisions).

- [ ] **Step 3: Full gate.** `npm test && npm run validate && npm run build && npm run e2e` → unit suite green, `✓ 142 exercises validated across 4 world(s)`, build clean, e2e 7/7 (no e2e references movies — verified by grep during planning).

- [ ] **Step 4: Commit.**

```bash
git add README.md docs/superpowers/specs/2026-07-18-sql-learning-app-design.md
git commit -m "docs: world lineup is Pokemon, Yu-Gi-Oh, Digimon + Seattle 311"
```

---

## Plan self-review notes

- **Spec coverage:** builder + two tables + schema/entity ✓ (Task 1); sanity checks incl. release_year range and Agumon chain ✓ (Task 1); curriculum slots + region tag + fresh lessons/banks + XP scale ✓ (Task 3); movies deletion incl. package script ✓ (Task 4); load-time migration (collection + orphaned skill + badge) with unit test ✓ (Task 2); digimon label palette ✓ (Task 2); validate at 142 + comparator dry-run + e2e + README/spec sync ✓ (Tasks 3/5).
- **Deliberate deviations from spec text:** new banks use `ctd-*`/`wrd-*` prefixes instead of reusing `cte-*`/`wr-*` — the spec's "stale solved-exercise ids are inert" holds ONLY if ids aren't reused; reuse would mark new exercises pre-solved in existing saves, suppressing first-solve XP and catches. Badge drop for `arena-movies` added for the same export-cleanliness reason the spec gives for the skill entry.
- **Known risks:** DAPI field spellings (attribute/level values) are verified against the built table before authoring (Task 3 authoring rules); DAPI outage → builder reports BLOCKED, never fabricates; evolution-graph cycles are confirmed empirically (Task 1 Step 4) and recursion is banned in digimon banks.
