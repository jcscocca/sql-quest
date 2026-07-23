import { useRef, useState } from 'react'
import { createSystemsDesignTrack } from '../lib/tracks/systems-design'
import type { Track } from '../lib/tracks/types'
import { useProgress } from '../lib/progress'
import type { DrillBank, DrillExercise, Region, Skill } from '../lib/content'

type Feedback =
  | { kind: 'success'; gained: number; finished: boolean; explanation: string }
  | { kind: 'wrong' }

export function DrillScreen({ skill, bank, region, onBack }: {
  skill: Skill
  bank: DrillBank
  region: Region
  onBack: () => void
}) {
  const progress = useProgress()
  const trackRef = useRef<Track<string, DrillExercise> | null>(null)
  if (!trackRef.current) trackRef.current = createSystemsDesignTrack()
  const track = trackRef.current
  const solved = progress.skills[skill.id]?.solved ?? []
  const firstUnsolved = bank.exercises.findIndex(e => !solved.includes(e.id))
  const [idx, setIdx] = useState(firstUnsolved === -1 ? 0 : firstUnsolved)
  const [showLesson, setShowLesson] = useState(solved.length === 0)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [hintsShown, setHintsShown] = useState(0)
  const [completion, setCompletion] = useState(false)

  const ex = bank.exercises[idx]
  const exSolved = solved.includes(ex.id)

  async function handleSubmit() {
    if (selected === null) return
    setBusy(true)
    setFeedback(null)
    try {
      const outcome = await track.check(await track.run(selected), ex)
      if (outcome.correct) {
        const res = useProgress
          .getState()
          .recordSolve(skill.id, ex.id, ex.xp, hintsShown, bank.exercises.length)
        if (res.newlyCompleted) {
          useProgress.getState().awardBadge(skill.id)
          if (region.skills.every(sk => useProgress.getState().skills[sk.id]?.completed))
            useProgress.getState().awardBadge(`region:${region.id}`)
        }
        setFeedback({ kind: 'success', gained: res.gained, finished: res.newlyCompleted, explanation: ex.explanation })
      } else {
        setFeedback({ kind: 'wrong' })
      }
    } finally {
      setBusy(false)
    }
  }

  function advance() {
    const nowSolved = useProgress.getState().skills[skill.id]?.solved ?? []
    const next = bank.exercises.findIndex(e => !nowSolved.includes(e.id))
    if (next !== -1) {
      setIdx(next)
    } else if (idx + 1 < bank.exercises.length) {
      setIdx(idx + 1)
    } else {
      onBack()
      return
    }
    setSelected(null)
    setFeedback(null)
    setHintsShown(0)
  }

  if (showLesson) {
    return (
      <div className="lesson">
        <button className="back" onClick={onBack}>← Back</button>
        <h2>{skill.name}</h2>
        <p>{skill.lesson.intro}</p>
        <div className="lesson-actions">
          <button onClick={() => setShowLesson(false)}>Start drills</button>
        </div>
      </div>
    )
  }

  if (completion) {
    return (
      <div className="lesson completion-card">
        <h2>🏅 {skill.name} complete!</h2>
        {skill.lesson.wrapUp && <p>{skill.lesson.wrapUp}</p>}
        <p>
          Badge earned: <strong>{skill.name}</strong>
        </p>
        <button onClick={onBack}>Back to map</button>
      </div>
    )
  }

  const locked = feedback?.kind === 'success'
  return (
    <div className="exercise">
      <header className="topbar">
        <button className="back" onClick={onBack}>← Back</button>
        <h2>{skill.name}</h2>
        <span className="progress-count">
          {solved.length}/{bank.exercises.length} solved
        </span>
      </header>
      <div className="exercise-layout">
        <aside className="left-panel">
          <div className="prompt">
            <span className="label">Drill {idx + 1} of {bank.exercises.length}</span>
            {ex.scenario && <p className="scenario">{ex.scenario}</p>}
            <p>{ex.prompt}</p>
            {exSolved && !feedback && <p className="already-solved">Already solved — replaying is free practice.</p>}
          </div>
          <div className="hints">
            {ex.hints.slice(0, hintsShown).map((h, i) => (
              <div key={i} className="hint">
                <strong>Hint {i + 1}:</strong> {h}
              </div>
            ))}
            {hintsShown < ex.hints.length && (
              <button onClick={() => setHintsShown(hintsShown + 1)}>
                💡 Hint {hintsShown + 1}/{ex.hints.length} (costs XP)
              </button>
            )}
          </div>
        </aside>
        <main className="right-panel">
          <div className="choices">
            {ex.choices.map(c => (
              <button
                key={c.id}
                className={`choice${selected === c.id ? ' selected' : ''}`}
                onClick={() => setSelected(c.id)}
                disabled={busy || locked}
              >
                {c.text}
              </button>
            ))}
          </div>
          <div className="actions">
            <button
              onClick={() => void handleSubmit()}
              disabled={busy || selected === null || locked}
              className="submit"
            >
              Submit
            </button>
          </div>
          {feedback?.kind === 'success' && (
            <div className="feedback success">
              <div>
                ✓ Correct! {feedback.gained > 0 ? `+${feedback.gained} XP` : 'Already solved — no XP this time.'}
                <p className="explanation">{feedback.explanation}</p>
              </div>
              {feedback.finished ? (
                <button onClick={() => setCompletion(true)}>Finish node →</button>
              ) : (
                <button onClick={advance}>Next →</button>
              )}
            </div>
          )}
          {feedback?.kind === 'wrong' && <div className="feedback wrong">Not quite — try again.</div>}
        </main>
      </div>
    </div>
  )
}
