import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'

// Dataset: "Customer Service Requests" (City of Seattle Open Data portal,
// data.seattle.gov), Socrata resource id 5ngg-rpne. Catalog page:
// https://data.seattle.gov/City-Administration/Customer-Service-Requests/5ngg-rpne
// Found via the Socrata Discovery API (search_datasets("Customer Service
// Requests", domain="data.seattle.gov")) — the only City Administration
// dataset matching that exact name; updated daily, 2.4M+ rows spanning
// 2013–present. Confirmed distinct from "Customer Service Request Tracking
// Data" (43nw-pkdq), a separate pilot status-update log covering only 5 of
// 47 service types with an incompatible request-numbering scheme.
//
// $select is used to pull only the columns the `requests` table needs.
// $limit is 350000, not the plan's default 50000/100000: this dataset's
// intake rate has grown sharply (recent 365-day trailing count queried at
// build-planning time was ~325k rows), so a 50k or even 100k "most recent"
// slice would span only weeks, not the ≥1 year window-function exercises
// need. 350000 comfortably clears a 1-year span with margin. Re-verified by
// this script's own sanity checks below (which fail the build if the span
// is still <1 year).
const RESOURCE_ID = '5ngg-rpne'
const FETCH_LIMIT = 350_000
const FIELDS = ['servicerequestnumber', 'webintakeservicerequests', 'departmentname', 'createddate', 'servicerequeststatusname', 'community_reporting_area']
const CSV_URL =
  `https://data.seattle.gov/resource/${RESOURCE_ID}.csv` +
  `?$select=${FIELDS.join(',')}` +
  `&$limit=${FETCH_LIMIT}` +
  `&$order=createddate%20DESC`

const SRC = 'data-src/seattle311'
const OUT = 'public/worlds/seattle311'
const csvPath = `${SRC}/requests.csv`

mkdirSync(SRC, { recursive: true })
mkdirSync(OUT, { recursive: true })

if (!existsSync(csvPath)) {
  console.log(`downloading requests.csv (limit=${FETCH_LIMIT})…`)
  const res = await fetch(CSV_URL)
  if (!res.ok) throw new Error(`${RESOURCE_ID}.csv: HTTP ${res.status}`)
  writeFileSync(csvPath, Buffer.from(await res.arrayBuffer()))
} else {
  console.log(`${csvPath} already cached, skipping fetch`)
}

const db = await DuckDBInstance.create()
const conn = await db.connect()

await conn.run(`
CREATE TABLE requests_raw AS
SELECT * FROM read_csv('${csvPath}', header = true, columns = {
  servicerequestnumber: 'VARCHAR',
  webintakeservicerequests: 'VARCHAR',
  departmentname: 'VARCHAR',
  createddate: 'TIMESTAMP',
  servicerequeststatusname: 'VARCHAR',
  community_reporting_area: 'VARCHAR'
})
`)

const rawCount = Number((await conn.runAndReadAll(`SELECT COUNT(*) FROM requests_raw`)).getRows()[0][0])
const distinctIds = Number(
  (await conn.runAndReadAll(`SELECT COUNT(DISTINCT servicerequestnumber) FROM requests_raw`)).getRows()[0][0],
)
const dupeCount = rawCount - distinctIds
console.log(`fetched ${rawCount} rows, ${distinctIds} distinct request numbers (${dupeCount} duplicate id rows)`)

// The source dataset's servicerequestnumber is unique across its full 2.4M+
// row history (verified via Socrata's column profiler before this script was
// written), so duplicates are not expected in a recent slice either — this
// QUALIFY is a defensive dedupe (keep the latest createddate per id) that is
// a no-op unless the portal's export ever violates that invariant.
//
// closed_date is NOT included: the source dataset has no closure timestamp
// of any kind. Verified three ways — (1) the portal's described column list
// for 5ngg-rpne has no closed/updated/resolved date field, only createddate;
// (2) the raw CSV header (fetched directly) matches that list exactly; (3)
// Socrata's system fields :created_at/:updated_at are batch-load timestamps
// (identical across all rows loaded in the same daily refresh), not
// per-record signals, so they cannot stand in as a closure date. The
// separate "Customer Service Request Tracking Data" dataset (43nw-pkdq) does
// carry per-status-change dates, but only for 5 of 47 service types under 3
// of 11 departments and using a different request-numbering scheme —
// joining it in would make closed_date NULL for "not tracked" reasons on
// >90% of rows, not "still open" reasons, which would misrepresent the
// column. Rather than fabricate or misrepresent, closed_date is omitted;
// `status` (the real terminal/non-terminal status text) is kept so
// open-vs-closed state is still queryable, just not date-diffable.
await conn.run(`
CREATE TABLE requests AS
SELECT
  servicerequestnumber AS request_id,
  webintakeservicerequests AS service_request_type,
  departmentname AS department,
  CAST(createddate AS DATE) AS created_date,
  community_reporting_area AS neighborhood,
  servicerequeststatusname AS status
FROM requests_raw
QUALIFY ROW_NUMBER() OVER (PARTITION BY servicerequestnumber ORDER BY createddate DESC) = 1
ORDER BY created_date DESC
`)

