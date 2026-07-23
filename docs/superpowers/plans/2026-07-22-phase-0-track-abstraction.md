# Phase 0: Track Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a `Track` abstraction so the SQL exercise flow runs behind a pluggable interface — with zero behavior change — making room for future JavaScript, Python, and Systems Design tracks.

**Architecture:** Introduce a `Track` interface with five ports (`prepare`, `run`, `check`, `reward`, `example`). Implement one SQL track that delegates to the existing `duckdb`, `compare`, and `catches` modules via injected dependencies (so it is unit-testable without the WASM engine). Route `ExerciseScreen` and `ReviewScreen` through the track instead of calling those modules directly. Content JSON, `content.ts` types, and the `scripts/` pipeline are unchanged — the SQL track reads the existing `referenceSql` / `orderMatters` / `entity` / `exampleSql` fields internally. The existing unit + e2e + `validate` suites are the regression net for "no behavior change."

**Tech Stack:** TypeScript, React 19, Vite, Vitest (unit), Playwright (e2e), DuckDB-WASM.

**Scope boundary (deliberate):** Phase 0 abstracts only the three *logic* ports plus `example`. The result type stays `QueryResult` and the input UI stays the SQL `Editor`/`SchemaBrowser` — generalizing the result shape and the input component happens in a later phase when a non-tabular track needs it. `content.ts`, `scripts/validate-content.ts`, and `scripts/build-sprites.ts` are **not** touched.

---

## File Structure

- `src/lib/tracks/types.ts` — **create.** The `Track` interface and its port types (`CheckOutcome`, `Catch`, `RewardContext`). Pure types; no runtime deps beyond type imports.
- `src/lib/tracks/sql.ts` — **create.** `createSqlTrack(deps)` — the SQL track. Holds per-world state (`schema`, lazy `worldNames`, `refCache`). Delegates to injected `runQuery`/`loadWorld` and to `compareResults` / `pickCatches`. No import of `duckdb` (deps are injected → unit-testable).
- `src/lib/tracks/sql.test.ts` — **create.** Unit tests for `example`, `check`, and `reward` using a fake runner.
- `src/lib/tracks/registry.ts` — **create.** `getTrack(skill, deps)` → returns the SQL track for every skill in Phase 0 (later dispatches on a track id).
- `src/lib/tracks/registry.test.ts` — **create.** Asserts `getTrack` returns a track with `id === 'sql'`.
- `src/components/ExerciseScreen.tsx` — **modify.** Route run/check/reward/example through a track instance; drop direct `compareResults`/`pickCatches`/`worldNames`/`refCache`.
- `src/components/ReviewScreen.tsx` — **modify.** Route run/check through a track instance; drop direct `compareResults`.

---

## Task 1: SQL track + Track interface

**Files:**
- Create: `src/lib/tracks/types.ts`
- Create: `src/lib/tracks/sql.ts`
- Test: `src/lib/tracks/sql.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/tracks/sql.test.ts`:

```ts
import { expect, test } from 'vitest'
import { createSqlTrack } from './sql'
import type { QueryResult } from '../compare'
import type { Exercise, Skill, WorldSchema } from '../content'

const skill = { id: 's1', name: 'S1', world: 'pokemon', requires: [], lesson: { intro: '', exampleSql: 'SELECT 1' } } as Skill
const exercise = { id: 'e1', prompt: '', referenceSql: 'SELECT x FROM t', orderMatters: false, hints: [], xp: 10 } as Exercise
const noDeps = { runQuery: async () => ({ columns: [], rows: [] }), loadWorld: async () => {} }

test('example returns the skill exampleSql', () => {
  const track = createSqlTrack(noDeps)
  expect(track.example(skill)).toBe('SELECT 1')
})

test('check is correct when the user result matches the reference', async () => {
  const ref: QueryResult = { columns: ['x'], rows: [['a']] }
  const track = createSqlTrack({ runQuery: async () => ref, loadWorld: async () => {} })
  const outcome = await track.check({ columns: ['x'], rows: [['a']] }, exercise)
  expect(outcome.correct).toBe(true)
})

test('check is wrong with a reason when results differ', async () => {
  const ref: QueryResult = { columns: ['x'], rows: [['a']] }
  const track = createSqlTrack({ runQuery: async () => ref, loadWorld: async () => {} })
  const outcome = await track.check({ columns: ['x'], rows: [['b']] }, exercise)
  expect(outcome.correct).toBe(false)
  expect(typeof outcome.reason).toBe('string')
})

test('reward catches an entity appearing in the result, with its label', async () => {
  const schema = { world: 'pokemon', name: 'Pokémon', tables: [{ name: 'pokemon', description: '', columns: [] }], entity: { table: 'pokemon', column: 'name', labelColumn: 'type1' } } as WorldSchema
  const runQuery = async (sql: string): Promise<QueryResult> => {
    if (sql.includes('DISTINCT')) return { columns: ['name'], rows: [['pikachu'], ['mew']] }
    if (sql.includes('IN (')) return { columns: ['name', 'type1'], rows: [['pikachu', 'electric']] }
    return { columns: [], rows: [] }
  }
  const track = createSqlTrack({ runQuery, loadWorld: async () => {} })
  await track.prepare(skill, schema)
  const caught = await track.reward({ columns: ['name'], rows: [['pikachu']] }, exercise, { owned: new Set() })
  expect(caught).toEqual([{ name: 'pikachu', label: 'electric' }])
})

test('reward is empty when the world has no entity', async () => {
  const schema = { world: 'w', name: 'W', tables: [{ name: 't', description: '', columns: [] }] } as WorldSchema
  const track = createSqlTrack(noDeps)
  await track.prepare(skill, schema)
  const caught = await track.reward({ columns: ['x'], rows: [['a']] }, exercise, { owned: new Set() })
  expect(caught).toEqual([])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/tracks/sql.test.ts`
