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
