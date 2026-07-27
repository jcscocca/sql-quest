import { useEffect, useMemo, useRef, useState } from 'react'
import { python } from '@codemirror/lang-python'
import { Editor } from './Editor'
import { CodeEditor } from './CodeEditor'
import { ResultGrid } from './ResultGrid'
import type { QueryResult } from '../lib/compare'
import { loadWorld, runQuery } from '../lib/duckdb'
import { translateError, TrainerError } from '../lib/errors'
import { getTrack } from '../lib/tracks/registry'
import type { Track } from '../lib/tracks/types'
import { createJavascriptTrack } from '../lib/tracks/javascript'
import { createPythonTrack } from '../lib/tracks/python'
import type { TestResult } from '../lib/js-runtime'
import { useProgress } from '../lib/progress'
import type { ReviewItem } from '../lib/review'
import type { CodeTest, Curriculum, Exercise, WorldSchema } from '../lib/content'

type Feedback =
  | { kind: 'success'; gained: number }
  | { kind: 'wrong'; message: string }
  | { kind: 'error'; friendly: string | null; raw: string }

interface SkillResult {
  before: number
  after: number
}

type CodeRun = { results: TestResult[]; error?: string }
interface CodeTrack {
  run: (code: string, ex: { tests: CodeTest[]; fixture?: string; mustCall?: string[] }) => Promise<CodeRun>
  check: (r: CodeRun) => { correct: boolean; reason?: string }
}
type CodeTrackId = 'javascript' | 'python'

const defaultCodeTrack = (trackId: CodeTrackId): CodeTrack =>
  trackId === 'javascript' ? createJavascriptTrack() : createPythonTrack()

