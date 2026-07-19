import { beforeEach, expect, test } from 'vitest'
import { exportState, useProgress, type ProgressState } from './progress'
import { todayString } from './xp'

beforeEach(() => {
  useProgress.setState({
    version: 1,
    xp: 0,
    streak: { count: 0, lastDay: '' },
    skills: {},
    collection: [],
    badges: [],
    hydrated: true,
  })
})

test('recordSolve awards XP and marks the exercise solved', () => {
  const gained = useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  expect(gained.gained).toBe(10)
  const s = useProgress.getState()
  expect(s.xp).toBe(10)
  expect(s.skills['select-basics'].solved).toEqual(['sb-1'])
  expect(s.skills['select-basics'].completed).toBe(false)
  expect(s.streak.count).toBe(1)
})

test('hints reduce the XP awarded', () => {
  const gained = useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 2, 2)
  expect(gained.gained).toBe(4)
})

test('re-solving the same exercise awards nothing', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  const again = useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  expect(again.gained).toBe(0)
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

test('completion is sticky when a bank grows', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  useProgress.getState().recordSolve('select-basics', 'sb-2', 10, 0, 2)
  expect(useProgress.getState().skills['select-basics'].completed).toBe(true)
  useProgress.getState().recordSolve('select-basics', 'sb-3', 10, 0, 4)
  const sk = useProgress.getState().skills['select-basics']
  expect(sk.completed).toBe(true)
  expect(sk.mastery).toBe(3)
  expect(sk.solved).toEqual(['sb-1', 'sb-2', 'sb-3'])
})

test('importState rejects malformed shapes', () => {
  expect(() => useProgress.getState().importState({ version: 1 } as unknown as ProgressState)).toThrow()
  expect(() => useProgress.getState().importState({ version: 1, xp: 'lots', streak: { count: 1, lastDay: '' }, skills: {} } as unknown as ProgressState)).toThrow()
})

test('hydrate treats a corrupt saved blob as empty', async () => {
  const { set: idbSet } = await import('idb-keyval')
  await idbSet('sql-quest-progress', { version: 1, xp: undefined })
  await useProgress.getState().hydrate()
  expect(useProgress.getState().xp).toBe(0)
})

test('newly completing a node schedules its first review', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  const res = useProgress.getState().recordSolve('select-basics', 'sb-2', 10, 0, 2)
  expect(res.newlyCompleted).toBe(true)
  const sk = useProgress.getState().skills['select-basics']
  expect(sk.interval).toBe(2)
  expect(sk.due).toBeDefined()
  const again = useProgress.getState().recordSolve('select-basics', 'sb-3', 10, 0, 4)
  expect(again.newlyCompleted).toBe(false)
})

test('addCatches unions and reports only fresh names', () => {
  expect(useProgress.getState().addCatches(['pikachu', 'mew'])).toEqual(['pikachu', 'mew'])
  expect(useProgress.getState().addCatches(['mew', 'eevee'])).toEqual(['eevee'])
  expect(useProgress.getState().collection).toEqual(['pikachu', 'mew', 'eevee'])
})

test('awardBadge is idempotent', () => {
  useProgress.getState().awardBadge('select-basics')
  useProgress.getState().awardBadge('select-basics')
  expect(useProgress.getState().badges).toEqual(['select-basics'])
})

test('recordReview applies the scheduling outcome', () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 1)
  useProgress.getState().recordReview('select-basics', true)
  const sk = useProgress.getState().skills['select-basics']
  expect(sk.mastery).toBe(4)
  expect(sk.interval).toBe(4)
})

test('recordReviewSolve awards reduced XP and updates streak', () => {
  const gained = useProgress.getState().recordReviewSolve(0)
  expect(gained).toBe(5)
  expect(useProgress.getState().xp).toBe(5)
  expect(useProgress.getState().streak.count).toBe(1)
})

test('stage 1 saves without collection/badges hydrate with defaults', async () => {
  const { set: idbSet } = await import('idb-keyval')
  await idbSet('sql-quest-progress', {
    version: 1,
    xp: 42,
    streak: { count: 3, lastDay: '2026-07-18' },
    skills: {},
  })
  await useProgress.getState().hydrate()
  expect(useProgress.getState().xp).toBe(42)
  expect(useProgress.getState().collection).toEqual([])
  expect(useProgress.getState().badges).toEqual([])
})

test('stage 1 completed skills get a review schedule backfilled on hydrate', async () => {
  const { set: idbSet } = await import('idb-keyval')
  await idbSet('sql-quest-progress', {
    version: 1,
    xp: 10,
    streak: { count: 1, lastDay: '2026-07-18' },
    skills: { 'select-basics': { solved: ['sb-1', 'sb-2'], completed: true, mastery: 3 } },
  })
  await useProgress.getState().hydrate()
  const sk = useProgress.getState().skills['select-basics']
  expect(sk.interval).toBe(2)
  expect(sk.due).toBe(todayString())
})
