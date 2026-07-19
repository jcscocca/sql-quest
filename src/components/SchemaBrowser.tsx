import type { WorldSchema } from '../lib/content'

export function SchemaBrowser({ schema }: { schema: WorldSchema }) {
  return (
    <div className="schema-browser">
      <h4>Schema</h4>
      {schema.tables.map(t => (
        <details key={t.name} open={schema.tables.length === 1}>
          <summary>
            <code>{t.name}</code> — {t.description}
          </summary>
          <ul>
            {t.columns.map(c => (
              <li key={c.name}>
                <code>{c.name}</code> <span className="coltype">{c.type}</span>
                {c.description && ` — ${c.description}`}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  )
}
