import { expect, test } from 'vitest'
import { getTrack } from './registry'
import type { Skill } from '../content'

const skill = { id: 's1', name: 'S1', world: 'pokemon', requires: [], lesson: { intro: '', exampleSql: '' } } as Skill
const deps = { runQuery: async () => ({ columns: [], rows: [] }), loadWorld: async () => {} }

test('getTrack returns the SQL track for any skill', () => {
  expect(getTrack(skill, deps).id).toBe('sql')
})
