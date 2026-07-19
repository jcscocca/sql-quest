import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'

const ZIP_URL = 'https://files.grouplens.org/datasets/movielens/ml-latest-small.zip'
const SRC = 'data-src/movies'
const CSV_DIR = `${SRC}/ml-latest-small`
const OUT = 'public/worlds/movies'

mkdirSync(SRC, { recursive: true })
mkdirSync(OUT, { recursive: true })

const zipPath = `${SRC}/ml-latest-small.zip`
if (!existsSync(zipPath)) {
  console.log('downloading ml-latest-small.zip…')
  const res = await fetch(ZIP_URL)
  if (!res.ok) throw new Error(`ml-latest-small.zip: HTTP ${res.status}`)
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()))
} else {
  console.log(`${zipPath} already cached, skipping fetch`)
}

if (!existsSync(`${CSV_DIR}/movies.csv`)) {
  console.log('unzipping…')
  execSync(`unzip -o -q ${zipPath} -d ${SRC}`)
} else {
  console.log(`${CSV_DIR} already extracted, skipping unzip`)
}

const db = await DuckDBInstance.create()
const conn = await db.connect()

// Title year-stripping: titles end with " (YYYY)" *except* ~13 entries (mostly
// TV series like 'Babylon 5', 'The OA') that carry no year in the source data
// — those keep their full title and get a NULL year, per spec. A handful of
// titles also carry a trailing space after the year (e.g. 'Foo (1999) ') so
// the regex matches against the trimmed title, not the raw one.
await conn.run(`
CREATE TABLE movies AS
SELECT
  movieId AS movie_id,
  CASE WHEN regexp_matches(trim(title), '\\(\\d{4}\\)$')
       THEN trim(regexp_replace(trim(title), '\\s*\\(\\d{4}\\)$', ''))
       ELSE trim(title) END AS title,
  CASE WHEN regexp_matches(trim(title), '\\(\\d{4}\\)$')
       THEN CAST(regexp_extract(trim(title), '\\((\\d{4})\\)$', 1) AS BIGINT)
       ELSE NULL END AS year,
  CASE WHEN genres = '(no genres listed)' THEN NULL
       ELSE list_extract(string_split(genres, '|'), 1) END AS genre1,
  CASE WHEN genres = '(no genres listed)' THEN NULL
       ELSE list_extract(string_split(genres, '|'), 2) END AS genre2
FROM read_csv('${CSV_DIR}/movies.csv', header = true)
ORDER BY movieId
`)

// Movies with zero ratings simply produce no aggregate row (18 of them in
// this dataset) — intentional; a learner needs LEFT JOIN movies to ratings
// to see every movie, which is the point of leaving them absent rather than
// backfilling zeros.
await conn.run(`
CREATE TABLE ratings AS
SELECT
  movieId AS movie_id,
  ROUND(AVG(rating), 2) AS avg_rating,
  COUNT(*) AS num_ratings,
  CAST(MIN(EXTRACT(YEAR FROM to_timestamp(timestamp))) AS BIGINT) AS first_rated,
  CAST(MAX(EXTRACT(YEAR FROM to_timestamp(timestamp))) AS BIGINT) AS last_rated
FROM read_csv('${CSV_DIR}/ratings.csv', header = true)
GROUP BY movieId
ORDER BY movieId
`)

// Same absence pattern as ratings: only movies with at least one user tag
// appear (most movies, ~84%, have none).
await conn.run(`
CREATE TABLE tags AS
SELECT
  movieId AS movie_id,
  tag,
  COUNT(*) AS tag_count
FROM read_csv('${CSV_DIR}/tags.csv', header = true)
GROUP BY movieId, tag
ORDER BY movieId, tag_count DESC, tag
`)

for (const table of ['movies', 'ratings', 'tags']) {
  await conn.run(`COPY ${table} TO '${OUT}/${table}.parquet' (FORMAT parquet)`)
  const reader = await conn.runAndReadAll(`SELECT COUNT(*) AS n FROM ${table}`)
  console.log(`wrote ${OUT}/${table}.parquet with ${reader.getRows()[0][0]} rows`)
}

