export interface QueryResult {
  columns: string[]
  rows: unknown[][]
}

export interface CompareOptions {
  orderMatters?: boolean
}

export interface CompareOutcome {
  equal: boolean
  reason?: string
}

export function compareResults(
  user: QueryResult,
  ref: QueryResult,
  opts: CompareOptions = {},
): CompareOutcome {
  if (user.columns.length !== ref.columns.length)
    return { equal: false, reason: `expected ${ref.columns.length} column(s), got ${user.columns.length}` }
  if (user.rows.length !== ref.rows.length)
    return { equal: false, reason: `expected ${ref.rows.length} row(s), got ${user.rows.length}` }

  const n = ref.columns.length
  const ordered = opts.orderMatters ?? false
  const refVectors = Array.from({ length: n }, (_, c) => columnVector(ref, c, ordered))
  const userVectors = Array.from({ length: n }, (_, c) => columnVector(user, c, ordered))
  const candidates = refVectors.map(rv =>
    userVectors.map((uv, j) => (uv === rv ? j : -1)).filter(j => j >= 0),
  )
  const used = new Array<boolean>(n).fill(false)
  const perm = new Array<number>(n).fill(-1)

  const search = (i: number): boolean => {
    if (i === n) return rowsMatch(user, ref, perm, ordered)
    for (const j of candidates[i]) {
      if (used[j]) continue
      used[j] = true
      perm[i] = j
      if (search(i + 1)) return true
      used[j] = false
    }
    return false
  }

  return search(0) ? { equal: true } : { equal: false, reason: 'the values differ' }
}

function canon(v: unknown): string {
  if (v === null || v === undefined) return '\u0000NULL'
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'number') return Number.isInteger(v) ? v.toString() : v.toPrecision(10)
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

function columnVector(res: QueryResult, col: number, ordered: boolean): string {
  const vals = res.rows.map(r => canon(r[col]))
  if (!ordered) vals.sort()
  return vals.join('\u0001')
}

function rowsMatch(user: QueryResult, ref: QueryResult, perm: number[], ordered: boolean): boolean {
  const userTuples = user.rows.map(row => perm.map(j => canon(row[j])).join('\u0001'))
  const refTuples = ref.rows.map(row => row.map(canon).join('\u0001'))
  if (!ordered) {
    userTuples.sort()
    refTuples.sort()
  }
  return userTuples.every((t, i) => t === refTuples[i])
}
