import type { JsTest } from './content'

export interface TestResult {
  pass: boolean
  expected: unknown
  actual: unknown
  error?: string
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (a && b && typeof a === 'object') {
    const ka = Object.keys(a as object)
    const kb = Object.keys(b as object)
    if (ka.length !== kb.length) return false
    return ka.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

export function runTests(fn: Function, tests: JsTest[]): TestResult[] {
  return tests.map(t => {
    try {
      const actual = fn(...t.input)
      return { pass: deepEqual(actual, t.expected), expected: t.expected, actual }
    } catch (e) {
      return { pass: false, expected: t.expected, actual: undefined, error: String(e) }
    }
  })
}

export async function runJs(
  code: string,
  ex: { functionName: string; tests: JsTest[] },
): Promise<{ results: TestResult[]; error?: string }> {
  try {
    const worker = new Worker(new URL('./js-worker.ts', import.meta.url), { type: 'module' })
    return await new Promise(resolve => {
      const timer = setTimeout(() => {
        worker.terminate()
        resolve({ results: [], error: 'timed out (infinite loop?)' })
      }, 5000)
      worker.onmessage = (e: MessageEvent) => {
        clearTimeout(timer)
        worker.terminate()
        resolve(e.data as { results: TestResult[]; error?: string })
      }
      worker.onerror = (e: ErrorEvent) => {
        clearTimeout(timer)
        worker.terminate()
        resolve({ results: [], error: e.message || 'worker error' })
      }
      worker.postMessage({ code, functionName: ex.functionName, tests: ex.tests })
    })
  } catch (e) {
    return { results: [], error: String(e) }
  }
}
