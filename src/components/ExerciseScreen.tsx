import { useEffect, useRef, useState } from 'react'
import { Editor } from './Editor'
import { ResultGrid } from './ResultGrid'
import { SchemaBrowser } from './SchemaBrowser'
import { compareResults, type QueryResult } from '../lib/compare'
import { loadWorld, runQuery } from '../lib/duckdb'
import { translateError, TrainerError } from '../lib/errors'
import { pickCatches } from '../lib/catches'
import { useProgress } from '../lib/progress'
import type { ExerciseBank, Region, Skill, WorldSchema } from '../lib/content'

type Feedback =
  | { kind: 'success'; gained: number; caught: string[]; finished: boolean }
  | { kind: 'wrong'; message: string }
  | { kind: 'error'; friendly: string | null; raw: string }

export function ExerciseScreen({ skill, bank, schema, region, onBack }: {
  skill: Skill
  bank: ExerciseBank
  schema: WorldSchema
  region: Region
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
  const [worldNames, setWorldNames] = useState<Set<string> | null>(null)
  const [sessionCatches, setSessionCatches] = useState<string[]>([])
  const [completion, setCompletion] = useState<{ catches: string[] } | null>(null)

  const ex = bank.exercises[idx]
  const exSolved = solved.includes(ex.id)

  useEffect(() => {
    loadWorld(schema.world, schema.tables.map(t => t.name))
      .then(async () => {
        setEngineReady(true)
        if (schema.entity) {
          const r = await runQuery(`SELECT DISTINCT ${schema.entity.column} FROM ${schema.entity.table}`)
          setWorldNames(new Set(r.rows.map(row => String(row[0]))))
        }
      })
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
        const res = useProgress
          .getState()
          .recordSolve(skill.id, ex.id, ex.xp, hintsShown, bank.exercises.length)
        let caught: string[] = []
        if (res.gained > 0 && schema.entity) {
          try {
            let names = worldNames
            if (!names) {
              const r = await runQuery(
                `SELECT DISTINCT ${schema.entity.column} FROM ${schema.entity.table}`,
              )
              names = new Set(r.rows.map(row => String(row[0])))
              setWorldNames(names)
            }
            const owned = new Set(useProgress.getState().collection)
            caught = useProgress
              .getState()
              .addCatches(pickCatches(user, names, owned, ex.collectibles ?? []))
            if (caught.length > 0) setSessionCatches(prev => [...prev, ...caught])
          } catch (err) {
            console.error('Catch check failed', err)
          }
        }
        if (res.newlyCompleted) {
          useProgress.getState().awardBadge(skill.id)
          if (region.skills.every(sk => useProgress.getState().skills[sk.id]?.completed))
            useProgress.getState().awardBadge(`region:${region.id}`)
        }
        setFeedback({ kind: 'success', gained: res.gained, caught, finished: res.newlyCompleted })
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
    if (next !== -1) {
      setIdx(next)
    } else if (idx + 1 < bank.exercises.length) {
      setIdx(idx + 1)
    } else {
      onBack()
      return
    }
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

  if (completion) {
    return (
      <div className="lesson completion-card">
        <h2>🏅 {skill.name} complete!</h2>
        {skill.lesson.wrapUp && <p>{skill.lesson.wrapUp}</p>}
        <p>
          Badge earned: <strong>{skill.name}</strong>
        </p>
        {completion.catches.length > 0 && <p>Caught this node: {completion.catches.join(', ')}</p>}
        <button onClick={onBack}>Back to map</button>
      </div>
    )
  }

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
                💡 Hint {hintsShown + 1}/{ex.hints.length} (costs XP)
              </button>
            )}
          </div>
          <SchemaBrowser schema={schema} />
        </aside>
        <main className="right-panel">
          <Editor key={ex.id} value={sqlText} onChange={setSqlText} schema={schema} />
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
              {feedback.caught.length > 0 && (
                <span className="catch-chip">Caught: {feedback.caught.join(', ')}!</span>
              )}
              {feedback.finished ? (
                <button onClick={() => setCompletion({ catches: sessionCatches })}>Finish node →</button>
              ) : (
                <button onClick={advance}>Next →</button>
              )}
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
