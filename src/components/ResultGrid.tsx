import type { QueryResult } from '../lib/compare'

const MAX_ROWS = 500

export function ResultGrid({ result }: { result: QueryResult }) {
  const shown = result.rows.slice(0, MAX_ROWS)
  return (
    <div className="result-grid">
      <table>
        <thead>
          <tr>{result.columns.map(c => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j} className={v === null ? 'null-cell' : undefined}>
                  {v === null ? 'NULL' : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid-meta">
        {result.rows.length} row(s)
        {result.rows.length > MAX_ROWS && ` — showing first ${MAX_ROWS}`}
      </div>
    </div>
  )
}
