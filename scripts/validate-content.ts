import { existsSync, readFileSync } from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'
import { compareResults, type QueryResult } from '../src/lib/compare'
import { runTests } from '../src/lib/js-runtime'
import type { CaseBuildBank, Curriculum, DrillBank, ExerciseBank, JsBank, WorldSchema } from '../src/lib/content'

const failures: string[] = []

const curriculum = JSON.parse(readFileSync('public/content/skills.json', 'utf8')) as Curriculum
const skills = curriculum.regions.flatMap(r => r.skills)
const ids = new Set(skills.map(s => s.id))
for (const s of skills)
  for (const r of s.requires)
    if (!ids.has(r)) failures.push(`${s.id}: unknown prerequisite "${r}"`)

const db = await DuckDBInstance.create()
const conn = await db.connect()

const worlds = new Set(skills.map(s => s.world).filter((w): w is string => !!w))
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

  if (skill.trackId === 'systems-design' && skill.format === 'case') {
    let cb: CaseBuildBank
    try {
      cb = JSON.parse(readFileSync(`public/content/exercises/${skill.id}.json`, 'utf8')) as CaseBuildBank
    } catch {
      failures.push(`${skill.id}: missing or unreadable case-build bank`)
      continue
    }
    if (cb.skillId !== skill.id) failures.push(`${skill.id}: bank skillId is "${cb.skillId}"`)
    if (!cb.title?.trim()) failures.push(`${skill.id}: missing case-build title`)
    if (!cb.scenario?.trim()) failures.push(`${skill.id}: missing case-build scenario`)
    if (!Array.isArray(cb.steps) || cb.steps.length < 2) {
      failures.push(`${skill.id}: case-build needs at least 2 steps`)
      continue
    }
    if (new Set(cb.steps.map(s => s.id)).size !== cb.steps.length)
      failures.push(`${skill.id}: duplicate step ids in bank`)
    for (const st of cb.steps) {
      checked++
      const tag = `${skill.id}/${st.id}`
      if (!st.label?.trim()) failures.push(`${tag}: missing label`)
      if (!Array.isArray(st.choices) || st.choices.length < 2) failures.push(`${tag}: needs at least 2 choices`)
      else if (!st.choices.some(c => c.id === st.answer)) failures.push(`${tag}: answer "${st.answer}" matches no choice id`)
      if (!st.explanation?.trim()) failures.push(`${tag}: missing explanation`)
      if (st.hints.length !== 3) failures.push(`${tag}: expected 3 hints, found ${st.hints.length}`)
    }
    continue
  }

  if (skill.trackId === 'systems-design') {
    let drills: DrillBank
    try {
      drills = JSON.parse(readFileSync(`public/content/exercises/${skill.id}.json`, 'utf8')) as DrillBank
    } catch {
      failures.push(`${skill.id}: missing or unreadable drill bank`)
      continue
    }
    if (drills.skillId !== skill.id) failures.push(`${skill.id}: bank skillId is "${drills.skillId}"`)
    if (!Array.isArray(drills.exercises) || drills.exercises.length === 0) {
      failures.push(`${skill.id}: drill bank is empty`)
      continue
    }
    if (new Set(drills.exercises.map(d => d.id)).size !== drills.exercises.length)
      failures.push(`${skill.id}: duplicate drill ids in bank`)
    for (const d of drills.exercises) {
      checked++
      const tag = `${skill.id}/${d.id}`
      if (!Array.isArray(d.choices) || d.choices.length < 2) failures.push(`${tag}: needs at least 2 choices`)
      else if (!d.choices.some(c => c.id === d.answer)) failures.push(`${tag}: answer "${d.answer}" matches no choice id`)
      if (!d.explanation?.trim()) failures.push(`${tag}: missing explanation`)
      if (d.hints.length !== 3) failures.push(`${tag}: expected 3 hints, found ${d.hints.length}`)
    }
    continue
  }

  if (skill.trackId === 'javascript') {
    let jsBank: JsBank
    try {
      jsBank = JSON.parse(readFileSync(`public/content/exercises/${skill.id}.json`, 'utf8')) as JsBank
    } catch {
      failures.push(`${skill.id}: missing or unreadable JS bank`)
      continue
    }
    if (jsBank.skillId !== skill.id) failures.push(`${skill.id}: bank skillId is "${jsBank.skillId}"`)
    if (!Array.isArray(jsBank.exercises) || jsBank.exercises.length === 0) {
      failures.push(`${skill.id}: JS bank is empty`)
      continue
    }
    if (new Set(jsBank.exercises.map(e => e.id)).size !== jsBank.exercises.length)
      failures.push(`${skill.id}: duplicate exercise ids in bank`)
    for (const ex of jsBank.exercises) {
      checked++
      const tag = `${skill.id}/${ex.id}`
      if (!ex.functionName?.trim()) failures.push(`${tag}: missing functionName`)
      if (!ex.starter?.trim()) failures.push(`${tag}: missing starter`)
      if (!ex.solution?.trim()) failures.push(`${tag}: missing solution`)
      if (!Array.isArray(ex.tests) || ex.tests.length < 1) failures.push(`${tag}: needs at least 1 test`)
      if (ex.hints.length !== 3) failures.push(`${tag}: expected 3 hints, found ${ex.hints.length}`)
      if (ex.functionName?.trim() && ex.solution?.trim() && Array.isArray(ex.tests) && ex.tests.length > 0) {
        try {
          const fn = new Function(`${ex.solution}\n; return ${ex.functionName}`)() as Function
          runTests(fn, ex.tests).forEach((r, i) => {
            if (!r.pass)
              failures.push(
                `${tag}: solution fails test ${i + 1} — expected ${JSON.stringify(r.expected)}, got ${r.error ? `error ${r.error}` : JSON.stringify(r.actual)}`,
              )
          })
        } catch (e) {
          failures.push(`${tag}: solution did not evaluate — ${e}`)
        }
      }
    }
    continue
  }

  const world = skill.world!
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
      const names = entityNames[world]
      if (names)
        for (const row of a.rows)
          for (const cell of row) if (typeof cell === 'string' && names.has(cell)) catchableByWorld[world].add(cell)
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
        const entity = worldSchemas[world]?.entity
        if (!entity) {
          failures.push(`${tag}: world has no entity, collectibles not allowed`)
        } else {
          for (const c of ex.collectibles ?? []) {
            const hit = await run(`SELECT 1 FROM ${entity.table} WHERE ${entity.column} = '${c.replace(/'/g, "''")}'`)
            if (hit.rows.length === 0) failures.push(`${tag}: collectible "${c}" not found in world`)
            else (catchableByWorld[world] ??= new Set()).add(c)
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
