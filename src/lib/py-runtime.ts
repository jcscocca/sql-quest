import type { TestResult } from './js-runtime'
import type { CodeTest } from './content'

type RunResult = { results: TestResult[]; error?: string }

// One long-lived worker so Pyodide is fetched/loaded once; reset it if a run is killed.
let worker: Worker | null = null

export async function runPy(
  code: string,
  ex: { tests: CodeTest[]; fixture?: string },
): Promise<RunResult> {
  try {
    if (!worker) worker = new Worker(new URL('./py-worker.ts', import.meta.url), { type: 'module' })
    const w = worker
    return await new Promise<RunResult>(resolve => {
      const timer = setTimeout(() => {
        w.terminate()
        worker = null
        resolve({ results: [], error: 'timed out' })
      }, 15000)
      w.onmessage = (e: MessageEvent) => {
        clearTimeout(timer)
        resolve(e.data as RunResult)
      }
      w.onerror = (e: ErrorEvent) => {
        clearTimeout(timer)
        w.terminate()
        worker = null
        resolve({ results: [], error: e.message || 'worker error' })
      }
      w.postMessage({ code, tests: ex.tests, fixture: ex.fixture })
    })
  } catch (e) {
    return { results: [], error: String(e) }
  }
}
