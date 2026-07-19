import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'

const API = 'https://digi-api.com/api/v1/digimon'
const SRC = 'data-src/digimon'
const OUT = 'public/worlds/digimon'

interface ListPage {
  content?: { id: number }[]
}
interface Detail {
  id: number
  name: string
  xAntibody: boolean
  levels?: { level: string }[]
  types?: { type: string }[]
  attributes?: { attribute: string }[]
  releaseDate?: string | number | null
  nextEvolutions?: { id: number | null; digimon: string; condition: string }[]
}

mkdirSync(`${SRC}/detail`, { recursive: true })
mkdirSync(OUT, { recursive: true })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchJson<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as T
    } catch (err) {
      if (attempt === 3) throw new Error(`BLOCKED: ${url} failed after 3 attempts: ${err}`)
      await sleep(1000 * attempt)
    }
  }
}

// --- 1. id list (paged; nextPage URLs are malformed and pageable.totalPages
// undercounts, so page manually until an empty page) ---
const idsPath = `${SRC}/ids.json`
let ids: number[]
if (existsSync(idsPath)) {
  ids = JSON.parse(readFileSync(idsPath, 'utf8')) as number[]
  console.log(`${idsPath} already cached (${ids.length} ids), skipping list fetch`)
} else {
  ids = []
  for (let p = 0; ; p++) {
    const page = await fetchJson<ListPage>(`${API}?pageSize=100&page=${p}`)
    if (!page.content?.length) break // past-the-end pages return 200 with no content key
    page.content.forEach(d => ids.push(d.id))
    await sleep(200)
  }
  writeFileSync(idsPath, JSON.stringify(ids))
  console.log(`fetched ${ids.length} ids`)
}

// --- 2. detail records, one file per id, skip-if-exists, ≤5 req/sec ---
let fetched = 0
for (const id of ids) {
  const p = `${SRC}/detail/${id}.json`
  if (existsSync(p)) continue
  const d = await fetchJson<Detail>(`${API}/${id}`)
  writeFileSync(p, JSON.stringify(d))
  fetched++
  if (fetched % 100 === 0) console.log(`  …${fetched} details fetched`)
  await sleep(200)
}
console.log(`details: ${fetched} fetched now, ${ids.length - fetched} already cached`)

// --- 3. transform ---
const details = ids.map(id => JSON.parse(readFileSync(`${SRC}/detail/${id}.json`, 'utf8')) as Detail)

const digimonOut = details.map(d => ({
  id: d.id,
  name: d.name,
  level: d.levels?.[0]?.level ?? null,
  type: d.types?.[0]?.type ?? null,
  attribute: d.attributes?.[0]?.attribute ?? null,
  x_antibody: d.xAntibody,
  release_year: d.releaseDate != null && Number(d.releaseDate) > 0 ? Number(d.releaseDate) : null,
}))

const idSet = new Set(digimonOut.map(d => d.id))
const nameById = new Map(digimonOut.map(d => [d.id, d.name]))
const seenEdges = new Set<string>()
let droppedEdges = 0
const evoOut: { from_id: number; from_name: string; to_id: number; to_name: string; condition: string | null }[] = []
for (const d of details) {
  for (const e of d.nextEvolutions ?? []) {
    if (e.id == null || !idSet.has(e.id)) {
      droppedEdges++
      continue
    }
    const key = `${d.id}->${e.id}`
    if (seenEdges.has(key)) continue
    seenEdges.add(key)
    const condition = e.condition?.trim() ? e.condition.trim() : null
    evoOut.push({ from_id: d.id, from_name: d.name, to_id: e.id, to_name: nameById.get(e.id)!, condition })
  }
}
console.log(`transformed ${digimonOut.length} digimon, ${evoOut.length} evolution edges (${droppedEdges} dangling edges dropped)`)

const toJsonl = (rows: object[]) => rows.map(r => JSON.stringify(r)).join('\n') + '\n'
writeFileSync(`${SRC}/digimon.jsonl`, toJsonl(digimonOut))
writeFileSync(`${SRC}/evolutions.jsonl`, toJsonl(evoOut))

const db = await DuckDBInstance.create()
const conn = await db.connect()

await conn.run(`
CREATE TABLE digimon AS
SELECT * FROM read_json('${SRC}/digimon.jsonl', format = 'newline_delimited', columns = {
  id: 'BIGINT', name: 'VARCHAR', level: 'VARCHAR', type: 'VARCHAR',
  attribute: 'VARCHAR', x_antibody: 'BOOLEAN', release_year: 'BIGINT'
})
ORDER BY id
`)

