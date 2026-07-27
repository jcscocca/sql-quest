import { runCodeExercise } from './js-runtime'
import type { CodeTest } from './content'

self.onmessage = (e: MessageEvent<{ code: string; tests: CodeTest[]; fixture?: string; mustCall?: string[] }>) => {
  const { code, tests, fixture, mustCall } = e.data
  try {
    self.postMessage(runCodeExercise(code, { tests, fixture, mustCall }))
  } catch (err) {
    self.postMessage({ results: [], error: String(err) })
  }
}
