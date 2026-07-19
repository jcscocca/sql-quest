# SQL Quest Stage 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Stage 2 — SM-2-lite mastery decay + Daily Review, capped-dynamic collection with badges and a collection page, node-complete moments with lesson wrap-ups, and Foundations banks topped up to 6 exercises per skill.

**Architecture:** All additions ride on the Stage 1 static SPA. Two new pure libs (review scheduling, catch picking) get TDD; the progress store grows additive v1 fields (old saves stay valid via normalization); two new screens (Collection, Review) reuse the existing engine/editor components; content grows wrap-ups and ~20 new exercises, all gated by the validation harness.

**Tech Stack:** unchanged — React 19 + TS + Vite, DuckDB-WASM, zustand + idb-keyval, Vitest, Playwright.

**Repo:** `/Users/jscocca/Repos/sql-learning-app`, branch off `main` (create `stage-2`). Spec: `docs/superpowers/specs/2026-07-18-sql-learning-app-design.md` (Stage 2 mechanics finalized 2026-07-19). Convention: plan/spec code blocks stay byte-synced with shipped code.

**Design invariants (carry from Stage 1):** completion is sticky; comparator tolerates representation noise only (computed decimals pin rounding in prompts); banks append-only; content ships only through `npm run validate`.

---

## File structure

```
src/lib/xp.ts                      + addDays, dayDiff (TDD)
src/lib/review.ts                  NEW: schedule/decay/outcome/assembly (TDD)
src/lib/catches.ts                 NEW: pickCatches (TDD)
src/lib/progress.ts                + collection/badges/interval/due, recordSolve→{gained,newlyCompleted},
                                     addCatches/awardBadge/recordReview/recordReviewSolve (TDD)
src/lib/content.ts                 + lesson.wrapUp?, WorldSchema.entity?
src/components/ExerciseScreen.tsx  + catches, completion card, badges
src/components/CollectionScreen.tsx NEW
src/components/ReviewScreen.tsx     NEW
src/components/HomeScreen.tsx      + collection button, review callout
src/App.tsx                        + view routing for collection/review, region prop, assembly
src/styles.css                     + callout/tiles/type colors/completion/badges
scripts/build-pokemon-world.ts     + entity in schema.json (regenerate)
scripts/validate-content.ts        + wrapUp + entity checks
public/content/skills.json         + wrapUp ×5
public/content/exercises/*.json    top-up to 6 per skill
e2e/smoke.spec.ts                  + collection test, seeded review test
```

---

### Task 1: Date helpers (TDD)

**Files:**
- Modify: `src/lib/xp.ts`
- Test: `src/lib/xp.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `src/lib/xp.test.ts`:

```ts
test('addDays walks forward across month boundaries', () => {
  expect(addDays('2026-07-30', 2)).toBe('2026-08-01')
  expect(addDays('2026-07-19', 30)).toBe('2026-08-18')
})

test('dayDiff counts whole days between ISO dates', () => {
  expect(dayDiff('2026-07-19', '2026-07-21')).toBe(2)
  expect(dayDiff('2026-07-21', '2026-07-19')).toBe(-2)
  expect(dayDiff('2026-07-19', '2026-07-19')).toBe(0)
})
```
Also add `addDays, dayDiff` to the import from `'./xp'` at the top of the test file.

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/lib/xp.test.ts` — expect FAIL (no export).

- [ ] **Step 3: Implement** — append to `src/lib/xp.ts`:

```ts
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10)
}

export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
}
```

- [ ] **Step 4: Run to verify pass** — 13 tests in the file. Full `npm test` → 48.

- [ ] **Step 5: Commit** — `feat: date helpers for review scheduling`

---

### Task 2: Review scheduler (TDD)

**Files:**
- Create: `src/lib/review.ts`
- Test: `src/lib/review.test.ts`
- Modify (spec sync): `docs/superpowers/specs/2026-07-18-sql-learning-app-design.md` — in the Daily Review bullet, after "round-robin so no skill dominates", insert ", taking at most 2 exercises per skill per session".

`review.ts` must NOT import from `progress.ts` (progress imports review — a cycle otherwise). It defines a structural `ReviewableSkill` type instead.

- [ ] **Step 1: Write the failing tests** — `src/lib/review.test.ts`:

```ts
import { expect, test } from 'vitest'
import {
  assembleReview,
  displayedMastery,
  reviewOutcome,
  scheduleOnComplete,
  type ReviewableSkill,
} from './review'
import type { ExerciseBank } from './content'

const seq = (...vals: number[]) => {
  let i = 0
  return () => vals[i++ % vals.length]
}

const skill = (over: Partial<ReviewableSkill> = {}): ReviewableSkill => ({
  mastery: 3,
  completed: true,
  interval: 2,
  due: '2026-07-19',
  ...over,
})

const bank = (skillId: string, n: number): ExerciseBank => ({
  skillId,
  exercises: Array.from({ length: n }, (_, i) => ({
    id: `${skillId}-${i + 1}`,
    prompt: 'p',
    referenceSql: 'SELECT 1',
    orderMatters: false,
    hints: ['a', 'b', 'c'],
    xp: 10,
  })),
})

test('completing a node schedules first review in 2 days', () => {
  expect(scheduleOnComplete('2026-07-19')).toEqual({ interval: 2, due: '2026-07-21' })
})

test('displayed mastery holds until due, then drops per full overdue interval', () => {
  expect(displayedMastery(skill({ due: '2026-07-20' }), '2026-07-19')).toBe(3)
  expect(displayedMastery(skill({ due: '2026-07-19' }), '2026-07-19')).toBe(2)
  expect(displayedMastery(skill({ due: '2026-07-19' }), '2026-07-20')).toBe(2)
  expect(displayedMastery(skill({ due: '2026-07-19' }), '2026-07-21')).toBe(1)
  expect(displayedMastery(skill({ mastery: 5, due: '2026-07-01', interval: 2 }), '2026-07-19')).toBe(1)
})

test('unscheduled skills never display decay', () => {
  expect(displayedMastery({ mastery: 3, completed: true }, '2026-07-19')).toBe(3)
})

test('successful review raises mastery and doubles interval capped at 30', () => {
  expect(reviewOutcome(skill(), true, '2026-07-19')).toEqual({ mastery: 4, interval: 4, due: '2026-07-23' })
  expect(reviewOutcome(skill({ mastery: 5, interval: 20 }), true, '2026-07-19')).toEqual({
    mastery: 5,
    interval: 30,
    due: '2026-08-18',
  })
})

test('failed review lowers mastery and resets interval', () => {
  expect(reviewOutcome(skill({ mastery: 4, interval: 8 }), false, '2026-07-19')).toEqual({
    mastery: 3,
    interval: 2,
    due: '2026-07-21',
  })
  expect(reviewOutcome(skill({ mastery: 1 }), false, '2026-07-19')).toMatchObject({ mastery: 1 })
})

test('assembly takes only due, completed skills', () => {
  const items = assembleReview(
    {
      a: skill({ due: '2026-07-18' }),
      b: skill({ due: '2026-07-25' }),
      c: { mastery: 0, completed: false, interval: 2, due: '2026-07-01' },
    },
    { a: bank('a', 6), b: bank('b', 6), c: bank('c', 6) },
    '2026-07-19',
    seq(0),
  )
  expect(items.every(i => i.skillId === 'a')).toBe(true)
})

test('assembly caps at 2 exercises per skill and 8 total, most overdue first', () => {
  const skills = {
    fresh: skill({ due: '2026-07-19', interval: 10 }),
    rusty: skill({ due: '2026-07-01', interval: 2 }),
    mid: skill({ due: '2026-07-15', interval: 4 }),
    d4: skill({ due: '2026-07-16', interval: 4 }),
    d5: skill({ due: '2026-07-17', interval: 4 }),
  }
  const banks = Object.fromEntries(Object.keys(skills).map(k => [k, bank(k, 6)]))
  const items = assembleReview(skills, banks, '2026-07-19', seq(0))
  expect(items.length).toBe(8)
  expect(items[0].skillId).toBe('rusty')
  for (const id of Object.keys(skills))
    expect(items.filter(i => i.skillId === id).length).toBeLessThanOrEqual(2)
})

test('assembly with one due skill yields at most 2 items', () => {
  const items = assembleReview({ a: skill({ due: '2026-07-01' }) }, { a: bank('a', 6) }, '2026-07-19', seq(0))
  expect(items.length).toBe(2)
})
```

