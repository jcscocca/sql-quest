import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { computeXp, todayString, updateStreak, type Streak } from './xp'

export interface SkillProgress {
  solved: string[]
  completed: boolean
  mastery: number
}

export interface ProgressState {
  version: 1
  xp: number
  streak: Streak
  skills: Record<string, SkillProgress>
}

interface ProgressStore extends ProgressState {
  hydrated: boolean
  hydrate(): Promise<void>
  recordSolve(skillId: string, exerciseId: string, baseXp: number, hintsUsed: number, bankSize: number): number
  importState(imported: ProgressState): void
}

const KEY = 'sql-quest-progress'
const empty: ProgressState = { version: 1, xp: 0, streak: { count: 0, lastDay: '' }, skills: {} }

function isProgressState(x: unknown): x is ProgressState {
  if (typeof x !== 'object' || x === null) return false
  const s = x as ProgressState
  return (
    s.version === 1 &&
    typeof s.xp === 'number' &&
    typeof s.streak === 'object' && s.streak !== null &&
    typeof s.streak.count === 'number' &&
    typeof s.streak.lastDay === 'string' &&
    typeof s.skills === 'object' && s.skills !== null
  )
}

export const useProgress = create<ProgressStore>((set, get) => ({
  ...empty,
  hydrated: false,

  async hydrate() {
    const saved = await idbGet<ProgressState>(KEY)
    if (saved && !isProgressState(saved)) console.warn('Ignoring unrecognized saved progress')
    set({ ...(saved && isProgressState(saved) ? saved : empty), hydrated: true })
  },

  recordSolve(skillId, exerciseId, baseXp, hintsUsed, bankSize) {
    const s = get()
    const prev = s.skills[skillId] ?? { solved: [], completed: false, mastery: 0 }
    if (prev.solved.includes(exerciseId)) return 0
    const gained = computeXp(baseXp, hintsUsed)
    const solved = [...prev.solved, exerciseId]
    const completed = prev.completed || solved.length >= bankSize
    const next: ProgressState = {
      version: 1,
      xp: s.xp + gained,
      streak: updateStreak(s.streak.lastDay ? s.streak : null, todayString()),
      skills: { ...s.skills, [skillId]: { solved, completed, mastery: completed ? Math.max(prev.mastery, 3) : prev.mastery } },
    }
    set(next)
    void idbSet(KEY, next).catch(err => console.error('Progress persist failed', err))
    return gained
  },

  importState(imported) {
    if (!isProgressState(imported)) throw new Error('Unrecognized progress file')
    const next: ProgressState = { version: 1, xp: imported.xp, streak: imported.streak, skills: imported.skills }
    set(next)
    void idbSet(KEY, next).catch(err => console.error('Progress persist failed', err))
  },
}))

export function exportState(s: ProgressState): string {
  return JSON.stringify({ version: s.version, xp: s.xp, streak: s.streak, skills: s.skills }, null, 2)
}
