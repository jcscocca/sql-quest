import { useRef, useState } from 'react'
import type { CourseMeta, SkillBank, Skill, Unit } from '../lib/content'
import { exerciseVocab } from '../lib/content'
import { useProgress } from '../lib/progress'
import { ExerciseCard } from './exercises/ExerciseCard'

export function LessonScreen({ skill, bank, unit, course, onBack }: {
  skill: Skill
  bank: SkillBank
  unit: Unit
  course: CourseMeta
  onBack: () => void
}) {
  const progress = useProgress()
  const solved = progress.skills[skill.id]?.solved ?? []
  const firstUnsolved = bank.exercises.findIndex(e => !solved.includes(e.id))
  const [idx, setIdx] = useState(firstUnsolved === -1 ? 0 : firstUnsolved)
  const [showLesson, setShowLesson] = useState(solved.length === 0)
  const [completion, setCompletion] = useState(false)
  const finishRef = useRef(false)

  const ex = bank.exercises[idx]
  const exSolved = solved.includes(ex.id)

  function handleCorrect(hintsUsed: number) {
    const store = useProgress.getState()
    const res = store.recordSolve(skill.id, ex.id, ex.xp, hintsUsed, bank.exercises.length)
    store.addVocab(course.id, exerciseVocab(ex))
    if (res.newlyCompleted) {
      store.awardBadge(skill.id)
      if (unit.skills.every(sk => useProgress.getState().skills[sk.id]?.completed))
        store.awardBadge(`unit:${unit.id}`)
    }
    finishRef.current = res.newlyCompleted
    return { gained: res.gained, finished: res.newlyCompleted }
  }

  function advance() {
    const nowSolved = useProgress.getState().skills[skill.id]?.solved ?? []
    const next = bank.exercises.findIndex(e => !nowSolved.includes(e.id))
    if (next !== -1) setIdx(next)
    else if (idx + 1 < bank.exercises.length) setIdx(idx + 1)
    else onBack()
  }

  function handleContinue() {
    if (finishRef.current) {
      finishRef.current = false
      setCompletion(true)
      return
    }
    advance()
  }

  if (showLesson) {
    return (
      <div className="lesson">
        <button className="back" onClick={onBack}>← Back</button>
        <h2>{skill.icon ? `${skill.icon} ` : ''}{skill.name}</h2>
        <p className="intro">{skill.lesson.intro}</p>
        {skill.lesson.tips && skill.lesson.tips.length > 0 && (
          <ul className="tips">
            {skill.lesson.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}
        <div className="lesson-actions">
          <button className="submit" onClick={() => setShowLesson(false)}>¡Vamos! Start →</button>
        </div>
      </div>
    )
  }

  if (completion) {
    return (
      <div className="lesson completion-card">
        <div className="trophy">🏅</div>
        <h2>¡{skill.name} completado!</h2>
        <p>You earned the <strong>{skill.name}</strong> badge and this skill has joined your Daily Review.</p>
        <button className="submit" onClick={onBack}>Back to the map</button>
      </div>
    )
  }

  return (
    <div className="runner">
      <header className="topbar">
        <button className="back" onClick={onBack}>← Back</button>
        <h2>{skill.icon ? `${skill.icon} ` : ''}{skill.name}</h2>
        <span className="progress-count">{solved.length}/{bank.exercises.length}</span>
      </header>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${(solved.length / bank.exercises.length) * 100}%` }} />
      </div>
      <div className="runner-body">
        <ExerciseCard
          key={ex.id}
          exercise={ex}
          voice={course.voice}
          label={`Exercise ${idx + 1} of ${bank.exercises.length}`}
          alreadySolved={exSolved}
          onCorrect={handleCorrect}
          onContinue={handleContinue}
        />
      </div>
    </div>
  )
}