await conn.run(`COPY requests TO '${OUT}/requests.parquet' (FORMAT parquet)`)
const finalCount = Number((await conn.runAndReadAll(`SELECT COUNT(*) FROM requests`)).getRows()[0][0])
console.log(`wrote ${OUT}/requests.parquet with ${finalCount} rows`)

const schema = {
  world: 'seattle311',
  name: 'Seattle 311',
  tables: [
    {
      name: 'requests',
      description:
        'One row per Seattle city service request (311-style non-emergency reports and inquiries), most recent ~350k requests as of build time, from the City of Seattle "Customer Service Requests" open dataset. Note: the source has no closure-date field, so there is no closed_date column — only created_date and a terminal-or-not status string',
      columns: [
        { name: 'request_id', type: 'VARCHAR', description: "Unique service request number, e.g. '26-00200215'" },
        { name: 'service_request_type', type: 'VARCHAR', description: "The service requested, e.g. 'Pothole', 'Illegal Dumping / Needles', 'Abandoned Vehicle'" },
        { name: 'department', type: 'VARCHAR', description: "City department responsible, e.g. 'SDOT-Seattle Department of Transportation'" },
        { name: 'created_date', type: 'DATE', description: 'Date the request was created' },
        {
          name: 'neighborhood',
          type: 'VARCHAR',
          description:
            "Community reporting area, e.g. 'BALLARD', 'CAPITOL HILL' — NULL for a small share of requests (~1–2% in this recent slice; the source dataset does not assign one for every address)",
        },
        {
          name: 'status',
          type: 'VARCHAR',
          description:
            "Current request status, one of 10 values: 'Closed', 'Reported', 'Open', 'New', 'Transferred to Other Dept', 'Duplicate (Closed)', 'Closed as Duplicate', 'Closed -Incomplete Information', 'Duplicate (Open)', 'Canceled'. The source dataset tracks no separate closure date — there is no closed_date column here; open-vs-closed state is only readable qualitatively from this text, not as a date difference",
        },
      ],
    },
  ],
}
writeFileSync(`${OUT}/schema.json`, JSON.stringify(schema, null, 2))
console.log(`wrote ${OUT}/schema.json`)

// --- Post-build sanity checks (standalone: harness won't load this world until Phase C) ---
console.log('\n--- sanity checks ---')

console.log(`requests: ${finalCount} rows`)
if (finalCount < 40_000) throw new Error(`sanity check failed: row count ${finalCount} below 40k floor`)

const dateRange = await conn.runAndReadAll(`SELECT MIN(created_date), MAX(created_date) FROM requests`)
const [minDate, maxDate] = dateRange.getRows()[0]
console.log(`date range: ${minDate} to ${maxDate}`)
const spanDays = (new Date(String(maxDate)).getTime() - new Date(String(minDate)).getTime()) / 86_400_000
console.log(`span: ${spanDays.toFixed(0)} days`)
if (spanDays < 365) throw new Error(`sanity check failed: date span ${spanDays.toFixed(0)} days is under the required 1 year — raise FETCH_LIMIT`)

const neighborhoodNulls = await conn.runAndReadAll(`SELECT COUNT(*) FROM requests WHERE neighborhood IS NULL`)
const nNulls = Number(neighborhoodNulls.getRows()[0][0])
const neighborhoodNullShare = nNulls / finalCount
console.log(`neighborhood NULL share: ${(neighborhoodNullShare * 100).toFixed(1)}% (${nNulls}/${finalCount})`)

const statusDomain = await conn.runAndReadAll(
  `SELECT status, COUNT(*) AS n FROM requests GROUP BY status ORDER BY n DESC`,
)
console.log('status domain:')
for (const [status, n] of statusDomain.getRows()) console.log(`  ${status}: ${n}`)

const deptTypeDistribution = await conn.runAndReadAll(
  `SELECT department, COUNT(*) AS n FROM requests GROUP BY department ORDER BY n DESC LIMIT 5`,
)
console.log('top 5 departments:')
for (const [dept, n] of deptTypeDistribution.getRows()) console.log(`  ${dept}: ${n}`)

const typeCount = Number((await conn.runAndReadAll(`SELECT COUNT(DISTINCT service_request_type) FROM requests`)).getRows()[0][0])
console.log(`distinct service_request_type values: ${typeCount}`)

const nullRequestId = Number((await conn.runAndReadAll(`SELECT COUNT(*) FROM requests WHERE request_id IS NULL`)).getRows()[0][0])
if (nullRequestId > 0) throw new Error(`sanity check failed: ${nullRequestId} rows with NULL request_id`)

const totalAfter = Number((await conn.runAndReadAll(`SELECT COUNT(*) FROM requests`)).getRows()[0][0])
const distinctAfter = Number((await conn.runAndReadAll(`SELECT COUNT(DISTINCT request_id) FROM requests`)).getRows()[0][0])
const dupeIdsAfter = totalAfter - distinctAfter
console.log(`duplicate request_ids after dedupe: ${dupeIdsAfter}`)
if (dupeIdsAfter > 0) throw new Error(`sanity check failed: ${dupeIdsAfter} duplicate request_ids survived dedupe`)

console.log('\nall sanity checks passed')
