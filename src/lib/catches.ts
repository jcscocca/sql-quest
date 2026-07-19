import type { QueryResult } from './compare'

export function pickCatches(
  result: QueryResult,
  worldNames: Set<string>,
  owned: Set<string>,
  authored: string[] = [],
  cap = 3,
  rng: () => number = Math.random,
): string[] {
  const seen = new Set<string>()
  for (const row of result.rows)
    for (const cell of row)
      if (typeof cell === 'string' && worldNames.has(cell) && !owned.has(cell)) seen.add(cell)
  const candidates = [...seen]
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  const caught = new Set(candidates.slice(0, cap))
  for (const a of authored) if (!owned.has(a)) caught.add(a)
  return [...caught]
}
