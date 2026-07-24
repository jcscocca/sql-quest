import { expect, test } from 'vitest'
import { runCodeTests } from '../js-runtime'
import { createJavascriptTrack } from './javascript'
import type { CodeTest } from '../content'

const code = 'function add(a, b) { return a + b }'
const tests: CodeTest[] = [
  { expr: 'add(1, 2)', expect: '3' },
  { expr: 'add(-4, 4)', expect: '0' },
]

test('track id is javascript', () => {
  expect(createJavascriptTrack().id).toBe('javascript')
})

test('check is correct only when every test passes with no error', () => {
  const track = createJavascriptTrack()
  expect(track.check({ results: runCodeTests(code, tests) }).correct).toBe(true)
  expect(track.check({ results: runCodeTests('function add(a, b) { return a - b }', tests) }).correct).toBe(false)
  expect(track.check({ results: [], error: 'timed out' }).correct).toBe(false)
})
