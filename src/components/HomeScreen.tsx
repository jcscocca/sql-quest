import { useRef } from 'react'
import type { Curriculum } from '../lib/content'
import { exportState, useProgress, type ProgressState } from '../lib/progress'

export function HomeScreen({ curriculum, onOpenSkill, onOpenCollection }: {
  curriculum: Curriculum
  onOpenSkill: (skillId: string) => void
  onOpenCollection: () => void
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
      {curriculum.regions.map(region => (
        <section key={region.id} className="region">
          <h2>{region.name}</h2>
          <div className="nodes">
            {region.skills.map(skill => {
              const done = completed(skill.id)
              const unlocked = skill.requires.every(completed)
              const solvedCount = progress.skills[skill.id]?.solved.length ?? 0
              return (
                <button
                  key={skill.id}
                  disabled={!unlocked}
                  className={`node ${done ? 'done' : unlocked ? 'open' : 'locked'}`}
                  onClick={() => onOpenSkill(skill.id)}
                >
                  <span className="badge">{done ? '✓' : unlocked ? '▶' : '🔒'}</span>
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
