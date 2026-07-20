import { useEffect, useState } from 'react'
import { useProgress } from '../lib/progress'
import { loadManifest, spriteUrl, type SpriteManifest } from '../lib/sprites'
import type { Curriculum } from '../lib/content'

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'unknown'

export function CollectionScreen({ curriculum, worldNames, onBack }: {
  curriculum: Curriculum
  worldNames: Record<string, string>
  onBack: () => void
}) {
  const collection = useProgress(s => s.collection)
  const badges = useProgress(s => s.badges)

  const skillName = (id: string) =>
    curriculum.regions.flatMap(r => r.skills).find(s => s.id === id)?.name ?? id
  const regionName = (id: string) =>
    curriculum.regions.find(r => `region:${r.id}` === id)?.name ?? id.replace('region:', '')

  const worlds = [...new Set(collection.map(e => e.world))].sort()

  const [manifests, setManifests] = useState<Record<string, SpriteManifest | null>>({})
  useEffect(() => {
    let live = true
    for (const w of worlds)
      void loadManifest(w).then(m => {
        if (live) setManifests(prev => ({ ...prev, [w]: m }))
      })
    return () => {
      live = false
    }
  }, [worlds.join(',')])

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
      {worlds.map(world => (
        <section key={world} className="world-section">
          <h3>{worldNames[world] ?? world.charAt(0).toUpperCase() + world.slice(1)}</h3>
          <div className="collection-grid">
            {collection
              .filter(e => e.world === world)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(entry => {
                const url = spriteUrl(world, manifests[world] ?? null, entry.name)
                return url ? (
                  <div key={`${entry.world}:${entry.name}`} className={`tile tile-sprite type-${slugify(entry.label)}`}>
                    <img src={url} alt="" loading="lazy" className={url.endsWith('.png') ? 'pixelated' : undefined} />
                    <span className="tile-name">{entry.name}</span>
                  </div>
                ) : (
                  <div key={`${entry.world}:${entry.name}`} className={`tile type-${slugify(entry.label)}`}>
                    <span className="tile-name">{entry.name}</span>
                    <span className="tile-type">{entry.label}</span>
                  </div>
                )
              })}
          </div>
        </section>
      ))}
      {collection.length === 0 && (
        <p className="muted">Solve exercises to catch the collectibles your queries return.</p>
      )}
    </div>
  )
}
