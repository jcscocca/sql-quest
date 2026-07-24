# Code Track Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the JavaScript and Python tracks to SQL-parity depth (~5 regions, ~23 skills, ~110–120 exercises each) after first widening the test harness so it can verify sets, tuples, exceptions, generators, classes, and in-place mutation.

**Architecture:** Two phases. **Phase 0 (Engine)** replaces the JSON-round-trip test schema (`{input, expected}`) with **in-language expression pairs** (`{setup?, expr, expect?, raises?}`) compared *inside* the target runtime — Python `==`, JS `deepEqual` — so only a verdict crosses the worker boundary. It also adds a Pyodide-backed Python execution gate to `npm run validate`. **Phases 1–5 (Curriculum)** author content one region-pair at a time, each gated green by `npm run validate`.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest 4, Playwright, DuckDB-WASM (SQL track), Pyodide 0.26.2 (Python execution — CDN in-browser, npm package in the validator), Web Workers.

---

## Conventions (read once, apply throughout)

- **TDD.** For engine tasks: write the failing test, run it red, implement, run it green, commit. Content tasks are gated by `npm run validate` instead of unit tests.
- **Commit cadence.** One commit per task unless a task says otherwise. Conventional-commit prefixes match the repo (`feat:`, `fix:`, `docs:`, `refactor:`).
- **Exact commands.** `npm test` (Vitest, ~200ms), `npm run validate` (content gate), `npm run build` (`tsc --noEmit` + Vite), `npm run e2e` (Playwright).
- **The one schema.** After Phase 0 there is exactly one test type, `CodeTest`. No `{input, expected}` remains anywhere.
- **`expect` xor `raises`.** Every `CodeTest` has `expr`. Exactly one of `expect` or `raises` is present.
- **Values in `expr`/`expect` are source in the exercise's own language.** A JS string result is expected as `"'hello'"` (JSON string containing a JS string literal); a Python list as `"[1, 2, 3]"`.

---

## PHASE 0 — The verification engine

Files touched in this phase:
- Create: `src/lib/py-runner-src.ts` — the shared Python runner source (one string constant, no browser/node deps).
- Create: `src/lib/js-runtime.test.ts` — unit tests for the JS runner + `deepEqual`.
- Create: `src/lib/py-runner.test.ts` — unit tests for the Python runner (loads Pyodide).
- Modify: `src/lib/content.ts` — `CodeTest`, `fixture?`, `TestResult`-adjacent types.
- Modify: `src/lib/js-runtime.ts` — `deepEqual` (+Set/Map), `render`, `withFixtureSetup`, `runCodeTests`, `runJs`.
- Modify: `src/lib/js-worker.ts`, `src/lib/py-worker.ts`, `src/lib/py-runtime.ts`.
- Modify: `src/lib/tracks/javascript.ts`, `src/lib/tracks/python.ts` and their `.test.ts`.
- Modify: `src/components/CodeScreen.tsx`.
- Modify: `scripts/validate-content.ts`, `package.json` (add `pyodide` devDep).
- Modify: `public/content/exercises/{js-basics,js-arrays,py-basics,py-collections}.json`.
- Modify: `e2e/smoke.spec.ts`.

### Task 0.1: Add the `CodeTest` type (additive, still compiles)

**Files:**
- Modify: `src/lib/content.ts`

- [ ] **Step 1: Add `CodeTest` and `fixture`, keep `JsTest` for now**

In `src/lib/content.ts`, add `CodeTest` immediately above the existing `JsTest` interface, and add an optional `fixture` to both exercise types. Do **not** delete `JsTest` yet and do **not** change `JsExercise.tests`/`PyExercise.tests` yet — this keeps the project compiling.

```ts
export interface CodeTest {
  setup?: string   // statements run first, in the solution's scope
  expr: string     // expression whose value is checked
  expect?: string  // expression giving the expected value; omit iff `raises` is set
  raises?: string  // instead of expect: the error-type name expr must throw
}
```

Add `fixture?: string` as the first field after `xp` is not required; place it right after `solution` in both `JsExercise` and `PyExercise`:

```ts
  solution: string
  fixture?: string   // statements prepended to every test's setup in this exercise
  tests: JsTest[]
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: PASS (type-check clean; only additions were made).

- [ ] **Step 3: Commit**

```bash
git add src/lib/content.ts
git commit -m "feat: add CodeTest schema and exercise fixture field"
```

### Task 0.2: JS runner core — `deepEqual`, `render`, `runCodeTests` (TDD)

**Files:**
- Create: `src/lib/js-runtime.test.ts`
- Modify: `src/lib/js-runtime.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/js-runtime.test.ts`:

```ts
import { expect, test } from 'vitest'
import { deepEqual, render, runCodeTests } from './js-runtime'
import type { CodeTest } from './content'

test('deepEqual handles Set and Map', () => {
  expect(deepEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true)
  expect(deepEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false)
  expect(deepEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true)
  expect(deepEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false)
  expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true)
})

test('render is readable for common shapes', () => {
  expect(render([1, 2])).toBe('[1, 2]')
  expect(render('hi')).toBe('"hi"')
  expect(render(new Set([1, 2]))).toBe('Set(1, 2)')
})

test('runCodeTests passes a correct solution via expr/expect', () => {
  const tests: CodeTest[] = [
    { expr: 'add(1, 2)', expect: '3' },
    { expr: 'add(-4, 4)', expect: '0' },
  ]
  const r = runCodeTests('function add(a, b) { return a + b }', tests)
  expect(r.every(t => t.pass)).toBe(true)
})

test('runCodeTests reports a wrong result with rendered actual', () => {
  const r = runCodeTests('function add(a, b) { return a - b }', [{ expr: 'add(1, 2)', expect: '3' }])
  expect(r[0].pass).toBe(false)
  expect(r[0].actual).toBe('-1')
  expect(r[0].expected).toBe('3')
})

test('runCodeTests runs setup and observes mutation', () => {
  const code = 'function sortInPlace(xs) { xs.sort((a, b) => a - b) }'
  const r = runCodeTests(code, [{ setup: 'const xs = [3, 1, 2]\nsortInPlace(xs)', expr: 'xs', expect: '[1, 2, 3]' }])
  expect(r[0].pass).toBe(true)
})

test('runCodeTests isolates state between tests', () => {
  const code = 'function push1(xs) { xs.push(1); return xs }'
  const r = runCodeTests(code, [
    { setup: 'const a = []\npush1(a)', expr: 'a', expect: '[1]' },
    { setup: 'const a = []', expr: 'a', expect: '[]' },
  ])
  expect(r.every(t => t.pass)).toBe(true)
})

test('runCodeTests supports raises', () => {
  const code = 'function boom() { throw new RangeError("nope") }'
  const pass = runCodeTests(code, [{ expr: 'boom()', raises: 'RangeError' }])
  expect(pass[0].pass).toBe(true)
  const wrong = runCodeTests(code, [{ expr: 'boom()', raises: 'TypeError' }])
  expect(wrong[0].pass).toBe(false)
  const noThrow = runCodeTests('function ok() { return 1 }', [{ expr: 'ok()', raises: 'Error' }])
  expect(noThrow[0].pass).toBe(false)
})

