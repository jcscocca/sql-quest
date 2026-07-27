// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ReviewScreen } from './ReviewScreen'
import { useProgress } from '../lib/progress'
import { FIRST_INTERVAL, type ReviewItem } from '../lib/review'
import type { Curriculum, Exercise, JsExercise, WorldSchema } from '../lib/content'

const h = vi.hoisted(() => ({
  prepareImpl: (): Promise<void> => Promise.resolve(),
}))

vi.mock('../lib/duckdb', () => ({ loadWorld: vi.fn(), runQuery: vi.fn() }))
vi.mock('./Editor', () => ({
  Editor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="editor" value={value} onChange={e => onChange(e.target.value)} />
  ),
}))
vi.mock('./CodeEditor', () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="code-editor" value={value} onChange={e => onChange(e.target.value)} />
  ),
}))
// The fake track judges by submission text: "RIGHT" is correct, anything else is wrong.
vi.mock('../lib/tracks/registry', () => ({
  getTrack: () => ({
    id: 'sql',
    prepare: () => h.prepareImpl(),
    run: (submission: string) => Promise.resolve({ columns: ['name'], rows: [[submission.trim()]] }),
    check: (result: { rows: unknown[][] }) =>
      Promise.resolve(result.rows[0]?.[0] === 'RIGHT' ? { correct: true } : { correct: false, reason: 'row mismatch' }),
    reward: () => Promise.resolve([]),
    example: () => '',
  }),
}))

const schema: WorldSchema = {
  world: 'pokemon',
  name: 'Pokemon',
  tables: [{ name: 'pokemon', description: '', columns: [{ name: 'name', type: 'text', description: '' }] }],
}
const skill = (id: string, name: string) => ({
  id, name, world: 'pokemon', requires: [], lesson: { intro: '', exampleSql: '' },
})
const exercise = (id: string): Exercise => ({
  id, prompt: `prompt-${id}`, referenceSql: 'SELECT 1', orderMatters: false, hints: ['try a WHERE clause'], xp: 10,
})
const jsExercise = (id: string): JsExercise => ({
  id,
  prompt: `prompt-${id}`,
  functionName: 'f',
  starter: 'starter-code',
  solution: 'function f() { return 1 }',
  tests: [{ expr: 'f()', expect: '1' }],
  hints: ['use map'],
  xp: 15,
})
const curriculum: Curriculum = {
  regions: [
    { id: 'r1', name: 'Region 1', skills: [skill('sel', 'Select'), skill('agg', 'Aggregate')] },
    {
      id: 'r2',
      name: 'JS Region',
      skills: [{ id: 'jsk', name: 'Arrays', trackId: 'javascript' as const, requires: [], lesson: { intro: '', exampleSql: '' } }],
    },
  ],
}
// The fake code track judges by submission text, like the fake SQL track above.
const fakeCodeTrack = {
  run: (code: string) =>
    Promise.resolve(
      code.includes('RIGHT')
        ? { results: [{ pass: true, expected: '1', actual: '1' }] }
        : { results: [{ pass: false, expected: '1', actual: '0' }] },
    ),
  check: (r: { results: { pass: boolean }[]; error?: string }) => ({
    correct: !r.error && r.results.length > 0 && r.results.every(t => t.pass),
  }),
}

beforeEach(() => {
  h.prepareImpl = () => Promise.resolve()
  useProgress.setState({ ...useProgress.getInitialState(), hydrated: true }, true)
  useProgress.setState({
    skills: {
      sel: { solved: ['s1'], completed: true, mastery: 3, interval: 2, due: '2026-01-01' },
      agg: { solved: ['a1'], completed: true, mastery: 3, interval: 2, due: '2026-01-01' },
      jsk: { solved: ['j1'], completed: true, mastery: 3, interval: 2, due: '2026-01-01' },
    },
  })
})
afterEach(cleanup)

async function renderReady(items: ReviewItem[], onDone = vi.fn()) {
  render(
    <ReviewScreen
      items={items}
      schemas={{ pokemon: schema }}
      curriculum={curriculum}
      onDone={onDone}
      createCodeTrack={() => fakeCodeTrack}
    />,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: /Run/ })).toBeEnabled())
  return onDone
}

const sqlItem = (skillId: string, ex: Exercise): ReviewItem => ({ skillId, trackId: 'sql', exercise: ex })
const jsItem = (skillId: string, ex: JsExercise): ReviewItem => ({ skillId, trackId: 'javascript', exercise: ex })

function submit(text: string, label = 'editor') {
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
}

