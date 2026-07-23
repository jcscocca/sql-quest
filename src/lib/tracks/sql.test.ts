import { expect, test } from 'vitest'
import { createSqlTrack } from './sql'
import type { QueryResult } from '../compare'
import type { Exercise, Skill, WorldSchema } from '../content'

const skill = { id: 's1', name: 'S1', world: 'pokemon', requires: [], lesson: { intro: '', exampleSql: 'SELECT 1' } } as Skill
const exercise = { id: 'e1', prompt: '', referenceSql: 'SELECT x FROM t', orderMatters: false, hints: [], xp: 10 } as Exercise
const noDeps = { runQuery: async () => ({ columns: [], rows: [] }), loadWorld: async () => {} }

test('example returns the skill exampleSql', () => {
  const track = createSqlTrack(noDeps)
  expect(track.example(skill)).toBe('SELECT 1')
})

test('check is correct when the user result matches the reference', async () => {
  const ref: QueryResult = { columns: ['x'], rows: [['a']] }
  const track = createSqlTrack({ runQuery: async () => ref, loadWorld: async () => {} })
  const outcome = await track.check({ columns: ['x'], rows: [['a']] }, exercise)
  expect(outcome.correct).toBe(true)
})

test('check is wrong with a reason when results differ', async () => {
  const ref: QueryResult = { columns: ['x'], rows: [['a']] }
  const track = createSqlTrack({ runQuery: async () => ref, loadWorld: async () => {} })
  const outcome = await track.check({ columns: ['x'], rows: [['b']] }, exercise)
  expect(outcome.correct).toBe(false)
  expect(typeof outcome.reason).toBe('string')
})

test('reward catches an entity appearing in the result, with its label', async () => {
  const schema = { world: 'pokemon', name: 'Pokémon', tables: [{ name: 'pokemon', description: '', columns: [] }], entity: { table: 'pokemon', column: 'name', labelColumn: 'type1' } } as WorldSchema
  const runQuery = async (sql: string): Promise<QueryResult> => {
    if (sql.includes('DISTINCT')) return { columns: ['name'], rows: [['pikachu'], ['mew']] }
    if (sql.includes('IN (')) return { columns: ['name', 'type1'], rows: [['pikachu', 'electric']] }
    return { columns: [], rows: [] }
  }
  const track = createSqlTrack({ runQuery, loadWorld: async () => {} })
  await track.prepare(skill, schema)
  const caught = await track.reward({ columns: ['name'], rows: [['pikachu']] }, exercise, { owned: new Set() })
  expect(caught).toEqual([{ name: 'pikachu', label: 'electric' }])
})

test('reward is empty when the world has no entity', async () => {
  const schema = { world: 'w', name: 'W', tables: [{ name: 't', description: '', columns: [] }] } as WorldSchema
  const track = createSqlTrack(noDeps)
  await track.prepare(skill, schema)
  const caught = await track.reward({ columns: ['x'], rows: [['a']] }, exercise, { owned: new Set() })
  expect(caught).toEqual([])
})
