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
