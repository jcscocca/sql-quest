import { PY_RUNNER } from './py-runner-src'
import { withFixtureSetup, type TestResult } from './js-runtime'
import type { CodeTest } from './content'

interface Pyodide {
  runPython(code: string): unknown
  globals: { get(name: string): ((...args: unknown[]) => unknown) & { destroy?(): void } }
}

// Pyodide is served from our own origin (see vite.config.ts), so the app works offline
// and the runtime version always matches the pyodide package used by validate.
const BASE = new URL(`${import.meta.env.BASE_URL}pyodide/`, self.location.origin).href
let ready: Promise<Pyodide> | null = null

function loadPyodideOnce(): Promise<Pyodide> {
  if (!ready)
    ready = import(/* @vite-ignore */ `${BASE}pyodide.mjs`).then(
      (m: { loadPyodide: (c: { indexURL: string }) => Promise<Pyodide> }) => m.loadPyodide({ indexURL: BASE }),
    )
  return ready
}

self.onmessage = async (e: MessageEvent<{ id: number; code: string; tests: CodeTest[]; fixture?: string; mustCall?: string[] }>) => {
  const { id, code, tests, fixture, mustCall } = e.data
  try {
    const py = await loadPyodideOnce()
    self.postMessage({ id, ready: true })
    py.runPython(PY_RUNNER)
    const folded = tests.map(t => ({ ...t, setup: withFixtureSetup(fixture, t.setup) }))
    const runExercise = py.globals.get('_run_exercise')
    const out = JSON.parse(runExercise(code, JSON.stringify(folded), JSON.stringify(mustCall ?? [])) as string) as
      | [boolean, string, string, string | null][]
      | { error: string }
    runExercise.destroy?.()
    if (!Array.isArray(out)) {
      self.postMessage({ id, results: [], error: out.error })
      return
    }
    const results: TestResult[] = out.map(([pass, expected, actual, error]) => ({
      pass,
      expected,
      actual,
      error: error ?? undefined,
    }))
    self.postMessage({ id, results })
  } catch (err) {
    self.postMessage({ id, results: [], error: String(err) })
  }
}