test('runCodeTests folds an exercise fixture into every test setup', () => {
  const code = 'function count(xs) { return xs.length }'
  const r = runCodeTests(code, [{ expr: 'count(data)', expect: '2' }], 'const data = [10, 20]')
  expect(r[0].pass).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- js-runtime`
Expected: FAIL — `render`/`runCodeTests` are not exported yet.

- [ ] **Step 3: Rewrite `src/lib/js-runtime.ts`**

Replace the entire file with:

```ts
import type { CodeTest } from './content'

export interface TestResult {
  pass: boolean
  expected: string
  actual: string
  error?: string
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false
    for (const x of a) if (!b.has(x)) return false
    return true
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k))) return false
    return true
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (a && b && typeof a === 'object') {
    const ka = Object.keys(a as object)
    const kb = Object.keys(b as object)
    if (ka.length !== kb.length) return false
    return ka.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

export function render(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v)
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (v instanceof Set) return `Set(${[...v].map(render).join(', ')})`
  if (v instanceof Map) return `Map(${[...v].map(([k, val]) => `${render(k)} => ${render(val)}`).join(', ')})`
  if (Array.isArray(v)) return `[${v.map(render).join(', ')}]`
  if (typeof v === 'object') return `{${Object.entries(v as object).map(([k, val]) => `${k}: ${render(val)}`).join(', ')}}`
  return String(v)
}

export function withFixtureSetup(fixture: string | undefined, setup: string | undefined): string {
  return [fixture, setup].filter(Boolean).join('\n')
}

function evalPair(code: string, setup: string, expr: string, expectExpr: string): [unknown, unknown] {
  return new Function(`"use strict";\n${code}\n${setup}\nreturn [ (${expr}), (${expectExpr}) ];`)() as [unknown, unknown]
}

function evalOne(code: string, setup: string, expr: string): unknown {
  return new Function(`"use strict";\n${code}\n${setup}\nreturn ( ${expr} );`)()
}

export function runCodeTests(code: string, tests: CodeTest[], fixture?: string): TestResult[] {
  return tests.map(t => {
    const setup = withFixtureSetup(fixture, t.setup)
    try {
      if (t.raises !== undefined) {
        try {
          evalOne(code, setup, t.expr)
          return { pass: false, expected: `raises ${t.raises}`, actual: 'no error thrown' }
        } catch (e) {
          const name = e instanceof Error ? e.name : String(e)
          return { pass: name === t.raises, expected: `raises ${t.raises}`, actual: `raises ${name}` }
        }
      }
      const [actual, expected] = evalPair(code, setup, t.expr, t.expect ?? 'undefined')
      return { pass: deepEqual(actual, expected), expected: render(expected), actual: render(actual) }
    } catch (e) {
      return { pass: false, expected: t.expect ?? '', actual: '', error: String(e) }
    }
  })
}

export async function runJs(
  code: string,
  ex: { tests: CodeTest[]; fixture?: string },
): Promise<{ results: TestResult[]; error?: string }> {
  try {
    const worker = new Worker(new URL('./js-worker.ts', import.meta.url), { type: 'module' })
    return await new Promise(resolve => {
      const timer = setTimeout(() => {
        worker.terminate()
        resolve({ results: [], error: 'timed out (infinite loop?)' })
      }, 5000)
      worker.onmessage = (e: MessageEvent) => {
        clearTimeout(timer)
        worker.terminate()
        resolve(e.data as { results: TestResult[]; error?: string })
      }
      worker.onerror = (e: ErrorEvent) => {
        clearTimeout(timer)
        worker.terminate()
        resolve({ results: [], error: e.message || 'worker error' })
      }
      worker.postMessage({ code, tests: ex.tests, fixture: ex.fixture })
    })
  } catch (e) {
    return { results: [], error: String(e) }
  }
}
```

Note: the old `runTests(fn, tests)` export is intentionally gone. The `deepEqual` Set path compares elements by `has` (SameValueZero) — correct for sets of primitives, which is all the curriculum uses; document this limit in a comment if you like.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- js-runtime`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/js-runtime.ts src/lib/js-runtime.test.ts
git commit -m "feat: expr/expect JS runner with Set/Map deepEqual and render"
```

### Task 0.3: Shared Python runner source + unit test (TDD)

**Files:**
- Create: `src/lib/py-runner-src.ts`
- Create: `src/lib/py-runner.test.ts`
- Modify: `package.json` (add `pyodide` devDependency)

- [ ] **Step 1: Add the Pyodide devDependency**

Run: `npm install -D pyodide@0.26.2`
Expected: `package.json` gains `"pyodide": "0.26.2"` under devDependencies (pin matches the CDN version in `src/lib/py-worker.ts`).

- [ ] **Step 2: Create the shared runner source**

Create `src/lib/py-runner-src.ts`. This is a single string constant with no imports, safe to load in both the browser worker and Node. `_run_exercise` execs the solution into a fresh dict, then runs each test in a per-test copy (isolating mutation), and returns a JSON array of `[pass, expectedRepr, actualRepr, error]` rows.

```ts
// Shared by src/lib/py-worker.ts (browser) and scripts/validate-content.ts (Node)
// so browser and CI verify Python with identical semantics.
export const PY_RUNNER = `
import json as _json

def _run_exercise(_code, _tests_json):
    _base = {}
    exec(_code, _base)
    _tests = _json.loads(_tests_json)
    _out = []
    for _t in _tests:
        _ns = dict(_base)
        _setup = _t.get("setup", "")
        if _setup:
            exec(_setup, _ns)
        _raises = _t.get("raises")
        _expr = _t["expr"]
        if _raises is not None:
            try:
                eval(_expr, _ns)
                _out.append([False, "raises " + _raises, "no error raised", None])
            except Exception as _e:
                _out.append([type(_e).__name__ == _raises, "raises " + _raises, "raises " + type(_e).__name__, None])
        else:
            try:
                _a = eval(_expr, _ns)
                _ex = eval(_t["expect"], _ns)
                _out.append([bool(_a == _ex), repr(_ex), repr(_a), None])
            except Exception as _e:
                _out.append([False, "", "", repr(_e)])
    return _json.dumps(_out)
`
```

Note: the caller folds any exercise `fixture` into each test's `setup` before stringifying (via `withFixtureSetup`), so `_run_exercise` never sees `fixture` — this avoids newline-escaping inside the Python string literal.

- [ ] **Step 3: Write the failing Python-runner test**

Create `src/lib/py-runner.test.ts`. It loads Pyodide from the npm package once and drives `_run_exercise` directly.

```ts
import { beforeAll, expect, test } from 'vitest'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { PY_RUNNER } from './py-runner-src'
import type { CodeTest } from './content'

let py: PyodideInterface

beforeAll(async () => {
  py = await loadPyodide()
  py.runPython(PY_RUNNER)
}, 60_000)

function run(code: string, tests: CodeTest[]): [boolean, string, string, string | null][] {
  const runExercise = py.globals.get('_run_exercise') as (c: string, t: string) => string
  const out = JSON.parse(runExercise(code, JSON.stringify(tests)))
  ;(runExercise as unknown as { destroy?: () => void }).destroy?.()
  return out
}

test('passes a correct solution', () => {
  const out = run('def add(a, b):\n    return a + b', [{ expr: 'add(1, 2)', expect: '3' }])
  expect(out[0][0]).toBe(true)
})

