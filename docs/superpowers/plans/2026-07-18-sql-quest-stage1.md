# SQL Quest Stage 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Stage 1 MVP of SQL Quest — Pokémon world + Foundations region with the full exercise loop (real editor, results-diff checking, hint ladder, XP/streak, IndexedDB progress).

**Architecture:** Fully static React+TS SPA. DuckDB-WASM (bundled locally, no CDN) runs queries in a web worker against Parquet files built by a Node script from PokéAPI CSV dumps. All curriculum/exercise content is JSON under `public/`; the app is a generic player. Progress persists to IndexedDB via idb-keyval + zustand.

**Tech Stack:** React 19, TypeScript, Vite, @duckdb/duckdb-wasm, @uiw/react-codemirror + @codemirror/lang-sql, zustand, idb-keyval, Vitest (+fake-indexeddb), Playwright, @duckdb/node-api + tsx for build/validate scripts.

**Repo:** `/Users/jscocca/Repos/sql-learning-app` (already a git repo containing `docs/`). Spec: `docs/superpowers/specs/2026-07-18-sql-learning-app-design.md`. Node 20+ required. Run all commands from repo root.

**Out of scope (later stages):** mastery decay / Daily Review, collection page & badges, worlds beyond Pokémon, regions beyond Foundations, "Ask Claude" button. The content format still carries optional `collectibles` so Stage 2 needs no content migration.

---

## File structure

```
package.json / vite.config.ts / tsconfig.json / index.html / playwright.config.ts
public/
  worlds/pokemon/{pokemon.parquet, schema.json}     ← Task 6 output (committed)
  content/skills.json                                ← curriculum tree
  content/exercises/<skill-id>.json                  ← exercise banks (5 files)
src/
  main.tsx, App.tsx, styles.css, test-setup.ts
  lib/compare.ts        results-diff comparator (pure, TDD)
  lib/xp.ts             XP + streak math (pure, TDD)
  lib/errors.ts         read-only guard + error translation (pure, TDD)
  lib/content.ts        content types + JSON loader
  lib/duckdb.ts         DuckDB-WASM engine service (worker, timeout, restart)
  lib/progress.ts       zustand store + IndexedDB persistence (TDD)
  components/{Editor,ResultGrid,SchemaBrowser,HomeScreen,ExerciseScreen}.tsx
scripts/
  build-pokemon-world.ts   PokéAPI CSVs → Parquet + schema.json
  validate-content.ts      content gate: every exercise verified against DuckDB
e2e/smoke.spec.ts
data-src/                  downloaded CSVs (gitignored)
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/test-setup.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Write config files**

`package.json`:
```json
{
  "name": "sql-quest",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "e2e": "playwright test",
    "build:world": "tsx scripts/build-pokemon-world.ts",
    "validate": "tsx scripts/validate-content.ts"
  }
}
```

`vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "scripts", "e2e"]
}
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SQL Quest</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
```

`src/App.tsx` (placeholder, replaced in Task 14):
```tsx
export default function App() {
  return <h1>⚡ SQL Quest</h1>
}
```

`src/styles.css` (placeholder, replaced in Task 14):
```css
body { font-family: system-ui, sans-serif; }
```

`src/test-setup.ts`:
```ts
import 'fake-indexeddb/auto'
```

Append to `.gitignore`:
```
data-src/
test-results/
playwright-report/
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react react-dom zustand idb-keyval @duckdb/duckdb-wasm @uiw/react-codemirror @codemirror/lang-sql
npm install -D typescript vite @vitejs/plugin-react @types/react @types/react-dom vitest fake-indexeddb tsx @duckdb/node-api @playwright/test @types/node
npx playwright install chromium
```
Expected: installs succeed, `package-lock.json` created.

- [ ] **Step 3: Verify build works**

Run: `npm run build`
Expected: tsc passes, vite build outputs `dist/`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS app with test tooling"
```

---

### Task 2: Results-diff comparator (TDD)

The correctness heart of the app: compares a user's query result to the reference result. Row-order-insensitive by default, column-order-insensitive always (users may reorder/alias columns), float tolerance, NULL-aware.

**Files:**
- Create: `src/lib/compare.ts`
- Test: `src/lib/compare.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/compare.test.ts`:
```ts
import { expect, test } from 'vitest'
import { compareResults } from './compare'

const res = (columns: string[], rows: unknown[][]) => ({ columns, rows })

test('identical results match', () => {
  const a = res(['name', 'atk'], [['pikachu', 55], ['mew', 100]])
  expect(compareResults(a, a).equal).toBe(true)
})

test('row order is ignored by default', () => {
  const user = res(['name'], [['mew'], ['pikachu']])
  const ref = res(['name'], [['pikachu'], ['mew']])
  expect(compareResults(user, ref).equal).toBe(true)
})

test('row order is enforced when orderMatters', () => {
  const user = res(['name'], [['mew'], ['pikachu']])
  const ref = res(['name'], [['pikachu'], ['mew']])
  expect(compareResults(user, ref, { orderMatters: true }).equal).toBe(false)
})

test('user column order may differ from reference', () => {
  const user = res(['atk', 'name'], [[55, 'pikachu'], [100, 'mew']])
  const ref = res(['name', 'attack'], [['pikachu', 55], ['mew', 100]])
  expect(compareResults(user, ref).equal).toBe(true)
})

test('column names are irrelevant, only values count', () => {
  const user = res(['whatever'], [['pikachu']])
  const ref = res(['name'], [['pikachu']])
  expect(compareResults(user, ref).equal).toBe(true)
})

test('floats compare with tolerance', () => {
  const user = res(['avg'], [[0.1 + 0.2]])
  const ref = res(['avg'], [[0.3]])
  expect(compareResults(user, ref).equal).toBe(true)
})

test('bigint and number compare equal', () => {
  const user = res(['n'], [[3n]])
  const ref = res(['n'], [[3]])
  expect(compareResults(user, ref).equal).toBe(true)
})

test('NULL does not equal zero or empty string', () => {
  expect(compareResults(res(['x'], [[null]]), res(['x'], [[0]])).equal).toBe(false)
  expect(compareResults(res(['x'], [[null]]), res(['x'], [['']])).equal).toBe(false)
  expect(compareResults(res(['x'], [[null]]), res(['x'], [[null]])).equal).toBe(true)
})

test('row count mismatch gives a reason', () => {
  const out = compareResults(res(['x'], [[1]]), res(['x'], [[1], [2]]))
  expect(out.equal).toBe(false)
  expect(out.reason).toContain('expected 2 row(s), got 1')
})

test('column count mismatch gives a reason', () => {
  const out = compareResults(res(['a'], [[1]]), res(['a', 'b'], [[1, 2]]))
  expect(out.equal).toBe(false)
  expect(out.reason).toContain('expected 2 column(s), got 1')
})

test('different values fail', () => {
  const out = compareResults(res(['x'], [[1]]), res(['x'], [[2]]))
  expect(out.equal).toBe(false)
})

test('same multisets but inconsistent row pairing fails', () => {
  const user = res(['a', 'b'], [[1, 'y'], [2, 'x']])
  const ref = res(['a', 'b'], [[1, 'x'], [2, 'y']])
  expect(compareResults(user, ref).equal).toBe(false)
})

test('adjacent values are not concatenation-confused', () => {
  const user = res(['a', 'b'], [['x', 'yz']])
  const ref = res(['a', 'b'], [['xy', 'z']])
  expect(compareResults(user, ref).equal).toBe(false)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/compare.test.ts`
Expected: FAIL — cannot resolve `./compare`.

- [ ] **Step 3: Implement the comparator**