export function ReviewScreen({ items, schemas, curriculum, onDone, createCodeTrack = defaultCodeTrack }: {
  items: ReviewItem[]
  schemas: Record<string, WorldSchema>
  curriculum: Curriculum
  onDone: () => void
  createCodeTrack?: (trackId: CodeTrackId) => CodeTrack
}) {
  const first = items[0] as ReviewItem | undefined
  const [idx, setIdx] = useState(0)
  const [submission, setSubmission] = useState(first && first.trackId !== 'sql' ? first.exercise.starter : '')
  const [busy, setBusy] = useState(false)
  const [engineReady, setEngineReady] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [tests, setTests] = useState<TestResult[] | null>(null)
  const [hintsShown, setHintsShown] = useState(0)
  const [hintUsed, setHintUsed] = useState<Record<string, boolean>>({})
  const [missed, setMissed] = useState<Record<string, boolean>>({})
  const [xpEarned, setXpEarned] = useState(0)
  const [summary, setSummary] = useState<Record<string, SkillResult> | null>(null)

  const item = items[idx]
  const allSkills = useMemo(() => curriculum.regions.flatMap(r => r.skills), [curriculum])
  const sqlNeeded = useMemo(() => items.some(i => i.trackId === 'sql'), [items])
  const world = allSkills.find(s => s.id === item?.skillId)?.world ?? 'pokemon'
  const schema = schemas[world]
  const trackRef = useRef<Track<QueryResult, Exercise> | null>(null)
  if (!trackRef.current && sqlNeeded) {
    const sk = allSkills.find(s => s.id === items.find(i => i.trackId === 'sql')?.skillId)
    if (sk) trackRef.current = getTrack(sk, { runQuery, loadWorld })
  }
  const track = trackRef.current
  const codeTracksRef = useRef<Partial<Record<CodeTrackId, CodeTrack>>>({})
  function codeTrack(trackId: CodeTrackId): CodeTrack {
    const existing = codeTracksRef.current[trackId]
    if (existing) return existing
    const created = createCodeTrack(trackId)
    codeTracksRef.current[trackId] = created
    return created
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: prepare only matters per world — re-running per item would be a no-op
  useEffect(() => {
    if (!sqlNeeded) {
      setEngineReady(true)
      return
    }
    setEngineReady(false)
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
    if (item.trackId === 'sql') {
      try {
        setResult(await track!.run(submission))
      } catch (e) {
        showError(e)
      } finally {
        setBusy(false)
      }
      return
    }
    const r = await codeTrack(item.trackId).run(submission, item.exercise)
    setTests(r.results)
    if (r.error) setFeedback({ kind: 'error', friendly: r.error, raw: '' })
    setBusy(false)
  }

  async function handleSubmit() {
    setBusy(true)
    setFeedback(null)
    if (item.trackId === 'sql') {
      try {
        const user = await track!.run(submission)
        setResult(user)
        const outcome = await track!.check(user, item.exercise)
        if (outcome.correct) succeed()
        else miss(`Not quite — ${outcome.reason}. Try again.`)
      } catch (e) {
        showError(e)
      } finally {
        setBusy(false)
      }
      return
    }
    const r = await codeTrack(item.trackId).run(submission, item.exercise)
    setTests(r.results)
    if (r.error) setFeedback({ kind: 'error', friendly: r.error, raw: '' })
    else if (codeTrack(item.trackId).check(r).correct) succeed()
    else miss(`${r.results.filter(t => t.pass).length}/${r.results.length} tests passing — try again.`)
    setBusy(false)
  }

  function succeed() {
    const gained = useProgress.getState().recordReviewSolve(hintsShown)
    setXpEarned(x => x + gained)
    setFeedback({ kind: 'success', gained })
  }

  function miss(message: string) {
    setMissed(m => ({ ...m, [item.skillId]: true }))
    setFeedback({ kind: 'wrong', message })
  }

  function recordOutcomes(skillIds: string[]): Record<string, SkillResult> {
    const store = useProgress.getState()
    const out: Record<string, SkillResult> = {}
    for (const skillId of [...new Set(skillIds)]) {
      const before = store.skills[skillId]?.mastery ?? 0
      store.recordReview(skillId, !hintUsed[skillId] && !missed[skillId])
      out[skillId] = { before, after: useProgress.getState().skills[skillId]?.mastery ?? before }
    }
    return out
  }

  function advance() {
    if (idx + 1 < items.length) {
      const next = items[idx + 1]
      setIdx(idx + 1)
      setSubmission(next.trackId === 'sql' ? '' : next.exercise.starter)
      setResult(null)
      setTests(null)
      setFeedback(null)
      setHintsShown(0)
      return
    }
    setSummary(recordOutcomes(items.map(i => i.skillId)))
  }

  // Exiting early still banks the XP already earned, so it has to bank the recall
  // outcome too — otherwise the drills stay due and can be re-farmed indefinitely.
  // Only skills the user actually engaged with count: solved, missed, or hinted.
  function exit() {
    const solved = idx + (feedback?.kind === 'success' ? 1 : 0)
    recordOutcomes([
      ...items.slice(0, solved).map(i => i.skillId),
      ...Object.keys(missed),
      ...Object.keys(hintUsed),
    ])
    onDone()
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
        <button type="button" onClick={onDone}>Done</button>
      </div>
    )
  }

  return (
    <div className="exercise">
      <header className="topbar">
        <button type="button" className="back" onClick={exit}>← Exit</button>
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
          {item.trackId !== 'sql' && item.exercise.fixture && (
            <div className="fixture">
              <span className="label">Data available to your code</span>
              <pre>{item.exercise.fixture}</pre>
            </div>
          )}
          <div className="hints">
            {item.exercise.hints.slice(0, hintsShown).map((h, i) => (
              <div key={i} className="hint">
                <strong>Hint {i + 1}:</strong> {h}
              </div>
            ))}
            {hintsShown < item.exercise.hints.length && (
              <button type="button" onClick={showHint}>💡 Hint (marks this skill for reset)</button>
            )}
          </div>
        </aside>
        <main className="right-panel">
          {item.trackId === 'sql' ? (
            <Editor key={`${idx}`} value={submission} onChange={setSubmission} schema={schema} />
          ) : (
            <CodeEditor key={`${idx}`} value={submission} onChange={setSubmission} lang={item.trackId === 'python' ? python : undefined} />
          )}
          <div className="actions">
            <button type="button" onClick={() => void handleRun()} disabled={busy || (item.trackId === 'sql' && !engineReady)}>
              ▶ Run
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={busy || (item.trackId === 'sql' && !engineReady) || feedback?.kind === 'success'}
              className="submit"
            >
              Submit
            </button>
            {item.trackId === 'sql' && !engineReady && <span className="engine-status">Loading SQL engine…</span>}
          </div>
          {feedback?.kind === 'success' && (
            <div className="feedback success">
              ✓ Correct! +{feedback.gained} XP
              <button type="button" onClick={advance}>{idx + 1 < items.length ? 'Next →' : 'Finish review →'}</button>
            </div>
          )}
          {feedback?.kind === 'wrong' && <div className="feedback wrong">{feedback.message}</div>}
          {feedback?.kind === 'error' && (
            <div className="feedback error">
              {feedback.friendly && <p>{feedback.friendly}</p>}
              {feedback.raw && <pre className="raw-error">{feedback.raw}</pre>}
            </div>
          )}
          {item.trackId === 'sql' && result && <ResultGrid result={result} />}
          {item.trackId !== 'sql' && tests && (
            <div className="tests">
              {tests.map((t, i) => (
                <div key={i} className={`test ${t.pass ? 'pass' : 'fail'}`}>
                  <span>{t.pass ? '✓' : '✗'} Test {i + 1}</span>
                  {!t.pass && (
                    <span className="test-detail">
                      {t.error
                        ? `error: ${t.error}`
                        : `expected ${t.expected}, got ${t.actual}`}
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