test('compares sets and tuples natively', () => {
  const out = run('def uniq(xs):\n    return set(xs)', [{ expr: 'uniq([1, 1, 2])', expect: '{1, 2}' }])
  expect(out[0][0]).toBe(true)
  const tup = run('def dm(a, b):\n    return divmod(a, b)', [{ expr: 'dm(7, 2)', expect: '(3, 1)' }])
  expect(tup[0][0]).toBe(true)
})

test('observes mutation via setup and isolates tests', () => {
  const code = 'def sort_in_place(xs):\n    xs.sort()'
  const out = run(code, [
    { setup: 'xs = [3, 1, 2]\nsort_in_place(xs)', expr: 'xs', expect: '[1, 2, 3]' },
    { setup: 'xs = [5]', expr: 'xs', expect: '[5]' },
  ])
  expect(out.every(r => r[0])).toBe(true)
})

test('handles raises', () => {
  const code = 'import math\ndef s(x):\n    return math.sqrt(x)'
  const ok = run(code, [{ expr: 's(-1)', raises: 'ValueError' }])
  expect(ok[0][0]).toBe(true)
  const wrong = run(code, [{ expr: 's(4)', raises: 'ValueError' }])
  expect(wrong[0][0]).toBe(false)
})

test('reports a wrong answer with reprs', () => {
  const out = run('def add(a, b):\n    return a - b', [{ expr: 'add(1, 2)', expect: '3' }])
  expect(out[0][0]).toBe(false)
  expect(out[0][1]).toBe('3')
  expect(out[0][2]).toBe('-1')
})
```

- [ ] **Step 4: Run to verify it fails, then passes**

Run: `npm test -- py-runner`
Expected: first run FAILS if `PY_RUNNER` has a bug; iterate until PASS. (First Pyodide load takes a few seconds — the 60s `beforeAll` timeout covers it.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/py-runner-src.ts src/lib/py-runner.test.ts package.json package-lock.json
git commit -m "feat: shared Pyodide runner for expr/expect Python tests"
```

### Task 0.4: Flip the schema and rewire runtimes, workers, tracks, screen

This task changes `JsExercise.tests`/`PyExercise.tests` to `CodeTest[]` and deletes `JsTest`, so every consumer must move in the same commit to stay compiling. Work top-down, then verify once at the end.

**Files:**
- Modify: `src/lib/content.ts`, `src/lib/js-worker.ts`, `src/lib/py-worker.ts`, `src/lib/py-runtime.ts`, `src/lib/tracks/javascript.ts`, `src/lib/tracks/python.ts`, `src/lib/tracks/javascript.test.ts`, `src/lib/tracks/python.test.ts`, `src/components/CodeScreen.tsx`

- [ ] **Step 1: Finalize the content types**

In `src/lib/content.ts`: delete the `JsTest` interface. Change both exercise types' `tests` field to `CodeTest[]`:

```ts
  fixture?: string
  tests: CodeTest[]
```

(There are two occurrences — `JsExercise` and `PyExercise`.)

- [ ] **Step 2: Rewrite `src/lib/js-worker.ts`**

```ts
import { runCodeTests } from './js-runtime'
import type { CodeTest } from './content'

self.onmessage = (e: MessageEvent<{ code: string; tests: CodeTest[]; fixture?: string }>) => {
  const { code, tests, fixture } = e.data
  try {
    self.postMessage({ results: runCodeTests(code, tests, fixture) })
  } catch (err) {
    self.postMessage({ results: [], error: String(err) })
  }
}
```

- [ ] **Step 3: Rewrite `src/lib/py-worker.ts`**

Keep `loadPyodideOnce` and the `Pyodide`/CDN block exactly as they are. Replace the `RUNNER` constant and the `onmessage` handler:

```ts
import { PY_RUNNER } from './py-runner-src'
import { withFixtureSetup, type TestResult } from './js-runtime'
import type { CodeTest } from './content'

interface Pyodide {
  runPython(code: string): unknown
  globals: { get(name: string): ((...args: unknown[]) => unknown) & { destroy?(): void } }
}

// (PYODIDE_VERSION, BASE, ready, loadPyodideOnce stay unchanged)

self.onmessage = async (e: MessageEvent<{ code: string; tests: CodeTest[]; fixture?: string }>) => {
  const { code, tests, fixture } = e.data
  try {
    const py = await loadPyodideOnce()
    py.runPython(PY_RUNNER)
    const folded = tests.map(t => ({ ...t, setup: withFixtureSetup(fixture, t.setup) }))
    const runExercise = py.globals.get('_run_exercise')
    const rows = JSON.parse(runExercise(code, JSON.stringify(folded)) as string) as [
      boolean,
      string,
      string,
      string | null,
    ][]
    runExercise.destroy?.()
    const results: TestResult[] = rows.map(([pass, expected, actual, error]) => ({
      pass,
      expected,
      actual,
      error: error ?? undefined,
    }))
    self.postMessage({ results })
  } catch (err) {
    self.postMessage({ results: [], error: String(err) })
  }
}
```

Delete the now-unused `_json`/`_run_case` `RUNNER` string and its `runPython(RUNNER)` call.

- [ ] **Step 4: Update `src/lib/py-runtime.ts`**

Change the `runPy` signature and the `postMessage` payload only:

```ts
import type { TestResult } from './js-runtime'
import type { CodeTest } from './content'

// ...
export async function runPy(
  code: string,
  ex: { tests: CodeTest[]; fixture?: string },
): Promise<RunResult> {
```

and the post:

```ts
      w.postMessage({ code, tests: ex.tests, fixture: ex.fixture })
```

- [ ] **Step 5: Update the two track adapters**

`src/lib/tracks/javascript.ts`:

```ts
import { runJs, type TestResult } from '../js-runtime'
import type { CodeTest, JsExercise } from '../content'

type RunResult = { results: TestResult[]; error?: string }

export function createJavascriptTrack() {
  return {
    id: 'javascript' as const,
    run: (code: string, ex: { tests: CodeTest[]; fixture?: string }): Promise<RunResult> => runJs(code, ex),
    check: (r: RunResult) => ({
      correct: !r.error && r.results.length > 0 && r.results.every(t => t.pass),
      reason: r.error,
    }),
    example: (ex: JsExercise) => ex.starter,
  }
}
```

`src/lib/tracks/python.ts`:

```ts
import { type TestResult } from '../js-runtime'
import { runPy } from '../py-runtime'
import type { CodeTest, PyExercise } from '../content'

type RunResult = { results: TestResult[]; error?: string }

export function createPythonTrack() {
  return {
    id: 'python' as const,
    run: (code: string, ex: { tests: CodeTest[]; fixture?: string }): Promise<RunResult> => runPy(code, ex),
    check: (r: RunResult) => ({
      correct: !r.error && r.results.length > 0 && r.results.every(t => t.pass),
      reason: r.error,
    }),
    example: (ex: PyExercise) => ex.starter,
  }
}
```

- [ ] **Step 6: Update `src/components/CodeScreen.tsx`**

Change the `CodeTrack.run` param type and the test rendering. Replace the `JsTest` import and the `RunResult`/`CodeTrack` block near the top:

```ts
import type { CodeTest, JsBank, PyBank, Region, Skill } from '../lib/content'

type RunResult = { results: TestResult[]; error?: string }
interface CodeTrack {
  run: (code: string, ex: { tests: CodeTest[]; fixture?: string }) => Promise<RunResult>
  check: (r: RunResult) => { correct: boolean; reason?: string }
}
```

