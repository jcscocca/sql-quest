import { existsSync, readFileSync } from 'node:fs'
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
const worldSchemas: Record<string, WorldSchema> = {}
const entityNames: Record<string, Set<string>> = {}
// mirrors pickCatches (src/lib/catches.ts) and build-sprites.ts catchable() — keep matching semantics in lockstep
const catchableByWorld: Record<string, Set<string>> = {}
for (const w of worlds) {
  const schema = JSON.parse(readFileSync(`public/worlds/${w}/schema.json`, 'utf8')) as WorldSchema
  worldSchemas[w] = schema
  for (const t of schema.tables)
    await conn.run(`CREATE OR REPLACE TABLE ${t.name} AS SELECT * FROM 'public/worlds/${w}/${t.name}.parquet'`)
  if (schema.entity) {
    try {
      await conn.run(`SELECT ${schema.entity.column} FROM ${schema.entity.table} LIMIT 1`)
      const nameReader = await conn.runAndReadAll(`SELECT DISTINCT ${schema.entity.column} FROM ${schema.entity.table}`)
      entityNames[w] = new Set(nameReader.getRows().map(r => String(r[0])))
      catchableByWorld[w] = new Set()
    } catch {
      failures.push(`world ${w}: entity ${schema.entity.table}.${schema.entity.column} is not queryable`)
    }
  }
}

async function run(sql: string): Promise<QueryResult> {
  const reader = await conn.runAndReadAll(sql)
  return { columns: reader.columnNames(), rows: reader.getRows() }
}

let checked = 0
const idBanks = new Map<string, string[]>()
for (const skill of skills) {
  if (!skill.lesson?.wrapUp?.trim()) failures.push(`${skill.id}: missing lesson.wrapUp`)
  let bank: ExerciseBank
  try {
    bank = JSON.parse(readFileSync(`public/content/exercises/${skill.id}.json`, 'utf8')) as ExerciseBank
  } catch {
    failures.push(`${skill.id}: missing or unreadable exercise bank`)
    continue
  }
  if (bank.skillId !== skill.id) failures.push(`${skill.id}: bank skillId is "${bank.skillId}"`)
  if (!Array.isArray(bank.exercises)) {
    failures.push(`${skill.id}: bank has no exercises array`)
    continue
  }
  if (bank.exercises.length === 0) failures.push(`${skill.id}: exercise bank is empty`)
  if (new Set(bank.exercises.map(e => e.id)).size !== bank.exercises.length)
    failures.push(`${skill.id}: duplicate exercise ids in bank`)
  for (const ex of bank.exercises) {
    checked++
    idBanks.set(ex.id, [...(idBanks.get(ex.id) ?? []), skill.id])
    const tag = `${skill.id}/${ex.id}`
    if (ex.hints.length !== 3) failures.push(`${tag}: expected 3 hints, found ${ex.hints.length}`)
    try {
      const a = await run(ex.referenceSql)
      if (a.rows.length === 0) {
        failures.push(`${tag}: reference query returns no rows`)
        continue
      }
      const names = entityNames[skill.world]
      if (names)
        for (const row of a.rows)
          for (const cell of row) if (typeof cell === 'string' && names.has(cell)) catchableByWorld[skill.world].add(cell)
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
      if ((ex.collectibles ?? []).length > 0) {
        const entity = worldSchemas[skill.world]?.entity
        if (!entity) {
          failures.push(`${tag}: world has no entity, collectibles not allowed`)
        } else {
          for (const c of ex.collectibles ?? []) {
            const hit = await run(`SELECT 1 FROM ${entity.table} WHERE ${entity.column} = '${c.replace(/'/g, "''")}'`)
            if (hit.rows.length === 0) failures.push(`${tag}: collectible "${c}" not found in world`)
            else (catchableByWorld[skill.world] ??= new Set()).add(c)
          }
        }
      }
    } catch (e) {
      failures.push(`${tag}: reference query failed — ${e}`)
    }
  }
}

for (const [id, banks] of idBanks)
  if (banks.length > 1) failures.push(`duplicate exercise id "${id}" in banks ${banks.join(' and ')}`)

for (const w of Object.keys(catchableByWorld)) {
  const manifestPath = `public/sprites/${w}/manifest.json`
  if (!existsSync(manifestPath)) {
    console.warn(`${w}: no sprite manifest, skipping sprite coverage check`)
    continue
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { entities: Record<string, string> }
  for (const name of catchableByWorld[w])
    if (!manifest.entities[name] || !existsSync(`public/sprites/${w}/${manifest.entities[name]}`))
      failures.push(`${w}: catchable entity "${name}" has no sprite — run: npm run build:sprites ${w}`)
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} problem(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ ${checked} exercises validated across ${worlds.size} world(s)`)
