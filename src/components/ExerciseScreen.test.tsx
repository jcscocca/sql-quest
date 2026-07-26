// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ExerciseScreen } from './ExerciseScreen'
import { useProgress } from '../lib/progress'
import type { Exercise, ExerciseBank, Region, Skill, WorldSchema } from '../lib/content'

const h = vi.hoisted(() => ({
  prepareImpl: (): Promise<void> => Promise.resolve(),
  rewardImpl: (): Promise<{ name: string; label: string }[]> => Promise.resolve([]),
}))

vi.mock('../lib/duckdb', () => ({ loadWorld: vi.fn(), runQuery: vi.fn() }))
vi.mock('../lib/sprites', () => ({
  loadManifest: () => Promise.resolve(null),
  spriteUrl: () => null,
}))
vi.mock('./Editor', () => ({
  Editor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="editor" value={value} onChange={e => onChange(e.target.value)} />
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
    reward: () => h.rewardImpl(),
    example: () => 'SELECT example',
  }),
}))

const schema: WorldSchema = {
  world: 'pokemon',
  name: 'Pokemon',
  tables: [{ name: 'pokemon', description: '', columns: [{ name: 'name', type: 'text', description: '' }] }],
}
const skill: Skill = {
  id: 'sel',
  name: 'Select',
  world: 'pokemon',
  requires: [],
  lesson: { intro: 'Rows come back with SELECT.', exampleSql: 'SELECT 1', wrapUp: 'Nice work.' },
}
const exercise = (id: string): Exercise => ({
  id, prompt: `prompt-${id}`, referenceSql: 'SELECT 1', orderMatters: false, hints: ['think small'], xp: 10,
})
const bank: ExerciseBank = { skillId: 'sel', exercises: [exercise('e1'), exercise('e2')] }
const region: Region = { id: 'r1', name: 'Region 1', skills: [skill] }

beforeEach(() => {
  h.prepareImpl = () => Promise.resolve()
  h.rewardImpl = () => Promise.resolve([])
  useProgress.setState({ ...useProgress.getInitialState(), hydrated: true }, true)
})
afterEach(cleanup)

function renderScreen(onBack = vi.fn()) {
  render(<ExerciseScreen skill={skill} bank={bank} schema={schema} region={region} onBack={onBack} />)
  return onBack
}

async function startExercises() {
  fireEvent.click(screen.getByRole('button', { name: 'Start exercises' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /Run/ })).toBeEnabled())
}

function submit(text: string) {
  fireEvent.change(screen.getByLabelText('editor'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
}

test('shows the lesson first; "Try the example" prefills the editor', () => {
  renderScreen()
  expect(screen.getByText('Rows come back with SELECT.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try the example' }))
  expect(screen.getByLabelText('editor')).toHaveValue('SELECT example')
})

test('a wrong answer shows feedback and awards nothing', async () => {
  renderScreen()
  await startExercises()
  submit('WRONG')
  await screen.findByText(/Not quite — row mismatch/)
  expect(useProgress.getState().xp).toBe(0)
})

test('solving the bank awards XP, catches, badges, and the completion card', async () => {
  h.rewardImpl = () => Promise.resolve([{ name: 'pikachu', label: 'electric' }])
  renderScreen()
  await startExercises()
  submit('RIGHT')
  await screen.findByText(/Correct! \+10 XP/)
  expect(screen.getByText(/Caught:/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
  submit('RIGHT')
  await screen.findByText(/Correct!/)
  fireEvent.click(screen.getByRole('button', { name: 'Finish node →' }))
  expect(screen.getByText('🏅 Select complete!')).toBeInTheDocument()
  expect(screen.getByText(/Caught this node: pikachu/)).toBeInTheDocument()
  const s = useProgress.getState()
  expect(s.xp).toBe(20)
  expect(s.skills.sel.completed).toBe(true)
  expect(s.collection).toEqual([{ world: 'pokemon', name: 'pikachu', label: 'electric' }])
  expect(s.badges).toEqual(['sel', 'region:r1'])
})

test('an engine failure surfaces and keeps Run disabled', async () => {
  h.prepareImpl = () => Promise.reject(new Error('wasm exploded'))
  renderScreen()
  fireEvent.click(screen.getByRole('button', { name: 'Start exercises' }))
  await screen.findByText(/Engine failed: Error: wasm exploded/)
  expect(screen.getByRole('button', { name: /Run/ })).toBeDisabled()
})