await conn.run(`
CREATE TABLE evolutions AS
SELECT * FROM read_json('${SRC}/evolutions.jsonl', format = 'newline_delimited', columns = {
  from_id: 'BIGINT', from_name: 'VARCHAR', to_id: 'BIGINT', to_name: 'VARCHAR', condition: 'VARCHAR'
})
ORDER BY from_id, to_id
`)

for (const table of ['digimon', 'evolutions']) {
  await conn.run(`COPY ${table} TO '${OUT}/${table}.parquet' (FORMAT parquet)`)
  const reader = await conn.runAndReadAll(`SELECT COUNT(*) AS n FROM ${table}`)
  console.log(`wrote ${OUT}/${table}.parquet with ${reader.getRows()[0][0]} rows`)
}

const schema = {
  world: 'digimon',
  name: 'Digimon',
  entity: { table: 'digimon', column: 'name', labelColumn: 'attribute' },
  tables: [
    {
      name: 'digimon',
      description: 'One row per Digimon (Wikimon-sourced via DAPI)',
      columns: [
        { name: 'id', type: 'BIGINT', description: 'DAPI id' },
        { name: 'name', type: 'VARCHAR', description: 'Digimon name, e.g. Agumon' },
        { name: 'level', type: 'VARCHAR', description: "Primary evolution stage, e.g. 'Baby I', 'Child', 'Adult', 'Perfect', 'Ultimate' — NULL when unlisted" },
        { name: 'type', type: 'VARCHAR', description: "Primary type, e.g. 'Reptile', 'Machine' — NULL when unlisted" },
        { name: 'attribute', type: 'VARCHAR', description: "Primary attribute: 'Vaccine', 'Virus', 'Data', 'Free', or 'Variable' — NULL when unlisted" },
        { name: 'x_antibody', type: 'BOOLEAN', description: 'TRUE for X-Antibody variants' },
        { name: 'release_year', type: 'BIGINT', description: 'Year the Digimon debuted — NULL when unknown' },
      ],
    },
    {
      name: 'evolutions',
      description: 'Directed evolution edges (from one Digimon to a possible next form); a Digimon can have many rows in both directions',
      columns: [
        { name: 'from_id', type: 'BIGINT', description: 'References digimon.id (the earlier form)' },
        { name: 'from_name', type: 'VARCHAR', description: 'Name of the earlier form (denormalized for readable joins)' },
        { name: 'to_id', type: 'BIGINT', description: 'References digimon.id (the evolved form)' },
        { name: 'to_name', type: 'VARCHAR', description: 'Name of the evolved form' },
        { name: 'condition', type: 'VARCHAR', description: "Evolution requirement text, e.g. 'with Starmons' — NULL when unconditional" },
      ],
    },
  ],
}
writeFileSync(`${OUT}/schema.json`, JSON.stringify(schema, null, 2))
console.log(`wrote ${OUT}/schema.json`)

// --- sanity checks (standalone; the harness only loads this world once skills.json references it) ---
console.log('\n--- sanity checks ---')
const agu = await conn.runAndReadAll(`SELECT level, type, attribute FROM digimon WHERE name = 'Agumon'`)
const aguRow = agu.getRows()[0]
console.log(`Agumon: ${JSON.stringify(aguRow)}`)
if (!aguRow || aguRow[0] !== 'Child' || aguRow[1] !== 'Reptile' || aguRow[2] !== 'Vaccine')
  throw new Error('sanity check failed: Agumon missing or not Child/Reptile/Vaccine')

const edge = await conn.runAndReadAll(
  `SELECT COUNT(*) FROM evolutions WHERE from_name = 'Agumon' AND to_name = 'Greymon'`,
)
if (Number(edge.getRows()[0][0]) === 0) throw new Error('sanity check failed: no Agumon -> Greymon edge')
console.log('Agumon -> Greymon edge exists')

const yr = await conn.runAndReadAll(`SELECT MIN(release_year), MAX(release_year) FROM digimon`)
const [minY, maxY] = yr.getRows()[0].map(Number)
console.log(`release_year range: ${minY}–${maxY}`)
if (minY !== 1997 || maxY < 2015) throw new Error(`sanity check failed: release_year range ${minY}–${maxY}`)

console.log('\nall sanity checks passed')