- [ ] **Step 2: Run to verify fail** — cannot resolve `./review`.

- [ ] **Step 3: Implement** — `src/lib/review.ts`:

```ts
import { addDays, dayDiff } from './xp'
import type { Exercise, ExerciseBank } from './content'

export interface ReviewableSkill {
  mastery: number
  completed: boolean
  interval?: number
  due?: string
}

export interface Schedule {
  interval: number
  due: string
}

export interface ReviewItem {
  skillId: string
  exercise: Exercise
}

export const FIRST_INTERVAL = 2
export const MAX_INTERVAL = 30
export const REVIEW_MAX = 8
export const PER_SKILL_MAX = 2
export const REVIEW_BASE_XP = 5

export function scheduleOnComplete(today: string): Schedule {
  return { interval: FIRST_INTERVAL, due: addDays(today, FIRST_INTERVAL) }
}

export function displayedMastery(sp: ReviewableSkill, today: string): number {
  if (!sp.due || !sp.interval || today < sp.due) return sp.mastery
  const overdue = dayDiff(sp.due, today)
  return Math.max(1, sp.mastery - 1 - Math.floor(overdue / sp.interval))
}

export function reviewOutcome(sp: ReviewableSkill, success: boolean, today: string): Required<Omit<ReviewableSkill, 'completed'>> {
  if (success) {
    const interval = Math.min(MAX_INTERVAL, (sp.interval ?? FIRST_INTERVAL) * 2)
    return { mastery: Math.min(5, sp.mastery + 1), interval, due: addDays(today, interval) }
  }
  return { mastery: Math.max(1, sp.mastery - 1), interval: FIRST_INTERVAL, due: addDays(today, FIRST_INTERVAL) }
}

export function assembleReview(
  skills: Record<string, ReviewableSkill>,
  banks: Record<string, ExerciseBank>,
  today: string,
  rng: () => number = Math.random,
): ReviewItem[] {
  const pools = Object.entries(skills)
    .filter(([id, sp]) => sp.completed && sp.due && sp.interval && sp.due <= today && banks[id])
    .map(([id, sp]) => ({
      id,
      ratio: dayDiff(sp.due!, today) / sp.interval!,
      pool: shuffle([...banks[id].exercises], rng).slice(0, PER_SKILL_MAX),
    }))
    .sort((a, b) => b.ratio - a.ratio)

  const items: ReviewItem[] = []
  let round = 0
  while (items.length < REVIEW_MAX) {
    let took = false
    for (const p of pools) {
      if (items.length >= REVIEW_MAX) break
      const exercise = p.pool[round]
      if (exercise) {
        items.push({ skillId: p.id, exercise })
        took = true
      }
    }
    if (!took) break
    round++
  }
  return items
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
```

- [ ] **Step 4: Run to verify pass** — 8 tests. Full `npm test` → 56.

- [ ] **Step 5: Apply the spec sync edit** (Files list above), then commit both — `feat: SM-2-lite review scheduling and session assembly`

---

### Task 3: Catch picker (TDD)

**Files:**
- Create: `src/lib/catches.ts`
- Test: `src/lib/catches.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/catches.test.ts`:

```ts
import { expect, test } from 'vitest'
import { pickCatches } from './catches'

const names = new Set(['pikachu', 'mew', 'eevee', 'ditto'])
const res = (rows: unknown[][]) => ({ columns: ['x'], rows })
const zero = () => 0

test('catches up to 3 new pokemon appearing in result cells', () => {
  const out = pickCatches(res([['pikachu'], ['mew'], ['eevee'], ['ditto']]), names, new Set(), [], 3, zero)
  expect(out.length).toBe(3)
  out.forEach(n => expect(names.has(n)).toBe(true))
})

test('owned pokemon and non-name cells are ignored', () => {
  const out = pickCatches(
    res([['pikachu', 55], ['mew', null], ['not-a-pokemon', 'ditto']]),
    names,
    new Set(['pikachu']),
    [],
    3,
    zero,
  )
  expect(out).not.toContain('pikachu')
  expect(out).not.toContain('not-a-pokemon')
  expect(out).toContain('mew')
  expect(out).toContain('ditto')
})

test('authored collectibles are always added on top of the cap', () => {
  const out = pickCatches(res([['pikachu'], ['mew'], ['eevee']]), names, new Set(), ['ditto'], 3, zero)
  expect(out).toContain('ditto')
  expect(out.length).toBe(4)
})

test('already-owned authored collectibles are not re-added', () => {
  const out = pickCatches(res([]), names, new Set(['ditto']), ['ditto'], 3, zero)
  expect(out).toEqual([])
})

test('duplicate cells produce one catch', () => {
  const out = pickCatches(res([['mew'], ['mew'], ['mew']]), names, new Set(), [], 3, zero)
  expect(out).toEqual(['mew'])
})
```

- [ ] **Step 2: Run to verify fail** — cannot resolve `./catches`.

- [ ] **Step 3: Implement** — `src/lib/catches.ts`:

```ts
import type { QueryResult } from './compare'

export function pickCatches(
  result: QueryResult,
  worldNames: Set<string>,
  owned: Set<string>,
  authored: string[] = [],
  cap = 3,
  rng: () => number = Math.random,
): string[] {
  const seen = new Set<string>()
  for (const row of result.rows)
    for (const cell of row)
      if (typeof cell === 'string' && worldNames.has(cell) && !owned.has(cell)) seen.add(cell)
  const candidates = [...seen]
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  const caught = new Set(candidates.slice(0, cap))
  for (const a of authored) if (!owned.has(a)) caught.add(a)
  return [...caught]
}
```

