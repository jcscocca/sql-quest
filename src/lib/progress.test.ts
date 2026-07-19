import { beforeEach, expect, test } from 'vitest'
import { exportState, useProgress, type ProgressState } from './progress'

beforeEach(() => {
  useProgress.setState({ version: 1, xp: 0, streak: { count: 0, lastDay: '' }, skills: {}, hydrated: true })
})

test('recordSolve awards XP and marks the exercise solved', () => {
  const gained = useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  expect(gained).toBe(10)
  const s = useProgress.getState()
  expect(s.xp).toBe(10)
  expect(s.skills['select-basics'].solved).toEqual(['sb-1'])
  expect(s.skills['select-basics'].completed).toBe(false)
  expect(s.streak.count).toBe(1)
})

test('hints reduce the XP awarded', () => {
  const gained = useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 2, 2)
  expect(gained).toBe(4)
})

test('re-solving the same exercise awards nothing', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  const again = useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  expect(again).toBe(0)
  expect(useProgress.getState().xp).toBe(10)
})

test('solving the whole bank completes the skill at mastery 3', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  useProgress.getState().recordSolve('select-basics', 'sb-2', 10, 0, 2)
  const sk = useProgress.getState().skills['select-basics']
  expect(sk.completed).toBe(true)
  expect(sk.mastery).toBe(3)
})

test('hydrate loads defaults when nothing is saved', async () => {
  await useProgress.getState().hydrate()
  expect(useProgress.getState().xp).toBe(0)
  expect(useProgress.getState().hydrated).toBe(true)
})

test('importState rejects unknown versions', () => {
  expect(() =>
    useProgress.getState().importState({ version: 99 } as unknown as ProgressState),
  ).toThrow()
})

test('exportState round-trips through importState', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  const json = exportState(useProgress.getState())
  useProgress.setState({ version: 1, xp: 0, streak: { count: 0, lastDay: '' }, skills: {}, hydrated: true })
  useProgress.getState().importState(JSON.parse(json) as ProgressState)
  expect(useProgress.getState().xp).toBe(10)
})
