import { expect, test } from 'vitest'
import { deepEqual, runTests } from '../js-runtime'
import { createJavascriptTrack } from './javascript'
import type { JsTest } from '../content'

const tests: JsTest[] = [
  { input: [1, 2], expected: 3 },
  { input: [-4, 4], expected: 0 },
]

test('runTests passes a correct function', () => {
  const results = runTests((a: number, b: number) => a + b, tests)
  expect(results.every(r => r.pass)).toBe(true)
})

test('runTests fails a wrong function and reports actual', () => {
  const results = runTests((a: number, b: number) => a - b, tests)
  expect(results[0].pass).toBe(false)
  expect(results[0].actual).toBe(-1)
})

test('runTests catches a throwing function per-test', () => {
  const results = runTests(() => { throw new Error('boom') }, tests)
  expect(results[0].pass).toBe(false)
  expect(results[0].error).toContain('boom')
})

test('deepEqual on arrays and nested objects', () => {
  expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true)
  expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
  expect(deepEqual({ a: 1, b: [2] }, { a: 1, b: [2] })).toBe(true)
  expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false)
  expect(deepEqual([], [])).toBe(true)
})

test('track check is correct only when every test passes with no error', () => {
  const track = createJavascriptTrack()
  expect(track.id).toBe('javascript')
  expect(track.check({ results: runTests((a: number, b: number) => a + b, tests) }).correct).toBe(true)
  expect(track.check({ results: runTests((a: number, b: number) => a - b, tests) }).correct).toBe(false)
  expect(track.check({ results: [], error: 'timed out' }).correct).toBe(false)
})
