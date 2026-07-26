import type { TestResult } from './js-runtime'
import type { CodeTest } from './content'

type RunResult = { results: TestResult[]; error?: string }

// One long-lived worker so Pyodide is fetched/loaded once; reset it if a run is killed.
let worker: Worker | null = null
let nextId = 1

// The cold Pyodide fetch/compile is far slower than any exercise, so it gets its own
// budget: the execution clock only starts once the worker reports the runtime is up.
const LOAD_TIMEOUT = 60000
const RUN_TIMEOUT = 15000

export async function runPy(
  code: string,
  ex: { tests: CodeTest[]; fixture?: string },
): Promise<RunResult> {
  try {
    if (!worker) worker = new Worker(new URL('./py-worker.ts', import.meta.url), { type: 'module' })
    const w = worker
    const id = nextId++
    return await new Promise<RunResult>(resolve => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const done = (r: RunResult) => {
        clearTimeout(timer)
        w.removeEventListener('message', onMessage)
        w.removeEventListener('error', onError)
        resolve(r)
      }
      const kill = () => {
        w.terminate()
        if (worker === w) worker = null
        done({ results: [], error: 'timed out' })
      }
      const onMessage = (e: MessageEvent) => {
        const data = e.data as { id?: number; ready?: boolean } & RunResult
        if (data.id !== id) return
        if (data.ready) {
          clearTimeout(timer)
          timer = setTimeout(kill, RUN_TIMEOUT)
          return
        }
        done(data)
      }
      const onError = (e: ErrorEvent) => {
        w.terminate()
        if (worker === w) worker = null
        done({ results: [], error: e.message || 'worker error' })
      }
      timer = setTimeout(kill, LOAD_TIMEOUT)
      w.addEventListener('message', onMessage)
      w.addEventListener('error', onError)
      w.postMessage({ id, code, tests: ex.tests, fixture: ex.fixture })
    })
  } catch (e) {
    return { results: [], error: String(e) }
  }
}
