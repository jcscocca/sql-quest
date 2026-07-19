import type { WorldSchema } from './content'

export class TrainerError extends Error {}

export function assertReadOnly(sql: string): void {
  const stripped = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
  const statements = stripped.split(';').map(s => s.trim()).filter(Boolean)
  if (statements.length > 1) throw new TrainerError('One statement at a time, please.')
  const first = statements[0]?.split(/\s+/)[0]?.toUpperCase() ?? ''
  if (first !== 'SELECT' && first !== 'WITH')
    throw new TrainerError('This trainer is read-only — queries must start with SELECT (or WITH).')
}

export function translateError(raw: string, schema: WorldSchema): string | null {
  let m = raw.match(/Referenced column "([^"]+)" not found/i)
  if (m) {
    const cols = schema.tables.flatMap(t => t.columns.map(c => c.name)).join(', ')
    return `There is no column called "${m[1]}". Available columns: ${cols}.`
  }
  m = raw.match(/Table with name (\S+) does not exist/i)
  if (m) {
    const tables = schema.tables.map(t => t.name).join(', ')
    return `There is no table called "${m[1]}". Tables in this world: ${tables}.`
  }
  if (/GROUP BY clause/i.test(raw))
    return 'Every selected column must either be wrapped in an aggregate function (COUNT, AVG, MAX, …) or listed in GROUP BY.'
  return null
}
