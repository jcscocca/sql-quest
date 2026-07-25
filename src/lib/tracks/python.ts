import { type TestResult } from '../js-runtime'
import { runPy } from '../py-runtime'
import type { CodeTest } from '../content'

type RunResult = { results: TestResult[]; error?: string }

export function createPythonTrack() {
  return {
    id: 'python' as const,
    run: (code: string, ex: { tests: CodeTest[]; fixture?: string }): Promise<RunResult> => runPy(code, ex),
    check: (r: RunResult) => ({
      correct: !r.error && r.results.length > 0 && r.results.every(t => t.pass),
      reason: r.error,
    }),
  }
}