Expected: FAIL — `Failed to resolve import "./sql"` (module does not exist yet).

- [ ] **Step 3: Create the interface types**

Create `src/lib/tracks/types.ts`:

```ts
import type { QueryResult } from '../compare'
import type { Exercise, Skill, WorldSchema } from '../content'

export interface CheckOutcome {
  correct: boolean
  reason?: string
}

export interface Catch {
  name: string
  label: string
}

export interface RewardContext {
  owned: Set<string>
}

export interface Track {
  id: string
  /** Load any engine state the exercises in this skill need. SQL: load the world's tables. */
  prepare(skill: Skill, schema: WorldSchema | undefined): Promise<void>
  /** Run the learner's submission and return the result the UI grid renders. */
  run(submission: string): Promise<QueryResult>
  /** Judge a run result against the exercise. SQL: run the reference query and diff. */
  check(result: QueryResult, exercise: Exercise): Promise<CheckOutcome>
  /** Collectibles earned from a correct solve. SQL: entities in the result cells. Others: []. */
  reward(result: QueryResult, exercise: Exercise, ctx: RewardContext): Promise<Catch[]>
  /** Starter text to prefill the editor. */
  example(skill: Skill): string
}
```

- [ ] **Step 4: Implement the SQL track**

Create `src/lib/tracks/sql.ts`:

```ts
import { compareResults, type QueryResult } from '../compare'
import { pickCatches } from '../catches'
import type { Exercise, Skill, WorldSchema } from '../content'
import type { Catch, CheckOutcome, RewardContext, Track } from './types'

export interface SqlDeps {
  runQuery: (sql: string) => Promise<QueryResult>
  loadWorld: (world: string, tables: string[]) => Promise<void>
}

export function createSqlTrack(deps: SqlDeps): Track {
  let schema: WorldSchema | undefined
  let worldNames: Set<string> | null = null
  const refCache = new Map<string, QueryResult>()

  async function names(): Promise<Set<string> | null> {
    if (!schema?.entity) return null
    if (!worldNames) {
      const r = await deps.runQuery(`SELECT DISTINCT ${schema.entity.column} FROM ${schema.entity.table}`)
      worldNames = new Set(r.rows.map(row => String(row[0])))
    }
    return worldNames
  }

  return {
    id: 'sql',

    async prepare(_skill: Skill, s: WorldSchema | undefined) {
      schema = s
      worldNames = null
      if (schema) await deps.loadWorld(schema.world, schema.tables.map(t => t.name))
    },

    run(submission: string) {
      return deps.runQuery(submission)
    },

    async check(result: QueryResult, exercise: Exercise): Promise<CheckOutcome> {
      let ref = refCache.get(exercise.id)
      if (!ref) {
        ref = await deps.runQuery(exercise.referenceSql)
        refCache.set(exercise.id, ref)
      }
      const outcome = compareResults(result, ref, { orderMatters: exercise.orderMatters })
      return outcome.equal ? { correct: true } : { correct: false, reason: outcome.reason }
    },

    async reward(result: QueryResult, exercise: Exercise, ctx: RewardContext): Promise<Catch[]> {
      const nameSet = await names()
      if (!schema?.entity || !nameSet) return []
      const caught = pickCatches(result, nameSet, ctx.owned, exercise.collectibles ?? [])
      if (caught.length === 0) return []
      if (!schema.entity.labelColumn) return caught.map(n => ({ name: n, label: '' }))
      const list = caught.map(n => `'${n.replace(/'/g, "''")}'`).join(', ')
      const lr = await deps.runQuery(
        `SELECT ${schema.entity.column}, ${schema.entity.labelColumn} FROM ${schema.entity.table} WHERE ${schema.entity.column} IN (${list})`,
      )
      const labels = new Map(lr.rows.map(r => [String(r[0]), String(r[1] ?? '')]))
      return caught.map(n => ({ name: n, label: labels.get(n) ?? '' }))
    },

    example(skill: Skill) {
      return skill.lesson.exampleSql
    },
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/tracks/sql.test.ts`
Expected: PASS — 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tracks/types.ts src/lib/tracks/sql.ts src/lib/tracks/sql.test.ts
git commit -m "feat: SQL track behind a Track interface (no wiring yet)"
```

