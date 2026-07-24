import { expect, test } from 'vitest'
import { createPythonTrack } from './python'
import type { PyExercise } from '../content'
import type { TestResult } from '../js-runtime'

const pass: TestResult[] = [{ pass: true, expected: '3', actual: '3' }]
const fail: TestResult[] = [{ pass: false, expected: '3', actual: '2' }]

test('python track id and example prefills the starter', () => {
  const track = createPythonTrack()
  expect(track.id).toBe('python')
  expect(track.example({ starter: 'def add(a, b):\n    pass' } as PyExercise)).toBe('def add(a, b):\n    pass')
})

test('python track check reflects results and passes through the error reason', () => {
  const track = createPythonTrack()
  expect(track.check({ results: pass }).correct).toBe(true)
  expect(track.check({ results: fail }).correct).toBe(false)
  expect(track.check({ results: [], error: 'timed out' }).correct).toBe(false)
  expect(track.check({ results: [], error: 'timed out' }).reason).toBe('timed out')
})
