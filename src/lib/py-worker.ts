import { PY_RUNNER } from './py-runner-src'
import { withFixtureSetup, type TestResult } from './js-runtime'
import type { CodeTest } from './content'

interface Pyodide {
  runPython(code: string): unknown
  globals: { get(name: string): ((...args: unknown[]) => unknown) & { destroy?(): void } }
}

// Pyodide is fetched from the CDN on first run — the only online dependency of the app.
const PYODIDE_VERSION = '0.26.2'
const BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`
let ready: Promise<Pyodide> | null = null

function loadPyodideOnce(): Promise<Pyodide> {
  if (!ready)
    ready = import(/* @vite-ignore */ `${BASE}pyodide.mjs`).then(
      (m: { loadPyodide: (c: { indexURL: string }) => Promise<Pyodide> }) => m.loadPyodide({ indexURL: BASE }),
    )
  return ready
}

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