`src/lib/compare.ts`:
```ts
export interface QueryResult {
  columns: string[]
  rows: unknown[][]
}

export interface CompareOptions {
  orderMatters?: boolean
}

export interface CompareOutcome {
  equal: boolean
  reason?: string
}

export function compareResults(
  user: QueryResult,
  ref: QueryResult,
  opts: CompareOptions = {},
): CompareOutcome {
  if (user.columns.length !== ref.columns.length)
    return { equal: false, reason: `expected ${ref.columns.length} column(s), got ${user.columns.length}` }
  if (user.rows.length !== ref.rows.length)
    return { equal: false, reason: `expected ${ref.rows.length} row(s), got ${user.rows.length}` }

  const n = ref.columns.length
  const ordered = opts.orderMatters ?? false
  const refVectors = Array.from({ length: n }, (_, c) => columnVector(ref, c, ordered))
  const userVectors = Array.from({ length: n }, (_, c) => columnVector(user, c, ordered))
  const candidates = refVectors.map(rv =>
    userVectors.map((uv, j) => (uv === rv ? j : -1)).filter(j => j >= 0),
  )
  const used = new Array<boolean>(n).fill(false)
  const perm = new Array<number>(n).fill(-1)

  const search = (i: number): boolean => {
    if (i === n) return rowsMatch(user, ref, perm, ordered)
    for (const j of candidates[i]) {
      if (used[j]) continue
      used[j] = true
      perm[i] = j
      if (search(i + 1)) return true
      used[j] = false
    }
    return false
  }

  return search(0) ? { equal: true } : { equal: false, reason: 'the values differ' }
}

function canon(v: unknown): string {
  if (v === null || v === undefined) return '\u0000NULL'
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'number') return Number.isInteger(v) ? v.toString() : v.toPrecision(10)
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

function columnVector(res: QueryResult, col: number, ordered: boolean): string {
  const vals = res.rows.map(r => canon(r[col]))
  if (!ordered) vals.sort()
  return vals.join('\u0001')
}

function rowsMatch(user: QueryResult, ref: QueryResult, perm: number[], ordered: boolean): boolean {
  const userTuples = user.rows.map(row => perm.map(j => canon(row[j])).join('\u0001'))
  const refTuples = ref.rows.map(row => row.map(canon).join('\u0001'))
  if (!ordered) {
    userTuples.sort()
    refTuples.sort()
  }
  return userTuples.every((t, i) => t === refTuples[i])
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/compare.test.ts`
Expected: 13 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compare.ts src/lib/compare.test.ts
git commit -m "feat: results-diff comparator with order/column/float/NULL semantics"
```

---

### Task 3: XP and streak math (TDD)

**Files:**
- Create: `src/lib/xp.ts`
- Test: `src/lib/xp.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/xp.test.ts`:
```ts
import { expect, test } from 'vitest'
import { computeXp, todayString, updateStreak } from './xp'

test('full XP with no hints', () => {
  expect(computeXp(10, 0)).toBe(10)
})

test('each hint costs 3 XP', () => {
  expect(computeXp(10, 1)).toBe(7)
  expect(computeXp(10, 2)).toBe(4)
})

test('XP never drops below 2', () => {
  expect(computeXp(10, 3)).toBe(2)
  expect(computeXp(10, 5)).toBe(2)
})

test('first ever practice starts a streak of 1', () => {
  expect(updateStreak(null, '2026-07-18')).toEqual({ count: 1, lastDay: '2026-07-18' })
})

test('same-day practice leaves streak unchanged', () => {
  expect(updateStreak({ count: 4, lastDay: '2026-07-18' }, '2026-07-18')).toEqual({ count: 4, lastDay: '2026-07-18' })
})

test('next-day practice increments streak', () => {
  expect(updateStreak({ count: 4, lastDay: '2026-07-17' }, '2026-07-18')).toEqual({ count: 5, lastDay: '2026-07-18' })
})

test('a gap resets the streak to 1', () => {
  expect(updateStreak({ count: 9, lastDay: '2026-07-10' }, '2026-07-18')).toEqual({ count: 1, lastDay: '2026-07-18' })
})

