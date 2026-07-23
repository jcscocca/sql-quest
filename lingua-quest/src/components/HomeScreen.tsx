import { useRef } from 'react'
import type { CourseMeta, Curriculum } from '../lib/content'
import { exportState, useProgress, type ProgressState } from '../lib/progress'
import { displayedMastery } from '../lib/review'
import { todayString } from '../lib/xp'

export function HomeScreen({ course, courses, curriculum, onOpenSkill, onOpenVocab, onSwitchCourse, reviewCount, rustiest, onStartReview }: {
  course: CourseMeta
  courses: CourseMeta[]
  curriculum: Curriculum
  onOpenSkill: (skillId: string) => void
  onOpenVocab: () => void
  onSwitchCourse: (id: string) => void
  reviewCount: number
  rustiest: { name: string; from: number; to: number } | null
  onStartReview: () => void
}) {
  const progress = useProgress()
  const fileRef = useRef<HTMLInputElement>(null)
  const today = todayString()
  const completed = (id: string) => progress.skills[id]?.completed ?? false

  function download() {
    const blob = new Blob([exportState(progress)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'lingua-quest-progress.json'
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

  const vocabCount = progress.vocab.filter(v => v.course === course.id).length

  return (
    <div className="home">
      <header className="topbar home-topbar">
        <h1>🗺️ Lingua Quest</h1>
        <div className="stats">
          <span title="Daily streak">🔥 {progress.streak.count}</span>
          <span title="Total XP">⭐ {progress.xp} XP</span>
          <button onClick={onOpenVocab} title="Your vocabulary">📖 {vocabCount}</button>
          <button onClick={download}>Export</button>
          <button onClick={() => fileRef.current?.click()}>Import</button>
          <button
            onClick={() => useProgress.getState().setUnlockAll(!progress.unlockAll)}
            title="Open every skill regardless of prerequisites"
            aria-pressed={progress.unlockAll}
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

      <div className="course-bar">
        <span className="course-current">{course.flag} {course.name} <span className="muted">· {course.nativeName}</span></span>
        {courses.length > 1 && (
          <label className="course-switch">
            Language:{' '}
            <select value={course.id} onChange={e => onSwitchCourse(e.target.value)}>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.flag} {c.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {reviewCount > 0 && (
        <div className="review-callout">
          <strong>📅 Daily Review — {reviewCount} exercise{reviewCount === 1 ? '' : 's'} ready</strong>
          {rustiest && (
            <span> · {rustiest.name} is getting rusty ({rustiest.from}→{rustiest.to})</span>
          )}
          <button onClick={onStartReview}>Start review</button>
        </div>
      )}

      {curriculum.units.map(unit => {
        const done = unit.skills.filter(s => completed(s.id)).length
        return (
          <section key={unit.id} className="unit">
            <div className="unit-head">
              <h2>{unit.name}</h2>
              {unit.subtitle && <span className="unit-subtitle">{unit.subtitle}</span>}
              <span className="unit-progress">{done}/{unit.skills.length}</span>
            </div>
            <div className="nodes">
              {unit.skills.map(skill => {
                const isDone = completed(skill.id)
                const earned = skill.requires.every(completed)
                const unlocked = earned || progress.unlockAll
                const sp = progress.skills[skill.id]
                const mastery = sp && isDone ? displayedMastery(sp, today) : 0
                return (
                  <button
                    key={skill.id}
                    disabled={!unlocked}
                    className={`node ${isDone ? 'done' : earned ? 'open' : 'locked'}`}
                    onClick={() => onOpenSkill(skill.id)}
                  >
                    <span className="node-icon">{skill.icon ?? (isDone ? '✓' : earned ? '▶' : '🔒')}</span>
                    <span className="node-name">{skill.name}</span>
                    {isDone ? (
                      <span className="pips" aria-label={`mastery ${mastery} of 5`}>
                        {'●'.repeat(mastery)}{'○'.repeat(5 - mastery)}
                      </span>
                    ) : sp && sp.solved.length > 0 ? (
                      <span className="count">{sp.solved.length} done</span>
                    ) : !unlocked ? (
                      <span className="count">🔒</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      <footer className="home-footer">
        <p className="muted">
          Progress is saved in your browser — no account needed. Use Export to back it up.
        </p>
      </footer>
    </div>
  )
}
