import * as duckdb from '@duckdb/duckdb-wasm'
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import { assertReadOnly, TrainerError } from './errors'
import type { QueryResult } from './compare'

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdb_wasm, mainWorker: mvp_worker },
  eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker },
}
const TIMEOUT_MS = 5000

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null
let loadedWorld: string | null = null
let loadedTables: string[] = []
let initPromise: Promise<void> | null = null
let restartPromise: Promise<void> | null = null

async function init(): Promise<void> {
  const bundle = await duckdb.selectBundle(BUNDLES)
  const worker = new Worker(bundle.mainWorker!)
  db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  conn = await db.connect()
}

async function doLoadWorld(world: string, tables: string[]): Promise<void> {
  if (!initPromise)
    initPromise = init().catch(err => {
      initPromise = null
      throw err
    })
  await initPromise
  if (loadedWorld === world) return
  for (const t of tables) {
    const res = await fetch(`${import.meta.env.BASE_URL}worlds/${world}/${t}.parquet`)
    if (!res.ok) throw new Error(`Could not fetch ${t}.parquet (HTTP ${res.status})`)
    await db!.registerFileBuffer(`${t}.parquet`, new Uint8Array(await res.arrayBuffer()))
    await conn!.query(`CREATE OR REPLACE TABLE ${t} AS SELECT * FROM '${t}.parquet'`)
  }
  loadedWorld = world
  loadedTables = tables
}

export async function loadWorld(world: string, tables: string[]): Promise<void> {
  if (restartPromise) await restartPromise
  return doLoadWorld(world, tables)
}

export async function runQuery(sql: string): Promise<QueryResult> {
  assertReadOnly(sql)
  if (restartPromise) await restartPromise
  if (!conn) throw new TrainerError('The SQL engine is still starting — try again in a moment.')
  const table = await withTimeout(conn.query(sql))
  const columns = table.schema.fields.map(f => f.name)
  const rows: unknown[][] = Array.from({ length: table.numRows }, () => [])
  for (let c = 0; c < columns.length; c++) {
    const vec = table.getChildAt(c)
    for (let r = 0; r < table.numRows; r++) rows[r].push(vec?.get(r) ?? null)
  }
  return { columns, rows }
}

export async function restart(): Promise<void> {
  if (restartPromise) return restartPromise
  restartPromise = (async () => {
    const world = loadedWorld
    const tables = loadedTables
    try {
      await db?.terminate()
    } catch {
      /* worker already gone */
    }
    db = null
    conn = null
    loadedWorld = null
    initPromise = null
    if (world) await doLoadWorld(world, tables)
  })().finally(() => {
    restartPromise = null
  })
  return restartPromise
}

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void restart().catch(err => console.error('Engine restart failed', err))
      reject(
        new TrainerError(
          'Query ran past 5 seconds and was cancelled (accidental huge join?). The engine restarted — fix the query and run it again.',
        ),
      )
    }, TIMEOUT_MS)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    clearTimeout(timer)
  }
}