- [ ] **Step 4: Run to verify pass** — 5 tests. Full `npm test` → 61.

- [ ] **Step 5: Commit** — `feat: capped dynamic catch picker`

---

### Task 4: Content types, world entity, harness entity check

**Files:**
- Modify: `src/lib/content.ts`, `scripts/build-pokemon-world.ts`, `scripts/validate-content.ts`
- Regenerate: `public/worlds/pokemon/schema.json`

- [ ] **Step 1: Extend types** — in `src/lib/content.ts`, change `Skill.lesson` to `lesson: { intro: string; exampleSql: string; wrapUp?: string }` and add to `WorldSchema`: `entity?: { table: string; column: string }`.

- [ ] **Step 2: Builder** — in `scripts/build-pokemon-world.ts`, add to the schema object (after `name: 'Pokémon',`):

```ts
  entity: { table: 'pokemon', column: 'name' },
```

Run `npm run build:world` — parquet is byte-identical (deterministic), `schema.json` gains the entity block.

- [ ] **Step 3: Harness entity check** — in `scripts/validate-content.ts`, inside the world-loading loop after the `CREATE OR REPLACE TABLE` loop, add:

```ts
  if (schema.entity) {
    try {
      await conn.run(`SELECT ${schema.entity.column} FROM ${schema.entity.table} LIMIT 1`)
    } catch {
      failures.push(`world ${w}: entity ${schema.entity.table}.${schema.entity.column} is not queryable`)
    }
  }
```

Note: the loop currently discards `schema` after loading tables — hold it in a local (`const schema = ...` already exists inside the loop; place the check there).

- [ ] **Step 4: Verify** — `npm run validate` green; `npm run build`; `npm test` (61). Sabotage check: temporarily set entity.column to `'nope'` in schema.json, run validate → expect the entity failure; revert (re-run build:world) and re-run green.

- [ ] **Step 5: Commit** (including regenerated schema.json) — `feat: world entity declaration and wrapUp content type`

---

### Task 5: Progress store extensions (TDD)

**Files:**
- Modify: `src/lib/progress.ts`
- Test: `src/lib/progress.test.ts`

**Breaking signature change:** `recordSolve` now returns `{ gained: number; newlyCompleted: boolean }`. Update the four existing tests that read its return (`.gained`) and the one call site in `src/components/ExerciseScreen.tsx` — for THIS task only patch the call site minimally (`const res = ...; const gained = res.gained`) so the build stays green; Task 7 rewrites that section properly.

- [ ] **Step 1: Write the failing tests** — append to `src/lib/progress.test.ts` (and update existing `recordSolve` assertions from `expect(gained)` to `expect(gained.gained)` style; the `beforeEach` state gains `collection: [], badges: []`):

```ts
test('newly completing a node schedules its first review', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  const res = useProgress.getState().recordSolve('select-basics', 'sb-2', 10, 0, 2)
  expect(res.newlyCompleted).toBe(true)
  const sk = useProgress.getState().skills['select-basics']
  expect(sk.interval).toBe(2)
  expect(sk.due).toBeDefined()
  const again = useProgress.getState().recordSolve('select-basics', 'sb-3', 10, 0, 4)
  expect(again.newlyCompleted).toBe(false)
})

test('addCatches unions and reports only fresh names', () => {
  expect(useProgress.getState().addCatches(['pikachu', 'mew'])).toEqual(['pikachu', 'mew'])
  expect(useProgress.getState().addCatches(['mew', 'eevee'])).toEqual(['eevee'])
  expect(useProgress.getState().collection).toEqual(['pikachu', 'mew', 'eevee'])
})

test('awardBadge is idempotent', () => {
  useProgress.getState().awardBadge('select-basics')
  useProgress.getState().awardBadge('select-basics')
  expect(useProgress.getState().badges).toEqual(['select-basics'])
})

test('recordReview applies the scheduling outcome', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 1)
  useProgress.getState().recordReview('select-basics', true)
  const sk = useProgress.getState().skills['select-basics']
  expect(sk.mastery).toBe(4)
  expect(sk.interval).toBe(4)
})

test('recordReviewSolve awards reduced XP and updates streak', () => {
  const gained = useProgress.getState().recordReviewSolve(0)
  expect(gained).toBe(5)
  expect(useProgress.getState().xp).toBe(5)
  expect(useProgress.getState().streak.count).toBe(1)
})

test('stage 1 saves without collection/badges hydrate with defaults', async () => {
  const { set: idbSet } = await import('idb-keyval')
  await idbSet('sql-quest-progress', {
    version: 1,
    xp: 42,
    streak: { count: 3, lastDay: '2026-07-18' },
    skills: {},
  })
  await useProgress.getState().hydrate()
  expect(useProgress.getState().xp).toBe(42)
  expect(useProgress.getState().collection).toEqual([])
  expect(useProgress.getState().badges).toEqual([])
})

test('stage 1 completed skills get a review schedule backfilled on hydrate', async () => {
  const { set: idbSet } = await import('idb-keyval')
  await idbSet('sql-quest-progress', {
    version: 1,
    xp: 10,
    streak: { count: 1, lastDay: '2026-07-18' },
    skills: { 'select-basics': { solved: ['sb-1', 'sb-2'], completed: true, mastery: 3 } },
  })
  await useProgress.getState().hydrate()
  const sk = useProgress.getState().skills['select-basics']
  expect(sk.interval).toBe(2)
  expect(sk.due).toBe(todayString())
})

test('hydrate persists the backfilled schedule so due dates anchor once', async () => {
  const { set: idbSet, get: idbGetRaw } = await import('idb-keyval')
  await idbSet('sql-quest-progress', {
    version: 1,
    xp: 10,
    streak: { count: 1, lastDay: '2026-07-18' },
    skills: { 'select-basics': { solved: ['sb-1', 'sb-2'], completed: true, mastery: 3 } },
  })
  await useProgress.getState().hydrate()
  const stored = (await idbGetRaw('sql-quest-progress')) as ProgressState
  expect(stored.skills['select-basics'].interval).toBe(2)
  expect(stored.skills['select-basics'].due).toBe(todayString())
  expect(stored.collection).toEqual([])
})

test('bank growth preserves an evolved review schedule', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  useProgress.getState().recordSolve('select-basics', 'sb-2', 10, 0, 2)
  useProgress.getState().recordReview('select-basics', true)
  const before = useProgress.getState().skills['select-basics']
  useProgress.getState().recordSolve('select-basics', 'sb-3', 10, 0, 4)
  const after = useProgress.getState().skills['select-basics']
  expect(after.interval).toBe(before.interval)
  expect(after.due).toBe(before.due)
})

test('export round-trips collection, badges, and schedules', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 1)
  useProgress.getState().addCatches(['pikachu'])
  useProgress.getState().awardBadge('select-basics')
  const json = exportState(useProgress.getState())
  useProgress.setState({ version: 1, xp: 0, streak: { count: 0, lastDay: '' }, skills: {}, collection: [], badges: [], hydrated: true })
  useProgress.getState().importState(JSON.parse(json) as ProgressState)
  const s = useProgress.getState()
  expect(s.collection).toEqual(['pikachu'])
  expect(s.badges).toEqual(['select-basics'])
  expect(s.skills['select-basics'].interval).toBe(2)
})
```

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Implement** — `src/lib/progress.ts` becomes:

