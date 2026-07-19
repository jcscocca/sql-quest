import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'

const CSV_BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv'
const FILES = ['pokemon.csv', 'pokemon_species.csv', 'pokemon_stats.csv', 'pokemon_types.csv', 'types.csv']
const SRC = 'data-src/pokemon'
const OUT = 'public/worlds/pokemon'

mkdirSync(SRC, { recursive: true })
mkdirSync(OUT, { recursive: true })

for (const f of FILES) {
  const path = `${SRC}/${f}`
  if (existsSync(path)) continue
  console.log(`downloading ${f}…`)
  const res = await fetch(`${CSV_BASE}/${f}`)
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
}

const db = await DuckDBInstance.create()
const conn = await db.connect()

await conn.run(`
CREATE TABLE pokemon AS
WITH stats AS (
  SELECT pokemon_id,
    MAX(CASE stat_id WHEN 1 THEN base_stat END) AS hp,
    MAX(CASE stat_id WHEN 2 THEN base_stat END) AS attack,
    MAX(CASE stat_id WHEN 3 THEN base_stat END) AS defense,
    MAX(CASE stat_id WHEN 4 THEN base_stat END) AS special_attack,
    MAX(CASE stat_id WHEN 5 THEN base_stat END) AS special_defense,
    MAX(CASE stat_id WHEN 6 THEN base_stat END) AS speed
  FROM read_csv('${SRC}/pokemon_stats.csv') GROUP BY pokemon_id
),
ptypes AS (
  SELECT pt.pokemon_id,
    MAX(CASE pt.slot WHEN 1 THEN t.identifier END) AS type1,
    MAX(CASE pt.slot WHEN 2 THEN t.identifier END) AS type2
  FROM read_csv('${SRC}/pokemon_types.csv') pt
  JOIN read_csv('${SRC}/types.csv') t ON t.id = pt.type_id
  GROUP BY pt.pokemon_id
)
SELECT
  p.id,
  p.identifier AS name,
  sp.generation_id AS generation,
  ptypes.type1,
  ptypes.type2,
  stats.hp, stats.attack, stats.defense,
  stats.special_attack, stats.special_defense, stats.speed,
  stats.hp + stats.attack + stats.defense + stats.special_attack + stats.special_defense + stats.speed AS total,
  p.height / 10.0 AS height_m,
  p.weight / 10.0 AS weight_kg,
  sp.is_legendary::BOOLEAN AS is_legendary,
  prev.identifier AS evolves_from
FROM read_csv('${SRC}/pokemon.csv') p
JOIN read_csv('${SRC}/pokemon_species.csv') sp ON sp.id = p.species_id
LEFT JOIN read_csv('${SRC}/pokemon_species.csv') prev ON prev.id = sp.evolves_from_species_id
JOIN stats ON stats.pokemon_id = p.id
JOIN ptypes ON ptypes.pokemon_id = p.id
WHERE p.is_default = 1
ORDER BY p.id
`)

await conn.run(`COPY pokemon TO '${OUT}/pokemon.parquet' (FORMAT parquet)`)
const reader = await conn.runAndReadAll('SELECT COUNT(*) AS n FROM pokemon')
console.log(`wrote ${OUT}/pokemon.parquet with ${reader.getRows()[0][0]} rows`)

const schema = {
  world: 'pokemon',
  name: 'Pokémon',
  entity: { table: 'pokemon', column: 'name' },
  tables: [
    {
      name: 'pokemon',
      description: 'One row per Pokémon species (default form)',
      columns: [
        { name: 'id', type: 'BIGINT', description: 'National Pokédex number' },
        { name: 'name', type: 'VARCHAR', description: 'Lowercase species name, e.g. pikachu' },
        { name: 'generation', type: 'BIGINT', description: 'Game generation introduced (1–9)' },
        { name: 'type1', type: 'VARCHAR', description: 'Primary type, e.g. fire' },
        { name: 'type2', type: 'VARCHAR', description: 'Secondary type — NULL for single-typed Pokémon' },
        { name: 'hp', type: 'BIGINT', description: 'Base HP stat' },
        { name: 'attack', type: 'BIGINT', description: 'Base Attack stat' },
        { name: 'defense', type: 'BIGINT', description: 'Base Defense stat' },
        { name: 'special_attack', type: 'BIGINT', description: 'Base Special Attack stat' },
        { name: 'special_defense', type: 'BIGINT', description: 'Base Special Defense stat' },
        { name: 'speed', type: 'BIGINT', description: 'Base Speed stat' },
        { name: 'total', type: 'BIGINT', description: 'Sum of all six base stats' },
        { name: 'height_m', type: 'DOUBLE', description: 'Height in meters' },
        { name: 'weight_kg', type: 'DOUBLE', description: 'Weight in kilograms' },
        { name: 'is_legendary', type: 'BOOLEAN', description: 'True for legendary Pokémon' },
        { name: 'evolves_from', type: 'VARCHAR', description: 'Name of the pre-evolution — NULL if none' },
      ],
    },
  ],
}
writeFileSync(`${OUT}/schema.json`, JSON.stringify(schema, null, 2))
console.log(`wrote ${OUT}/schema.json`)
