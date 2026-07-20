import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'
import sharp from 'sharp'

const WORLDS = ['pokemon', 'yugioh', 'digimon'] as const
type SpriteWorld = (typeof WORLDS)[number]

const arg = process.argv[2] as SpriteWorld | undefined
if (arg && !WORLDS.includes(arg)) throw new Error(`unknown world "${arg}" — expected one of ${WORLDS.join(', ')}`)
const targets: readonly SpriteWorld[] = arg ? [arg] : WORLDS

interface Skill { id: string; world: string }
interface Bank { exercises: { referenceSql: string; collectibles?: string[] }[] }
interface WorldSchema { entity?: { table: string; column: string }; tables: { name: string }[] }

const curriculum = JSON.parse(readFileSync('public/content/skills.json', 'utf8')) as { regions: { skills: Skill[] }[] }
const skills = curriculum.regions.flatMap(r => r.skills)

const db = await DuckDBInstance.create()
const conn = await db.connect()
for (const w of new Set(skills.map(s => s.world))) {
  const schema = JSON.parse(readFileSync(`public/worlds/${w}/schema.json`, 'utf8')) as WorldSchema
  for (const t of schema.tables)
    await conn.run(`CREATE OR REPLACE TABLE ${t.name} AS SELECT * FROM 'public/worlds/${w}/${t.name}.parquet'`)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// 404 => null (a recorded miss); network/server errors retry then throw BLOCKED.
async function fetchImage(url: string): Promise<Buffer | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      if (attempt === 3) throw new Error(`BLOCKED: ${url} failed after 3 attempts: ${err}`)
      await sleep(1000 * attempt)
    }
  }
}

// 404 => null (a recorded miss); network/server errors retry then throw BLOCKED.
async function fetchJson(url: string): Promise<unknown | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (attempt === 3) throw new Error(`BLOCKED: ${url} failed after 3 attempts: ${err}`)
      await sleep(1000 * attempt)
    }
  }
}

async function catchable(world: string, entityTable: string, entityColumn: string): Promise<Set<string>> {
  const nameReader = await conn.runAndReadAll(`SELECT DISTINCT ${entityColumn} FROM ${entityTable}`)
  const names = new Set(nameReader.getRows().map(r => String(r[0])))
  const out = new Set<string>()
  for (const s of skills.filter(s => s.world === world)) {
    const bank = JSON.parse(readFileSync(`public/content/exercises/${s.id}.json`, 'utf8')) as Bank
    for (const ex of bank.exercises) {
      const reader = await conn.runAndReadAll(ex.referenceSql)
      for (const row of reader.getRows())
        for (const cell of row) if (typeof cell === 'string' && names.has(cell)) out.add(cell)
      for (const c of ex.collectibles ?? []) out.add(c)
    }
  }
  return out
}

