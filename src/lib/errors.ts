import type { WorldSchema } from './content'

export class TrainerError extends Error {
  name = 'TrainerError'
}

const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|ATTACH|COPY|INSTALL|LOAD|SET|CALL|BEGIN|COMMIT|ROLLBACK|VACUUM|EXPORT|IMPORT)\b/i

export function assertReadOnly(sql: string): void {
  const masked = sql.replace(/'(?:[^']|'')*'/g, "''")
  const stripped = masked
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
  const statements = stripped.split(';').map(s => s.trim()).filter(Boolean)
  if (statements.length > 1) throw new TrainerError('One statement at a time, please.')
  const only = statements[0] ?? ''
  const first = only.match(/^\(*\s*([A-Za-z]+)/)?.[1]?.toUpperCase() ?? ''
  if (first !== 'SELECT' && first !== 'WITH')
    throw new TrainerError('This trainer is read-only — queries must start with SELECT (or WITH).')
  if (FORBIDDEN.test(only))
    throw new TrainerError('This trainer is read-only — data-modifying statements are not allowed.')
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
