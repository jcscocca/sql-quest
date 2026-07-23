import { runTests } from './js-runtime'
import type { JsTest } from './content'

self.onmessage = (e: MessageEvent<{ code: string; functionName: string; tests: JsTest[] }>) => {
  const { code, functionName, tests } = e.data
  try {
    const fn = (0, eval)(code + '\n;' + functionName)
    self.postMessage({ results: runTests(fn, tests) })
  } catch (err) {
    self.postMessage({ results: [], error: String(err) })
  }
}
