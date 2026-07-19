import { expect, test } from 'vitest'
import { assertReadOnly, TrainerError, translateError } from './errors'
import type { WorldSchema } from './content'

const schema: WorldSchema = {
  world: 'pokemon',
  name: 'Pokémon',
  tables: [
    {
      name: 'pokemon',
      description: 'one row per Pokémon',
      columns: [
        { name: 'name', type: 'VARCHAR', description: '' },
        { name: 'attack', type: 'INTEGER', description: '' },
      ],
    },
  ],
}

test('SELECT and WITH pass, including trailing semicolon and comments', () => {
  expect(() => assertReadOnly('SELECT 1')).not.toThrow()
  expect(() => assertReadOnly('  with x as (select 1) select * from x;')).not.toThrow()
  expect(() => assertReadOnly('-- top pokemon\nSELECT name FROM pokemon')).not.toThrow()
})

test('mutations are rejected', () => {
  expect(() => assertReadOnly('DROP TABLE pokemon')).toThrow(TrainerError)
  expect(() => assertReadOnly('INSERT INTO pokemon VALUES (1)')).toThrow(TrainerError)
  expect(() => assertReadOnly('UPDATE pokemon SET attack = 0')).toThrow(TrainerError)
})

test('multiple statements are rejected', () => {
  expect(() => assertReadOnly('SELECT 1; SELECT 2')).toThrow(TrainerError)
})

test('unknown column errors list real columns', () => {
  const out = translateError('Binder Error: Referenced column "atk" not found in FROM clause!', schema)
  expect(out).toContain('"atk"')
  expect(out).toContain('name, attack')
})

test('unknown table errors list real tables', () => {
  const out = translateError('Catalog Error: Table with name pokmon does not exist!', schema)
  expect(out).toContain('pokmon')
  expect(out).toContain('pokemon')
})

test('GROUP BY errors get the plain-language rule', () => {
  const out = translateError('Binder Error: column "name" must appear in the GROUP BY clause or must be part of an aggregate function.', schema)
  expect(out).toMatch(/aggregate function|GROUP BY/)
})

test('unrecognized errors translate to null', () => {
  expect(translateError('Parser Error: syntax error at or near "FORM"', schema)).toBeNull()
})

test('semicolons inside string literals are not multi-statement', () => {
  expect(() => assertReadOnly("SELECT 'a;b' AS x")).not.toThrow()
  expect(() => assertReadOnly("SELECT 'it''s; fine' AS x")).not.toThrow()
})

test('comment markers inside string literals cannot smuggle a second statement', () => {
  expect(() => assertReadOnly("SELECT '--' AS x; DROP TABLE pokemon")).toThrow(TrainerError)
})

test('parenthesized queries are allowed', () => {
  expect(() => assertReadOnly('(SELECT 1)')).not.toThrow()
  expect(() => assertReadOnly('(SELECT 1) UNION (SELECT 2)')).not.toThrow()
})

test('WITH-prefixed mutations are rejected', () => {
  expect(() => assertReadOnly('WITH x AS (SELECT 1) DELETE FROM pokemon')).toThrow(TrainerError)
})

test('TrainerError carries its name', () => {
  expect(new TrainerError('x').name).toBe('TrainerError')
})
