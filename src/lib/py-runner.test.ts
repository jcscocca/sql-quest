import { beforeAll, expect, test } from 'vitest'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { PY_RUNNER } from './py-runner-src'
import type { CodeTest } from './content'

let py: PyodideInterface

beforeAll(async () => {
  py = await loadPyodide()
  py.runPython(PY_RUNNER)
}, 60_000)

function run(code: string, tests: CodeTest[]): [boolean, string, string, string | null][] {
  const runExercise = py.globals.get('_run_exercise') as (c: string, t: string) => string
  const out = JSON.parse(runExercise(code, JSON.stringify(tests)))
  ;(runExercise as unknown as { destroy?: () => void }).destroy?.()
  return out
}

test('passes a correct solution', () => {
  const out = run('def add(a, b):\n    return a + b', [{ expr: 'add(1, 2)', expect: '3' }])
  expect(out[0][0]).toBe(true)
})

test('compares sets and tuples natively', () => {
  const out = run('def uniq(xs):\n    return set(xs)', [{ expr: 'uniq([1, 1, 2])', expect: '{1, 2}' }])
  expect(out[0][0]).toBe(true)
  const tup = run('def dm(a, b):\n    return divmod(a, b)', [{ expr: 'dm(7, 2)', expect: '(3, 1)' }])
  expect(tup[0][0]).toBe(true)
})

test('observes mutation via setup and isolates tests', () => {
  const code = 'def sort_in_place(xs):\n    xs.sort()'
  const out = run(code, [
    { setup: 'xs = [3, 1, 2]\nsort_in_place(xs)', expr: 'xs', expect: '[1, 2, 3]' },
    { setup: 'xs = [5]', expr: 'xs', expect: '[5]' },
  ])
  expect(out.every(r => r[0])).toBe(true)
})

test('handles raises', () => {
  const code = 'import math\ndef s(x):\n    return math.sqrt(x)'
  const ok = run(code, [{ expr: 's(-1)', raises: 'ValueError' }])
  expect(ok[0][0]).toBe(true)
  const wrong = run(code, [{ expr: 's(4)', raises: 'ValueError' }])
  expect(wrong[0][0]).toBe(false)
})

test('reports a wrong answer with reprs', () => {
  const out = run('def add(a, b):\n    return a - b', [{ expr: 'add(1, 2)', expect: '3' }])
  expect(out[0][0]).toBe(false)
  expect(out[0][1]).toBe('3')
  expect(out[0][2]).toBe('-1')
})

test('captures a harness error', () => {
  const out = run('def f():\n    return 1', [{ expr: 'undefined_name', expect: '1' }])
  expect(out[0][0]).toBe(false)
  expect(out[0][3]).toContain('NameError')
})
