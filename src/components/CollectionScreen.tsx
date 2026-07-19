import { useEffect, useState } from 'react'
import { loadWorld, runQuery } from '../lib/duckdb'
import { useProgress } from '../lib/progress'
import type { Curriculum, WorldSchema } from '../lib/content'

export function CollectionScreen({ schema, curriculum, onBack }: {
  schema: WorldSchema
  curriculum: Curriculum
  onBack: () => void
}) {
  const collection = useProgress(s => s.collection)
  const badges = useProgress(s => s.badges)
  const [types, setTypes] = useState<Map<string, string> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadWorld(schema.world, schema.tables.map(t => t.name))
      .then(async () => {
        const r = await runQuery('SELECT name, type1 FROM pokemon')
        setTypes(new Map(r.rows.map(row => [String(row[0]), String(row[1])])))
      })
      .catch(e => setError(String(e)))
  }, [schema])

  const skillName = (id: string) =>
    curriculum.regions.flatMap(r => r.skills).find(s => s.id === id)?.name ?? id
  const regionName = (id: string) =>
    curriculum.regions.find(r => `region:${r.id}` === id)?.name ?? id.replace('region:', '')

  return (
    <div className="collection">
      <header className="topbar">
        <button className="back" onClick={onBack}>← Back</button>
        <h2>📚 Collection ({collection.length})</h2>
      </header>
      <section className="badge-shelf">
        <span className="label">Badges</span>
        {badges.length === 0 && <span className="muted">Complete a skill to earn your first badge.</span>}
        {badges.map(b => (
          <span key={b} className="badge-token">
            {b.startsWith('region:') ? `🏆 ${regionName(b)}` : `🏅 ${skillName(b)}`}
          </span>
        ))}
      </section>
      {error && <p className="muted">Could not load Pokémon details: {error}</p>}
      <div className="collection-grid">
        {[...collection].sort().map(name => (
          <div key={name} className={`tile type-${types?.get(name) ?? 'unknown'}`}>
            <span className="tile-name">{name}</span>
            <span className="tile-type">{types?.get(name) ?? ''}</span>
          </div>
        ))}
      </div>
      {collection.length === 0 && (
        <p className="muted">Solve exercises to catch the Pokémon your queries return.</p>
      )}
    </div>
  )
}
