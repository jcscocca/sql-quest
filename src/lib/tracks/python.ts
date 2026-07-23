import { type TestResult } from '../js-runtime'
import { runPy } from '../py-runtime'
import type { JsTest, PyExercise } from '../content'

type RunResult = { results: TestResult[]; error?: string }

export function createPythonTrack() {
  return {
    id: 'python' as const,
    run: (code: string, ex: { functionName: string; tests: JsTest[] }): Promise<RunResult> => runPy(code, ex),
    check: (r: RunResult) => ({
      correct: !r.error && r.results.length > 0 && r.results.every(t => t.pass),
      reason: r.error,
    }),
    example: (ex: PyExercise) => ex.starter,
  }
}