---

## Task 2: Track registry

**Files:**
- Create: `src/lib/tracks/registry.ts`
- Test: `src/lib/tracks/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/tracks/registry.test.ts`:

```ts
import { expect, test } from 'vitest'
import { getTrack } from './registry'
import type { Skill } from '../content'

const skill = { id: 's1', name: 'S1', world: 'pokemon', requires: [], lesson: { intro: '', exampleSql: '' } } as Skill
const deps = { runQuery: async () => ({ columns: [], rows: [] }), loadWorld: async () => {} }

test('getTrack returns the SQL track for any skill', () => {
  expect(getTrack(skill, deps).id).toBe('sql')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/tracks/registry.test.ts`
Expected: FAIL — `Failed to resolve import "./registry"`.

- [ ] **Step 3: Implement the registry**

Create `src/lib/tracks/registry.ts`:

```ts
import type { Skill } from '../content'
import { createSqlTrack, type SqlDeps } from './sql'
import type { Track } from './types'

// Phase 0: every skill is a SQL skill. A later phase dispatches on a skill track id.
export function getTrack(_skill: Skill, deps: SqlDeps): Track {
  return createSqlTrack(deps)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/tracks/registry.test.ts`
Expected: PASS — 1 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracks/registry.ts src/lib/tracks/registry.test.ts
git commit -m "feat: track registry (SQL-only for now)"
```

---

## Task 3: Route ExerciseScreen through the track

No new unit test — the regression net is the existing `e2e/smoke.spec.ts` (solve, catch, node-complete). This task is a behavior-preserving rewire.

**Files:**
- Modify: `src/components/ExerciseScreen.tsx`

- [ ] **Step 1: Swap the imports**

Replace the current lib imports (lines 5-11) so `compare`/`catches` are no longer imported directly and the track is:

```tsx
import { type QueryResult } from '../lib/compare'
import { loadWorld, runQuery } from '../lib/duckdb'
import { translateError, TrainerError } from '../lib/errors'
import { getTrack } from '../lib/tracks/registry'
import type { Track } from '../lib/tracks/types'
import { useProgress } from '../lib/progress'
import { loadManifest, spriteUrl, type SpriteManifest } from '../lib/sprites'
import type { ExerciseBank, Region, Skill, WorldSchema } from '../lib/content'
```

(`compareResults` and `pickCatches` imports are removed — the track owns them now.)

- [ ] **Step 2: Create the track instance; delete the `worldNames`/`refCache` state**

Delete these two lines (current 37-38):

```tsx
const refCache = useRef(new Map<string, QueryResult>())
const [worldNames, setWorldNames] = useState<Set<string> | null>(null)
```

Add a stable track instance near the other hooks (after the `useProgress()` call, ~line 25):

```tsx
const trackRef = useRef<Track | null>(null)
if (!trackRef.current) trackRef.current = getTrack(skill, { runQuery, loadWorld })
const track = trackRef.current
```

- [ ] **Step 3: Replace the world-load effect with `track.prepare`**

Replace the effect at current lines 55-65:

```tsx
  useEffect(() => {
    track.prepare(skill, schema)
      .then(() => setEngineReady(true))
      .catch(e => setEngineError(String(e)))
  }, [schema])
