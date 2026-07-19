import { readFileSync } from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'
import { compareResults, type QueryResult } from '../src/lib/compare'
import type { Curriculum, ExerciseBank, WorldSchema } from '../src/lib/content'

const failures: string[] = []

const curriculum = JSON.parse(readFileSync('public/content/skills.json', 'utf8')) as Curriculum
const skills = curriculum.regions.flatMap(r => r.skills)
const ids = new Set(skills.map(s => s.id))
for (const s of skills)
  for (const r of s.requires)
    if (!ids.has(r)) failures.push(`${s.id}: unknown prerequisite "${r}"`)

const db = await DuckDBInstance.create()
const conn = await db.connect()

const worlds = new Set(skills.map(s => s.world))
for (const w of worlds) {
  const schema = JSON.parse(readFileSync(`public/worlds/${w}/schema.json`, 'utf8')) as WorldSchema
  for (const t of schema.tables)
    await conn.run(`CREATE OR REPLACE TABLE ${t.name} AS SELECT * FROM 'public/worlds/${w}/${t.name}.parquet'`)
}

async function run(sql: string): Promise<QueryResult> {
  const reader = await conn.runAndReadAll(sql)
  return { columns: reader.columnNames(), rows: reader.getRows() }
}

let checked = 0
for (const skill of skills) {
  let bank: ExerciseBank
  try {
    bank = JSON.parse(readFileSync(`public/content/exercises/${skill.id}.json`, 'utf8')) as ExerciseBank
  } catch {
    failures.push(`${skill.id}: missing or unreadable exercise bank`)
    continue
  }
  if (bank.skillId !== skill.id) failures.push(`${skill.id}: bank skillId is "${bank.skillId}"`)
  for (const ex of bank.exercises) {
    checked++
    const tag = `${skill.id}/${ex.id}`
    if (ex.hints.length !== 3) failures.push(`${tag}: expected 3 hints, found ${ex.hints.length}`)
    try {
      const a = await run(ex.referenceSql)
      if (a.rows.length === 0) {
        failures.push(`${tag}: reference query returns no rows`)
        continue
      }
      const b = await run(ex.referenceSql)
      if (!compareResults(a, b, { orderMatters: ex.orderMatters }).equal)
        failures.push(`${tag}: reference query is nondeterministic — add a tiebreaker to ORDER BY`)
      for (const hint of ex.hints) {
        const m = hint.match(/```sql([\s\S]*?)```/)
        if (m)
          await run(`EXPLAIN ${m[1].trim().replace(/;\s*$/, '')}`).catch(() =>
            failures.push(`${tag}: hint SQL does not parse`),
          )
      }
      for (const c of ex.collectibles ?? []) {
        const hit = await run(`SELECT 1 FROM pokemon WHERE name = '${c.replace(/'/g, "''")}'`)
        if (hit.rows.length === 0) failures.push(`${tag}: collectible "${c}" not found in world`)
      }
    } catch (e) {
      failures.push(`${tag}: reference query failed — ${e}`)
    }
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} problem(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ ${checked} exercises validated across ${worlds.size} world(s)`)