In the results list, `t.expected`/`t.actual` are now preformatted strings — drop the `JSON.stringify` calls:

```tsx
                  {!t.pass && (
                    <span className="test-detail">
                      {t.error ? `error: ${t.error}` : `expected ${t.expected}, got ${t.actual}`}
                    </span>
                  )}
```

- [ ] **Step 7: Rewrite the two track tests**

`src/lib/tracks/javascript.test.ts`:

```ts
import { expect, test } from 'vitest'
import { runCodeTests } from '../js-runtime'
import { createJavascriptTrack } from './javascript'
import type { CodeTest } from '../content'

const code = 'function add(a, b) { return a + b }'
const tests: CodeTest[] = [
  { expr: 'add(1, 2)', expect: '3' },
  { expr: 'add(-4, 4)', expect: '0' },
]

test('track id is javascript', () => {
  expect(createJavascriptTrack().id).toBe('javascript')
})

test('check is correct only when every test passes with no error', () => {
  const track = createJavascriptTrack()
  expect(track.check({ results: runCodeTests(code, tests) }).correct).toBe(true)
  expect(track.check({ results: runCodeTests('function add(a, b) { return a - b }', tests) }).correct).toBe(false)
  expect(track.check({ results: [], error: 'timed out' }).correct).toBe(false)
})
```

`src/lib/tracks/python.test.ts` (no Pyodide here — keep it a fast unit test of `check`/`example` only):

```ts
import { expect, test } from 'vitest'
import { createPythonTrack } from './python'
import type { PyExercise } from '../content'
import type { TestResult } from '../js-runtime'

const pass: TestResult[] = [{ pass: true, expected: '3', actual: '3' }]
const fail: TestResult[] = [{ pass: false, expected: '3', actual: '2' }]

test('python track id and example prefills the starter', () => {
  const track = createPythonTrack()
  expect(track.id).toBe('python')
  expect(track.example({ starter: 'def add(a, b):\n    pass' } as PyExercise)).toBe('def add(a, b):\n    pass')
})

test('python track check reflects results and passes through the error reason', () => {
  const track = createPythonTrack()
  expect(track.check({ results: pass }).correct).toBe(true)
  expect(track.check({ results: fail }).correct).toBe(false)
  expect(track.check({ results: [], error: 'timed out' }).correct).toBe(false)
  expect(track.check({ results: [], error: 'timed out' }).reason).toBe('timed out')
})
```

- [ ] **Step 8: Verify the whole project compiles and unit tests pass**

Run: `npm run build`
Expected: PASS (no dangling `JsTest`/`runTests`/`functionName`-on-run references).

Run: `npm test`
Expected: PASS (js-runtime, py-runner, both track tests, and all pre-existing suites).

- [ ] **Step 9: Commit**

```bash
git add src/lib/content.ts src/lib/js-worker.ts src/lib/py-worker.ts src/lib/py-runtime.ts src/lib/tracks/ src/components/CodeScreen.tsx
git commit -m "refactor: move JS/Python tracks onto the CodeTest expr/expect schema"
```

### Task 0.5: Validator — JS via runner, Python via Pyodide, schema checks

**Files:**
- Modify: `scripts/validate-content.ts`

- [ ] **Step 1: Add imports and a one-time Pyodide load**

At the top of `scripts/validate-content.ts`, replace `import { runTests } from '../src/lib/js-runtime'` with:

```ts
import { runCodeTests, withFixtureSetup } from '../src/lib/js-runtime'
import { PY_RUNNER } from '../src/lib/py-runner-src'
import { loadPyodide } from 'pyodide'
import type { CodeTest, Curriculum, ExerciseBank, JsBank, PyBank, WorldSchema } from '../src/lib/content'
```

After the DuckDB connection is created (around line 17), add:

```ts
const py = await loadPyodide()
py.runPython(PY_RUNNER)
const pyRunExercise = py.globals.get('_run_exercise') as (code: string, testsJson: string) => string

function runPyExercise(code: string, tests: CodeTest[], fixture?: string): [boolean, string, string, string | null][] {
  const folded = tests.map(t => ({ ...t, setup: withFixtureSetup(fixture, t.setup) }))
  return JSON.parse(pyRunExercise(code, JSON.stringify(folded)))
}
```

- [ ] **Step 2: Add a shared per-test structural check**

Add this helper near the top of the module (after `const failures: string[] = []`):

```ts
function checkCodeTests(tag: string, tests: unknown): tests is CodeTest[] {
  if (!Array.isArray(tests) || tests.length < 1) {
    failures.push(`${tag}: needs at least 1 test`)
    return false
  }
  for (const [i, t] of tests.entries()) {
    const where = `${tag}: test ${i + 1}`
    if (!t.expr?.trim()) failures.push(`${where}: missing expr`)
    const hasExpect = typeof t.expect === 'string' && t.expect.trim() !== ''
    const hasRaises = typeof t.raises === 'string' && t.raises.trim() !== ''
    if (hasExpect === hasRaises) failures.push(`${where}: needs exactly one of expect or raises`)
  }
  return true
}
```

- [ ] **Step 3: Replace the JavaScript validation block**

Inside the `if (skill.trackId === 'javascript')` block, leave the bank read and the `skillId`/empty/duplicate-id checks as they are, and replace the entire `for (const ex of jsBank.exercises) { ... }` loop (the old version builds a `fn` with `new Function` and calls `runTests`) with:

```ts
    for (const ex of jsBank.exercises) {
      checked++
      const tag = `${skill.id}/${ex.id}`
      if (!ex.functionName?.trim()) failures.push(`${tag}: missing functionName`)
      if (!ex.starter?.trim()) failures.push(`${tag}: missing starter`)
      if (!ex.solution?.trim()) failures.push(`${tag}: missing solution`)
      if (ex.hints.length !== 3) failures.push(`${tag}: expected 3 hints, found ${ex.hints.length}`)
      if (!checkCodeTests(tag, ex.tests)) continue
      if (ex.solution?.trim()) {
        for (const [i, r] of runCodeTests(ex.solution, ex.tests, ex.fixture).entries()) {
          if (!r.pass)
            failures.push(
              `${tag}: solution fails test ${i + 1} — expected ${r.expected}, got ${r.error ? `error ${r.error}` : r.actual}`,
            )
        }
      }
    }
```

- [ ] **Step 4: Replace the Python validation block**

Replace the comment `// Python: structural checks only …` and the per-exercise loop with an executing version:

```ts
  if (skill.trackId === 'python') {
    let pyBank: PyBank
    try {
      pyBank = JSON.parse(readFileSync(`public/content/exercises/${skill.id}.json`, 'utf8')) as PyBank
    } catch {
      failures.push(`${skill.id}: missing or unreadable Python bank`)
      continue
    }
    if (pyBank.skillId !== skill.id) failures.push(`${skill.id}: bank skillId is "${pyBank.skillId}"`)
    if (!Array.isArray(pyBank.exercises) || pyBank.exercises.length === 0) {
      failures.push(`${skill.id}: Python bank is empty`)
      continue
    }
    if (new Set(pyBank.exercises.map(e => e.id)).size !== pyBank.exercises.length)
      failures.push(`${skill.id}: duplicate exercise ids in bank`)
    for (const ex of pyBank.exercises) {
      checked++
      const tag = `${skill.id}/${ex.id}`
      if (!ex.functionName?.trim()) failures.push(`${tag}: missing functionName`)
      if (!ex.starter?.trim()) failures.push(`${tag}: missing starter`)
      if (!ex.solution?.trim()) failures.push(`${tag}: missing solution`)
      if (ex.hints.length !== 3) failures.push(`${tag}: expected 3 hints, found ${ex.hints.length}`)
      if (!checkCodeTests(tag, ex.tests)) continue
      if (ex.solution?.trim()) {
        try {
          for (const [i, row] of runPyExercise(ex.solution, ex.tests, ex.fixture).entries()) {
            const [ok, expected, actual, error] = row
            if (!ok)
              failures.push(
                `${tag}: solution fails test ${i + 1} — expected ${expected}, got ${error ? `error ${error}` : actual}`,
              )
          }
        } catch (e) {
          failures.push(`${tag}: Python solution did not run — ${e}`)
        }
      }
    }
    continue
  }
```

- [ ] **Step 5: Run the gate**

Run: `npm run validate`
Expected: FAIL — the four existing banks still use `{input, expected}`, so their `expr` is missing. This is the expected red that Task 0.6 fixes. Confirm the failures name the four code skills' tests (e.g. `js-basics/js-add: test 1: missing expr`).

- [ ] **Step 6: Commit**

```bash
git add scripts/validate-content.ts
git commit -m "feat: execute JS and Python solutions in the content validator"
```

### Task 0.6: Convert the four existing banks

**Files:**
- Modify: `public/content/exercises/js-basics.json`, `public/content/exercises/js-arrays.json`, `public/content/exercises/py-basics.json`, `public/content/exercises/py-collections.json`

Transform each test `{ "input": [A, B], "expected": E }` into `{ "expr": "fnName(A, B)", "expect": "<E as a source literal>" }`. Numbers stay bare (`3`); strings gain quotes (`"'FizzBuzz'"`); arrays render as literals (`"[2, 4, 6]"`). Everything else in each exercise (prompt, functionName, starter, solution, hints, xp) is unchanged.

- [ ] **Step 1: Convert `js-basics.json`**

Replace each exercise's `tests` array:

```json
"tests": [
  { "expr": "add(1, 2)", "expect": "3" },
  { "expr": "add(0, 0)", "expect": "0" },
  { "expr": "add(-5, 5)", "expect": "0" },
  { "expr": "add(-3, -4)", "expect": "-7" },
  { "expr": "add(2.5, 0.5)", "expect": "3" },
  { "expr": "add(100, 250)", "expect": "350" }
]
```

For `max`: `{ "expr": "max(1, 2)", "expect": "2" }`, `max(5, 3)`→`5`, `max(-1, -2)`→`-1`, `max(0, 0)`→`0`, `max(7, 7)`→`7`, `max(-10, 10)`→`10`.

For `fizzbuzz` (string results — quote them): `{ "expr": "fizzbuzz(1)", "expect": "'1'" }`, `fizzbuzz(3)`→`"'Fizz'"`, `fizzbuzz(5)`→`"'Buzz'"`, `fizzbuzz(9)`→`"'Fizz'"`, `fizzbuzz(15)`→`"'FizzBuzz'"`, `fizzbuzz(7)`→`"'7'"`.

- [ ] **Step 2: Convert `js-arrays.json`**

`doubleAll`: `{ "expr": "doubleAll([1, 2, 3])", "expect": "[2, 4, 6]" }`, `[]`→`"[]"`, `[0]`→`"[0]"`, `[-1, -2]`→`"[-2, -4]"`, `[5]`→`"[10]"`, `[1.5, 2]`→`"[3, 4]"`.
`sumEven`: `sumEven([1, 2, 3, 4])`→`6`, `[]`→`0`, `[1, 3, 5]`→`0`, `[2, 4, 6]`→`12`, `[-2, -4, 1]`→`-6`, `[0, 1, 2]`→`2`.
`countVowels` (string arg): `{ "expr": "countVowels('hello')", "expect": "2" }`, `''`→`0`, `'xyz'`→`0`, `'AEIOU'`→`5`, `'Programming'`→`3`, `'Why'`→`0`.

- [ ] **Step 3: Convert `py-basics.json`**

`add`: same six as js-basics `add`. `biggest`: `biggest(1, 2)`→`2`, `(5, 3)`→`5`, `(-1, -2)`→`-1`, `(0, 0)`→`0`, `(7, 7)`→`7`, `(-10, 10)`→`10`. `fizzbuzz` (string results): `fizzbuzz(1)`→`"'1'"`, `(3)`→`"'Fizz'"`, `(5)`→`"'Buzz'"`, `(9)`→`"'Fizz'"`, `(15)`→`"'FizzBuzz'"`, `(7)`→`"'7'"`.

- [ ] **Step 4: Convert `py-collections.json`**

`double_all`: `double_all([1, 2, 3])`→`"[2, 4, 6]"`, `[]`→`"[]"`, `[0]`→`"[0]"`, `[-1, -2]`→`"[-2, -4]"`, `[5]`→`"[10]"`, `[1, 2, 100]`→`"[2, 4, 200]"`.
`sum_even`: `sum_even([1, 2, 3, 4])`→`6`, `[]`→`0`, `[1, 3, 5]`→`0`, `[2, 4, 6]`→`12`, `[-2, -4, 1]`→`-6`, `[0, 1, 2]`→`2`.
`count_vowels` (string arg): `{ "expr": "count_vowels('hello')", "expect": "2" }`, `''`→`0`, `'xyz'`→`0`, `'AEIOU'`→`5`, `'Programming'`→`3`, `'Why'`→`0`.

- [ ] **Step 5: Run the gate green**