const schema = {
  world: 'movies',
  name: 'Movies',
  entity: { table: 'movies', column: 'title', labelColumn: 'genre1' },
  tables: [
    {
      name: 'movies',
      description: 'One row per movie in the MovieLens ml-latest-small catalog',
      columns: [
        { name: 'movie_id', type: 'BIGINT', description: 'Unique movie identifier' },
        {
          name: 'title',
          type: 'VARCHAR',
          description:
            "Movie title with the release year stripped, e.g. 'Toy Story' — not guaranteed unique; a few remakes/re-adaptations share both title and year (e.g. two different 2005 films titled 'War of the Worlds')",
        },
        {
          name: 'year',
          type: 'BIGINT',
          description: 'Release year parsed from the original title — NULL for a small number of titles with no year in the source data (mostly TV series)',
        },
        { name: 'genre1', type: 'VARCHAR', description: 'First listed genre, e.g. Adventure — NULL if the source listed no genres' },
        {
          name: 'genre2',
          type: 'VARCHAR',
          description:
            'Second listed genre, if present — NULL if the movie has zero or one genre listed (many movies have 3+ genres in the source; only the first two are kept here)',
        },
      ],
    },
    {
      name: 'ratings',
      description:
        'Per-movie rating aggregates from ~100k user ratings — only movies with at least one rating appear (LEFT JOIN from movies to include the rest)',
      columns: [
        { name: 'movie_id', type: 'BIGINT', description: 'References movies.movie_id' },
        { name: 'avg_rating', type: 'DOUBLE', description: 'Mean of all user ratings (0.5–5.0 scale), rounded to 2 decimals' },
        { name: 'num_ratings', type: 'BIGINT', description: 'Number of ratings the movie received' },
        { name: 'first_rated', type: 'BIGINT', description: 'Year of the earliest rating' },
        { name: 'last_rated', type: 'BIGINT', description: 'Year of the most recent rating' },
      ],
    },
    {
      name: 'tags',
      description:
        'Per-movie free-text tag aggregates from ~3.6k user tag applications — only movies with at least one tag appear (LEFT JOIN from movies to include the rest)',
      columns: [
        { name: 'movie_id', type: 'BIGINT', description: 'References movies.movie_id' },
        { name: 'tag', type: 'VARCHAR', description: "Free-text tag applied by a user, e.g. 'thought-provoking' (case as originally entered)" },
        { name: 'tag_count', type: 'BIGINT', description: 'Number of times this exact tag text was applied to the movie' },
      ],
    },
  ],
}
writeFileSync(`${OUT}/schema.json`, JSON.stringify(schema, null, 2))
console.log(`wrote ${OUT}/schema.json`)

// --- Post-build sanity checks (standalone: harness won't load this world until Phase C) ---
console.log('\n--- sanity checks ---')

const toyStory = await conn.runAndReadAll(`SELECT year, genre1 FROM movies WHERE title = 'Toy Story'`)
const tsRows = toyStory.getRows()
console.log(`Toy Story: year=${tsRows[0]?.[0] ?? 'MISSING'}, genre1=${tsRows[0]?.[1] ?? 'MISSING'}`)
if (tsRows.length === 0 || Number(tsRows[0][0]) !== 1995 || tsRows[0][1] !== 'Adventure')
  throw new Error('sanity check failed: Toy Story missing or year != 1995 / genre1 != Adventure')

const movieCount = await conn.runAndReadAll(`SELECT COUNT(*) FROM movies`)
const nMovies = Number(movieCount.getRows()[0][0])
console.log(`movie count: ${nMovies}`)
if (nMovies < 9000 || nMovies > 10500) throw new Error(`sanity check failed: movie count ${nMovies} outside expected ~9.7k range`)

// Forrest Gump is a high-volume, well-known film — its average should land in
// a plausible "beloved classic" band.
const forrest = await conn.runAndReadAll(
  `SELECT r.avg_rating, r.num_ratings FROM movies m JOIN ratings r ON r.movie_id = m.movie_id WHERE m.title = 'Forrest Gump'`,
)
const fRows = forrest.getRows()
console.log(`Forrest Gump: avg_rating=${fRows[0]?.[0] ?? 'MISSING'}, num_ratings=${fRows[0]?.[1] ?? 'MISSING'}`)
if (fRows.length === 0 || Number(fRows[0][0]) < 3.5 || Number(fRows[0][0]) > 5)
  throw new Error('sanity check failed: Forrest Gump avg_rating missing or implausible')

const yearRange = await conn.runAndReadAll(`SELECT MIN(year), MAX(year) FROM movies WHERE year IS NOT NULL`)
const [minYear, maxYear] = yearRange.getRows()[0]
console.log(`year range: ${minYear}–${maxYear}`)
if (Number(minYear) < 1900 || Number(maxYear) > 2020) throw new Error(`sanity check failed: year range ${minYear}-${maxYear} looks wrong`)

const missingYear = await conn.runAndReadAll(`SELECT COUNT(*) FROM movies WHERE year IS NULL`)
console.log(`movies with NULL year: ${missingYear.getRows()[0][0]}`)

const absentFromRatings = await conn.runAndReadAll(
  `SELECT COUNT(*) FROM movies m WHERE NOT EXISTS (SELECT 1 FROM ratings r WHERE r.movie_id = m.movie_id)`,
)
console.log(`movies absent from ratings (zero ratings): ${absentFromRatings.getRows()[0][0]}`)

const absentFromTags = await conn.runAndReadAll(
  `SELECT COUNT(*) FROM movies m WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.movie_id = m.movie_id)`,
)
console.log(`movies absent from tags (zero tags): ${absentFromTags.getRows()[0][0]}`)

for (const table of ['movies', 'ratings', 'tags']) {
  const r = await conn.runAndReadAll(`SELECT COUNT(*) FROM ${table}`)
  console.log(`${table}: ${r.getRows()[0][0]} rows`)
}

console.log('\nall sanity checks passed')
