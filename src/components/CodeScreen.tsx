import { useRef, useState } from 'react'
import { type Extension } from '@uiw/react-codemirror'
import { CodeEditor } from './CodeEditor'
import { createJavascriptTrack } from '../lib/tracks/javascript'
import { type TestResult } from '../lib/js-runtime'
import { useProgress } from '../lib/progress'
import type { JsBank, JsTest, PyBank, Region, Skill } from '../lib/content'

type RunResult = { results: TestResult[]; error?: string }
interface CodeTrack {
  run: (code: string, ex: { functionName: string; tests: JsTest[] }) => Promise<RunResult>
  check: (r: RunResult) => { correct: boolean; reason?: string }
}

type Feedback =
  | { kind: 'success'; gained: number; finished: boolean }
  | { kind: 'wrong'; passed: number; total: number }

export function CodeScreen({ skill, bank, region, onBack, createTrack = createJavascriptTrack, lang }: {
  skill: Skill
  bank: JsBank | PyBank
  region: Region
  onBack: () => void
  createTrack?: () => CodeTrack
  lang?: () => Extension
}) {
  const progress = useProgress()
  const trackRef = useRef<CodeTrack | null>(null)
  if (!trackRef.current) trackRef.current = createTrack()
  const track = trackRef.current
  const solved = progress.skills[skill.id]?.solved ?? []
  const firstUnsolved = bank.exercises.findIndex(e => !solved.includes(e.id))
  const initialIdx = firstUnsolved === -1 ? 0 : firstUnsolved
  const [idx, setIdx] = useState(initialIdx)
  const [code, setCode] = useState(bank.exercises[initialIdx].starter)
  const [showLesson, setShowLesson] = useState(solved.length === 0)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<TestResult[] | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [hintsShown, setHintsShown] = useState(0)
  const [completion, setCompletion] = useState(false)

  const ex = bank.exercises[idx]
  const exSolved = solved.includes(ex.id)

  async function handleRun() {
    setBusy(true)
    setFeedback(null)
    const { results, error } = await track.run(code, ex)
    setResults(results)
    setRunError(error ?? null)
    setBusy(false)
  }

  async function handleSubmit() {
    setBusy(true)
    setFeedback(null)
    const r = await track.run(code, ex)
    setResults(r.results)
    setRunError(r.error ?? null)
    if (track.check(r).correct) {
      const res = useProgress
        .getState()
        .recordSolve(skill.id, ex.id, ex.xp, hintsShown, bank.exercises.length)
      if (res.newlyCompleted) {
        useProgress.getState().awardBadge(skill.id)
        if (region.skills.every(sk => useProgress.getState().skills[sk.id]?.completed))
          useProgress.getState().awardBadge(`region:${region.id}`)
      }
      setFeedback({ kind: 'success', gained: res.gained, finished: res.newlyCompleted })
    } else {
      setFeedback({ kind: 'wrong', passed: r.results.filter(t => t.pass).length, total: r.results.length })
    }
    setBusy(false)
  }

  function advance() {
    const nowSolved = useProgress.getState().skills[skill.id]?.solved ?? []
    let next = bank.exercises.findIndex(e => !nowSolved.includes(e.id))
    if (next === -1) {
      if (idx + 1 < bank.exercises.length) next = idx + 1
      else {
        onBack()
        return
      }
    }
    setIdx(next)
    setCode(bank.exercises[next].starter)
    setResults(null)
    setRunError(null)
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
          <CodeEditor key={ex.id} value={code} onChange={setCode} lang={lang} />
          <div className="actions">
            <button onClick={() => void handleRun()} disabled={busy}>
              ▶ Run
            </button>
            <button onClick={() => void handleSubmit()} disabled={busy} className="submit">
              Submit
            </button>
          </div>
          {feedback?.kind === 'success' && (
            <div className="feedback success">
              ✓ Correct! {feedback.gained > 0 ? `+${feedback.gained} XP` : 'Already solved — no XP this time.'}
              {feedback.finished ? (
                <button onClick={() => setCompletion(true)}>Finish node →</button>
              ) : (
                <button onClick={advance}>Next →</button>
              )}
            </div>
          )}
          {feedback?.kind === 'wrong' && (
            <div className="feedback wrong">
              {feedback.total > 0
                ? `${feedback.passed}/${feedback.total} tests passing — keep going.`
                : 'Your code didn’t run — see the error below.'}
            </div>
          )}
          {(results || runError) && (
            <div className="tests">
              {runError && <div className="test fail">⚠ {runError}</div>}
              {results?.map((t, i) => (
                <div key={i} className={`test ${t.pass ? 'pass' : 'fail'}`}>
                  <span>{t.pass ? '✓' : '✗'} Test {i + 1}</span>
                  {!t.pass && (
                    <span className="test-detail">
                      {t.error
                        ? `error: ${t.error}`
                        : `expected ${JSON.stringify(t.expected)}, got ${JSON.stringify(t.actual)}`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