test('solving a drill awards review XP and advances to the next item', async () => {
  await renderReady([sqlItem('sel', exercise('e1')), sqlItem('agg', exercise('e2'))])
  expect(screen.getByText('prompt-e1')).toBeInTheDocument()
  submit('RIGHT')
  await screen.findByText(/Correct! \+5 XP/)
  expect(useProgress.getState().xp).toBe(5)
  fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
  expect(screen.getByText('prompt-e2')).toBeInTheDocument()
  expect(screen.getByText(/2\/2/)).toBeInTheDocument()
})

test('finishing a clean review raises mastery and shows the summary', async () => {
  await renderReady([sqlItem('sel', exercise('e1'))])
  submit('RIGHT')
  await screen.findByText(/Correct!/)
  fireEvent.click(screen.getByRole('button', { name: 'Finish review →' }))
  expect(screen.getByText('📅 Review complete!')).toBeInTheDocument()
  expect(screen.getByText(/Select: mastery 3 → 4/)).toBeInTheDocument()
  expect(useProgress.getState().skills.sel.mastery).toBe(4)
})

test('a wrong attempt counts as failed recall even if solved afterwards', async () => {
  await renderReady([sqlItem('sel', exercise('e1'))])
  submit('WRONG')
  await screen.findByText(/Not quite — row mismatch/)
  submit('RIGHT')
  await screen.findByText(/Correct!/)
  fireEvent.click(screen.getByRole('button', { name: 'Finish review →' }))
  const sel = useProgress.getState().skills.sel
  expect(sel.mastery).toBe(2)
  expect(sel.interval).toBe(FIRST_INTERVAL)
})

test('using a hint marks the skill for reset', async () => {
  await renderReady([sqlItem('sel', exercise('e1'))])
  fireEvent.click(screen.getByRole('button', { name: /💡 Hint/ }))
  expect(screen.getByText('try a WHERE clause')).toBeInTheDocument()
  submit('RIGHT')
  await screen.findByText(/Correct!/)
  fireEvent.click(screen.getByRole('button', { name: 'Finish review →' }))
  expect(useProgress.getState().skills.sel.mastery).toBe(2)
})

test('exiting part-way banks outcomes for solved skills only', async () => {
  const onDone = await renderReady([
    sqlItem('sel', exercise('e1')),
    sqlItem('agg', exercise('e2')),
  ])
  submit('RIGHT')
  await screen.findByText(/Correct!/)
  fireEvent.click(screen.getByRole('button', { name: '← Exit' }))
  expect(onDone).toHaveBeenCalled()
  const s = useProgress.getState().skills
  expect(s.sel.mastery).toBe(4) // solved item banked as successful recall
  expect(s.agg.mastery).toBe(3) // untouched item left alone
  expect(s.agg.due).toBe('2026-01-01')
})

test('a code drill seeds the starter and a clean solve raises mastery', async () => {
  await renderReady([jsItem('jsk', jsExercise('j1'))])
  expect(screen.getByLabelText('code-editor')).toHaveValue('starter-code')
  submit('RIGHT', 'code-editor')
  await screen.findByText(/Correct! \+5 XP/)
  fireEvent.click(screen.getByRole('button', { name: 'Finish review →' }))
  expect(screen.getByText(/Arrays: mastery 3 → 4/)).toBeInTheDocument()
  expect(useProgress.getState().skills.jsk.mastery).toBe(4)
})

test('a failed code attempt shows test counts and counts as failed recall', async () => {
  await renderReady([jsItem('jsk', jsExercise('j1'))])
  submit('WRONG', 'code-editor')
  await screen.findByText(/0\/1 tests passing — try again\./)
  expect(screen.getByText(/✗ Test 1/)).toBeInTheDocument()
  submit('RIGHT', 'code-editor')
  await screen.findByText(/Correct!/)
  fireEvent.click(screen.getByRole('button', { name: 'Finish review →' }))
  const jsk = useProgress.getState().skills.jsk
  expect(jsk.mastery).toBe(2)
  expect(jsk.interval).toBe(FIRST_INTERVAL)
})

test('a mixed review switches from the SQL editor to the code editor', async () => {
  await renderReady([sqlItem('sel', exercise('e1')), jsItem('jsk', jsExercise('j1'))])
  submit('RIGHT')
  await screen.findByText(/Correct!/)
  fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
  expect(screen.getByText('prompt-j1')).toBeInTheDocument()
  expect(screen.getByLabelText('code-editor')).toHaveValue('starter-code')
  submit('RIGHT', 'code-editor')
  await screen.findByText(/Correct!/)
  fireEvent.click(screen.getByRole('button', { name: 'Finish review →' }))
  expect(useProgress.getState().skills.sel.mastery).toBe(4)
  expect(useProgress.getState().skills.jsk.mastery).toBe(4)
})