```ts
import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { computeXp, todayString, updateStreak, type Streak } from './xp'
import { FIRST_INTERVAL, REVIEW_BASE_XP, reviewOutcome, scheduleOnComplete } from './review'

export interface SkillProgress {
  solved: string[]
  completed: boolean
  mastery: number
  interval?: number
  due?: string
}

export interface ProgressState {
  version: 1
  xp: number
  streak: Streak
  skills: Record<string, SkillProgress>
  collection: string[]
  badges: string[]
}

export interface SolveResult {
  gained: number
  newlyCompleted: boolean
}

interface ProgressStore extends ProgressState {
  hydrated: boolean
  hydrate(): Promise<void>
  recordSolve(skillId: string, exerciseId: string, baseXp: number, hintsUsed: number, bankSize: number): SolveResult
  addCatches(names: string[]): string[]
  awardBadge(id: string): void
  recordReview(skillId: string, success: boolean): void
  recordReviewSolve(hintsUsed: number): number
  importState(imported: ProgressState): void
}

const KEY = 'sql-quest-progress'
const empty: ProgressState = {
  version: 1,
  xp: 0,
  streak: { count: 0, lastDay: '' },
  skills: {},
  collection: [],
  badges: [],
}

function isProgressState(x: unknown): x is ProgressState {
  if (typeof x !== 'object' || x === null) return false
  const s = x as ProgressState
  return (
    s.version === 1 &&
    typeof s.xp === 'number' &&
    typeof s.streak === 'object' && s.streak !== null &&
    typeof s.streak.count === 'number' &&
    typeof s.streak.lastDay === 'string' &&
    typeof s.skills === 'object' && s.skills !== null
  )
}

function normalize(s: ProgressState): ProgressState {
  const today = todayString()
  const skills: Record<string, SkillProgress> = {}
  for (const [id, sp] of Object.entries(s.skills ?? {})) {
    skills[id] =
      sp.completed && (!sp.interval || !sp.due)
        ? { ...sp, interval: FIRST_INTERVAL, due: today }
        : sp
  }
  return {
    ...s,
    skills,
    collection: Array.isArray(s.collection) ? s.collection : [],
    badges: Array.isArray(s.badges) ? s.badges : [],
  }
}

function dataOf(s: ProgressStore): ProgressState {
  return { version: 1, xp: s.xp, streak: s.streak, skills: s.skills, collection: s.collection, badges: s.badges }
}

function persist(next: ProgressState): void {
  void idbSet(KEY, next).catch(err => console.error('Progress persist failed', err))
}

export const useProgress = create<ProgressStore>((set, get) => ({
  ...empty,
  hydrated: false,

  async hydrate() {
    let saved: ProgressState | undefined
    try {
      saved = await idbGet<ProgressState>(KEY)
    } catch (err) {
      console.error('Failed to read saved progress', err)
    }
    if (saved && !isProgressState(saved)) console.warn('Ignoring unrecognized saved progress')
    if (saved && isProgressState(saved)) {
      const normalized = normalize(saved)
      if (JSON.stringify(normalized) !== JSON.stringify(saved)) persist(normalized)
      set({ ...normalized, hydrated: true })
    } else {
      set({ ...empty, hydrated: true })
    }
  },

  recordSolve(skillId, exerciseId, baseXp, hintsUsed, bankSize) {
    const s = get()
    const prev = s.skills[skillId] ?? { solved: [], completed: false, mastery: 0 }
    if (prev.solved.includes(exerciseId)) return { gained: 0, newlyCompleted: false }
    const gained = computeXp(baseXp, hintsUsed)
    const solved = [...prev.solved, exerciseId]
    const completed = prev.completed || solved.length >= bankSize
    const newlyCompleted = completed && !prev.completed
    const today = todayString()
    const schedule = newlyCompleted
      ? scheduleOnComplete(today)
      : { interval: prev.interval, due: prev.due }
    const next: ProgressState = {
      ...dataOf(s),
      xp: s.xp + gained,
      streak: updateStreak(s.streak.lastDay ? s.streak : null, today),
      skills: {
        ...s.skills,
        [skillId]: {
          solved,
          completed,
          mastery: completed ? Math.max(prev.mastery, 3) : prev.mastery,
          interval: schedule.interval,
          due: schedule.due,
        },
      },
    }
    set(next)
    persist(next)
    return { gained, newlyCompleted }
  },

  addCatches(names) {
    if (names.length === 0) return []
    const s = get()
    const fresh = names.filter(n => !s.collection.includes(n))
    if (fresh.length === 0) return []
    const next: ProgressState = { ...dataOf(s), collection: [...s.collection, ...fresh] }
    set(next)
    persist(next)
    return fresh
  },

  awardBadge(id) {
    const s = get()
    if (s.badges.includes(id)) return
    const next: ProgressState = { ...dataOf(s), badges: [...s.badges, id] }
    set(next)
    persist(next)
  },

  recordReview(skillId, success) {
    const s = get()
    const prev = s.skills[skillId]
    if (!prev) return
    const next: ProgressState = {
      ...dataOf(s),
      skills: { ...s.skills, [skillId]: { ...prev, ...reviewOutcome(prev, success, todayString()) } },
    }
    set(next)
    persist(next)
  },

  recordReviewSolve(hintsUsed) {
    const s = get()
    const gained = computeXp(REVIEW_BASE_XP, hintsUsed)
    const next: ProgressState = {
      ...dataOf(s),
      xp: s.xp + gained,
      streak: updateStreak(s.streak.lastDay ? s.streak : null, todayString()),
    }
    set(next)
    persist(next)
    return gained
  },

  importState(imported) {
    if (!isProgressState(imported)) throw new Error('Unrecognized progress file')
    const next = normalize({
      version: 1,
      xp: imported.xp,
      streak: imported.streak,
      skills: imported.skills,
      collection: imported.collection,
      badges: imported.badges,
    })
    set(next)
    persist(next)
  },
}))

export function exportState(s: ProgressState): string {
  return JSON.stringify(
    { version: s.version, xp: s.xp, streak: s.streak, skills: s.skills, collection: s.collection, badges: s.badges },
    null,
    2,
  )
}
```

- [ ] **Step 4: Patch the Stage 1 call site minimally** — in `src/components/ExerciseScreen.tsx` handleSubmit, replace the `const gained = ...recordSolve(...)` line with:

```ts
        const gained = useProgress
          .getState()
          .recordSolve(skill.id, ex.id, ex.xp, hintsShown, bank.exercises.length).gained
```