Run: `npm run validate`
Expected: PASS — `✓ N exercises validated across 4 world(s)` with no failures.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/content/exercises/js-basics.json public/content/exercises/js-arrays.json public/content/exercises/py-basics.json public/content/exercises/py-collections.json
git commit -m "refactor: convert existing JS/Python banks to expr/expect tests"
```

### Task 0.7: End-to-end smoke for both code tracks

**Files:**
- Modify: `e2e/smoke.spec.ts`

- [ ] **Step 1: Add a JavaScript solve path**

Append to `e2e/smoke.spec.ts`. This exercises the worker + expr/expect loop with no network dependency:

```ts
test('javascript: solve the first JS exercise end to end', async ({ page }) => {
  await page.addInitScript(() => {
    const req = indexedDB.open('keyval-store')
    req.onupgradeneeded = () => req.result.createObjectStore('keyval')
    req.onsuccess = () => {
      const tx = req.result.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').put(
        { version: 1, xp: 0, streak: { count: 0, lastDay: '' }, skills: {}, collection: [], badges: [], unlockAll: true },
        'sql-quest-progress',
      )
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: /JS Basics/ }).click()
  await page.getByRole('button', { name: 'Start exercises' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.type('function add(a, b) { return a + b }')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText(/\+\d+ XP/)).toBeVisible({ timeout: 30_000 })
})
```

- [ ] **Step 2: Add a Python solve path**

```ts
// Python fetches Pyodide from the CDN on first run — needs network and a longer timeout.
test('python: solve the first Python exercise end to end', async ({ page }) => {
  await page.addInitScript(() => {
    const req = indexedDB.open('keyval-store')
    req.onupgradeneeded = () => req.result.createObjectStore('keyval')
    req.onsuccess = () => {
      const tx = req.result.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').put(
        { version: 1, xp: 0, streak: { count: 0, lastDay: '' }, skills: {}, collection: [], badges: [], unlockAll: true },
        'sql-quest-progress',
      )
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Python Basics/ }).click()
  await page.getByRole('button', { name: 'Start exercises' }).click()
  await page.locator('.cm-content').click()
  // Single-line body dodges CodeMirror's auto-indent after ':' (a multi-line def would double-indent).
  await page.keyboard.type('def add(a, b): return a + b')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText(/\+\d+ XP/)).toBeVisible({ timeout: 60_000 })
})
```

- [ ] **Step 3: Run the e2e suite**

Run: `npm run e2e -- smoke.spec.ts`
Expected: PASS. If the Python test is flaky on CI network, the plan's `npm run validate` remains the authoritative Python gate; keep the test but allow the team to mark it `test.skip` behind a network flag if needed.

- [ ] **Step 4: Commit**

```bash
git add e2e/smoke.spec.ts
git commit -m "test: e2e smoke for JavaScript and Python solve paths"
```

**Phase 0 exit criteria:** `npm run build`, `npm test`, `npm run validate`, and `npm run e2e` all green. The 12 existing exercises pass through the new engine unchanged in behavior. No `{input, expected}` or `JsTest` remains.

---

## PHASES 1–5 — Curriculum authoring

These phases add content only — no app-code changes. Each phase adds one **region-pair** (JavaScript region N + Python region N), and **closes only when `npm run validate` is green**. Author in this order so prerequisite chains are always satisfiable.

### Authoring rules (apply to every skill in every phase)

1. **Skill entry** in `public/content/skills.json` under the track's region, with: `id`, `name`, `trackId` (`"javascript"` or `"python"`), `requires` (array of prerequisite skill ids), and `lesson: { intro, exampleSql: "", wrapUp }`. Code skills always set `exampleSql` to the empty string (`CodeScreen` renders only `intro` and `wrapUp`). `intro` and `wrapUp` mirror the voice of the existing `js-basics`/`py-basics` lessons.
2. **Bank file** `public/content/exercises/<id>.json` = `{ "skillId": "<id>", "exercises": [...] }`.
3. **Each exercise** has: `id` (globally unique across ALL banks — the validator enforces this), `prompt`, `functionName`, `starter`, `solution`, optional `fixture`, `tests` (≥1 `CodeTest`), exactly `3` hints, `xp` (use 15 like existing code exercises; 20 for Applied Data capstones).
4. **Density:** 4–5 exercises for mechanical early skills, 6–8 for grounded/complex ones.
5. **Every test's `expect` is a source literal in the exercise's language.** Verify by running `npm run validate` — the solution is executed against every test.
6. **Hints** follow the existing ladder: hint 1 orients, hint 2 narrows, hint 3 essentially gives the line.
7. **Floats:** there is no tolerance field — round inside the expression when a result is inexact (`{ "expr": "round(mean(xs), 2)", "expect": "3.33" }`). Exact floats (`3.0`) may be asserted directly.
8. After authoring each bank, run `npm run validate` and fix reds before moving on. Commit per skill or per region as convenient (`feat: <track> <skill> exercises`).

### Prerequisite graph (assign these `requires` edges)

Update the two existing entries and add the rest. Within a region the chain is linear; each region's first skill requires the previous region's last skill.

**JavaScript:** `js-basics`[]→`js-conditionals`→`js-numbers`→`js-strings`→`js-loops` → `js-arrays`(change requires to `["js-loops"]`)→`js-reduce`→`js-sorting`→`js-searching`→`js-nested-arrays` → `js-objects`→`js-grouping`→`js-maps-sets`→`js-destructuring`→`js-records` → `js-higher-order`→`js-closures`→`js-recursion`→`js-errors`→`js-classes` → `js-applied-pokemon`→`js-applied-yugioh`→`js-applied-seattle`.

**Python:** `py-basics`[]→`py-conditionals`→`py-numbers`→`py-strings`→`py-loops` → `py-collections`(change requires to `["py-loops"]`)→`py-comprehensions`→`py-sorting`→`py-nested-lists`→`py-tuples` → `py-dicts`→`py-grouping`→`py-sets`→`py-dict-comprehensions`→`py-records` → `py-higher-order`→`py-recursion`→`py-generators`→`py-exceptions`→`py-classes` → `py-applied-pokemon`→`py-applied-yugioh`→`py-applied-seattle`.

### Phase 1 — Region 1: Foundations

**New JS skills:** `js-conditionals`, `js-numbers`, `js-strings`, `js-loops`.
**New Python skills:** `py-conditionals`, `py-numbers`, `py-strings`, `py-loops`.

Concept checklist per skill (each concept ≥1 exercise):
- **conditionals:** if/else, comparison operators, boolean and/or/not, ternary (JS) / conditional expression (Py), truthiness (Py: empty vs non-empty).
- **numbers:** integer vs float division, floor division `//` / `Math.floor`, modulo, rounding to N places, min/max of two. Keep Phase 1 results as plain numbers — tuple-returning shapes like `divmod` belong in Phase 2 (`py-tuples`).
- **strings:** indexing/slicing, length, upper/lower, `includes`/`in`, split/join basics, f-strings (Py) / template literals (JS).
- **loops:** `for` accumulation, `while`, `range`/index walking, early exit / counting.

These mirror the existing abstract style. **Exemplar (JS `js-conditionals`, one exercise):**

```json
{
  "id": "js-cond-sign",
  "prompt": "Implement sign(n) so it returns 'positive' for n > 0, 'negative' for n < 0, and 'zero' for 0.",
  "functionName": "sign",
  "starter": "function sign(n) {\n  // 'positive', 'negative', or 'zero'\n}",
  "solution": "function sign(n) {\n  if (n > 0) return 'positive'\n  if (n < 0) return 'negative'\n  return 'zero'\n}",
  "tests": [
    { "expr": "sign(5)", "expect": "'positive'" },
    { "expr": "sign(-3)", "expect": "'negative'" },
    { "expr": "sign(0)", "expect": "'zero'" },
    { "expr": "sign(-0.1)", "expect": "'negative'" }
  ],
  "hints": [
    "Handle one case per branch; return ends the function so the next check only runs when the earlier ones were false.",
    "Compare with n > 0 and n < 0; anything left is exactly 0.",
    "if (n > 0) return 'positive'; if (n < 0) return 'negative'; return 'zero'."
  ],
  "xp": 15
}
```

**Exemplar (Python `py-strings`, one exercise):**

