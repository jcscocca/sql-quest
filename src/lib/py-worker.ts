import { deepEqual, type TestResult } from './js-runtime'
import type { JsTest } from './content'

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

// JSON bridges args/results so integers stay integers (Python int, not float) and
// lists/strings round-trip losslessly, independent of JS↔Python number heuristics.
const RUNNER = `
import json as _json
def _run_case(_name, _args_json):
    _args = _json.loads(_args_json)
    return _json.dumps(globals()[_name](*_args))
`

self.onmessage = async (e: MessageEvent<{ code: string; functionName: string; tests: JsTest[] }>) => {
  const { code, functionName, tests } = e.data
  try {
    const py = await loadPyodideOnce()
    py.runPython(code)
    py.runPython(RUNNER)
    const runCase = py.globals.get('_run_case')
    const results: TestResult[] = tests.map(t => {
      try {
        const actual = JSON.parse(runCase(functionName, JSON.stringify(t.input)) as string)
        return { pass: deepEqual(actual, t.expected), expected: t.expected, actual }
      } catch (err) {
        return { pass: false, expected: t.expected, actual: undefined, error: String(err) }
      }
    })
    runCase.destroy?.()
    self.postMessage({ results })
  } catch (err) {
    self.postMessage({ results: [], error: String(err) })
  }
}