- [ ] **Step 5: Run to verify pass** — progress suite 20; full `npm test` → 71 (13 compare + 13 xp + 12 errors + 20 progress + 8 review + 5 catches). `npm run build` green. Note: the new test file imports `todayString` from `'./xp'` — add it to the test file's imports.

- [ ] **Step 6: Spec sync** — in `docs/superpowers/specs/2026-07-18-sql-learning-app-design.md`, three wording fixes reflecting implemented behavior: (a) in the mastery bullet, replace "its **displayed** mastery drops 1 level per full overdue interval (floor 1)" with "its **displayed** mastery drops one level when it comes due, then one more per full overdue interval (floor 1)"; (b) in the Daily Review bullet, replace "assembles 5–8 exercises" with "assembles up to 8 exercises"; (c) append to the first mastery bullet: " Skills completed before scheduling existed are backfilled (interval 2, due immediately) on first load."

- [ ] **Step 7: Commit** — `feat: progress store gains collection, badges, and review scheduling`

---

### Task 6: Lesson wrap-ups + harness requirement

**Files:**
- Modify: `public/content/skills.json`, `scripts/validate-content.ts`

- [ ] **Step 1: Add `wrapUp` to each skill's lesson in skills.json** (after each `exampleSql`):

- select-basics: `"You now own the two clauses every query starts with. SELECT chooses columns, FROM chooses the table — and explicit column lists beat SELECT * because they make intent obvious and results stable. Everything else in SQL decorates this skeleton."`
- where-filtering: `"Filtering is half of analysis: WHERE keeps rows that pass your test, AND/OR combine tests, and NULL passes no test at all — remember IS NULL when data is missing. From here on, almost every query you write will carry a WHERE."`
- order-limit: `"ORDER BY makes results deterministic; LIMIT keeps them digestible; together they answer every 'top N' question. The tiebreaker habit — ORDER BY total DESC, name — separates queries that are reproducible from ones that shuffle under your feet."`
- distinct: `"DISTINCT collapses duplicate result rows, and COUNT(DISTINCT col) counts unique values — your go-to for 'how many different…' questions. Remember it applies to the whole selected row: DISTINCT a, b means unique combinations."`
- aggregates: `"Aggregates fold many rows into one: COUNT, AVG, SUM, MIN, MAX. Without GROUP BY the whole table becomes a single row, and COUNT(col) skips NULLs while COUNT(*) doesn't — the foundation for the grouping you'll meet in Shaping."`

- [ ] **Step 2: Harness check** — in `scripts/validate-content.ts`, in the skill loop before the bank read, add:

```ts
  if (!skill.lesson?.wrapUp?.trim()) failures.push(`${skill.id}: missing lesson.wrapUp`)
```

- [ ] **Step 3: Verify** — `npm run validate` green (prove-it: temporarily blank one wrapUp → failure named → revert). `npm test` unchanged.

- [ ] **Step 4: Commit** — `feat: lesson wrap-ups for all Foundations skills`

---

### Task 7: ExerciseScreen — catches, badges, completion card

**Files:**
- Modify: `src/components/ExerciseScreen.tsx`, `src/App.tsx`

- [ ] **Step 1: Props + state.** ExerciseScreen props gain `region: Region` (import `Region` from `../lib/content`; import `pickCatches` from `../lib/catches`). Add state:

```tsx
  const [worldNames, setWorldNames] = useState<Set<string> | null>(null)
  const [sessionCatches, setSessionCatches] = useState<string[]>([])
  const [completion, setCompletion] = useState<{ catches: string[] } | null>(null)
```

- [ ] **Step 2: Fetch world names.** Replace the loadWorld useEffect body:

```tsx
  useEffect(() => {
    loadWorld(schema.world, schema.tables.map(t => t.name))
      .then(async () => {
        setEngineReady(true)
        if (schema.entity) {
          const r = await runQuery(`SELECT DISTINCT ${schema.entity.column} FROM ${schema.entity.table}`)
          setWorldNames(new Set(r.rows.map(row => String(row[0]))))
        }
      })
      .catch(e => setEngineError(String(e)))
  }, [schema])
```

- [ ] **Step 3: Success path.** Feedback type's success member becomes `{ kind: 'success'; gained: number; caught: string[]; finished: boolean }`. In handleSubmit, replace the success branch with:

```tsx
      if (outcome.equal) {
        const res = useProgress
          .getState()
          .recordSolve(skill.id, ex.id, ex.xp, hintsShown, bank.exercises.length)
        let caught: string[] = []
        if (res.gained > 0 && schema.entity) {
          try {
            let names = worldNames
            if (!names) {
              const r = await runQuery(
                `SELECT DISTINCT ${schema.entity.column} FROM ${schema.entity.table}`,
              )
              names = new Set(r.rows.map(row => String(row[0])))
              setWorldNames(names)
            }
            const owned = new Set(useProgress.getState().collection)
            caught = useProgress
              .getState()
              .addCatches(pickCatches(user, names, owned, ex.collectibles ?? []))
            if (caught.length > 0) setSessionCatches(prev => [...prev, ...caught])
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
```

- [ ] **Step 4: Success feedback render** becomes:

```tsx
          {feedback?.kind === 'success' && (
            <div className="feedback success">
              ✓ Correct! {feedback.gained > 0 ? `+${feedback.gained} XP` : 'Already solved — no XP this time.'}
              {feedback.caught.length > 0 && (
                <span className="catch-chip">Caught: {feedback.caught.join(', ')}!</span>
              )}
              {feedback.finished ? (
                <button onClick={() => setCompletion({ catches: sessionCatches })}>Finish node →</button>
              ) : (
                <button onClick={advance}>Next →</button>
              )}
            </div>
          )}
```

- [ ] **Step 5: Completion card.** Immediately after the `if (showLesson)` block's closing brace, add:

```tsx
  if (completion) {
    return (
      <div className="lesson completion-card">
        <h2>🏅 {skill.name} complete!</h2>
        {skill.lesson.wrapUp && <p>{skill.lesson.wrapUp}</p>}
        <p>
          Badge earned: <strong>{skill.name}</strong>
        </p>
        {completion.catches.length > 0 && <p>Caught this node: {completion.catches.join(', ')}</p>}
        <button onClick={onBack}>Back to map</button>
      </div>
    )
  }
```

- [ ] **Step 6: App passes region.** In `src/App.tsx`'s exercise branch:

```tsx
    const region = content.curriculum.regions.find(r => r.skills.some(s => s.id === view.skillId))!
```

and add `region={region}` to the `<ExerciseScreen>` element.

- [ ] **Step 7: Verify** — `npm run build`, `npm test` (71). Browser check (dev server): solve a fresh exercise → "Caught: …" chip; finish a bank → completion card with wrap-up; collection persists (check via export).

- [ ] **Step 8: Commit** — `feat: catching, badges, and node-complete moment in exercise flow`

---

### Task 8: CollectionScreen + routing

**Files:**
- Create: `src/components/CollectionScreen.tsx`
- Modify: `src/App.tsx`, `src/components/HomeScreen.tsx`

