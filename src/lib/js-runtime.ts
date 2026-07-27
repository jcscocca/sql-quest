import { parse } from 'acorn'
import type { CodeTest } from './content'

export interface TestResult {
  pass: boolean
  expected: string
  actual: string
  error?: string
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  // primitives only: Set/Map members compared by SameValueZero (identity), not structurally
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false
    for (const x of a) if (!b.has(x)) return false
    return true
  }
  // primitives only: Set/Map members compared by SameValueZero (identity), not structurally
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k))) return false
    return true
  }
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

export function render(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v)
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (v instanceof Set) return `Set(${[...v].map(render).join(', ')})`
  if (v instanceof Map) return `Map(${[...v].map(([k, val]) => `${render(k)} => ${render(val)}`).join(', ')})`
  if (Array.isArray(v)) return `[${v.map(render).join(', ')}]`
  if (typeof v === 'object') return `{${Object.entries(v as object).map(([k, val]) => `${k}: ${render(val)}`).join(', ')}}`
  return String(v)
}

export function withFixtureSetup(fixture: string | undefined, setup: string | undefined): string {
  return [fixture, setup].filter(Boolean).join('\n')
}

/** Names in mustCall with no call site in code. Unparseable code reports nothing — the tests surface the syntax error. */
export function missingCalls(code: string, mustCall: string[]): string[] {
  if (mustCall.length === 0) return []
  let tree: object
  try {
    tree = parse(code, { ecmaVersion: 'latest' })
  } catch {
    return []
  }
  const called = new Set<string>()
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const item of n) walk(item)
      return
    }
    if (!n || typeof n !== 'object') return
    const node = n as { type?: unknown } & Record<string, unknown>
    if (node.type === 'CallExpression') {
      const callee = node.callee as { type: string; name?: string; computed?: boolean; property?: { type: string; name?: string } }
      if (callee.type === 'Identifier' && callee.name) called.add(callee.name)
      else if (callee.type === 'MemberExpression' && !callee.computed && callee.property?.type === 'Identifier' && callee.property.name)
        called.add(callee.property.name)
    }
    for (const k of Object.keys(node)) walk(node[k])
  }
  walk(tree)
  return mustCall.filter(name => !called.has(name))
}

export function runCodeExercise(
  code: string,
  ex: { tests: CodeTest[]; fixture?: string; mustCall?: string[] },
): { results: TestResult[]; error?: string } {
  const missing = missingCalls(code, ex.mustCall ?? [])
  if (missing.length > 0) return { results: [], error: `this exercise requires calling ${missing.join(', ')} in your code` }
  return { results: runCodeTests(code, ex.tests, ex.fixture) }
}

function prepare(code: string, setup: string, expr: string, expectExpr: string): { expr: () => unknown; expect: () => unknown } {
  return new Function(
    `"use strict";\n${code}\n${setup}\nreturn { expr: () => (${expr}), expect: () => (${expectExpr}) };`,
  )() as { expr: () => unknown; expect: () => unknown }
}

export function runCodeTests(code: string, tests: CodeTest[], fixture?: string): TestResult[] {
  return tests.map(t => {
    const setup = withFixtureSetup(fixture, t.setup)
    let thunks: { expr: () => unknown; expect: () => unknown }
    try {
      thunks = prepare(code, setup, t.expr, t.expect ?? 'undefined')
    } catch (e) {
      return { pass: false, expected: t.raises ? `raises ${t.raises}` : t.expect ?? '', actual: '', error: String(e) }
    }
    if (t.raises !== undefined) {
      try {
        thunks.expr()
        return { pass: false, expected: `raises ${t.raises}`, actual: 'no error thrown' }
      } catch (e) {
        const name = e instanceof Error ? e.name : String(e)
        return { pass: name === t.raises, expected: `raises ${t.raises}`, actual: `raises ${name}` }
      }
    }
    try {
      const actual = thunks.expr()
      const expected = thunks.expect()
      return { pass: deepEqual(actual, expected), expected: render(expected), actual: render(actual) }
    } catch (e) {
      return { pass: false, expected: t.expect ?? '', actual: '', error: String(e) }
    }
  })
}

export async function runJs(
  code: string,
  ex: { tests: CodeTest[]; fixture?: string; mustCall?: string[] },
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
      worker.postMessage({ code, tests: ex.tests, fixture: ex.fixture, mustCall: ex.mustCall })
    })
  } catch (e) {
    return { results: [], error: String(e) }
  }
}
