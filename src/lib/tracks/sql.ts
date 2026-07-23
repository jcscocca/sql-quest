import { compareResults, type QueryResult } from '../compare'
import { pickCatches } from '../catches'
import type { Exercise, Skill, WorldSchema } from '../content'
import type { Catch, CheckOutcome, RewardContext, Track } from './types'

export interface SqlDeps {
  runQuery: (sql: string) => Promise<QueryResult>
  loadWorld: (world: string, tables: string[]) => Promise<void>
}

export function createSqlTrack(deps: SqlDeps): Track {
  let schema: WorldSchema | undefined
  let worldNames: Set<string> | null = null
  const refCache = new Map<string, QueryResult>()

  async function names(): Promise<Set<string> | null> {
    const entity = schema?.entity
    if (!entity) return null
    if (!worldNames) {
      const r = await deps.runQuery(`SELECT DISTINCT ${entity.column} FROM ${entity.table}`)
      worldNames = new Set(r.rows.map(row => String(row[0])))
    }
    return worldNames
  }

  return {
    id: 'sql',

    async prepare(_skill: Skill, s: WorldSchema | undefined) {
      schema = s
      worldNames = null
      if (schema) await deps.loadWorld(schema.world, schema.tables.map(t => t.name))
    },

    run(submission: string) {
      return deps.runQuery(submission)
    },

    async check(result: QueryResult, exercise: Exercise): Promise<CheckOutcome> {
      let ref = refCache.get(exercise.id)
      if (!ref) {
        ref = await deps.runQuery(exercise.referenceSql)
        refCache.set(exercise.id, ref)
      }
      const outcome = compareResults(result, ref, { orderMatters: exercise.orderMatters })
      return outcome.equal ? { correct: true } : { correct: false, reason: outcome.reason }
    },

    async reward(result: QueryResult, exercise: Exercise, ctx: RewardContext): Promise<Catch[]> {
      const nameSet = await names()
      const entity = schema?.entity
      if (!entity || !nameSet) return []
      const caught = pickCatches(result, nameSet, ctx.owned, exercise.collectibles ?? [])
      if (caught.length === 0) return []
      if (!entity.labelColumn) return caught.map(n => ({ name: n, label: '' }))
      const list = caught.map(n => `'${n.replace(/'/g, "''")}'`).join(', ')
      const lr = await deps.runQuery(
        `SELECT ${entity.column}, ${entity.labelColumn} FROM ${entity.table} WHERE ${entity.column} IN (${list})`,
      )
      const labels = new Map(lr.rows.map(r => [String(r[0]), String(r[1] ?? '')]))
      return caught.map(n => ({ name: n, label: labels.get(n) ?? '' }))
    },

    example(skill: Skill) {
      return skill.lesson.exampleSql
    },
  }
}
