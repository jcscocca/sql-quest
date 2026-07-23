import { expect, test } from 'vitest'
import { runTests } from '../js-runtime'
import { createPythonTrack } from './python'
import type { JsTest, PyExercise } from '../content'

const tests: JsTest[] = [
  { input: [1, 2], expected: 3 },
  { input: [-4, 4], expected: 0 },
]

test('python track id and example prefills the starter', () => {
  const track = createPythonTrack()
  expect(track.id).toBe('python')
  expect(track.example({ starter: 'def add(a, b):\n    pass' } as PyExercise)).toBe('def add(a, b):\n    pass')
})

test('python track check is correct only when every test passes with no error', () => {
  const track = createPythonTrack()
  expect(track.check({ results: runTests((a: number, b: number) => a + b, tests) }).correct).toBe(true)
  expect(track.check({ results: runTests((a: number, b: number) => a - b, tests) }).correct).toBe(false)
  expect(track.check({ results: [], error: 'timed out' }).correct).toBe(false)
  expect(track.check({ results: [], error: 'timed out' }).reason).toBe('timed out')
})