```json
{
  "id": "py-str-initials",
  "prompt": "Implement initials(name) so it returns the uppercase first letter of each space-separated word joined together — initials('ada lovelace') returns 'AL'.",
  "functionName": "initials",
  "starter": "def initials(name):\n    # first letter of each word, uppercased\n    pass",
  "solution": "def initials(name):\n    return ''.join(w[0].upper() for w in name.split())",
  "tests": [
    { "expr": "initials('ada lovelace')", "expect": "'AL'" },
    { "expr": "initials('grace')", "expect": "'G'" },
    { "expr": "initials('')", "expect": "''" },
    { "expr": "initials('a b c')", "expect": "'ABC'" }
  ],
  "hints": [
    "name.split() breaks the string into a list of words on whitespace.",
    "For each word w, w[0] is its first character and .upper() capitalizes it.",
    "''.join(w[0].upper() for w in name.split()) glues the letters into one string; an empty name splits to [] and joins to ''."
  ],
  "xp": 15
}
```

**Checkpoint:** `npm run validate` green; open the app (`preview_start`), free-roam into two new skills, solve one exercise each. Commit.

### Phase 2 — Region 2: Arrays & Iteration / Lists & Comprehensions

**New JS skills:** `js-reduce`, `js-sorting`, `js-searching`, `js-nested-arrays`.
**New Python skills:** `py-comprehensions`, `py-sorting`, `py-nested-lists`, `py-tuples`.

Concept checklist:
- **reduce / comprehensions:** sum/product/min-max via fold; build-new-list transforms and filters.
- **sorting:** `sort`/`sorted` with comparator / `key=`, descending, stable multi-key.
- **searching / nested:** `find`/`some`/`every`/`indexOf`; matrices, `flat`/`zip`, row/column sums.
- **tuples (Py):** returning tuples and unpacking — **first schema-unlocked topic.** `divmod`, `(min, max)` pairs, swapping.

**Exemplar (Python `py-tuples`, tuple return now directly testable):**

```json
{
  "id": "py-tuple-minmax",
  "prompt": "Implement min_max(xs) so it returns a tuple (smallest, largest) of the numbers in xs. Assume xs is non-empty.",
  "functionName": "min_max",
  "starter": "def min_max(xs):\n    # return (smallest, largest)\n    pass",
  "solution": "def min_max(xs):\n    return (min(xs), max(xs))",
  "tests": [
    { "expr": "min_max([3, 1, 2])", "expect": "(1, 3)" },
    { "expr": "min_max([5])", "expect": "(5, 5)" },
    { "expr": "min_max([-2, -9, 0])", "expect": "(-9, 0)" },
    { "setup": "lo, hi = min_max([4, 8, 1])", "expr": "hi - lo", "expect": "7" }
  ],
  "hints": [
    "Python builds a tuple with parentheses: (a, b).",
    "min(xs) and max(xs) give the two ends directly.",
    "return (min(xs), max(xs)) — and the last test shows a caller unpacking it with lo, hi = ..."
  ],
  "xp": 15
}
```

**Checkpoint:** `npm run validate` green; browser-solve a `py-tuples` and a `js-sorting` exercise. Commit.

### Phase 3 — Region 3: Objects, Maps & Sets / Dicts & Sets

**New JS skills:** `js-objects`, `js-grouping`, `js-maps-sets`, `js-destructuring`, `js-records`.
**New Python skills:** `py-dicts`, `py-grouping`, `py-sets`, `py-dict-comprehensions`, `py-records`.

Concept checklist:
- **objects/dicts:** property access, iterate keys/values/entries, `.get`/default, build a frequency map.
- **grouping & counting:** group items by a key into buckets; count occurrences.
- **Map & Set / sets:** **schema-unlocked.** Dedup, membership, union/intersection; return a `Set` (JS) or `set` (Py).
- **destructuring / dict-comprehensions:** object/array destructuring & spread (JS); `{k: v for ...}` (Py).
- **records (grounded intro):** small inline arrays/lists of objects/dicts — first grounded exercises.

**Exemplar (JS `js-maps-sets`, returning a Set — needs the extended `deepEqual`):**

```json
{
  "id": "js-set-unique",
  "prompt": "Implement unique(arr) so it returns a Set of the distinct values in arr.",
  "functionName": "unique",
  "starter": "function unique(arr) {\n  // return a Set of distinct values\n}",
  "solution": "function unique(arr) {\n  return new Set(arr)\n}",
  "tests": [
    { "expr": "unique([1, 1, 2, 3, 3])", "expect": "new Set([1, 2, 3])" },
    { "expr": "unique([])", "expect": "new Set()" },
    { "expr": "unique(['a', 'a'])", "expect": "new Set(['a'])" },
    { "setup": "const s = unique([5, 5, 6])", "expr": "s.size", "expect": "2" }
  ],
  "hints": [
    "A Set stores only distinct values — constructing one from an array drops duplicates.",
    "new Set(arr) does exactly that.",
    "return new Set(arr); the last test checks .size is the count of distinct values."
  ],
  "xp": 15
}
```

**Exemplar (Python `py-records`, grounded intro with a `fixture`):**

```json
{
  "id": "py-records-names",
  "prompt": "Implement fire_names(pokemon) so it returns a list of the names of all Pokémon whose type is 'fire', in input order.",
  "functionName": "fire_names",
  "starter": "def fire_names(pokemon):\n    # names of the fire-type Pokemon\n    pass",
  "solution": "def fire_names(pokemon):\n    return [p['name'] for p in pokemon if p['type'] == 'fire']",
  "fixture": "roster = [\n    {'name': 'charmander', 'type': 'fire', 'attack': 52},\n    {'name': 'squirtle', 'type': 'water', 'attack': 48},\n    {'name': 'vulpix', 'type': 'fire', 'attack': 41},\n    {'name': 'pikachu', 'type': 'electric', 'attack': 55},\n]",
  "tests": [
    { "expr": "fire_names(roster)", "expect": "['charmander', 'vulpix']" },
    { "expr": "fire_names([])", "expect": "[]" },
    { "expr": "fire_names([{'name': 'onix', 'type': 'rock', 'attack': 45}])", "expect": "[]" }
  ],
  "hints": [
    "Each element is a dict; p['type'] reads its type and p['name'] its name.",
    "Filter with a comprehension: keep p when p['type'] == 'fire'.",
    "[p['name'] for p in pokemon if p['type'] == 'fire'] — the fixture 'roster' is available to every test."
  ],
  "xp": 15
}
```

**Checkpoint:** `npm run validate` green; browser-solve a set exercise and a records exercise on each track. Commit.

### Phase 4 — Region 4: Functions & Classes

**New JS skills:** `js-higher-order`, `js-closures`, `js-recursion`, `js-errors`, `js-classes`.
**New Python skills:** `py-higher-order`, `py-recursion`, `py-generators`, `py-exceptions`, `py-classes`.

Concept checklist:
- **higher-order:** pass/return functions, `map`/`filter`/`reduce` with a supplied callback, compose.
- **closures (JS) / recursion:** counter/memoize closures; factorial, sum-of-list, tree/flatten recursion.
- **generators (Py):** **schema-unlocked** — test by materializing: `expr: "list(take(fib(), 5))"`.
- **errors / exceptions:** **schema-unlocked** — use `raises`. Validate a guard that throws on bad input.
- **classes:** **schema-unlocked** — build an object in `setup`, observe method results / attributes in `expr`.

**Exemplar (Python `py-exceptions`, using `raises`):**

