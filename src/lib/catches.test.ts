import { expect, test } from 'vitest'
import { pickCatches } from './catches'

const names = new Set(['pikachu', 'mew', 'eevee', 'ditto'])
const res = (rows: unknown[][]) => ({ columns: ['x'], rows })
const zero = () => 0

test('catches up to 3 new pokemon appearing in result cells', () => {
  const out = pickCatches(res([['pikachu'], ['mew'], ['eevee'], ['ditto']]), names, new Set(), [], 3, zero)
  expect(out.length).toBe(3)
  out.forEach(n => expect(names.has(n)).toBe(true))
})

test('owned pokemon and non-name cells are ignored', () => {
  const out = pickCatches(
    res([['pikachu', 55], ['mew', null], ['not-a-pokemon', 'ditto']]),
    names,
    new Set(['pikachu']),
    [],
    3,
    zero,
  )
  expect(out).not.toContain('pikachu')
  expect(out).not.toContain('not-a-pokemon')
  expect(out).toContain('mew')
  expect(out).toContain('ditto')
})

test('authored collectibles are always added on top of the cap', () => {
  const out = pickCatches(res([['pikachu'], ['mew'], ['eevee']]), names, new Set(), ['ditto'], 3, zero)
  expect(out).toContain('ditto')
  expect(out.length).toBe(4)
})

test('already-owned authored collectibles are not re-added', () => {
  const out = pickCatches(res([]), names, new Set(['ditto']), ['ditto'], 3, zero)
  expect(out).toEqual([])
})

test('duplicate cells produce one catch', () => {
  const out = pickCatches(res([['mew'], ['mew'], ['mew']]), names, new Set(), [], 3, zero)
  expect(out).toEqual(['mew'])
})
