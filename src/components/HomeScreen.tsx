import { useRef } from 'react'
import type { Curriculum } from '../lib/content'
import { exportState, useProgress, type ProgressState } from '../lib/progress'

export function HomeScreen({ curriculum, onOpenSkill, onOpenCollection, reviewCount, rustiest, onStartReview, worlds }: {
  curriculum: Curriculum
  onOpenSkill: (skillId: string) => void
  onOpenCollection: () => void
  reviewCount: number
  rustiest: { name: string; from: number; to: number } | null
  onStartReview: () => void
  worlds: { name: string; regionName: string; state: 'active' | 'unlocked' | 'locked' }[]
}) {
  const progress = useProgress()
  const fileRef = useRef<HTMLInputElement>(null)
  const completed = (id: string) => progress.skills[id]?.completed ?? false

  function download() {
    const blob = new Blob([exportState(progress)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'sql-quest-progress.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 0)
  }

  async function importFile(f: File) {
    try {
      useProgress.getState().importState(JSON.parse(await f.text()) as ProgressState)
    } catch (e) {
      alert(`Import failed: ${e}`)
    }
  }

  return (
    <div className="home">
      <header className="topbar">
        <h1>⚡ SQL Quest</h1>
        <div className="stats">
          <span>🔥 {progress.streak.count}-day streak</span>
          <span>⭐ {progress.xp} XP</span>
          <button onClick={onOpenCollection}>📚 {progress.collection.length}</button>
          <button onClick={download}>Export</button>
          <button onClick={() => fileRef.current?.click()}>Import</button>
          <button
            onClick={() => useProgress.getState().setUnlockAll(!progress.unlockAll)}
            title="Open every skill regardless of prerequisites"
          >
            {progress.unlockAll ? '🔓 Free roam: on' : '🔒 Free roam: off'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            hidden
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </header>
      {reviewCount > 0 && (
        <div className="review-callout">
          <strong>📅 Daily Review — {reviewCount} drill{reviewCount === 1 ? '' : 's'} ready</strong>
          {rustiest && (
            <span>
              {' '}· {rustiest.name} is getting rusty ({rustiest.from}→{rustiest.to})
            </span>
          )}
          <button onClick={onStartReview}>Start review</button>
        </div>
      )}
      <div className="world-panel">
        {worlds.map(w => (
          <div key={`${w.regionName}-${w.name}`} className="world-row">
            <span>🌍 {w.name}</span>
            <span className="world-region">{w.regionName}</span>
            <span className="world-state">
              {w.state === 'unlocked' ? '✓' : w.state === 'active' ? '▶' : '🔒'}
            </span>
          </div>
        ))}
      </div>
      {curriculum.regions.map(region => (
        <section key={region.id} className="region">
          <h2>{region.name}</h2>
          <div className="nodes">
            {region.skills.map(skill => {
              const done = completed(skill.id)
              const earned = skill.requires.every(completed)
              const unlocked = earned || progress.unlockAll
              const solvedCount = progress.skills[skill.id]?.solved.length ?? 0
              return (
                <button
                  key={skill.id}
                  disabled={!unlocked}
                  className={`node ${done ? 'done' : earned ? 'open' : 'locked'}`}
                  onClick={() => onOpenSkill(skill.id)}
                >
                  <span className="badge">{done ? '✓' : earned ? '▶' : unlocked ? '🔓' : '🔒'}</span>
                  <span className="node-name">{skill.name}</span>
                  {solvedCount > 0 && !done && <span className="count">{solvedCount} solved</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
