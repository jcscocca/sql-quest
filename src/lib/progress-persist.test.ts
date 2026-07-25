import { beforeEach, expect, test, vi } from 'vitest'

// fake-indexeddb never rejects, so a write failure (quota exceeded, private
// browsing) needs a stand-in store that can be told to fail on demand.
const h = vi.hoisted(() => ({ store: new Map<string, unknown>(), failNextWrite: false }))

vi.mock('idb-keyval', () => ({
  get: async (key: string) => h.store.get(key),
  set: async (key: string, value: unknown) => {
    if (h.failNextWrite) {
      h.failNextWrite = false
      throw new Error('QuotaExceededError')
    }
    h.store.set(key, value)
  },
  clear: async () => h.store.clear(),
}))

const { useProgress } = await import('./progress')

const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  h.store.clear()
  h.failNextWrite = false
  useProgress.setState({ ...useProgress.getInitialState(), hydrated: true }, true)
})

test('a write that succeeds leaves saveFailed false', async () => {
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  await flush()
  expect(useProgress.getState().saveFailed).toBe(false)
  expect(h.store.get('sql-quest-progress')).toBeDefined()
})

test('a rejected write flags saveFailed so the home screen can warn', async () => {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  h.failNextWrite = true
  useProgress.getState().recordSolve('select-basics', 'sb-1', 10, 0, 2)
  await flush()
  expect(useProgress.getState().saveFailed).toBe(true)
  // the in-memory state still advanced — that is exactly why the warning matters
  expect(useProgress.getState().xp).toBe(10)
  quiet.mockRestore()
})
