import { useEffect, useRef, useState } from 'react'
import { Editor } from './Editor'
import { ResultGrid } from './ResultGrid'
import { SchemaBrowser } from './SchemaBrowser'
import { compareResults, type QueryResult } from '../lib/compare'
import { loadWorld, runQuery } from '../lib/duckdb'
import { translateError, TrainerError } from '../lib/errors'
import { useProgress } from '../lib/progress'
import type { ExerciseBank, Skill, WorldSchema } from '../lib/content'

type Feedback =
  | { kind: 'success'; gained: number }
  | { kind: 'wrong'; message: string }
  | { kind: 'error'; friendly: string | null; raw: string }

export function ExerciseScreen({ skill, bank, schema, onBack }: {
  skill: Skill
  bank: ExerciseBank
  schema: WorldSchema
  onBack: () => void
}) {
  const progress = useProgress()
  const solved = progress.skills[skill.id]?.solved ?? []
  const firstUnsolved = bank.exercises.findIndex(e => !solved.includes(e.id))
  const [idx, setIdx] = useState(firstUnsolved === -1 ? 0 : firstUnsolved)
  const [showLesson, setShowLesson] = useState(solved.length === 0)
  const [sqlText, setSqlText] = useState('')
  const [busy, setBusy] = useState(false)
  const [engineReady, setEngineReady] = useState(false)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [hintsShown, setHintsShown] = useState(0)
  const refCache = useRef(new Map<string, QueryResult>())

  const ex = bank.exercises[idx]
  const exSolved = solved.includes(ex.id)

  useEffect(() => {
    loadWorld(schema.world, schema.tables.map(t => t.name))
      .then(() => setEngineReady(true))
      .catch(e => setEngineError(String(e)))
  }, [schema])

  function showError(e: unknown) {
    const raw = e instanceof Error ? e.message : String(e)
    if (e instanceof TrainerError) setFeedback({ kind: 'error', friendly: raw, raw: '' })
    else setFeedback({ kind: 'error', friendly: translateError(raw, schema), raw })
  }

  async function handleRun(text = sqlText) {
    setBusy(true)
    setFeedback(null)
    try {
      setResult(await runQuery(text))
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
      const user = await runQuery(sqlText)
      setResult(user)
      let ref = refCache.current.get(ex.id)
      if (!ref) {
        ref = await runQuery(ex.referenceSql)
        refCache.current.set(ex.id, ref)
      }
      const outcome = compareResults(user, ref, { orderMatters: ex.orderMatters })
      if (outcome.equal) {
        const gained = useProgress
          .getState()
          .recordSolve(skill.id, ex.id, ex.xp, hintsShown, bank.exercises.length)
        setFeedback({ kind: 'success', gained })
      } else {
        setFeedback({ kind: 'wrong', message: `Not quite — ${outcome.reason}. Check the grid and try again.` })
      }
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  function advance() {
    const nowSolved = useProgress.getState().skills[skill.id]?.solved ?? []
    const next = bank.exercises.findIndex(e => !nowSolved.includes(e.id))
    if (next === -1) {
      onBack()
      return
    }
    setIdx(next)
    setSqlText('')
    setResult(null)
    setFeedback(null)
    setHintsShown(0)
  }

  if (showLesson) {
    return (
      <div className="lesson">
        <button className="back" onClick={onBack}>← Back</button>
        <h2>{skill.name}</h2>
        <p>{skill.lesson.intro}</p>
        <pre className="example-sql">{skill.lesson.exampleSql}</pre>
        <div className="lesson-actions">
          <button
            onClick={() => {
              setSqlText(skill.lesson.exampleSql)
              setShowLesson(false)
            }}
          >
            Try the example
          </button>
          <button onClick={() => setShowLesson(false)}>Start exercises</button>
        </div>
      </div>
    )
  }

  return (
    <div className="exercise">
      <header className="topbar">
        <button className="back" onClick={onBack}>← Back</button>
        <h2>{skill.name}</h2>
        <span className="progress-count">
          {(useProgress.getState().skills[skill.id]?.solved.length ?? 0)}/{bank.exercises.length} solved
        </span>
      </header>
      <div className="exercise-layout">
        <aside className="left-panel">
          <div className="prompt">
            <span className="label">Exercise {idx + 1} of {bank.exercises.length}</span>
            <p>{ex.prompt}</p>
            {exSolved && <p className="already-solved">Already solved — replaying is free practice.</p>}
          </div>
          <div className="hints">
            {ex.hints.slice(0, hintsShown).map((h, i) => (
              <div key={i} className="hint">
                <strong>Hint {i + 1}:</strong> {h}
              </div>
            ))}
            {hintsShown < ex.hints.length && (
              <button onClick={() => setHintsShown(hintsShown + 1)}>
                💡 Hint {hintsShown + 1}/3 (costs XP)
              </button>
            )}
          </div>
          <SchemaBrowser schema={schema} />
        </aside>
        <main className="right-panel">
          <Editor value={sqlText} onChange={setSqlText} schema={schema} />
          <div className="actions">
            <button onClick={() => void handleRun()} disabled={busy || !engineReady}>
              ▶ Run
            </button>
            <button onClick={() => void handleSubmit()} disabled={busy || !engineReady} className="submit">
              Submit
            </button>
            {!engineReady && !engineError && <span className="engine-status">Loading SQL engine…</span>}
            {engineError && <span className="engine-status error">Engine failed: {engineError}</span>}
          </div>
          {feedback?.kind === 'success' && (
            <div className="feedback success">
              ✓ Correct! {feedback.gained > 0 ? `+${feedback.gained} XP` : 'Already solved — no XP this time.'}
              <button onClick={advance}>Next →</button>
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
