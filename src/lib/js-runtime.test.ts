import { expect, test } from 'vitest'
import { deepEqual, render, runCodeTests } from './js-runtime'
import type { CodeTest } from './content'

test('deepEqual handles Set and Map', () => {
  expect(deepEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true)
  expect(deepEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false)
  expect(deepEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true)
  expect(deepEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false)
  expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true)
})

test('render is readable for common shapes', () => {
  expect(render([1, 2])).toBe('[1, 2]')
  expect(render('hi')).toBe('"hi"')
  expect(render(new Set([1, 2]))).toBe('Set(1, 2)')
})

test('runCodeTests passes a correct solution via expr/expect', () => {
  const tests: CodeTest[] = [
    { expr: 'add(1, 2)', expect: '3' },
    { expr: 'add(-4, 4)', expect: '0' },
  ]
  const r = runCodeTests('function add(a, b) { return a + b }', tests)
  expect(r.every(t => t.pass)).toBe(true)
})

test('runCodeTests reports a wrong result with rendered actual', () => {
  const r = runCodeTests('function add(a, b) { return a - b }', [{ expr: 'add(1, 2)', expect: '3' }])
  expect(r[0].pass).toBe(false)
  expect(r[0].actual).toBe('-1')
  expect(r[0].expected).toBe('3')
})

test('runCodeTests runs setup and observes mutation', () => {
  const code = 'function sortInPlace(xs) { xs.sort((a, b) => a - b) }'
  const r = runCodeTests(code, [{ setup: 'const xs = [3, 1, 2]\nsortInPlace(xs)', expr: 'xs', expect: '[1, 2, 3]' }])
  expect(r[0].pass).toBe(true)
})

test('runCodeTests isolates state between tests', () => {
  const code = 'function push1(xs) { xs.push(1); return xs }'
  const r = runCodeTests(code, [
    { setup: 'const a = []\npush1(a)', expr: 'a', expect: '[1]' },
    { setup: 'const a = []', expr: 'a', expect: '[]' },
  ])
  expect(r.every(t => t.pass)).toBe(true)
})

test('runCodeTests supports raises', () => {
  const code = 'function boom() { throw new RangeError("nope") }'
  const pass = runCodeTests(code, [{ expr: 'boom()', raises: 'RangeError' }])
  expect(pass[0].pass).toBe(true)
  const wrong = runCodeTests(code, [{ expr: 'boom()', raises: 'TypeError' }])
  expect(wrong[0].pass).toBe(false)
  const noThrow = runCodeTests('function ok() { return 1 }', [{ expr: 'ok()', raises: 'Error' }])
  expect(noThrow[0].pass).toBe(false)
})

test('runCodeTests folds an exercise fixture into every test setup', () => {
  const code = 'function count(xs) { return xs.length }'
  const r = runCodeTests(code, [{ expr: 'count(data)', expect: '2' }], 'const data = [10, 20]')
  expect(r[0].pass).toBe(true)
})

test('runCodeTests reports a thrown error on a value test', () => {
  const r = runCodeTests('function add() { throw new Error("boom") }', [{ expr: 'add()', expect: '3' }])
  expect(r[0].pass).toBe(false)
  expect(r[0].error).toContain('boom')
})

test('raises does not pass when the solution code fails to compile', () => {
  const r = runCodeTests('function parse( {', [{ expr: 'parse("x")', raises: 'SyntaxError' }])
  expect(r[0].pass).toBe(false)
  expect(r[0].error).toBeTruthy()
})

test('a JS raises match comes only from expr, not a throwing setup', () => {
  const r = runCodeTests('function ok() { return 1 }', [
    { setup: 'throw new TypeError("boom")', expr: 'ok()', raises: 'TypeError' },
  ])
  expect(r[0].pass).toBe(false)
  expect(r[0].error).toBeTruthy()
})

test('raises still matches a runtime throw from expr', () => {
  const r = runCodeTests('function boom() { throw new TypeError("nope") }', [{ expr: 'boom()', raises: 'TypeError' }])
  expect(r[0].pass).toBe(true)
})