- [ ] **Step 1: Component** — `src/components/CollectionScreen.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { loadWorld, runQuery } from '../lib/duckdb'
import { useProgress } from '../lib/progress'
import type { Curriculum, WorldSchema } from '../lib/content'

export function CollectionScreen({ schema, curriculum, onBack }: {
  schema: WorldSchema
  curriculum: Curriculum
  onBack: () => void
}) {
  const collection = useProgress(s => s.collection)
  const badges = useProgress(s => s.badges)
  const [types, setTypes] = useState<Map<string, string> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadWorld(schema.world, schema.tables.map(t => t.name))
      .then(async () => {
        const r = await runQuery('SELECT name, type1 FROM pokemon')
        setTypes(new Map(r.rows.map(row => [String(row[0]), String(row[1])])))
      })
      .catch(e => setError(String(e)))
  }, [schema])

  const skillName = (id: string) =>
    curriculum.regions.flatMap(r => r.skills).find(s => s.id === id)?.name ?? id
  const regionName = (id: string) =>
    curriculum.regions.find(r => `region:${r.id}` === id)?.name ?? id.replace('region:', '')

  return (
    <div className="collection">
      <header className="topbar">
        <button className="back" onClick={onBack}>← Back</button>
        <h2>📚 Collection ({collection.length})</h2>
      </header>
      <section className="badge-shelf">
        <span className="label">Badges</span>
        {badges.length === 0 && <span className="muted">Complete a skill to earn your first badge.</span>}
        {badges.map(b => (
          <span key={b} className="badge-token">
            {b.startsWith('region:') ? `🏆 ${regionName(b)}` : `🏅 ${skillName(b)}`}
          </span>
        ))}
      </section>
      {error && <p className="muted">Could not load Pokémon details: {error}</p>}
      <div className="collection-grid">
        {[...collection].sort().map(name => (
          <div key={name} className={`tile type-${types?.get(name) ?? 'unknown'}`}>
            <span className="tile-name">{name}</span>
            <span className="tile-type">{types?.get(name) ?? ''}</span>
          </div>
        ))}
      </div>
      {collection.length === 0 && (
        <p className="muted">Solve exercises to catch the Pokémon your queries return.</p>
      )}
    </div>
  )
}
```

(The `SELECT name, type1 FROM pokemon` line is knowingly world-specific; generalize when a second world lands.)

- [ ] **Step 2: Routing.** In `src/App.tsx`: extend `View` with `| { screen: 'collection' }`; render branch:

```tsx
  if (view.screen === 'collection')
    return (
      <CollectionScreen
        schema={content.schemas.pokemon}
        curriculum={content.curriculum}
        onBack={() => setView({ screen: 'home' })}
      />
    )
```

- [ ] **Step 3: Home button.** In HomeScreen: props gain `onOpenCollection: () => void`; in the `.stats` div, before Export, add:

```tsx
          <button onClick={onOpenCollection}>📚 {progress.collection.length}</button>
```

App passes `onOpenCollection={() => setView({ screen: 'collection' })}`.

- [ ] **Step 4: Verify** — build + browser check (collection opens, tiles render for existing catches). `npm test` unchanged.

- [ ] **Step 5: Commit** — `feat: collection page with badge shelf and type-colored tiles`

---

### Task 9: ReviewScreen + Home callout + routing

**Files:**
- Create: `src/components/ReviewScreen.tsx`
- Modify: `src/App.tsx`, `src/components/HomeScreen.tsx`

- [ ] **Step 1: Component** — `src/components/ReviewScreen.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Editor } from './Editor'
import { ResultGrid } from './ResultGrid'
import { compareResults, type QueryResult } from '../lib/compare'
import { loadWorld, runQuery } from '../lib/duckdb'
import { translateError, TrainerError } from '../lib/errors'
import { useProgress } from '../lib/progress'
import type { ReviewItem } from '../lib/review'
import type { Curriculum, WorldSchema } from '../lib/content'

type Feedback =
  | { kind: 'success'; gained: number }
  | { kind: 'wrong'; message: string }
  | { kind: 'error'; friendly: string | null; raw: string }

interface SkillResult {
  before: number
  after: number
}

export function ReviewScreen({ items, schemas, curriculum, onDone }: {
  items: ReviewItem[]
  schemas: Record<string, WorldSchema>
  curriculum: Curriculum
  onDone: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [sqlText, setSqlText] = useState('')
  const [busy, setBusy] = useState(false)
  const [engineReady, setEngineReady] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [hintsShown, setHintsShown] = useState(0)
  const [hintUsed, setHintUsed] = useState<Record<string, boolean>>({})
  const [xpEarned, setXpEarned] = useState(0)
  const [summary, setSummary] = useState<Record<string, SkillResult> | null>(null)

  const item = items[idx]
  const allSkills = useMemo(() => curriculum.regions.flatMap(r => r.skills), [curriculum])
  const world = allSkills.find(s => s.id === item?.skillId)?.world ?? 'pokemon'
  const schema = schemas[world]

  useEffect(() => {
    loadWorld(schema.world, schema.tables.map(t => t.name))
      .then(() => setEngineReady(true))
      .catch(e => setFeedback({ kind: 'error', friendly: String(e), raw: '' }))
  }, [schema])

  function skillName(id: string): string {
    return allSkills.find(s => s.id === id)?.name ?? id
  }

  function showError(e: unknown) {
    const raw = e instanceof Error ? e.message : String(e)
    if (e instanceof TrainerError) setFeedback({ kind: 'error', friendly: raw, raw: '' })
    else setFeedback({ kind: 'error', friendly: translateError(raw, schema), raw })
  }

  async function handleRun() {
    setBusy(true)
    setFeedback(null)
    try {
      setResult(await runQuery(sqlText))
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit() {
    setBusy(true)
    setFeedback(null)
    try {
      const user = await runQuery(sqlText)
      setResult(user)
      const ref = await runQuery(item.exercise.referenceSql)
      const outcome = compareResults(user, ref, { orderMatters: item.exercise.orderMatters })
      if (outcome.equal) {
        const gained = useProgress.getState().recordReviewSolve(hintsShown)
        setXpEarned(x => x + gained)
        setFeedback({ kind: 'success', gained })
      } else {
        setFeedback({ kind: 'wrong', message: `Not quite — ${outcome.reason}. Try again.` })
      }
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  function advance() {
    if (idx + 1 < items.length) {
      setIdx(idx + 1)
      setSqlText('')
      setResult(null)
      setFeedback(null)
      setHintsShown(0)
      return
    }
    const store = useProgress.getState()
    const out: Record<string, SkillResult> = {}
    for (const skillId of [...new Set(items.map(i => i.skillId))]) {
      const before = store.skills[skillId]?.mastery ?? 0
      store.recordReview(skillId, !hintUsed[skillId])
      out[skillId] = { before, after: useProgress.getState().skills[skillId]?.mastery ?? before }
    }
    setSummary(out)
  }

  function showHint() {
    setHintsShown(h => h + 1)
    setHintUsed(m => ({ ...m, [item.skillId]: true }))
  }

  if (summary) {
    return (
      <div className="lesson completion-card">
        <h2>📅 Review complete!</h2>
        <p>+{xpEarned} XP earned.</p>
        <ul>
          {Object.entries(summary).map(([id, r]) => (
            <li key={id}>
              {skillName(id)}: mastery {r.before} → {r.after}
            </li>
          ))}
        </ul>
        <button onClick={onDone}>Done</button>
      </div>
    )
  }

  return (
    <div className="exercise">
      <header className="topbar">
        <button className="back" onClick={onDone}>← Exit</button>
        <h2>📅 Daily Review</h2>
        <span className="progress-count">
          {idx + 1}/{items.length} · {skillName(item.skillId)}
        </span>
      </header>
      <div className="exercise-layout">
        <aside className="left-panel">
          <div className="prompt">
            <span className="label">Review drill {idx + 1} of {items.length}</span>
            <p>{item.exercise.prompt}</p>
          </div>
          <div className="hints">
            {item.exercise.hints.slice(0, hintsShown).map((h, i) => (
              <div key={i} className="hint">
                <strong>Hint {i + 1}:</strong> {h}
              </div>
            ))}
            {hintsShown < item.exercise.hints.length && (
              <button onClick={showHint}>💡 Hint (marks this skill for reset)</button>
            )}
          </div>
        </aside>
        <main className="right-panel">
          <Editor key={`${idx}`} value={sqlText} onChange={setSqlText} schema={schema} />
          <div className="actions">
            <button onClick={() => void handleRun()} disabled={busy || !engineReady}>
              ▶ Run
            </button>
            <button onClick={() => void handleSubmit()} disabled={busy || !engineReady} className="submit">
              Submit
            </button>
            {!engineReady && <span className="engine-status">Loading SQL engine…</span>}
          </div>
          {feedback?.kind === 'success' && (
            <div className="feedback success">
              ✓ Correct! +{feedback.gained} XP
              <button onClick={advance}>{idx + 1 < items.length ? 'Next →' : 'Finish review →'}</button>
            </div>
          )}
          {feedback?.kind === 'wrong' && <div className="feedback wrong">{feedback.message}</div>}
          {feedback?.kind === 'error' && (
            <div className="feedback error">
              {feedback.friendly && <p>{feedback.friendly}</p>}
              {feedback.raw && <pre className="raw-error">{feedback.raw}</pre>}
            </div>
          )}
          {result && <ResultGrid result={result} />}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Home callout.** HomeScreen props gain `reviewCount: number`, `rustiest: { name: string; from: number; to: number } | null`, `onStartReview: () => void`. After the `</header>` closing tag, add:

```tsx
      {reviewCount > 0 && (
        <div className="review-callout">
          <strong>📅 Daily Review — {reviewCount} drill{reviewCount === 1 ? '' : 's'} ready</strong>
          {rustiest && (
            <span>
              {' '}· {rustiest.name} is getting rusty ({rustiest.from}→{rustiest.to})
            </span>
          )}
          <button onClick={onStartReview}>Start review</button>
        </div>
      )}
