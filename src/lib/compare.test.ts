import { expect, test } from 'vitest'
import { compareResults } from './compare'

const res = (columns: string[], rows: unknown[][]) => ({ columns, rows })

test('identical results match', () => {
  const a = res(['name', 'atk'], [['pikachu', 55], ['mew', 100]])
  expect(compareResults(a, a).equal).toBe(true)
})

test('row order is ignored by default', () => {
  const user = res(['name'], [['mew'], ['pikachu']])
  const ref = res(['name'], [['pikachu'], ['mew']])
  expect(compareResults(user, ref).equal).toBe(true)
})

test('row order is enforced when orderMatters', () => {
  const user = res(['name'], [['mew'], ['pikachu']])
  const ref = res(['name'], [['pikachu'], ['mew']])
  expect(compareResults(user, ref, { orderMatters: true }).equal).toBe(false)
})

test('user column order may differ from reference', () => {
  const user = res(['atk', 'name'], [[55, 'pikachu'], [100, 'mew']])
  const ref = res(['name', 'attack'], [['pikachu', 55], ['mew', 100]])
  expect(compareResults(user, ref).equal).toBe(true)
})

test('column names are irrelevant, only values count', () => {
  const user = res(['whatever'], [['pikachu']])
  const ref = res(['name'], [['pikachu']])
  expect(compareResults(user, ref).equal).toBe(true)
})

test('floats compare with tolerance', () => {
  const user = res(['avg'], [[0.1 + 0.2]])
  const ref = res(['avg'], [[0.3]])
  expect(compareResults(user, ref).equal).toBe(true)
})

test('bigint and number compare equal', () => {
  const user = res(['n'], [[3n]])
  const ref = res(['n'], [[3]])
  expect(compareResults(user, ref).equal).toBe(true)
})

test('NULL does not equal zero or empty string', () => {
  expect(compareResults(res(['x'], [[null]]), res(['x'], [[0]])).equal).toBe(false)
  expect(compareResults(res(['x'], [[null]]), res(['x'], [['']])).equal).toBe(false)
  expect(compareResults(res(['x'], [[null]]), res(['x'], [[null]])).equal).toBe(true)
})

test('row count mismatch gives a reason', () => {
  const out = compareResults(res(['x'], [[1]]), res(['x'], [[1], [2]]))
  expect(out.equal).toBe(false)
  expect(out.reason).toContain('expected 2 row(s), got 1')
})

test('column count mismatch gives a reason', () => {
  const out = compareResults(res(['a'], [[1]]), res(['a', 'b'], [[1, 2]]))
  expect(out.equal).toBe(false)
  expect(out.reason).toContain('expected 2 column(s), got 1')
})

test('different values fail', () => {
  const out = compareResults(res(['x'], [[1]]), res(['x'], [[2]]))
  expect(out.equal).toBe(false)
})

test('same multisets but inconsistent row pairing fails', () => {
  const user = res(['a', 'b'], [[1, 'y'], [2, 'x']])
  const ref = res(['a', 'b'], [[1, 'x'], [2, 'y']])
  expect(compareResults(user, ref).equal).toBe(false)
})

test('adjacent values are not concatenation-confused', () => {
  const user = res(['a', 'b'], [['x', 'yz']])
  const ref = res(['a', 'b'], [['xy', 'z']])
  expect(compareResults(user, ref).equal).toBe(false)
})

// Matching user columns to reference ones is a permutation search. When many
// columns share a value multiset every column is a candidate for every slot,
// which used to cost O(n!) — a 10-column Latin square took ~11s on the main
// thread. These pin the two guards: prefix pruning, and a hard budget.
const cols = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`)

test('columns sharing a value multiset do not blow up the search', () => {
  const n = 10
  // Latin squares: every column holds {0..n-1}, so nothing is ruled out
  // up front, yet no column permutation reconciles the rows.
  const ref = res(cols(n), Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (r + c) % n)))
  const user = res(cols(n), Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (r + 2 * c) % n)))
  const started = Date.now()
  expect(compareResults(user, ref).equal).toBe(false)
  expect(Date.now() - started).toBeLessThan(1000)
})

test('an unmatchable result with duplicate columns gives up instead of hanging', () => {
  const n = 14
  // An all-identical prefix defeats prefix pruning, so only the budget bounds this.
  const pad = (v: number) => Array.from({ length: n - 2 }, () => v)
  const ref = res(cols(n), [[...pad(0), 1, 'x'], [...pad(0), 2, 'y']])
  const user = res(cols(n), [[...pad(0), 1, 'y'], [...pad(0), 2, 'x']])
  const started = Date.now()
  const out = compareResults(user, ref)
  expect(out.equal).toBe(false)
  expect(out.reason).toContain('interchangeable')
  expect(Date.now() - started).toBeLessThan(1000)
})

test('the budget never rejects a correct answer with duplicate columns', () => {
  const n = 40
  const pad = (v: number) => Array.from({ length: n - 2 }, () => v)
  const rows = [[...pad(0), 1, 'x'], [...pad(0), 2, 'y']]
  const rotated = rows.map(r => [r[n - 1], ...r.slice(0, n - 1)])
  expect(compareResults(res(cols(n), rotated), res(cols(n), rows)).equal).toBe(true)
})