```

- [ ] **Step 4: Route `handleRun` and `handleSubmit` through the track**

Replace `handleRun` (current 73-83):

```tsx
  async function handleRun(text = sqlText) {
    setBusy(true)
    setFeedback(null)
    try {
      setResult(await track.run(text))
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }
```

Replace `handleSubmit` (current 85-146):

```tsx
  async function handleSubmit() {
    setBusy(true)
    setFeedback(null)
    try {
      const user = await track.run(sqlText)
      setResult(user)
      const outcome = await track.check(user, ex)
      if (outcome.correct) {
        const res = useProgress
          .getState()
          .recordSolve(skill.id, ex.id, ex.xp, hintsShown, bank.exercises.length)
        let caught: string[] = []
        if (res.gained > 0) {
          try {
            const owned = new Set(
              useProgress.getState().collection.filter(c => c.world === skill.world).map(c => c.name),
            )
            const entries = await track.reward(user, ex, { owned })
            if (entries.length > 0) {
              const tagged = useProgress.getState().addCatches(skill.world, entries)
              caught = tagged.map(t => t.name)
              if (caught.length > 0) setSessionCatches(prev => [...prev, ...caught])
            }
          } catch (err) {
            console.error('Catch check failed', err)
          }
        }
        if (res.newlyCompleted) {
          useProgress.getState().awardBadge(skill.id)
          if (region.skills.every(sk => useProgress.getState().skills[sk.id]?.completed))
            useProgress.getState().awardBadge(`region:${region.id}`)
        }
        setFeedback({ kind: 'success', gained: res.gained, caught, finished: res.newlyCompleted })
      } else {
        setFeedback({ kind: 'wrong', message: `Not quite — ${outcome.reason}. Check the grid and try again.` })
      }
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }
```

- [ ] **Step 5: Use `track.example` for the lesson prefill**

In the lesson view, replace the two `skill.lesson.exampleSql` reads (current 171 and 175). Line 171 stays a display of the SQL example — leave the `<pre>` as `{skill.lesson.exampleSql}` (SQL-specific lesson display, out of Phase 0 scope). Change only the prefill handler (current 175):

```tsx
              setSqlText(track.example(skill))
```

- [ ] **Step 6: Typecheck + unit + e2e must stay green**

Run: `npm run build`
Expected: PASS (tsc no errors, vite build succeeds). If tsc flags an unused `QueryResult` import, keep it — `result` state is typed `QueryResult`; remove any genuinely unused import it names.

Run: `npm test`
Expected: PASS — all suites green (81+ tests).

Run: `npm run e2e`
Expected: PASS — 8 passed (solve, catch, node-complete, review, free-roam all unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/components/ExerciseScreen.tsx
git commit -m "refactor: ExerciseScreen runs through the SQL track"
```

---

## Task 4: Route ReviewScreen through the track

Regression net: the existing `daily review updates mastery` e2e test.

**Files:**
- Modify: `src/components/ReviewScreen.tsx`

- [ ] **Step 1: Swap the imports**

Replace lines 4-9:

```tsx
import { type QueryResult } from '../lib/compare'
import { loadWorld, runQuery } from '../lib/duckdb'
import { translateError, TrainerError } from '../lib/errors'
import { getTrack } from '../lib/tracks/registry'
import type { Track } from '../lib/tracks/types'
import { useProgress } from '../lib/progress'
import type { ReviewItem } from '../lib/review'
import type { Curriculum, WorldSchema } from '../lib/content'
```

(`compareResults` import removed.)

- [ ] **Step 2: Create the track instance**

After the state hooks (~line 36, before `const item = ...`), add:

```tsx
  const trackRef = useRef<Track | null>(null)
  if (!trackRef.current) trackRef.current = getTrack(item, { runQuery, loadWorld } as never)
  const track = trackRef.current
```

Note: `getTrack` takes a `Skill`; `item` is a `ReviewItem`. Pass the item's skill instead — the registry ignores the skill in Phase 0, but pass the correct type. Replace the line above with the type-correct version once `allSkills` is in scope; since `allSkills` is defined below, keep the deps object and pass a minimal skill lookup. Concretely, place this **after** `const item = items[idx]` and `allSkills`/`world` are computed (after current line 41):

```tsx
  const trackRef = useRef<Track | null>(null)
  if (!trackRef.current) {
    const sk = allSkills.find(s => s.id === item?.skillId)
    if (sk) trackRef.current = getTrack(sk, { runQuery, loadWorld })
  }
  const track = trackRef.current
```

Also add `useRef` to the React import at line 1:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
```

- [ ] **Step 3: Replace the world-load effect with `track.prepare`**

Replace lines 43-47:

```tsx
  useEffect(() => {
    track?.prepare(allSkills.find(s => s.id === item?.skillId), schema)
      .then(() => setEngineReady(true))
      .catch(e => setFeedback({ kind: 'error', friendly: String(e), raw: '' }))
  }, [schema])
```

`prepare`'s first argument is unused by the SQL track; the second (`schema`) is what matters. If TypeScript objects to `find(...)` being `Skill | undefined` where `Skill` is expected, change the signature call to `track?.prepare(item ? allSkills.find(s => s.id === item.skillId)! : undefined as never, schema)` — simplest is to widen `prepare`'s first param to `Skill | undefined` in `types.ts` and `sql.ts` (it is already ignored). Do that: in `types.ts` and `sql.ts` change `prepare(skill: Skill, ...)` / `prepare(_skill: Skill, ...)` to `prepare(skill: Skill | undefined, ...)` / `prepare(_skill: Skill | undefined, ...)`. Re-run `npx vitest run src/lib/tracks` — still PASS.

- [ ] **Step 4: Route `handleRun` and `handleSubmit` through the track**

Replace `handleRun` (current 59-69):

```tsx
  async function handleRun() {
    setBusy(true)
    setFeedback(null)
    try {
      setResult(await track!.run(sqlText))
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }
```

Replace the run+diff block inside `handleSubmit` (current 75-85) — keep the rest of the function identical:

```tsx
      const user = await track!.run(sqlText)
      setResult(user)
      const outcome = await track!.check(user, item.exercise)
      if (outcome.correct) {
        const gained = useProgress.getState().recordReviewSolve(hintsShown)
        setXpEarned(x => x + gained)
        setFeedback({ kind: 'success', gained })
      } else {
        setFeedback({ kind: 'wrong', message: `Not quite — ${outcome.reason}. Try again.` })
      }
```

- [ ] **Step 5: Typecheck + unit + e2e must stay green**

Run: `npm run build`
Expected: PASS.

Run: `npm test`
Expected: PASS — all green (the `src/lib/tracks` tests still pass after the `prepare` signature widening).

Run: `npm run e2e`
Expected: PASS — 8 passed, including `daily review updates mastery`.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReviewScreen.tsx src/lib/tracks/types.ts src/lib/tracks/sql.ts
git commit -m "refactor: ReviewScreen runs through the SQL track"
```

---

## Task 5: Full-suite green gate

- [ ] **Step 1: Content validation still passes (proves content pipeline untouched)**

Run: `npm run validate`
Expected: PASS — `✓ N exercises validated across M world(s)`.

- [ ] **Step 2: Full unit suite**

Run: `npm test`
Expected: PASS — all suites, including the new `src/lib/tracks/*.test.ts` (6 new tests total).

- [ ] **Step 3: Full e2e**

Run: `npm run e2e`
Expected: PASS — 8 passed.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: PASS — tsc clean, vite build emits `dist/`.

- [ ] **Step 5: Manual smoke (optional, if a dev server is handy)**

Run: `npm run dev`, open the app, solve one SELECT Basics exercise → confirm `✓ Correct!`, a single catch, and the result grid render exactly as before.

No commit — this task only verifies. Phase 0 is complete when all four commands above are green.

---

## Self-Review

**Spec coverage** (against `2026-07-22-multi-track-platform-design.md`, "Phase 0"):
- "Define the Track interface" → Task 1 (`types.ts`), five ports.
- "SQL becomes Track #0" → Task 1 (`sql.ts`) + Task 2 (registry).
- "Zero behavior change, validate stays green" → Tasks 3-5 route through the track with existing unit/e2e/validate as the net; Task 5 Step 1 runs `validate`.
- "Lift compare behind a verification interface, tabular-diff as the SQL impl" → `Track.check` is the verification port; `createSqlTrack.check` is the tabular-diff impl.
- Deferred *by design* (documented in the Scope boundary, not gaps): renaming `content.ts` fields, generalizing `WorldSchema` to a per-track context, and generalizing `scripts/validate-content.ts` / `build-sprites.ts` — these move in the phase that first adds a non-SQL track, since nothing here needs them.

**Placeholder scan:** every step has real code or an exact command + expected output. No TBD/TODO. The two "if TypeScript objects…" notes in Tasks 3-4 give the exact remedy (keep the typed import; widen `prepare`'s first param), not vague guidance.

**Type consistency:** `createSqlTrack(deps: SqlDeps)`, `SqlDeps { runQuery, loadWorld }`, `Track { prepare, run, check, reward, example }`, `CheckOutcome { correct, reason? }`, `Catch { name, label }`, `RewardContext { owned }`, `getTrack(skill, deps)` — names identical across Tasks 1-4. `reward` returns `Catch[]`, which `addCatches(world, entries)` already accepts (`{ name, label }[]`). `prepare`'s first param is widened to `Skill | undefined` in Task 4 Step 3 and reflected in the Task 4 commit (`types.ts`, `sql.ts` re-added).
