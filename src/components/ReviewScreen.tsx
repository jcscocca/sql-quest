import { useEffect, useMemo, useRef, useState } from 'react'
import { Editor } from './Editor'
import { ResultGrid } from './ResultGrid'
import { type QueryResult } from '../lib/compare'
import { loadWorld, runQuery } from '../lib/duckdb'
import { translateError, TrainerError } from '../lib/errors'
import { getTrack } from '../lib/tracks/registry'
import type { Track } from '../lib/tracks/types'
import { useProgress } from '../lib/progress'
import type { ReviewItem } from '../lib/review'
import type { Curriculum, Exercise, WorldSchema } from '../lib/content'

type Feedback =
  | { kind: 'success'; gained: number }
  | { kind: 'wrong'; message: string }
  | { kind: 'error'; friendly: string | null; raw: string }

interface SkillResult {
  before: number
  after: number
}

export function ReviewScreen({ items, schemas, curriculum, onDone }: {
  items: ReviewItem[]
  schemas: Record<string, WorldSchema>
  curriculum: Curriculum
  onDone: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [sqlText, setSqlText] = useState('')
  const [busy, setBusy] = useState(false)
  const [engineReady, setEngineReady] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [hintsShown, setHintsShown] = useState(0)
  const [hintUsed, setHintUsed] = useState<Record<string, boolean>>({})
  const [xpEarned, setXpEarned] = useState(0)
  const [summary, setSummary] = useState<Record<string, SkillResult> | null>(null)

  const item = items[idx]
  const allSkills = useMemo(() => curriculum.regions.flatMap(r => r.skills), [curriculum])
  const world = allSkills.find(s => s.id === item?.skillId)?.world ?? 'pokemon'
  const schema = schemas[world]
  const trackRef = useRef<Track<QueryResult, Exercise> | null>(null)
  if (!trackRef.current) {
    const sk = allSkills.find(s => s.id === item?.skillId)
    if (sk) trackRef.current = getTrack(sk, { runQuery, loadWorld })
  }
  const track = trackRef.current

  useEffect(() => {
    track?.prepare(allSkills.find(s => s.id === item?.skillId), schema)
      .then(() => setEngineReady(true))
      .catch(e => setFeedback({ kind: 'error', friendly: String(e), raw: '' }))
  }, [schema])

  function skillName(id: string): string {
    return allSkills.find(s => s.id === id)?.name ?? id
  }

  function showError(e: unknown) {
    const raw = e instanceof Error ? e.message : String(e)
    if (e instanceof TrainerError) setFeedback({ kind: 'error', friendly: raw, raw: '' })
    else setFeedback({ kind: 'error', friendly: translateError(raw, schema), raw })
  }

  async function handleRun() {
    setBusy(true)
    setFeedback(null)
    try {
      setResult(await track!.run(sqlText))
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit() {
    setBusy(true)
    setFeedback(null)
    try {
      const user = await track!.run(sqlText)
      setResult(user)
      const outcome = await track!.check(user, item.exercise)
      if (outcome.correct) {
        const gained = useProgress.getState().recordReviewSolve(hintsShown)
        setXpEarned(x => x + gained)
        setFeedback({ kind: 'success', gained })
      } else {
        setFeedback({ kind: 'wrong', message: `Not quite — ${outcome.reason}. Try again.` })
      }
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  function advance() {
    if (idx + 1 < items.length) {
      setIdx(idx + 1)
      setSqlText('')
      setResult(null)
      setFeedback(null)
      setHintsShown(0)
      return
    }
    const store = useProgress.getState()
    const out: Record<string, SkillResult> = {}
    for (const skillId of [...new Set(items.map(i => i.skillId))]) {
      const before = store.skills[skillId]?.mastery ?? 0
      store.recordReview(skillId, !hintUsed[skillId])
      out[skillId] = { before, after: useProgress.getState().skills[skillId]?.mastery ?? before }
    }
    setSummary(out)
  }

  function showHint() {
    setHintsShown(h => h + 1)
    setHintUsed(m => ({ ...m, [item.skillId]: true }))
  }

  if (summary) {
    return (
      <div className="lesson completion-card">
        <h2>📅 Review complete!</h2>
        <p>+{xpEarned} XP earned.</p>
        <ul>
          {Object.entries(summary).map(([id, r]) => (
            <li key={id}>
              {skillName(id)}: mastery {r.before} → {r.after}
            </li>
          ))}
        </ul>
        <button onClick={onDone}>Done</button>
      </div>
    )
  }

  return (
    <div className="exercise">
      <header className="topbar">
        <button className="back" onClick={onDone}>← Exit</button>
        <h2>📅 Daily Review</h2>
        <span className="progress-count">
          {idx + 1}/{items.length} · {skillName(item.skillId)}
        </span>
      </header>
      <div className="exercise-layout">
        <aside className="left-panel">
          <div className="prompt">
            <span className="label">Review drill {idx + 1} of {items.length}</span>
            <p>{item.exercise.prompt}</p>
          </div>
          <div className="hints">
            {item.exercise.hints.slice(0, hintsShown).map((h, i) => (
              <div key={i} className="hint">
                <strong>Hint {i + 1}:</strong> {h}
              </div>
            ))}
            {hintsShown < item.exercise.hints.length && (
              <button onClick={showHint}>💡 Hint (marks this skill for reset)</button>
            )}
          </div>
        </aside>
        <main className="right-panel">
          <Editor key={`${idx}`} value={sqlText} onChange={setSqlText} schema={schema} />
          <div className="actions">
            <button onClick={() => void handleRun()} disabled={busy || !engineReady}>
              ▶ Run
            </button>
            <button onClick={() => void handleSubmit()} disabled={busy || !engineReady || feedback?.kind === 'success'} className="submit">
              Submit
            </button>
            {!engineReady && <span className="engine-status">Loading SQL engine…</span>}
          </div>
          {feedback?.kind === 'success' && (
            <div className="feedback success">
              ✓ Correct! +{feedback.gained} XP
              <button onClick={advance}>{idx + 1 < items.length ? 'Next →' : 'Finish review →'}</button>
            </div>
          )}
          {feedback?.kind === 'wrong' && <div className="feedback wrong">{feedback.message}</div>}
          {feedback?.kind === 'error' && (
            <div className="feedback error">
              {feedback.friendly && <p>{feedback.friendly}</p>}
              {feedback.raw && <pre className="raw-error">{feedback.raw}</pre>}
            </div>
          )}
          {result && <ResultGrid result={result} />}
        </main>
      </div>
    </div>
  )
}