function writeManifest(world: SpriteWorld, entities: Map<string, string>): void {
  const sorted = Object.fromEntries([...entities.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  writeFileSync(`public/sprites/${world}/manifest.json`, JSON.stringify({ entities: sorted }, null, 2))
}

async function toWebp(src: Buffer, outPath: string): Promise<void> {
  await sharp(src).resize({ width: 96 }).webp({ quality: 80 }).toFile(outPath)
}

interface BuildResult { world: SpriteWorld; entries: number; downloaded: number; misses: string[] }

async function buildPokemon(): Promise<BuildResult> {
  const dir = 'public/sprites/pokemon'
  mkdirSync(dir, { recursive: true })
  const rows = (await conn.runAndReadAll('SELECT id, name FROM pokemon ORDER BY id')).getRows() as [number, string][]
  const entities = new Map<string, string>()
  const misses: string[] = []
  let downloaded = 0
  for (const [id, name] of rows) {
    const file = `${id}.png`
    if (!existsSync(`${dir}/${file}`)) {
      const buf = await fetchImage(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`)
      await sleep(120)
      if (!buf) {
        misses.push(String(name))
        continue
      }
      writeFileSync(`${dir}/${file}`, buf)
      downloaded++
    }
    entities.set(String(name), file)
  }
  const tolerance = Math.ceil(rows.length * 0.02)
  if (misses.length > tolerance) throw new Error(`BLOCKED: ${misses.length} pokemon sprites missing (tolerance ${tolerance}) — refusing to write a degraded manifest`)
  writeManifest('pokemon', entities)
  return { world: 'pokemon', entries: entities.size, downloaded, misses }
}

async function buildYugioh(): Promise<BuildResult> {
  const dir = 'public/sprites/yugioh'
  mkdirSync(dir, { recursive: true })
  const wanted = await catchable('yugioh', 'cards', 'name')
  const rows = (await conn.runAndReadAll('SELECT id, name FROM cards ORDER BY id')).getRows() as [number, string][]
  const idByName = new Map(rows.map(([id, name]) => [String(name), id]))
  const entities = new Map<string, string>()
  const misses: string[] = []
  let downloaded = 0
  for (const name of [...wanted].sort()) {
    const id = idByName.get(name)
    if (id === undefined) {
      misses.push(name)
      continue
    }
    const file = `${id}.webp`
    if (!existsSync(`${dir}/${file}`)) {
      const buf = await fetchImage(`https://images.ygoprodeck.com/images/cards_small/${id}.jpg`)
      await sleep(200)
      if (!buf) {
        misses.push(name)
        continue
      }
      await toWebp(buf, `${dir}/${file}`)
      downloaded++
    }
    entities.set(name, file)
  }
  const tolerance = Math.ceil(wanted.size * 0.02)
  if (misses.length > tolerance) throw new Error(`BLOCKED: ${misses.length} yugioh sprites missing (tolerance ${tolerance}) — refusing to write a degraded manifest`)
  writeManifest('yugioh', entities)
  return { world: 'yugioh', entries: entities.size, downloaded, misses }
}

async function buildDigimon(): Promise<BuildResult> {
  const dir = 'public/sprites/digimon'
  mkdirSync(dir, { recursive: true })
  const wanted = await catchable('digimon', 'digimon', 'name')
  const rows = (await conn.runAndReadAll('SELECT id, name FROM digimon ORDER BY id')).getRows() as [number, string][]
  const idByName = new Map(rows.map(([id, name]) => [String(name), id]))
  const entities = new Map<string, string>()
  const misses: string[] = []
  let downloaded = 0
  for (const name of [...wanted].sort()) {
    const id = idByName.get(name)
    if (id === undefined) {
      misses.push(name)
      continue
    }
    const file = `${id}.webp`
    if (!existsSync(`${dir}/${file}`)) {
      let imageUrl: string | undefined
      const cached = `data-src/digimon/detail/${id}.json`
      if (existsSync(cached)) {
        try {
          imageUrl = (JSON.parse(readFileSync(cached, 'utf8')) as { images?: { href: string }[] }).images?.[0]?.href
        } catch (err) {
          throw new Error(`corrupt cache file ${cached} — delete it and re-run to re-fetch (${err})`)
        }
      } else {
        const detail = (await fetchJson(`https://digi-api.com/api/v1/digimon/${id}`)) as { images?: { href: string }[] } | null
        imageUrl = detail?.images?.[0]?.href
        await sleep(200)
      }
      const buf = imageUrl ? await fetchImage(encodeURI(imageUrl)) : null
      await sleep(200)
      if (!buf) {
        misses.push(name)
        continue
      }
      await toWebp(buf, `${dir}/${file}`)
      downloaded++
    }
    entities.set(name, file)
  }
  const tolerance = Math.ceil(wanted.size * 0.02)
  if (misses.length > tolerance) throw new Error(`BLOCKED: ${misses.length} digimon sprites missing (tolerance ${tolerance}) — refusing to write a degraded manifest`)
  writeManifest('digimon', entities)
  return { world: 'digimon', entries: entities.size, downloaded, misses }
}

const builders: Record<SpriteWorld, () => Promise<BuildResult>> = {
  pokemon: buildPokemon,
  yugioh: buildYugioh,
  digimon: buildDigimon,
}

for (const w of targets) {
  const r = await builders[w]()
  console.log(`${r.world}: ${r.entries} manifest entries, ${r.downloaded} downloaded now, ${r.misses.length} misses`)
  if (r.misses.length > 0) console.log(`  MISSES (no art, omitted from manifest): ${r.misses.join(', ')}`)
}
console.log('done')