```

- [ ] **Step 3: App wiring.** In `src/App.tsx`: extend View with `| { screen: 'review'; items: ReviewItem[] }`; imports gain `assembleReview, displayedMastery, type ReviewItem` from `'../lib/review'` (path `./lib/review`), `todayString` from `'./lib/xp'`, ReviewScreen. Subscribe: `const skills = useProgress(s => s.skills)`. In the home branch:

```tsx
  const today = todayString()
  const reviewItems = assembleReview(skills, content.banks, today)
  const allSkills = content.curriculum.regions.flatMap(r => r.skills)
  let rustiest: { name: string; from: number; to: number } | null = null
  for (const sk of allSkills) {
    const sp = skills[sk.id]
    if (!sp?.completed) continue
    const shown = displayedMastery(sp, today)
    if (shown < sp.mastery && (!rustiest || sp.mastery - shown > rustiest.from - rustiest.to))
      rustiest = { name: sk.name, from: sp.mastery, to: shown }
  }
  return (
    <HomeScreen
      curriculum={content.curriculum}
      onOpenSkill={skillId => setView({ screen: 'exercise', skillId })}
      onOpenCollection={() => setView({ screen: 'collection' })}
      reviewCount={reviewItems.length}
      rustiest={rustiest}
      onStartReview={() => setView({ screen: 'review', items: reviewItems })}
    />
  )
```

Review branch:

```tsx
  if (view.screen === 'review')
    return (
      <ReviewScreen
        items={view.items}
        schemas={content.schemas}
        curriculum={content.curriculum}
        onDone={() => setView({ screen: 'home' })}
      />
    )
```

- [ ] **Step 4: Verify** — build + tests (71). Browser: with a completed skill whose `due` is future, no callout; manually verify via export/import (edit a due date into the past, import) that the callout appears, review runs, summary shows, callout clears.

- [ ] **Step 5: Commit** — `feat: daily review screen with home callout and mastery summary`

---

### Task 10: Styles

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Append:**

```css
.muted { color: var(--muted); }

.review-callout {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 24px 0;
  padding: 12px 16px;
  background: #422006;
  border: 1px solid var(--accent);
  border-radius: 8px;
}
.review-callout button { border-color: var(--accent); margin-left: auto; }

.catch-chip {
  background: #14532d;
  border: 1px solid var(--green);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 13px;
}

.completion-card { text-align: center; }
.completion-card ul { list-style: none; padding: 0; }
.completion-card li { margin: 6px 0; }

.collection { padding-bottom: 24px; }
.badge-shelf {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 14px 24px;
}
.badge-token {
  background: var(--panel);
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 14px;
}
.collection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  padding: 10px 24px;
}
.tile {
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  background: var(--panel);
}
.tile-name { font-weight: 600; }
.tile-type { font-size: 12px; color: var(--muted); text-transform: capitalize; }

