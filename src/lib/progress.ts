import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { computeXp, todayString, updateStreak, type Streak } from './xp'
import { FIRST_INTERVAL, REVIEW_BASE_XP, reviewOutcome, scheduleOnComplete } from './review'

export interface SkillProgress {
  solved: string[]
  completed: boolean
  mastery: number
  interval?: number
  due?: string
}

export interface ProgressState {
  version: 1
  xp: number
  streak: Streak
  skills: Record<string, SkillProgress>
  collection: string[]
  badges: string[]
}

export interface SolveResult {
  gained: number
  newlyCompleted: boolean
}

interface ProgressStore extends ProgressState {
  hydrated: boolean
  hydrate(): Promise<void>
  recordSolve(skillId: string, exerciseId: string, baseXp: number, hintsUsed: number, bankSize: number): SolveResult
  addCatches(names: string[]): string[]
  awardBadge(id: string): void
  recordReview(skillId: string, success: boolean): void
  recordReviewSolve(hintsUsed: number): number
  importState(imported: ProgressState): void
}

const KEY = 'sql-quest-progress'
const empty: ProgressState = {
  version: 1,
  xp: 0,
  streak: { count: 0, lastDay: '' },
  skills: {},
  collection: [],
  badges: [],
}

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

function normalize(s: ProgressState): ProgressState {
  const today = todayString()
  const skills: Record<string, SkillProgress> = {}
  for (const [id, sp] of Object.entries(s.skills ?? {})) {
    skills[id] =
      sp.completed && (!sp.interval || !sp.due)
        ? { ...sp, interval: FIRST_INTERVAL, due: today }
        : sp
  }
  return {
    ...s,
    skills,
    collection: Array.isArray(s.collection) ? s.collection : [],
    badges: Array.isArray(s.badges) ? s.badges : [],
  }
}

function dataOf(s: ProgressStore): ProgressState {
  return { version: 1, xp: s.xp, streak: s.streak, skills: s.skills, collection: s.collection, badges: s.badges }
}

function persist(next: ProgressState): void {
  void idbSet(KEY, next).catch(err => console.error('Progress persist failed', err))
}

export const useProgress = create<ProgressStore>((set, get) => ({
  ...empty,
  hydrated: false,

  async hydrate() {
    let saved: ProgressState | undefined
    try {
      saved = await idbGet<ProgressState>(KEY)
    } catch (err) {
      console.error('Failed to read saved progress', err)
    }
    if (saved && !isProgressState(saved)) console.warn('Ignoring unrecognized saved progress')
    if (saved && isProgressState(saved)) {
      const normalized = normalize(saved)
      if (JSON.stringify(normalized) !== JSON.stringify(saved)) persist(normalized)
      set({ ...normalized, hydrated: true })
    } else {
      set({ ...empty, hydrated: true })
    }
  },

  recordSolve(skillId, exerciseId, baseXp, hintsUsed, bankSize) {
    const s = get()
    const prev = s.skills[skillId] ?? { solved: [], completed: false, mastery: 0 }
    if (prev.solved.includes(exerciseId)) return { gained: 0, newlyCompleted: false }
    const gained = computeXp(baseXp, hintsUsed)
    const solved = [...prev.solved, exerciseId]
    const completed = prev.completed || solved.length >= bankSize
    const newlyCompleted = completed && !prev.completed
    const today = todayString()
    const schedule = newlyCompleted
      ? scheduleOnComplete(today)
      : { interval: prev.interval, due: prev.due }
    const next: ProgressState = {
      ...dataOf(s),
      xp: s.xp + gained,
      streak: updateStreak(s.streak.lastDay ? s.streak : null, today),
      skills: {
        ...s.skills,
        [skillId]: {
          solved,
          completed,
          mastery: completed ? Math.max(prev.mastery, 3) : prev.mastery,
          interval: schedule.interval,
          due: schedule.due,
        },
      },
    }
    set(next)
    persist(next)
    return { gained, newlyCompleted }
  },

  addCatches(names) {
    if (names.length === 0) return []
    const s = get()
    const fresh = names.filter(n => !s.collection.includes(n))
    if (fresh.length === 0) return []
    const next: ProgressState = { ...dataOf(s), collection: [...s.collection, ...fresh] }
    set(next)
    persist(next)
    return fresh
  },

  awardBadge(id) {
    const s = get()
    if (s.badges.includes(id)) return
    const next: ProgressState = { ...dataOf(s), badges: [...s.badges, id] }
    set(next)
    persist(next)
  },

  recordReview(skillId, success) {
    const s = get()
    const prev = s.skills[skillId]
    if (!prev) return
    const next: ProgressState = {
      ...dataOf(s),
      skills: { ...s.skills, [skillId]: { ...prev, ...reviewOutcome(prev, success, todayString()) } },
    }
    set(next)
    persist(next)
  },

  recordReviewSolve(hintsUsed) {
    const s = get()
    const gained = computeXp(REVIEW_BASE_XP, hintsUsed)
    const next: ProgressState = {
      ...dataOf(s),
      xp: s.xp + gained,
      streak: updateStreak(s.streak.lastDay ? s.streak : null, todayString()),
    }
    set(next)
    persist(next)
    return gained
  },

  importState(imported) {
    if (!isProgressState(imported)) throw new Error('Unrecognized progress file')
    const next = normalize({
      version: 1,
      xp: imported.xp,
      streak: imported.streak,
      skills: imported.skills,
      collection: imported.collection,
      badges: imported.badges,
    })
    set(next)
    persist(next)
  },
}))

export function exportState(s: ProgressState): string {
  return JSON.stringify(
    { version: s.version, xp: s.xp, streak: s.streak, skills: s.skills, collection: s.collection, badges: s.badges },
    null,
    2,
  )
}
