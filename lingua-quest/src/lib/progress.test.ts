import { beforeEach, describe, expect, it } from 'vitest'
import { exportState, useProgress, type ProgressState } from './progress'
import { addDays, todayString } from './xp'

function reset() {
  useProgress.setState({
    version: 1, xp: 0, streak: { count: 0, lastDay: '' },
    skills: {}, vocab: [], badges: [], unlockAll: false, hydrated: true,
  })
}

beforeEach(reset)

describe('recordSolve', () => {
  it('awards XP and records the solve', () => {
    const res = useProgress.getState().recordSolve('greetings', 'g1', 10, 0, 3)
    expect(res.gained).toBe(10)
    expect(useProgress.getState().xp).toBe(10)
    expect(useProgress.getState().skills.greetings.solved).toEqual(['g1'])
  })

  it('does not double-count the same exercise', () => {
    useProgress.getState().recordSolve('greetings', 'g1', 10, 0, 3)
    const again = useProgress.getState().recordSolve('greetings', 'g1', 10, 0, 3)
    expect(again).toEqual({ gained: 0, newlyCompleted: false })
    expect(useProgress.getState().xp).toBe(10)
  })

  it('docks XP for hints', () => {
    const res = useProgress.getState().recordSolve('greetings', 'g1', 10, 2, 3)
    expect(res.gained).toBe(4)
  })

  it('completes the skill and schedules review once the bank is exhausted', () => {
    const store = useProgress.getState()
    store.recordSolve('greetings', 'g1', 10, 0, 2)
    const last = store.recordSolve('greetings', 'g2', 10, 0, 2)
    expect(last.newlyCompleted).toBe(true)
    const sp = useProgress.getState().skills.greetings
    expect(sp.completed).toBe(true)
    expect(sp.mastery).toBe(3)
    const today = todayString()
    expect(sp.due).toBe(addDays(today, 2))
    expect(sp.interval).toBe(2)
  })

  it('starts a streak on the first solve', () => {
    useProgress.getState().recordSolve('greetings', 'g1', 10, 0, 3)
    expect(useProgress.getState().streak.count).toBe(1)
  })
})

describe('addVocab', () => {
  it('adds words and dedupes by course + es', () => {
    const store = useProgress.getState()
    const added = store.addVocab('es', [{ es: 'hola', en: 'hello' }, { es: 'adiós', en: 'goodbye' }])
    expect(added).toHaveLength(2)
    const dup = useProgress.getState().addVocab('es', [{ es: 'hola', en: 'hello' }])
    expect(dup).toHaveLength(0)
    expect(useProgress.getState().vocab).toHaveLength(2)
  })

  it('keeps the same word separate across courses', () => {
    useProgress.getState().addVocab('es', [{ es: 'no', en: 'no' }])
    const other = useProgress.getState().addVocab('fr', [{ es: 'no', en: 'no' }])
    expect(other).toHaveLength(1)
  })
})

describe('badges', () => {
  it('awards a badge once', () => {
    const store = useProgress.getState()
    store.awardBadge('greetings')
    store.awardBadge('greetings')
    expect(useProgress.getState().badges).toEqual(['greetings'])
  })
})

describe('review scoring', () => {
  it('raises mastery on a successful review', () => {
    useProgress.getState().recordSolve('greetings', 'g1', 10, 0, 1) // completes → mastery 3
    useProgress.getState().recordReview('greetings', true)
    expect(useProgress.getState().skills.greetings.mastery).toBe(4)
  })

  it('recordReviewSolve grants XP', () => {
    const gained = useProgress.getState().recordReviewSolve(0)
    expect(gained).toBe(5)
    expect(useProgress.getState().xp).toBe(5)
  })
})

describe('export / import', () => {
  it('round-trips state', () => {
    const store = useProgress.getState()
    store.recordSolve('greetings', 'g1', 10, 0, 3)
    store.addVocab('es', [{ es: 'hola', en: 'hello' }])
    const json = JSON.parse(exportState(useProgress.getState())) as ProgressState
    reset()
    useProgress.getState().importState(json)
    expect(useProgress.getState().xp).toBe(10)
    expect(useProgress.getState().vocab).toHaveLength(1)
  })

  it('rejects a malformed import', () => {
    expect(() => useProgress.getState().importState({ nope: true } as unknown as ProgressState)).toThrow()
  })
})

describe('setUnlockAll', () => {
  it('toggles free roam', () => {
    useProgress.getState().setUnlockAll(true)
    expect(useProgress.getState().unlockAll).toBe(true)
  })
})