.type-normal { border-left-color: #a8a29e; }
.type-fire { border-left-color: #f97316; }
.type-water { border-left-color: #3b82f6; }
.type-electric { border-left-color: #facc15; }
.type-grass { border-left-color: #4ade80; }
.type-ice { border-left-color: #67e8f9; }
.type-fighting { border-left-color: #b91c1c; }
.type-poison { border-left-color: #a855f7; }
.type-ground { border-left-color: #ca8a04; }
.type-flying { border-left-color: #93c5fd; }
.type-psychic { border-left-color: #f472b6; }
.type-bug { border-left-color: #84cc16; }
.type-rock { border-left-color: #92400e; }
.type-ghost { border-left-color: #6d28d9; }
.type-dragon { border-left-color: #4f46e5; }
.type-dark { border-left-color: #57534e; }
.type-steel { border-left-color: #94a3b8; }
.type-fairy { border-left-color: #fbcfe8; }
.type-unknown { border-left-color: var(--border); }
```

- [ ] **Step 2: Verify** — build; browser spot-check callout, tiles, completion card.

- [ ] **Step 3: Commit** — `feat: styles for review callout, collection tiles, completion card`

---

### Task 11: Foundations bank top-up (content authoring)

**Files:**
- Modify: all five `public/content/exercises/*.json`

This is a content-authoring task per the spec's pipeline (generated exercises, harness-gated, review-sampled). Author **4 new exercises per skill** (banks go 2 → 6). Rules — every one is enforced or reviewed:

1. IDs continue each bank's prefix (`sb-3`…`sb-6`, `wf-3`…, `ol-3`…, `d-3`…, `ag-3`…). No duplicates (harness enforces).
2. Prompts are real questions about the Pokémon data, pin the EXACT output columns by name, and are unambiguous — a careful learner following the prompt must produce the reference result. Use the existing 10 exercises as the style anchor.
3. `orderMatters: true` only when the prompt fully specifies ordering including a tiebreaker; reference SQL must be deterministic (harness enforces).
4. Computed decimals must specify rounding in the prompt and apply it in the reference SQL.
5. Exactly 3 hints: conceptual nudge → syntax pointer → full fenced ```sql answer equivalent to the reference (harness EXPLAIN-checks fenced SQL).
6. `xp` 10–15 scaled to difficulty; difficulty ramps across each bank (later exercises may combine the skill with earlier-region concepts, but must be solvable with only skills taught so far — e.g., an ORDER BY exercise may use WHERE, but a DISTINCT exercise may not use window functions).
7. `collectibles` on at most 2 exercises total across all banks, names must exist in the world (harness enforces), thematically apt (e.g., a legendary for a hard exercise).
8. Skill coverage within each bank: exercise the skill's syntax variations (e.g., where-filtering: OR, IS NULL/IS NOT NULL, LIKE, BETWEEN-style ranges; aggregates: SUM, MIN/MAX pairs, COUNT(col) vs COUNT(*); order-limit: ASC ordering, multi-column sorts; distinct: multi-column DISTINCT; select-basics: column subsets and ordering of columns).

- [ ] **Step 1:** Author the 20 exercises directly into the five bank files (append to each `exercises` array).
- [ ] **Step 2:** `npm run validate` → `✓ 30 exercises validated across 1 world(s)`. Fix anything it names.
- [ ] **Step 3:** Self-check every prompt against rule 2 (could a correct alternate reading fail?) and fix.
- [ ] **Step 4:** `npm test` unchanged; commit — `feat: top up Foundations banks to 6 exercises per skill`

---

### Task 12: E2E additions

**Files:**
- Modify: `e2e/smoke.spec.ts`

- [ ] **Step 1: Append two tests:**

```ts
test('catching pokemon and the collection page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /SELECT Basics/ }).click()
  await page.getByRole('button', { name: 'Start exercises' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.type('SELECT name FROM pokemon')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText(/Caught:/)).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '← Back' }).click()
  await page.getByRole('button', { name: /📚/ }).click()
  await expect(page.locator('.tile').first()).toBeVisible({ timeout: 30_000 })
})

test('daily review updates mastery', async ({ page }) => {
  await page.addInitScript(() => {
    const req = indexedDB.open('keyval-store')
    req.onupgradeneeded = () => req.result.createObjectStore('keyval')
    req.onsuccess = () => {
      const tx = req.result.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').put(
        {
          version: 1,
          xp: 20,
          streak: { count: 1, lastDay: '2026-07-01' },
          skills: {
            'select-basics': {
              solved: ['sb-1', 'sb-2'],
              completed: true,
              mastery: 3,
              interval: 2,
              due: '2026-07-02',
            },
          },
          collection: [],
          badges: ['select-basics'],
        },
        'sql-quest-progress',
      )
    }
  })
  await page.goto('/')
  await expect(page.getByText(/Daily Review/)).toBeVisible()
  await page.getByRole('button', { name: 'Start review' }).click()

  for (let done = 0; done < 2; done++) {
    await expect(page.getByText(new RegExp(`${done + 1}/2`))).toBeVisible({ timeout: 30_000 })
    for (let h = 0; h < 3; h++) await page.getByRole('button', { name: /💡 Hint/ }).click()
    const hintText = await page.locator('.hint').last().textContent()
    const sql = hintText!.match(/```sql([\s\S]*?)```/)![1].trim()
    await page.locator('.cm-content').click()
    await page.keyboard.type(sql)
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText(/✓ Correct!/)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: done === 0 ? 'Next →' : 'Finish review →' }).click()
  }

  await expect(page.getByText(/Review complete/)).toBeVisible()
  await expect(page.getByText(/mastery 3 → 2/)).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(/Daily Review/)).not.toBeVisible()
})
```

Notes: hints used → skill review fails → mastery 3→2 deterministically; the failed review pushes `due` two days out, so the callout disappears — both asserted. The hint-3 fenced SQL is comparator-equivalent to the reference by harness guarantee.

- [ ] **Step 2:** `npm run e2e` → 5/5. If a selector mismatches the built DOM, fix whichever is wrong minimally and note it.
- [ ] **Step 3:** Commit — `test: e2e coverage for collection and daily review`

---

### Task 13: README + final gate

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** In README's feature intro paragraph, after "starting with Pokémon.", add: `Daily Review resurfaces rusty skills on an expanding schedule, and correct queries catch the Pokémon they return into your collection.`
- [ ] **Step 2:** Full gate: `npm test && npm run validate && npm run build && npm run e2e` — all green (71 unit / 30 exercises / build / 5 e2e).
- [ ] **Step 3:** Commit — `docs: Stage 2 features in README`

---

## Plan self-review notes

- **Spec coverage (Stage 2)**: SM-2-lite fields + outcomes ✓ (T1/T2/T5); displayed decay ✓ (T2, used by Home rustiest T9); Daily Review assembly/round-robin/2-per-skill cap ✓ (T2/T9, spec synced); review XP base 5 + streak ✓ (T5/T9); capped dynamic catching + authored bonuses, first-solve only ✓ (T3/T7 — re-solves return gained 0 which gates catching); no catches in review ✓ (ReviewScreen never calls addCatches); badges skill+region ✓ (T7); collection page tiles + badge shelf, no sprites ✓ (T8/T10); node-complete moment + wrapUp ✓ (T6/T7); bank top-up 6/skill ✓ (T11); v1 additive schema, old saves normalized ✓ (T5).
- **Known judgment calls**: catching keys on `gained > 0` (first solve); displayed decay starts the day a skill comes due; review skill success = no hints used on its items (wrong attempts don't fail); CollectionScreen's type lookup is pokemon-specific (noted inline); review XP banks per drill while mastery outcomes apply only on session completion — abandoning mid-session keeps earned XP and leaves the skill due, and repeat solve-and-exit "farming" is accepted since XP is stakes-free and re-doing drills is practice.
- **Type consistency**: `ReviewableSkill` structural (no progress↔review cycle); `SolveResult` consumed in T7; `REVIEW_BASE_XP` lives in review.ts and is imported by progress.ts.
