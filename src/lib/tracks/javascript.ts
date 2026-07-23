import { runJs, type TestResult } from '../js-runtime'
import type { JsExercise, JsTest } from '../content'

type RunResult = { results: TestResult[]; error?: string }

export function createJavascriptTrack() {
  return {
    id: 'javascript' as const,
    run: (code: string, ex: { functionName: string; tests: JsTest[] }): Promise<RunResult> => runJs(code, ex),
    check: (r: RunResult) => ({
      correct: !r.error && r.results.length > 0 && r.results.every(t => t.pass),
      reason: r.error,
    }),
    example: (ex: JsExercise) => ex.starter,
  }
}