test('todayString formats as YYYY-MM-DD', () => {
  expect(todayString(new Date(2026, 6, 18))).toBe('2026-07-18')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/xp.test.ts`
Expected: FAIL — cannot resolve `./xp`.

- [ ] **Step 3: Implement**

`src/lib/xp.ts`:
```ts
export interface Streak {
  count: number
  lastDay: string
}

export function computeXp(base: number, hintsUsed: number): number {
  return Math.max(base - 3 * hintsUsed, 2)
}

export function updateStreak(prev: Streak | null, today: string): Streak {
  if (!prev || !prev.lastDay) return { count: 1, lastDay: today }
  const days = (Date.parse(today) - Date.parse(prev.lastDay)) / 86_400_000
  if (days === 0) return prev
  if (days === 1) return { count: prev.count + 1, lastDay: today }
  return { count: 1, lastDay: today }
}

export function todayString(d = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/xp.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/xp.ts src/lib/xp.test.ts
git commit -m "feat: XP and streak math"
```

---

### Task 4: Content types and loader

Pure types + a fetch helper. No test (no logic worth testing); exercised by everything downstream and by E2E.

**Files:**
- Create: `src/lib/content.ts`

- [ ] **Step 1: Write the module**

`src/lib/content.ts`:
```ts
export interface WorldSchema {
  world: string
  name: string
  tables: TableSchema[]
}

export interface TableSchema {
  name: string
  description: string
  columns: { name: string; type: string; description: string }[]
}

export interface Curriculum {
  regions: Region[]
}

export interface Region {
  id: string
  name: string
  skills: Skill[]
}

export interface Skill {
  id: string
  name: string
  world: string
  requires: string[]
  lesson: { intro: string; exampleSql: string }
}

export interface Exercise {
  id: string
  prompt: string
  referenceSql: string
  orderMatters: boolean
  hints: string[]
  xp: number
  collectibles?: string[]
}

export interface ExerciseBank {
  skillId: string
  exercises: Exercise[]
}

export async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`)
  return res.json() as Promise<T>
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/content.ts
git commit -m "feat: content types and JSON loader"
```

---

### Task 5: Read-only guard and error translation (TDD)

**Files:**
- Create: `src/lib/errors.ts`
- Test: `src/lib/errors.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/errors.test.ts`:
```ts
import { expect, test } from 'vitest'
import { assertReadOnly, TrainerError, translateError } from './errors'
import type { WorldSchema } from './content'

const schema: WorldSchema = {
  world: 'pokemon',
  name: 'Pokémon',
  tables: [
    {
      name: 'pokemon',
      description: 'one row per Pokémon',
      columns: [
        { name: 'name', type: 'VARCHAR', description: '' },
        { name: 'attack', type: 'INTEGER', description: '' },
      ],
    },
  ],
}

test('SELECT and WITH pass, including trailing semicolon and comments', () => {
  expect(() => assertReadOnly('SELECT 1')).not.toThrow()
  expect(() => assertReadOnly('  with x as (select 1) select * from x;')).not.toThrow()
  expect(() => assertReadOnly('-- top pokemon\nSELECT name FROM pokemon')).not.toThrow()
})

test('mutations are rejected', () => {
  expect(() => assertReadOnly('DROP TABLE pokemon')).toThrow(TrainerError)
  expect(() => assertReadOnly('INSERT INTO pokemon VALUES (1)')).toThrow(TrainerError)
  expect(() => assertReadOnly('UPDATE pokemon SET attack = 0')).toThrow(TrainerError)
})

test('multiple statements are rejected', () => {
  expect(() => assertReadOnly('SELECT 1; SELECT 2')).toThrow(TrainerError)
})

test('unknown column errors list real columns', () => {
  const out = translateError('Binder Error: Referenced column "atk" not found in FROM clause!', schema)
  expect(out).toContain('"atk"')
  expect(out).toContain('name, attack')
})

test('unknown table errors list real tables', () => {
  const out = translateError('Catalog Error: Table with name pokmon does not exist!', schema)
  expect(out).toContain('pokmon')
  expect(out).toContain('pokemon')
})

test('GROUP BY errors get the plain-language rule', () => {
  const out = translateError('Binder Error: column "name" must appear in the GROUP BY clause or must be part of an aggregate function.', schema)
  expect(out).toMatch(/aggregate function|GROUP BY/)
})

test('unrecognized errors translate to null', () => {
  expect(translateError('Parser Error: syntax error at or near "FORM"', schema)).toBeNull()
})

test('semicolons inside string literals are not multi-statement', () => {
  expect(() => assertReadOnly("SELECT 'a;b' AS x")).not.toThrow()
  expect(() => assertReadOnly("SELECT 'it''s; fine' AS x")).not.toThrow()
})

test('comment markers inside string literals cannot smuggle a second statement', () => {
  expect(() => assertReadOnly("SELECT '--' AS x; DROP TABLE pokemon")).toThrow(TrainerError)
})

test('parenthesized queries are allowed', () => {
  expect(() => assertReadOnly('(SELECT 1)')).not.toThrow()
  expect(() => assertReadOnly('(SELECT 1) UNION (SELECT 2)')).not.toThrow()
})

test('WITH-prefixed mutations are rejected', () => {
  expect(() => assertReadOnly('WITH x AS (SELECT 1) DELETE FROM pokemon')).toThrow(TrainerError)
})

test('TrainerError carries its name', () => {
  expect(new TrainerError('x').name).toBe('TrainerError')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/errors.test.ts`
Expected: FAIL — cannot resolve `./errors`.

- [ ] **Step 3: Implement**

`src/lib/errors.ts`:
```ts
import type { WorldSchema } from './content'

export class TrainerError extends Error {
  name = 'TrainerError'
}

const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|ATTACH|COPY|INSTALL|LOAD|SET|CALL|BEGIN|COMMIT|ROLLBACK|VACUUM|EXPORT|IMPORT)\b/i

export function assertReadOnly(sql: string): void {
  const masked = sql.replace(/'(?:[^']|'')*'/g, "''")
  const stripped = masked
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
  const statements = stripped.split(';').map(s => s.trim()).filter(Boolean)
  if (statements.length > 1) throw new TrainerError('One statement at a time, please.')
  const only = statements[0] ?? ''
  const first = only.match(/^\(*\s*([A-Za-z]+)/)?.[1]?.toUpperCase() ?? ''
  if (first !== 'SELECT' && first !== 'WITH')
    throw new TrainerError('This trainer is read-only — queries must start with SELECT (or WITH).')
  if (FORBIDDEN.test(only))
    throw new TrainerError('This trainer is read-only — data-modifying statements are not allowed.')
}

export function translateError(raw: string, schema: WorldSchema): string | null {
  let m = raw.match(/Referenced column "([^"]+)" not found/i)
  if (m) {
    const cols = schema.tables.flatMap(t => t.columns.map(c => c.name)).join(', ')
    return `There is no column called "${m[1]}". Available columns: ${cols}.`
  }
  m = raw.match(/Table with name (\S+) does not exist/i)
  if (m) {
    const tables = schema.tables.map(t => t.name).join(', ')
    return `There is no table called "${m[1]}". Tables in this world: ${tables}.`
  }
  if (/GROUP BY clause/i.test(raw))
    return 'Every selected column must either be wrapped in an aggregate function (COUNT, AVG, MAX, …) or listed in GROUP BY.'
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/errors.test.ts`
Expected: 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/errors.ts src/lib/errors.test.ts
git commit -m "feat: read-only guard and beginner-friendly error translation"
```

---

### Task 6: Pokémon world builder

Downloads PokéAPI's canonical CSV dumps (a few files from GitHub — no per-Pokémon API calls), assembles one denormalized `pokemon` table with DuckDB, writes Parquet + `schema.json`. Output is committed so the app never needs the network.

**Files:**
- Create: `scripts/build-pokemon-world.ts`
- Output (committed): `public/worlds/pokemon/pokemon.parquet`, `public/worlds/pokemon/schema.json`

- [ ] **Step 1: Write the builder**

`scripts/build-pokemon-world.ts`:
```ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'

const CSV_BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv'
const FILES = ['pokemon.csv', 'pokemon_species.csv', 'pokemon_stats.csv', 'pokemon_types.csv', 'types.csv']
const SRC = 'data-src/pokemon'
const OUT = 'public/worlds/pokemon'

mkdirSync(SRC, { recursive: true })
mkdirSync(OUT, { recursive: true })

for (const f of FILES) {
  const path = `${SRC}/${f}`
  if (existsSync(path)) continue
  console.log(`downloading ${f}…`)
  const res = await fetch(`${CSV_BASE}/${f}`)
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
}

const db = await DuckDBInstance.create()
const conn = await db.connect()

await conn.run(`
CREATE TABLE pokemon AS
WITH stats AS (
  SELECT pokemon_id,
    MAX(CASE stat_id WHEN 1 THEN base_stat END) AS hp,
    MAX(CASE stat_id WHEN 2 THEN base_stat END) AS attack,
    MAX(CASE stat_id WHEN 3 THEN base_stat END) AS defense,
    MAX(CASE stat_id WHEN 4 THEN base_stat END) AS special_attack,
    MAX(CASE stat_id WHEN 5 THEN base_stat END) AS special_defense,
    MAX(CASE stat_id WHEN 6 THEN base_stat END) AS speed
  FROM read_csv('${SRC}/pokemon_stats.csv') GROUP BY pokemon_id
),
ptypes AS (
  SELECT pt.pokemon_id,
    MAX(CASE pt.slot WHEN 1 THEN t.identifier END) AS type1,
    MAX(CASE pt.slot WHEN 2 THEN t.identifier END) AS type2
  FROM read_csv('${SRC}/pokemon_types.csv') pt
  JOIN read_csv('${SRC}/types.csv') t ON t.id = pt.type_id
  GROUP BY pt.pokemon_id
)
SELECT
  p.id,
  p.identifier AS name,
  sp.generation_id AS generation,
  ptypes.type1,
  ptypes.type2,
  stats.hp, stats.attack, stats.defense,
  stats.special_attack, stats.special_defense, stats.speed,
  stats.hp + stats.attack + stats.defense + stats.special_attack + stats.special_defense + stats.speed AS total,
  p.height / 10.0 AS height_m,
  p.weight / 10.0 AS weight_kg,
  sp.is_legendary::BOOLEAN AS is_legendary,
  prev.identifier AS evolves_from
FROM read_csv('${SRC}/pokemon.csv') p
JOIN read_csv('${SRC}/pokemon_species.csv') sp ON sp.id = p.species_id
LEFT JOIN read_csv('${SRC}/pokemon_species.csv') prev ON prev.id = sp.evolves_from_species_id
JOIN stats ON stats.pokemon_id = p.id
JOIN ptypes ON ptypes.pokemon_id = p.id
WHERE p.is_default = 1
ORDER BY p.id
`)

await conn.run(`COPY pokemon TO '${OUT}/pokemon.parquet' (FORMAT parquet)`)
const reader = await conn.runAndReadAll('SELECT COUNT(*) AS n FROM pokemon')
console.log(`wrote ${OUT}/pokemon.parquet with ${reader.getRows()[0][0]} rows`)

const schema = {
  world: 'pokemon',
  name: 'Pokémon',
  tables: [
    {
      name: 'pokemon',
      description: 'One row per Pokémon species (default form)',
      columns: [
        { name: 'id', type: 'INTEGER', description: 'National Pokédex number' },
        { name: 'name', type: 'VARCHAR', description: 'Lowercase species name, e.g. pikachu' },
        { name: 'generation', type: 'INTEGER', description: 'Game generation introduced (1–9)' },
        { name: 'type1', type: 'VARCHAR', description: 'Primary type, e.g. fire' },
        { name: 'type2', type: 'VARCHAR', description: 'Secondary type — NULL for single-typed Pokémon' },
        { name: 'hp', type: 'INTEGER', description: 'Base HP stat' },
        { name: 'attack', type: 'INTEGER', description: 'Base Attack stat' },
        { name: 'defense', type: 'INTEGER', description: 'Base Defense stat' },
        { name: 'special_attack', type: 'INTEGER', description: 'Base Special Attack stat' },
        { name: 'special_defense', type: 'INTEGER', description: 'Base Special Defense stat' },
        { name: 'speed', type: 'INTEGER', description: 'Base Speed stat' },
        { name: 'total', type: 'INTEGER', description: 'Sum of all six base stats' },
        { name: 'height_m', type: 'DOUBLE', description: 'Height in meters' },
        { name: 'weight_kg', type: 'DOUBLE', description: 'Weight in kilograms' },
        { name: 'is_legendary', type: 'BOOLEAN', description: 'True for legendary Pokémon' },
        { name: 'evolves_from', type: 'VARCHAR', description: 'Name of the pre-evolution — NULL if none' },
      ],
    },
  ],
}
writeFileSync(`${OUT}/schema.json`, JSON.stringify(schema, null, 2))
console.log(`wrote ${OUT}/schema.json`)
```

- [ ] **Step 2: Run the builder**

Run: `npm run build:world`
Expected: downloads 5 CSVs, prints `wrote public/worlds/pokemon/pokemon.parquet with ~1000+ rows` and `wrote public/worlds/pokemon/schema.json`.

- [ ] **Step 3: Sanity-check the output**

Run: `ls -la public/worlds/pokemon/`
Expected: `pokemon.parquet` (roughly 30–80 KB) and `schema.json`.

- [ ] **Step 4: Commit (including built data)**

```bash
git add scripts/build-pokemon-world.ts public/worlds/pokemon
git commit -m "feat: Pokémon world builder and committed Parquet + schema"
```

---

### Task 7: Curriculum and exercise banks (seed content)

Five Foundations skills, two exercises each. Banks are append-only; later authoring sessions top them up to 6–10 per skill (that's the content pipeline's job, not this plan's).

**Files:**
- Create: `public/content/skills.json`
- Create: `public/content/exercises/select-basics.json`, `where-filtering.json`, `order-limit.json`, `distinct.json`, `aggregates.json`

- [ ] **Step 1: Write `public/content/skills.json`**

```json
{
  "regions": [
    {
      "id": "foundations",
      "name": "Foundations",
      "skills": [
        {
          "id": "select-basics",
          "name": "SELECT Basics",
          "world": "pokemon",
          "requires": [],
          "lesson": {
            "intro": "Every query starts with SELECT (which columns you want) and FROM (which table they live in). SELECT * grabs every column, but naming columns explicitly — SELECT name, attack — is almost always better: you get exactly what you asked for, in the order you asked for it.",
            "exampleSql": "SELECT name, type1, attack FROM pokemon"
          }
        },
        {
          "id": "where-filtering",
          "name": "WHERE Filtering",
          "world": "pokemon",
          "requires": ["select-basics"],
          "lesson": {
            "intro": "WHERE keeps only the rows that pass a test. Combine tests with AND / OR, compare with = <> > < >= <=, match text with LIKE. One trap: NULL never equals anything — use IS NULL / IS NOT NULL for missing values (many Pokémon have no second type).",
            "exampleSql": "SELECT name, attack FROM pokemon WHERE type1 = 'fire' AND attack >= 100"
          }
        },
        {
          "id": "order-limit",
          "name": "ORDER BY & LIMIT",
          "world": "pokemon",
          "requires": ["where-filtering"],
          "lesson": {
            "intro": "ORDER BY sorts the output (ASC by default, DESC for highest-first) and LIMIT keeps the first N rows — together they answer every 'top 10' question. Sort by multiple columns to break ties deterministically: ORDER BY total DESC, name means 'by total, then alphabetically among equals'.",
            "exampleSql": "SELECT name, speed FROM pokemon ORDER BY speed DESC, name LIMIT 5"
          }
        },
        {
          "id": "distinct",
          "name": "DISTINCT",
          "world": "pokemon",
          "requires": ["where-filtering"],
          "lesson": {
            "intro": "DISTINCT collapses duplicate rows in the result. SELECT DISTINCT type1 lists each primary type once; COUNT(DISTINCT type1) counts how many different values exist. DISTINCT applies to the whole selected row, not just the column it sits next to.",
            "exampleSql": "SELECT DISTINCT type1 FROM pokemon ORDER BY type1"
          }
        },
        {
          "id": "aggregates",
          "name": "Aggregate Basics",
          "world": "pokemon",
          "requires": ["order-limit", "distinct"],
          "lesson": {
            "intro": "Aggregate functions squash many rows into one value: COUNT(*) counts rows, AVG/SUM/MIN/MAX do what they say. With no GROUP BY, the whole table becomes a single output row. COUNT(col) skips NULLs while COUNT(*) counts everything — that difference answers 'how many Pokémon have a second type?'",
            "exampleSql": "SELECT COUNT(*) AS pokemon_count, AVG(attack) AS avg_attack FROM pokemon"
          }
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Write the five exercise banks**

`public/content/exercises/select-basics.json`:
```json
{
  "skillId": "select-basics",
  "exercises": [
    {
      "id": "sb-1",
      "prompt": "List the name of every Pokémon.",
      "referenceSql": "SELECT name FROM pokemon",
      "orderMatters": false,
      "hints": [
        "You need exactly two clauses: SELECT (which column?) and FROM (which table?).",
        "The column is called name and the table is called pokemon.",
        "```sql\nSELECT name FROM pokemon\n```"
      ],
      "xp": 10
    },
    {
      "id": "sb-2",
      "prompt": "Show each Pokémon's name, primary type (type1), and total stat score.",
      "referenceSql": "SELECT name, type1, total FROM pokemon",
      "orderMatters": false,
      "hints": [
        "List multiple columns after SELECT, separated by commas.",
        "The three columns are name, type1, and total.",
        "```sql\nSELECT name, type1, total FROM pokemon\n```"
      ],
      "xp": 10
    }
  ]
}
```

`public/content/exercises/where-filtering.json`:
```json
{
  "skillId": "where-filtering",
  "exercises": [
    {
      "id": "wf-1",
      "prompt": "List the names of all legendary Pokémon.",
      "referenceSql": "SELECT name FROM pokemon WHERE is_legendary",
      "orderMatters": false,
      "hints": [
        "Add a WHERE clause that tests the is_legendary column.",
        "is_legendary is a BOOLEAN, so WHERE is_legendary (or WHERE is_legendary = true) works.",
        "```sql\nSELECT name FROM pokemon WHERE is_legendary\n```"
      ],
      "xp": 10,
      "collectibles": ["articuno", "zapdos", "moltres"]
    },
    {
      "id": "wf-2",
      "prompt": "Show the name and attack of water-type (type1) Pokémon whose attack is above 100.",
      "referenceSql": "SELECT name, attack FROM pokemon WHERE type1 = 'water' AND attack > 100",
      "orderMatters": false,
      "hints": [
        "You need two conditions joined with AND.",
        "Text comparisons use quotes: type1 = 'water'. The other condition is attack > 100.",
        "```sql\nSELECT name, attack FROM pokemon WHERE type1 = 'water' AND attack > 100\n```"
      ],
      "xp": 10
    }
  ]
}
```

`public/content/exercises/order-limit.json`:
```json
{
  "skillId": "order-limit",
  "exercises": [
    {
      "id": "ol-1",
      "prompt": "Show the top 10 Pokémon by total stats — name and total, highest first. Break ties alphabetically by name.",
      "referenceSql": "SELECT name, total FROM pokemon ORDER BY total DESC, name LIMIT 10",
      "orderMatters": true,
      "hints": [
        "ORDER BY total DESC puts the highest totals first; LIMIT 10 keeps ten rows.",
        "To break ties alphabetically, add a second sort column: ORDER BY total DESC, name.",
        "```sql\nSELECT name, total FROM pokemon ORDER BY total DESC, name LIMIT 10\n```"
      ],
      "xp": 15
    },
    {
      "id": "ol-2",
      "prompt": "Find the 5 heaviest Pokémon — name and weight_kg, heaviest first (ties alphabetical by name).",
      "referenceSql": "SELECT name, weight_kg FROM pokemon ORDER BY weight_kg DESC, name LIMIT 5",
      "orderMatters": true,
      "hints": [
        "Same shape as the last exercise, but sorting on weight_kg.",
        "ORDER BY weight_kg DESC, name — then LIMIT 5.",
        "```sql\nSELECT name, weight_kg FROM pokemon ORDER BY weight_kg DESC, name LIMIT 5\n```"
      ],
      "xp": 15
    }
  ]
}
```

`public/content/exercises/distinct.json`:
```json
{
  "skillId": "distinct",
  "exercises": [
    {
      "id": "d-1",
      "prompt": "List every distinct primary type (type1), alphabetically.",
      "referenceSql": "SELECT DISTINCT type1 FROM pokemon ORDER BY type1",
      "orderMatters": true,
      "hints": [
        "DISTINCT goes right after SELECT and removes duplicate rows.",
        "Alphabetical means ORDER BY type1 (ascending is the default).",
        "```sql\nSELECT DISTINCT type1 FROM pokemon ORDER BY type1\n```"
      ],
      "xp": 12
    },
    {
      "id": "d-2",
      "prompt": "How many distinct generations of Pokémon exist? Return a single number.",
      "referenceSql": "SELECT COUNT(DISTINCT generation) AS generations FROM pokemon",
      "orderMatters": false,
      "hints": [
        "You can put DISTINCT inside COUNT(...).",
        "COUNT(DISTINCT generation) counts each generation value once.",
        "```sql\nSELECT COUNT(DISTINCT generation) FROM pokemon\n```"
      ],
      "xp": 12
    }
  ]
}
```

`public/content/exercises/aggregates.json`:
```json
{
  "skillId": "aggregates",
  "exercises": [
    {
      "id": "ag-1",
      "prompt": "What is the average attack across all Pokémon? Return a single row.",
      "referenceSql": "SELECT AVG(attack) AS avg_attack FROM pokemon",
      "orderMatters": false,
      "hints": [
        "An aggregate with no GROUP BY collapses the whole table into one row.",
        "The function you want is AVG(attack).",
        "```sql\nSELECT AVG(attack) FROM pokemon\n```"
      ],
      "xp": 12
    },
    {
      "id": "ag-2",
      "prompt": "In one row: how many Pokémon are there, and what is the highest total stat score?",
      "referenceSql": "SELECT COUNT(*) AS pokemon_count, MAX(total) AS best_total FROM pokemon",
      "orderMatters": false,
      "hints": [
        "You can select two aggregates side by side in one SELECT.",
        "COUNT(*) for the count, MAX(total) for the best total.",
        "```sql\nSELECT COUNT(*), MAX(total) FROM pokemon\n```"
      ],
      "xp": 12
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add public/content
git commit -m "feat: Foundations curriculum and seed exercise banks"
```

---

### Task 8: Content validation harness

The content gate: every reference query must run, return rows, and be deterministic; hint SQL must parse; collectibles must exist; prerequisites must reference real skills. Reuses the app's own comparator so "deterministic" means exactly what the app will enforce.

**Files:**
- Create: `scripts/validate-content.ts`

- [ ] **Step 1: Write the harness**

`scripts/validate-content.ts`:
```ts
import { readFileSync } from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'
import { compareResults, type QueryResult } from '../src/lib/compare'
import type { Curriculum, ExerciseBank, WorldSchema } from '../src/lib/content'

const failures: string[] = []

const curriculum = JSON.parse(readFileSync('public/content/skills.json', 'utf8')) as Curriculum
const skills = curriculum.regions.flatMap(r => r.skills)
const ids = new Set(skills.map(s => s.id))
for (const s of skills)
  for (const r of s.requires)
    if (!ids.has(r)) failures.push(`${s.id}: unknown prerequisite "${r}"`)

const db = await DuckDBInstance.create()
const conn = await db.connect()

const worlds = new Set(skills.map(s => s.world))
for (const w of worlds) {
  const schema = JSON.parse(readFileSync(`public/worlds/${w}/schema.json`, 'utf8')) as WorldSchema
  for (const t of schema.tables)
    await conn.run(`CREATE OR REPLACE TABLE ${t.name} AS SELECT * FROM 'public/worlds/${w}/${t.name}.parquet'`)
}

async function run(sql: string): Promise<QueryResult> {
  const reader = await conn.runAndReadAll(sql)
  return { columns: reader.columnNames(), rows: reader.getRows() }
}

let checked = 0
for (const skill of skills) {
  let bank: ExerciseBank
  try {
    bank = JSON.parse(readFileSync(`public/content/exercises/${skill.id}.json`, 'utf8')) as ExerciseBank
  } catch {
    failures.push(`${skill.id}: missing or unreadable exercise bank`)
    continue
  }
  if (bank.skillId !== skill.id) failures.push(`${skill.id}: bank skillId is "${bank.skillId}"`)
  for (const ex of bank.exercises) {
    checked++
    const tag = `${skill.id}/${ex.id}`
    if (ex.hints.length !== 3) failures.push(`${tag}: expected 3 hints, found ${ex.hints.length}`)
    try {
      const a = await run(ex.referenceSql)
      if (a.rows.length === 0) {
        failures.push(`${tag}: reference query returns no rows`)
        continue
      }
      const b = await run(ex.referenceSql)
      if (!compareResults(a, b, { orderMatters: ex.orderMatters }).equal)
        failures.push(`${tag}: reference query is nondeterministic — add a tiebreaker to ORDER BY`)
      for (const hint of ex.hints) {
        const m = hint.match(/```sql([\s\S]*?)```/)
        if (m)
          await run(`EXPLAIN ${m[1].trim().replace(/;\s*$/, '')}`).catch(() =>
            failures.push(`${tag}: hint SQL does not parse`),
          )
      }
      for (const c of ex.collectibles ?? []) {
        const hit = await run(`SELECT 1 FROM pokemon WHERE name = '${c.replace(/'/g, "''")}'`)
        if (hit.rows.length === 0) failures.push(`${tag}: collectible "${c}" not found in world`)
      }
    } catch (e) {
      failures.push(`${tag}: reference query failed — ${e}`)
    }
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} problem(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ ${checked} exercises validated across ${worlds.size} world(s)`)
```

- [ ] **Step 2: Run the harness**

Run: `npm run validate`
Expected: `✓ 10 exercises validated across 1 world(s)`, exit code 0. If any exercise fails, fix the content JSON from Task 7 (or the builder from Task 6) until green — the harness output names the exact exercise.

- [ ] **Step 3: Prove it catches breakage**

Temporarily change `referenceSql` in `public/content/exercises/distinct.json` exercise `d-1` to `SELECT DISTINCT nope FROM pokemon`, run `npm run validate`, expect exit 1 with `distinct/d-1: reference query failed`. Revert the change and re-run to green.

- [ ] **Step 4: Commit**

```bash
git add scripts/validate-content.ts
git commit -m "feat: content validation harness gating all exercises"
```

---

### Task 9: Progress store (TDD)

**Files:**
- Create: `src/lib/progress.ts`
- Test: `src/lib/progress.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/progress.test.ts`:
```ts
import { beforeEach, expect, test } from 'vitest'
import { exportState, useProgress, type ProgressState } from './progress'

beforeEach(() => {
  useProgress.setState({ version: 1, xp: 0, streak: { count: 0, lastDay: '' }, skills: {}, hydrated: true })
})

test('recordSolve awards XP and marks the exercise solved', () => {
  const gained = useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  expect(gained).toBe(10)
  const s = useProgress.getState()
  expect(s.xp).toBe(10)
  expect(s.skills['select-basics'].solved).toEqual(['sb-1'])
  expect(s.skills['select-basics'].completed).toBe(false)
  expect(s.streak.count).toBe(1)
})

test('hints reduce the XP awarded', () => {
  const gained = useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 2, 2)
  expect(gained).toBe(4)
})

test('re-solving the same exercise awards nothing', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  const again = useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  expect(again).toBe(0)
  expect(useProgress.getState().xp).toBe(10)
})

test('solving the whole bank completes the skill at mastery 3', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  useProgress.getState().recordSolve('select-basics', 'sb-2', 10, 0, 2)
  const sk = useProgress.getState().skills['select-basics']
  expect(sk.completed).toBe(true)
  expect(sk.mastery).toBe(3)
})

test('hydrate loads defaults when nothing is saved', async () => {
  await useProgress.getState().hydrate()
  expect(useProgress.getState().xp).toBe(0)
  expect(useProgress.getState().hydrated).toBe(true)
})

test('importState rejects unknown versions', () => {
  expect(() =>
    useProgress.getState().importState({ version: 99 } as unknown as ProgressState),
  ).toThrow()
})

test('exportState round-trips through importState', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  const json = exportState(useProgress.getState())
  useProgress.setState({ version: 1, xp: 0, streak: { count: 0, lastDay: '' }, skills: {}, hydrated: true })
  useProgress.getState().importState(JSON.parse(json) as ProgressState)
  expect(useProgress.getState().xp).toBe(10)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/progress.test.ts`
Expected: FAIL — cannot resolve `./progress`.

- [ ] **Step 3: Implement**

`src/lib/progress.ts`:
```ts
import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { computeXp, todayString, updateStreak, type Streak } from './xp'

export interface SkillProgress {
  solved: string[]
  completed: boolean
  mastery: number
}

export interface ProgressState {
  version: 1
  xp: number
  streak: Streak
  skills: Record<string, SkillProgress>
}

interface ProgressStore extends ProgressState {
  hydrated: boolean
  hydrate(): Promise<void>
  recordSolve(skillId: string, exerciseId: string, baseXp: number, hintsUsed: number, bankSize: number): number
  importState(imported: ProgressState): void
}

const KEY = 'sql-quest-progress'
const empty: ProgressState = { version: 1, xp: 0, streak: { count: 0, lastDay: '' }, skills: {} }

export const useProgress = create<ProgressStore>((set, get) => ({
  ...empty,
  hydrated: false,

  async hydrate() {
    const saved = await idbGet<ProgressState>(KEY)
    set({ ...(saved && saved.version === 1 ? saved : empty), hydrated: true })
  },

  recordSolve(skillId, exerciseId, baseXp, hintsUsed, bankSize) {
    const s = get()
    const prev = s.skills[skillId] ?? { solved: [], completed: false, mastery: 0 }
    if (prev.solved.includes(exerciseId)) return 0
    const gained = computeXp(baseXp, hintsUsed)
    const solved = [...prev.solved, exerciseId]
    const completed = solved.length >= bankSize
    const next: ProgressState = {
      version: 1,
      xp: s.xp + gained,
      streak: updateStreak(s.streak.lastDay ? s.streak : null, todayString()),
      skills: { ...s.skills, [skillId]: { solved, completed, mastery: completed ? 3 : prev.mastery } },
    }
    set(next)
    void idbSet(KEY, next)
    return gained
  },

  importState(imported) {
    if (imported?.version !== 1) throw new Error('Unrecognized progress file version')
    const next: ProgressState = {
      version: 1,
      xp: imported.xp,
      streak: imported.streak,
      skills: imported.skills,
    }
    set(next)
    void idbSet(KEY, next)
  },
}))

export function exportState(s: ProgressState): string {
  return JSON.stringify({ version: s.version, xp: s.xp, streak: s.streak, skills: s.skills }, null, 2)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/progress.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/progress.ts src/lib/progress.test.ts
git commit -m "feat: progress store with IndexedDB persistence and export/import"
```

---

### Task 10: DuckDB engine service

Worker-hosted DuckDB with locally-bundled WASM (offline-capable), world loading from Parquet, read-only enforcement, 5s timeout with worker restart. No unit test — the pure parts (guard, comparator) are already tested; the engine is covered end-to-end in Task 15.

**Files:**
- Create: `src/lib/duckdb.ts`

- [ ] **Step 1: Write the module**

`src/lib/duckdb.ts`:
```ts
import * as duckdb from '@duckdb/duckdb-wasm'
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import { assertReadOnly, TrainerError } from './errors'
import type { QueryResult } from './compare'

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdb_wasm, mainWorker: mvp_worker },
  eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker },
}
const TIMEOUT_MS = 5000

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null
let loadedWorld: string | null = null
let loadedTables: string[] = []

async function init(): Promise<void> {
  const bundle = await duckdb.selectBundle(BUNDLES)
  const worker = new Worker(bundle.mainWorker!)
  db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  conn = await db.connect()
}

export async function loadWorld(world: string, tables: string[]): Promise<void> {
  if (!db || !conn) await init()
  if (loadedWorld === world) return
  for (const t of tables) {
    const res = await fetch(`${import.meta.env.BASE_URL}worlds/${world}/${t}.parquet`)
    if (!res.ok) throw new Error(`Could not fetch ${t}.parquet (HTTP ${res.status})`)
    await db!.registerFileBuffer(`${t}.parquet`, new Uint8Array(await res.arrayBuffer()))
    await conn!.query(`CREATE OR REPLACE TABLE ${t} AS SELECT * FROM '${t}.parquet'`)
  }
  loadedWorld = world
  loadedTables = tables
}

export async function runQuery(sql: string): Promise<QueryResult> {
  assertReadOnly(sql)
  if (!conn) throw new TrainerError('The SQL engine is still starting — try again in a moment.')
  const table = await withTimeout(conn.query(sql))
  const columns = table.schema.fields.map(f => f.name)
  const rows = table.toArray().map(row => {
    const o = row.toJSON() as Record<string, unknown>
    return columns.map(c => o[c] ?? null)
  })
  return { columns, rows }
}

export async function restart(): Promise<void> {
  const world = loadedWorld
  const tables = loadedTables
  try {
    await db?.terminate()
  } catch {
    /* worker already gone */
  }
  db = null
  conn = null
  loadedWorld = null
  if (world) await loadWorld(world, tables)
}

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void restart()
      reject(
        new TrainerError(
          'Query ran past 5 seconds and was cancelled (accidental huge join?). The engine restarted — fix the query and run it again.',
        ),
      )
    }, TIMEOUT_MS)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run build`
Expected: PASS. (If the `?url` worker import complains, ensure the import paths match the installed `@duckdb/duckdb-wasm` dist filenames — check `ls node_modules/@duckdb/duckdb-wasm/dist/ | grep worker`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/duckdb.ts
git commit -m "feat: DuckDB-WASM engine with world loading, timeout, and restart"
```

---

### Task 11: Editor, ResultGrid, SchemaBrowser components

**Files:**
- Create: `src/components/Editor.tsx`, `src/components/ResultGrid.tsx`, `src/components/SchemaBrowser.tsx`

- [ ] **Step 1: Write the components**

`src/components/Editor.tsx`:
```tsx
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import type { WorldSchema } from '../lib/content'

export function Editor({ value, onChange, schema }: {
  value: string
  onChange: (v: string) => void
  schema: WorldSchema
}) {
  const dbSchema = Object.fromEntries(schema.tables.map(t => [t.name, t.columns.map(c => c.name)]))
  return (
    <CodeMirror
      value={value}
      height="220px"
      theme="dark"
      onChange={onChange}
      extensions={[sql({ schema: dbSchema, upperCaseKeywords: true })]}
    />
  )
}
```

`src/components/ResultGrid.tsx`:
```tsx
import type { QueryResult } from '../lib/compare'

const MAX_ROWS = 500

export function ResultGrid({ result }: { result: QueryResult }) {
  const shown = result.rows.slice(0, MAX_ROWS)
  return (
    <div className="result-grid">
      <table>
        <thead>
          <tr>{result.columns.map(c => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j} className={v === null ? 'null-cell' : undefined}>
                  {v === null ? 'NULL' : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid-meta">
        {result.rows.length} row(s)
        {result.rows.length > MAX_ROWS && ` — showing first ${MAX_ROWS}`}
      </div>
    </div>
  )
}
```

`src/components/SchemaBrowser.tsx`:
```tsx
import type { WorldSchema } from '../lib/content'

export function SchemaBrowser({ schema }: { schema: WorldSchema }) {
  return (
    <div className="schema-browser">
      <h4>Schema</h4>
      {schema.tables.map(t => (
        <details key={t.name} open={schema.tables.length === 1}>
          <summary>
            <code>{t.name}</code> — {t.description}
          </summary>
          <ul>
            {t.columns.map(c => (
              <li key={c.name}>
                <code>{c.name}</code> <span className="coltype">{c.type}</span>
                {c.description && ` — ${c.description}`}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/Editor.tsx src/components/ResultGrid.tsx src/components/SchemaBrowser.tsx
git commit -m "feat: editor, result grid, and schema browser components"
```

---

### Task 12: HomeScreen

**Files:**
- Create: `src/components/HomeScreen.tsx`

- [ ] **Step 1: Write the component**

`src/components/HomeScreen.tsx`:
```tsx
import { useRef } from 'react'
import type { Curriculum } from '../lib/content'
import { exportState, useProgress, type ProgressState } from '../lib/progress'

export function HomeScreen({ curriculum, onOpenSkill }: {
  curriculum: Curriculum
  onOpenSkill: (skillId: string) => void
}) {
  const progress = useProgress()
  const fileRef = useRef<HTMLInputElement>(null)
  const completed = (id: string) => progress.skills[id]?.completed ?? false

  function download() {
    const blob = new Blob([exportState(progress)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'sql-quest-progress.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importFile(f: File) {
    try {
      useProgress.getState().importState(JSON.parse(await f.text()) as ProgressState)
    } catch (e) {
      alert(`Import failed: ${e}`)
    }
  }

  return (
    <div className="home">
      <header className="topbar">
        <h1>⚡ SQL Quest</h1>
        <div className="stats">
          <span>🔥 {progress.streak.count}-day streak</span>
          <span>⭐ {progress.xp} XP</span>
          <button onClick={download}>Export</button>
          <button onClick={() => fileRef.current?.click()}>Import</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            hidden
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </header>
      {curriculum.regions.map(region => (
        <section key={region.id} className="region">
          <h2>{region.name}</h2>
          <div className="nodes">
            {region.skills.map(skill => {
              const done = completed(skill.id)
              const unlocked = skill.requires.every(completed)
              const solvedCount = progress.skills[skill.id]?.solved.length ?? 0
              return (
                <button
                  key={skill.id}
                  disabled={!unlocked}
                  className={`node ${done ? 'done' : unlocked ? 'open' : 'locked'}`}
                  onClick={() => onOpenSkill(skill.id)}
                >
                  <span className="badge">{done ? '✓' : unlocked ? '▶' : '🔒'}</span>
                  <span className="node-name">{skill.name}</span>
                  {solvedCount > 0 && !done && <span className="count">{solvedCount} solved</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/HomeScreen.tsx
git commit -m "feat: home screen with skill tree, stats, and progress export/import"
```

---

### Task 13: ExerciseScreen

The IDE-style screen: left panel (prompt, hint ladder, schema), right panel (editor, Run/Submit, feedback, results). Includes the lesson intro card on first visit.

**Files:**
- Create: `src/components/ExerciseScreen.tsx`

- [ ] **Step 1: Write the component**

`src/components/ExerciseScreen.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import { Editor } from './Editor'
import { ResultGrid } from './ResultGrid'
import { SchemaBrowser } from './SchemaBrowser'
import { compareResults, type QueryResult } from '../lib/compare'
import { loadWorld, runQuery } from '../lib/duckdb'
import { translateError, TrainerError } from '../lib/errors'
import { useProgress } from '../lib/progress'
import type { ExerciseBank, Skill, WorldSchema } from '../lib/content'

type Feedback =
  | { kind: 'success'; gained: number }
  | { kind: 'wrong'; message: string }
  | { kind: 'error'; friendly: string | null; raw: string }

export function ExerciseScreen({ skill, bank, schema, onBack }: {
  skill: Skill
  bank: ExerciseBank
  schema: WorldSchema
  onBack: () => void
}) {
  const progress = useProgress()
  const solved = progress.skills[skill.id]?.solved ?? []
  const firstUnsolved = bank.exercises.findIndex(e => !solved.includes(e.id))
  const [idx, setIdx] = useState(firstUnsolved === -1 ? 0 : firstUnsolved)
  const [showLesson, setShowLesson] = useState(solved.length === 0)
  const [sqlText, setSqlText] = useState('')
  const [busy, setBusy] = useState(false)
  const [engineReady, setEngineReady] = useState(false)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [hintsShown, setHintsShown] = useState(0)
  const refCache = useRef(new Map<string, QueryResult>())

  const ex = bank.exercises[idx]
  const exSolved = solved.includes(ex.id)

  useEffect(() => {
    loadWorld(schema.world, schema.tables.map(t => t.name))
      .then(() => setEngineReady(true))
      .catch(e => setEngineError(String(e)))
  }, [schema])

  function showError(e: unknown) {
    const raw = e instanceof Error ? e.message : String(e)
    if (e instanceof TrainerError) setFeedback({ kind: 'error', friendly: raw, raw: '' })
    else setFeedback({ kind: 'error', friendly: translateError(raw, schema), raw })
  }

  async function handleRun(text = sqlText) {
    setBusy(true)
    setFeedback(null)
    try {
      setResult(await runQuery(text))
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
      let ref = refCache.current.get(ex.id)
      if (!ref) {
        ref = await runQuery(ex.referenceSql)
        refCache.current.set(ex.id, ref)
      }
      const outcome = compareResults(user, ref, { orderMatters: ex.orderMatters })
      if (outcome.equal) {
        const gained = useProgress
          .getState()
          .recordSolve(skill.id, ex.id, ex.xp, hintsShown, bank.exercises.length)
        setFeedback({ kind: 'success', gained })
      } else {
        setFeedback({ kind: 'wrong', message: `Not quite — ${outcome.reason}. Check the grid and try again.` })
      }
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  function advance() {
    const nowSolved = useProgress.getState().skills[skill.id]?.solved ?? []
    const next = bank.exercises.findIndex(e => !nowSolved.includes(e.id))
    if (next === -1) {
      onBack()
      return
    }
    setIdx(next)
    setSqlText('')
    setResult(null)
    setFeedback(null)
    setHintsShown(0)
  }

  if (showLesson) {
    return (
      <div className="lesson">
        <button className="back" onClick={onBack}>← Back</button>
        <h2>{skill.name}</h2>
        <p>{skill.lesson.intro}</p>
        <pre className="example-sql">{skill.lesson.exampleSql}</pre>
        <div className="lesson-actions">
          <button
            onClick={() => {
              setSqlText(skill.lesson.exampleSql)
              setShowLesson(false)
            }}
          >
            Try the example
          </button>
          <button onClick={() => setShowLesson(false)}>Start exercises</button>
        </div>
      </div>
    )
  }

  return (
    <div className="exercise">
      <header className="topbar">
        <button className="back" onClick={onBack}>← Back</button>
        <h2>{skill.name}</h2>
        <span className="progress-count">
          {(useProgress.getState().skills[skill.id]?.solved.length ?? 0)}/{bank.exercises.length} solved
        </span>
      </header>
      <div className="exercise-layout">
        <aside className="left-panel">
          <div className="prompt">
            <span className="label">Exercise {idx + 1} of {bank.exercises.length}</span>
            <p>{ex.prompt}</p>
            {exSolved && <p className="already-solved">Already solved — replaying is free practice.</p>}
          </div>
          <div className="hints">
            {ex.hints.slice(0, hintsShown).map((h, i) => (
              <div key={i} className="hint">
                <strong>Hint {i + 1}:</strong> {h}
              </div>
            ))}
            {hintsShown < ex.hints.length && (
              <button onClick={() => setHintsShown(hintsShown + 1)}>
                💡 Hint {hintsShown + 1}/3 (costs XP)
              </button>
            )}
          </div>
          <SchemaBrowser schema={schema} />
        </aside>
        <main className="right-panel">
          <Editor value={sqlText} onChange={setSqlText} schema={schema} />
          <div className="actions">
            <button onClick={() => void handleRun()} disabled={busy || !engineReady}>
              ▶ Run
            </button>
            <button onClick={() => void handleSubmit()} disabled={busy || !engineReady} className="submit">
              Submit
            </button>
            {!engineReady && !engineError && <span className="engine-status">Loading SQL engine…</span>}
            {engineError && <span className="engine-status error">Engine failed: {engineError}</span>}
          </div>
          {feedback?.kind === 'success' && (
            <div className="feedback success">
              ✓ Correct! {feedback.gained > 0 ? `+${feedback.gained} XP` : 'Already solved — no XP this time.'}
              <button onClick={advance}>Next →</button>
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

- [ ] **Step 2: Verify typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/ExerciseScreen.tsx
git commit -m "feat: IDE-style exercise screen with run/submit/hints/lesson intro"
```

---

### Task 14: App shell and styles

**Files:**
- Modify: `src/App.tsx` (replace placeholder)
- Modify: `src/styles.css` (replace placeholder)

- [ ] **Step 1: Write the app shell**

`src/App.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { HomeScreen } from './components/HomeScreen'
import { ExerciseScreen } from './components/ExerciseScreen'
import { loadJson, type Curriculum, type ExerciseBank, type WorldSchema } from './lib/content'
import { useProgress } from './lib/progress'

interface Content {
  curriculum: Curriculum
  banks: Record<string, ExerciseBank>
  schemas: Record<string, WorldSchema>
}

type View = { screen: 'home' } | { screen: 'exercise'; skillId: string }

export default function App() {
  const [content, setContent] = useState<Content | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ screen: 'home' })
  const hydrated = useProgress(s => s.hydrated)

  useEffect(() => {
    void useProgress.getState().hydrate()
    loadContent().then(setContent).catch(e => setError(String(e)))
  }, [])

  if (error)
    return (
      <div className="load-error">
        <p>Failed to load content: {error}</p>
        <button onClick={() => location.reload()}>Retry</button>
      </div>
    )
  if (!content || !hydrated) return <div className="loading">Loading…</div>

  if (view.screen === 'exercise') {
    const skill = content.curriculum.regions.flatMap(r => r.skills).find(s => s.id === view.skillId)
    if (!skill) return <div className="load-error">Unknown skill: {view.skillId}</div>
    return (
      <ExerciseScreen
        skill={skill}
        bank={content.banks[skill.id]}
        schema={content.schemas[skill.world]}
        onBack={() => setView({ screen: 'home' })}
      />
    )
  }
  return (
    <HomeScreen
      curriculum={content.curriculum}
      onOpenSkill={skillId => setView({ screen: 'exercise', skillId })}
    />
  )
}

async function loadContent(): Promise<Content> {
  const base = import.meta.env.BASE_URL
  const curriculum = await loadJson<Curriculum>(`${base}content/skills.json`)
  const skills = curriculum.regions.flatMap(r => r.skills)
  const banks: Record<string, ExerciseBank> = {}
  const schemas: Record<string, WorldSchema> = {}
  await Promise.all(
    skills.map(async s => {
      banks[s.id] = await loadJson<ExerciseBank>(`${base}content/exercises/${s.id}.json`)
    }),
  )
  await Promise.all(
    [...new Set(skills.map(s => s.world))].map(async w => {
      schemas[w] = await loadJson<WorldSchema>(`${base}worlds/${w}/schema.json`)
    }),
  )
  return { curriculum, banks, schemas }
}
```

- [ ] **Step 2: Write the stylesheet**

`src/styles.css`:
```css
:root {
  --bg: #0f172a;
  --panel: #1e293b;
  --border: #334155;
  --text: #e2e8f0;
  --muted: #94a3b8;
  --accent: #facc15;
  --green: #4ade80;
  --red: #f87171;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, sans-serif;
}

button {
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 14px;
}
button:hover:not(:disabled) { border-color: var(--accent); }
button:disabled { opacity: 0.45; cursor: default; }

.loading, .load-error {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  color: var(--muted);
}

.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border);
}
.topbar h1, .topbar h2 { margin: 0; font-size: 20px; flex: 1; }
.stats { display: flex; gap: 14px; align-items: center; }

.home .region { padding: 18px 24px; }
.home .region h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.nodes { display: flex; gap: 12px; flex-wrap: wrap; }
.node {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  font-size: 15px;
}
.node.done { border-color: var(--green); }
.node.open { border-color: var(--accent); }
.node .badge { font-size: 16px; }
.node .count { color: var(--muted); font-size: 12px; }

.lesson { max-width: 640px; margin: 40px auto; padding: 0 24px; }
.lesson p { line-height: 1.6; }
.example-sql {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  font-family: ui-monospace, monospace;
}
.lesson-actions { display: flex; gap: 10px; }

.exercise-layout {
  display: grid;
  grid-template-columns: minmax(260px, 340px) 1fr;
  gap: 18px;
  padding: 18px 24px;
  align-items: start;
}
.left-panel { display: flex; flex-direction: column; gap: 16px; }
.prompt, .hint, .schema-browser {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
}
.prompt p { margin: 6px 0 0; line-height: 1.5; }
.label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.already-solved { color: var(--muted); font-size: 13px; }
.hints { display: flex; flex-direction: column; gap: 8px; }
.hint { font-size: 14px; line-height: 1.5; }

.schema-browser h4 { margin: 0 0 8px; }
.schema-browser summary { cursor: pointer; }
.schema-browser ul { margin: 8px 0 0; padding-left: 18px; }
.schema-browser li { margin: 4px 0; font-size: 13px; }
.coltype { color: var(--muted); font-size: 11px; }

.right-panel { display: flex; flex-direction: column; gap: 12px; }
.actions { display: flex; gap: 10px; align-items: center; }
.actions .submit { border-color: var(--green); }
.engine-status { color: var(--muted); font-size: 13px; }
.engine-status.error { color: var(--red); }

.feedback {
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 14px;
}
.feedback.success { background: #14532d; border: 1px solid var(--green); }
.feedback.wrong { background: #451a03; border: 1px solid var(--accent); }
.feedback.error { background: #450a0a; border: 1px solid var(--red); display: block; }
.raw-error {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  color: var(--muted);
  margin: 8px 0 0;
}

.result-grid {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: auto;
  max-height: 420px;
}
.result-grid table { border-collapse: collapse; width: 100%; font-size: 13px; }
.result-grid th, .result-grid td {
  padding: 6px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  font-family: ui-monospace, monospace;
}
.result-grid th { position: sticky; top: 0; background: var(--panel); }
.null-cell { color: var(--muted); font-style: italic; }
.grid-meta { padding: 6px 12px; color: var(--muted); font-size: 12px; }
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run build` (expect PASS), then start the dev server and check manually:
- Home shows the five Foundations nodes; only "SELECT Basics" is unlocked (▶), the rest locked (🔒).
- Clicking SELECT Basics shows the lesson intro; "Try the example" opens the editor pre-filled.
- Run executes `SELECT name, type1, attack FROM pokemon` and shows the grid.
- Typing `DROP TABLE pokemon` and Run shows the read-only message.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "feat: app shell wiring content, progress, and screens together"
```

---

### Task 15: End-to-end smoke test

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`

- [ ] **Step 1: Write the config**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
```

- [ ] **Step 2: Write the test**

`e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test'

test('solve the first exercise end to end', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /SQL Quest/ })).toBeVisible()

  await page.getByRole('button', { name: /SELECT Basics/ }).click()
  await page.getByRole('button', { name: 'Start exercises' }).click()
  await expect(page.getByText('List the name of every Pokémon.')).toBeVisible()

  await page.locator('.cm-content').click()
  await page.keyboard.type('SELECT name FROM pokemon')

  await page.getByRole('button', { name: '▶ Run' }).click()
  await expect(page.locator('.result-grid tbody tr').first()).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText(/\+10 XP/)).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: 'Next →' }).click()
  await expect(page.getByText(/primary type/)).toBeVisible()
})

test('read-only guard blocks mutations', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /SELECT Basics/ }).click()
  await page.getByRole('button', { name: 'Start exercises' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.type('DROP TABLE pokemon')
  await page.getByRole('button', { name: '▶ Run' }).click()
  await expect(page.getByText(/read-only/)).toBeVisible({ timeout: 30_000 })
})
```

- [ ] **Step 3: Run the tests**

Run: `npm run e2e`
Expected: 2 tests PASS. If the engine is slow on first load, the generous timeouts cover WASM instantiation. If selectors fail, fix the component markup or the selector — whichever is wrong — and re-run.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts e2e/smoke.spec.ts
git commit -m "test: end-to-end smoke coverage for the exercise loop"
```

---

### Task 16: README and final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

`README.md`:
```markdown
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
```

- [ ] **Step 2: Run the full gate**

```bash
npm test && npm run validate && npm run build && npm run e2e
```
Expected: everything green.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with run/develop/content instructions"
```

---

## Plan self-review notes

- **Spec coverage (Stage 1):** skill tree home ✓ (T12), lesson anatomy ✓ (T7/T13), results-diff ✓ (T2), hint ladder + XP cost ✓ (T3/T13), streak ✓ (T3), IndexedDB + export/import ✓ (T9/T12), error translation + raw error ✓ (T5/T13), timeout/worker restart ✓ (T10), mutation guard ✓ (T5), 500-row cap ✓ (T11), schema-aware autocomplete ✓ (T11), world builder + committed data ✓ (T6), validation harness ✓ (T8), content-load failure state ✓ (T14), offline WASM bundling ✓ (T10), E2E ✓ (T15).
- **Deliberately deferred to Stage 2+ (per spec):** mastery decay + Daily Review scheduler (and its TDD), collection page/badges (content already carries `collectibles`), additional worlds/regions, larger banks (6–10 per skill via authoring sessions).
- **Known judgment calls:** comparator matches columns by value vectors with backtracking (aliases/order don't matter; pathological identical-column cases resolved by full row verification); streak uses local dates; reference results computed in-browser on first submit and cached per session.
