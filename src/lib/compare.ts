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

/**
 * Ceiling on cell comparisons spent matching user columns to reference ones.
 * The search is over permutations, so results whose columns share value
 * multisets can cost O(n!); prefix pruning cuts nearly all of that, and this
 * is the backstop that keeps a pathological result from freezing the tab.
 * Realistic comparisons finish in about n prefix checks, far under the cap.
 */
const MATCH_BUDGET = 5_000_000

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
  const userCells = user.rows.map(r => r.map(canon))
  const refCells = ref.rows.map(r => r.map(canon))
  const refVectors = Array.from({ length: n }, (_, c) => tuples(refCells, [c], ordered).join('\u0001'))
  const userVectors = Array.from({ length: n }, (_, c) => tuples(userCells, [c], ordered).join('\u0001'))
  const candidates = refVectors.map(rv =>
    userVectors.map((uv, j) => (uv === rv ? j : -1)).filter(j => j >= 0),
  )
  const refPrefixes = Array.from({ length: n + 1 }, (_, k) =>
    tuples(refCells, range(k), ordered),
  )
  const used = new Array<boolean>(n).fill(false)
  const perm = new Array<number>(n).fill(-1)
  let budget = MATCH_BUDGET

  // Projecting a matching set of tuples onto a subset of columns still matches,
  // so a mismatched prefix rules out every permutation extending it. At k === n
  // this is the full row comparison.
  const prefixMatches = (k: number): boolean => {
    budget -= userCells.length * k
    const got = tuples(userCells, perm.slice(0, k), ordered)
    return got.every((t, i) => t === refPrefixes[k][i])
  }

  const search = (i: number): boolean => {
    if (i === n) return true
    for (const j of candidates[i]) {
      if (used[j]) continue
      if (budget <= 0) return false
      used[j] = true
      perm[i] = j
      if (prefixMatches(i + 1) && search(i + 1)) return true
      used[j] = false
    }
    return false
  }

  if (search(0)) return { equal: true }
  return budget <= 0
    ? { equal: false, reason: 'too many interchangeable columns to compare' }
    : { equal: false, reason: 'the values differ' }
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

function canon(v: unknown): string {
  if (v === null || v === undefined) return '\u0000NULL'
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'number') return Number.isInteger(v) ? v.toString() : v.toPrecision(10)
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

function tuples(cells: string[][], cols: number[], ordered: boolean): string[] {
  const out = cells.map(row => cols.map(c => row[c]).join('\u0001'))
  if (!ordered) out.sort()
  return out
}
