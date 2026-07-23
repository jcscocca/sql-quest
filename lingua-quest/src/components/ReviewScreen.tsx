import { useMemo, useState } from 'react'
import type { CourseMeta, Curriculum } from '../lib/content'
import { useProgress } from '../lib/progress'
import type { ReviewItem } from '../lib/review'
import { ExerciseCard } from './exercises/ExerciseCard'

interface SkillResult {
  before: number
  after: number
}

export function ReviewScreen({ items, curriculum, course, onDone }: {
  items: ReviewItem[]
  curriculum: Curriculum
  course: CourseMeta
  onDone: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [xpEarned, setXpEarned] = useState(0)
  const [hinted, setHinted] = useState<Record<string, boolean>>({})
  const [summary, setSummary] = useState<Record<string, SkillResult> | null>(null)

  const allSkills = useMemo(() => curriculum.units.flatMap(u => u.skills), [curriculum])
  const skillName = (id: string) => allSkills.find(s => s.id === id)?.name ?? id
  const item = items[idx]

  function handleCorrect(hintsUsed: number) {
    const gained = useProgress.getState().recordReviewSolve(hintsUsed)
    setXpEarned(x => x + gained)
    if (hintsUsed > 0) setHinted(m => ({ ...m, [item.skillId]: true }))
    return { gained, finished: idx + 1 >= items.length }
  }

  function advance() {
    if (idx + 1 < items.length) {
      setIdx(idx + 1)
      return
    }
    const store = useProgress.getState()
    const out: Record<string, SkillResult> = {}
    for (const skillId of [...new Set(items.map(i => i.skillId))]) {
      const before = store.skills[skillId]?.mastery ?? 0
      store.recordReview(skillId, !hinted[skillId])
      out[skillId] = { before, after: useProgress.getState().skills[skillId]?.mastery ?? before }
    }
    setSummary(out)
  }

  if (summary) {
    return (
      <div className="lesson completion-card">
        <div className="trophy">📅</div>
        <h2>Review complete!</h2>
        <p>+{xpEarned} XP earned.</p>
        <ul className="mastery-list">
          {Object.entries(summary).map(([id, r]) => (
            <li key={id}>
              {skillName(id)}: mastery {r.before} → {r.after} {r.after > r.before ? '📈' : r.after < r.before ? '📉' : ''}
            </li>
          ))}
        </ul>
        <button className="submit" onClick={onDone}>Done</button>
      </div>
    )
  }

  return (
    <div className="runner">
      <header className="topbar">
        <button className="back" onClick={onDone}>← Exit</button>
        <h2>📅 Daily Review</h2>
        <span className="progress-count">{idx + 1}/{items.length} · {skillName(item.skillId)}</span>
      </header>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${(idx / items.length) * 100}%` }} />
      </div>
      <div className="runner-body">
        <ExerciseCard
          key={`${idx}-${item.exercise.id}`}
          exercise={item.exercise}
          voice={course.voice}
          label={`Review ${idx + 1} of ${items.length} · ${skillName(item.skillId)}`}
          onCorrect={handleCorrect}
          onContinue={advance}
        />
      </div>
    </div>
  )
}
