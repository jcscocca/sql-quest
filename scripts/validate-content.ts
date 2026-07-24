import { existsSync, readFileSync } from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'
import { compareResults, type QueryResult } from '../src/lib/compare'
import { runCodeTests, withFixtureSetup } from '../src/lib/js-runtime'
import { PY_RUNNER } from '../src/lib/py-runner-src'
import { loadPyodide } from 'pyodide'
import type { CodeTest, Curriculum, ExerciseBank, JsBank, PyBank, WorldSchema } from '../src/lib/content'

const failures: string[] = []

function checkCodeTests(tag: string, tests: unknown): tests is CodeTest[] {
  if (!Array.isArray(tests) || tests.length < 1) {
    failures.push(`${tag}: needs at least 1 test`)
    return false
  }
  for (const [i, t] of tests.entries()) {
    const where = `${tag}: test ${i + 1}`
    if (!t.expr?.trim()) failures.push(`${where}: missing expr`)
    const hasExpect = typeof t.expect === 'string' && t.expect.trim() !== ''
    const hasRaises = typeof t.raises === 'string' && t.raises.trim() !== ''
    if (hasExpect === hasRaises) failures.push(`${where}: needs exactly one of expect or raises`)
  }
  return true
}

const curriculum = JSON.parse(readFileSync('public/content/skills.json', 'utf8')) as Curriculum
const skills = curriculum.regions.flatMap(r => r.skills)
const ids = new Set(skills.map(s => s.id))
for (const s of skills)
  for (const r of s.requires)
    if (!ids.has(r)) failures.push(`${s.id}: unknown prerequisite "${r}"`)

const db = await DuckDBInstance.create()
const conn = await db.connect()

const py = await loadPyodide()
py.runPython(PY_RUNNER)
const pyRunExercise = py.globals.get('_run_exercise') as (code: string, testsJson: string) => string

function runPyExercise(code: string, tests: CodeTest[], fixture?: string): [boolean, string, string, string | null][] {
  const folded = tests.map(t => ({ ...t, setup: withFixtureSetup(fixture, t.setup) }))
  return JSON.parse(pyRunExercise(code, JSON.stringify(folded)))
}

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
      if (ex.hints.length !== 3) failures.push(`${tag}: expected 3 hints, found ${ex.hints.length}`)
      if (!checkCodeTests(tag, ex.tests)) continue
      if (ex.solution?.trim()) {
        for (const [i, r] of runCodeTests(ex.solution, ex.tests, ex.fixture).entries()) {
          if (!r.pass)
            failures.push(
              `${tag}: solution fails test ${i + 1} — expected ${r.expected}, got ${r.error ? `error ${r.error}` : r.actual}`,
            )
        }
      }
    }
    continue
  }

  if (skill.trackId === 'python') {
    let pyBank: PyBank
    try {
      pyBank = JSON.parse(readFileSync(`public/content/exercises/${skill.id}.json`, 'utf8')) as PyBank
    } catch {
      failures.push(`${skill.id}: missing or unreadable Python bank`)
      continue
    }
    if (pyBank.skillId !== skill.id) failures.push(`${skill.id}: bank skillId is "${pyBank.skillId}"`)
    if (!Array.isArray(pyBank.exercises) || pyBank.exercises.length === 0) {
      failures.push(`${skill.id}: Python bank is empty`)
      continue
    }
    if (new Set(pyBank.exercises.map(e => e.id)).size !== pyBank.exercises.length)
      failures.push(`${skill.id}: duplicate exercise ids in bank`)
    for (const ex of pyBank.exercises) {
      checked++
      const tag = `${skill.id}/${ex.id}`
      if (!ex.functionName?.trim()) failures.push(`${tag}: missing functionName`)
      if (!ex.starter?.trim()) failures.push(`${tag}: missing starter`)
      if (!ex.solution?.trim()) failures.push(`${tag}: missing solution`)
      if (ex.hints.length !== 3) failures.push(`${tag}: expected 3 hints, found ${ex.hints.length}`)
      if (!checkCodeTests(tag, ex.tests)) continue
      if (ex.solution?.trim()) {
        try {
          for (const [i, row] of runPyExercise(ex.solution, ex.tests, ex.fixture).entries()) {
            const [ok, expected, actual, error] = row
            if (!ok)
              failures.push(
                `${tag}: solution fails test ${i + 1} — expected ${expected}, got ${error ? `error ${error}` : actual}`,
              )
          }
        } catch (e) {
          failures.push(`${tag}: Python solution did not run — ${e}`)
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