```json
{
  "id": "py-exc-checked-sqrt",
  "prompt": "Implement checked_sqrt(x). Return the square root for x >= 0, but raise ValueError for negative x.",
  "functionName": "checked_sqrt",
  "starter": "def checked_sqrt(x):\n    # sqrt for x >= 0, else raise ValueError\n    pass",
  "solution": "import math\n\ndef checked_sqrt(x):\n    if x < 0:\n        raise ValueError('negative')\n    return math.sqrt(x)",
  "tests": [
    { "expr": "checked_sqrt(9)", "expect": "3.0" },
    { "expr": "checked_sqrt(0)", "expect": "0.0" },
    { "expr": "checked_sqrt(-1)", "raises": "ValueError" },
    { "expr": "checked_sqrt(-99)", "raises": "ValueError" }
  ],
  "hints": [
    "Guard the bad case first: if x < 0, raise instead of returning.",
    "raise ValueError('...') stops the function and signals the error the tests expect.",
    "After the guard, return math.sqrt(x); the raises tests confirm negatives error out."
  ],
  "xp": 15
}
```

**Exemplar (JS `js-classes`, object built in `setup`, observed in `expr`):**

```json
{
  "id": "js-class-counter",
  "prompt": "Implement a Counter class with a start value, an inc() method that adds one, and a value getter/field reflecting the current count.",
  "functionName": "Counter",
  "starter": "class Counter {\n  constructor(start) {\n    // store the start value\n  }\n  inc() {\n    // add one\n  }\n}",
  "solution": "class Counter {\n  constructor(start) {\n    this.value = start\n  }\n  inc() {\n    this.value++\n  }\n}",
  "tests": [
    { "setup": "const c = new Counter(0)\nc.inc()\nc.inc()", "expr": "c.value", "expect": "2" },
    { "setup": "const c = new Counter(10)", "expr": "c.value", "expect": "10" },
    { "setup": "const c = new Counter(5)\nc.inc()", "expr": "c.value", "expect": "6" }
  ],
  "hints": [
    "The constructor saves the starting count on the instance: this.value = start.",
    "inc() mutates that field: this.value++.",
    "setup builds the object and calls methods; expr reads c.value afterward."
  ],
  "xp": 15
}
```

**Exemplar (Python `py-generators`, materialized with `list`):**

```json
{
  "id": "py-gen-countup",
  "prompt": "Implement countup(n) as a generator that yields the integers 0, 1, ..., n-1 in order.",
  "functionName": "countup",
  "starter": "def countup(n):\n    # yield 0 .. n-1\n    pass",
  "solution": "def countup(n):\n    for i in range(n):\n        yield i",
  "tests": [
    { "expr": "list(countup(3))", "expect": "[0, 1, 2]" },
    { "expr": "list(countup(0))", "expect": "[]" },
    { "setup": "g = countup(5)\nfirst = next(g)", "expr": "first", "expect": "0" }
  ],
  "hints": [
    "A function that uses yield is a generator; each yield hands back the next value lazily.",
    "Loop with for i in range(n) and yield i each time.",
    "list(countup(n)) drains the generator into a list; next(g) pulls a single value."
  ],
  "xp": 15
}
```

**Checkpoint:** `npm run validate` green; browser-solve a `raises`, a generator, and a class exercise. Commit.

### Phase 5 — Region 5: Applied Data

**New JS skills:** `js-applied-pokemon`, `js-applied-yugioh`, `js-applied-seattle`.
**New Python skills:** `py-applied-pokemon`, `py-applied-yugioh`, `py-applied-seattle`.

These are grounded capstones (6–8 exercises each, `xp: 20`) over hand-curated inline fixtures derived from the existing worlds — ~15–20 records per fixture as a list of dicts/objects. Draw realistic field names from the world schemas (`public/worlds/<world>/schema.json`): Pokémon (`name`, `type`, `attack`, `defense`), Yu-Gi-Oh! (`name`, `archetype`, `atk`, `def`), Seattle 311 (`type`, `neighborhood`, `days_open`). Each skill's fixture is written once per exercise via the `fixture` field and reused across that exercise's tests.

Concept coverage: group-and-aggregate (strongest per type), filter-and-rank (top-N by a metric), join-like lookups across two lists, counting/summarizing by category — the same analytical shapes the SQL Boss Arenas teach, now in code.

**Exemplar (Python `py-applied-pokemon`, capstone shape):**

```json
{
  "id": "py-applied-strongest-by-type",
  "prompt": "Implement strongest_by_type(pokemon) so it returns a dict mapping each type to the name of its highest-attack Pokémon. On a tie, keep the first seen.",
  "functionName": "strongest_by_type",
  "starter": "def strongest_by_type(pokemon):\n    # {type: name_of_highest_attack}\n    pass",
  "solution": "def strongest_by_type(pokemon):\n    best = {}\n    for p in pokemon:\n        t = p['type']\n        if t not in best or p['attack'] > best[t]['attack']:\n            best[t] = p\n    return {t: p['name'] for t, p in best.items()}",
  "fixture": "roster = [\n    {'name': 'charmander', 'type': 'fire', 'attack': 52},\n    {'name': 'vulpix', 'type': 'fire', 'attack': 41},\n    {'name': 'charizard', 'type': 'fire', 'attack': 84},\n    {'name': 'squirtle', 'type': 'water', 'attack': 48},\n    {'name': 'gyarados', 'type': 'water', 'attack': 125},\n    {'name': 'pikachu', 'type': 'electric', 'attack': 55},\n]",
  "tests": [
    { "expr": "strongest_by_type(roster)", "expect": "{'fire': 'charizard', 'water': 'gyarados', 'electric': 'pikachu'}" },
    { "expr": "strongest_by_type([])", "expect": "{}" },
    { "expr": "strongest_by_type([{'name': 'onix', 'type': 'rock', 'attack': 45}])", "expect": "{'rock': 'onix'}" }
  ],
  "hints": [
    "Walk the list keeping the best record seen so far per type in a dict.",
    "Replace the stored record only when the current attack is strictly greater — strictly-greater keeps the first on ties.",
    "Finish by mapping each kept record to its name: {t: p['name'] for t, p in best.items()}."
  ],
  "xp": 20
}
```

**Checkpoint:** `npm run validate` green; browser-solve one capstone per track. Commit.

### Docs task (after Phase 5)

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-07-22-multi-track-platform-design.md`

- [ ] Update the README JS/Python bullet with real region names and exercise counts (run a quick count from the bank files).
- [ ] In the multi-track spec's Status note, flip "broaden content across all tracks" from future work to done, and record that Daily Review + collectibles for code tracks remain the open follow-ons.
- [ ] Commit: `docs: reflect JS/Python track expansion`.

**Phases 1–5 exit criteria:** each track has ~23 skills / ~110–120 exercises; `npm run validate`, `npm test`, and `npm run build` all green; the two tracks are navigable end-to-end in the browser.

---

## Self-review notes (for the executor)

- **The engine is the gate for everything after it.** Do not start Phase 1 until Phase 0's exit criteria are met — every content phase depends on `expr`/`expect` and the Python validator.
- **`expect` string quoting is the #1 authoring error.** A JS/Python string result must be a *source literal*: `"'fire'"`, not `"fire"`. `npm run validate` catches these because it evaluates `expect` in-language.
- **Exercise ids are globally unique** across all banks (the validator cross-checks). Prefix every id with its skill (e.g. `js-set-unique`).
- **Fixtures fold into setup**, so a name defined in `fixture` is visible in both `setup` and `expr` of every test in that exercise.
