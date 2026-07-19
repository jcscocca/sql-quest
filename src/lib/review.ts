import { addDays, dayDiff } from './xp'
import type { Exercise, ExerciseBank } from './content'

export interface ReviewableSkill {
  mastery: number
  completed: boolean
  interval?: number
  due?: string
}

export interface Schedule {
  interval: number
  due: string
}

export interface ReviewItem {
  skillId: string
  exercise: Exercise
}

export const FIRST_INTERVAL = 2
export const MAX_INTERVAL = 30
export const REVIEW_MAX = 8
export const PER_SKILL_MAX = 2
export const REVIEW_BASE_XP = 5

export function scheduleOnComplete(today: string): Schedule {
  return { interval: FIRST_INTERVAL, due: addDays(today, FIRST_INTERVAL) }
}

export function displayedMastery(sp: ReviewableSkill, today: string): number {
  if (!sp.due || !sp.interval || today < sp.due) return sp.mastery
  const overdue = dayDiff(sp.due, today)
  return Math.max(1, sp.mastery - 1 - Math.floor(overdue / sp.interval))
}

export function reviewOutcome(sp: ReviewableSkill, success: boolean, today: string): Required<Omit<ReviewableSkill, 'completed'>> {
  if (success) {
    const interval = Math.min(MAX_INTERVAL, (sp.interval ?? FIRST_INTERVAL) * 2)
    return { mastery: Math.min(5, sp.mastery + 1), interval, due: addDays(today, interval) }
  }
  return { mastery: Math.max(1, sp.mastery - 1), interval: FIRST_INTERVAL, due: addDays(today, FIRST_INTERVAL) }
}

export function assembleReview(
  skills: Record<string, ReviewableSkill>,
  banks: Record<string, ExerciseBank>,
  today: string,
  rng: () => number = Math.random,
): ReviewItem[] {
  const pools = Object.entries(skills)
    .filter(([id, sp]) => sp.completed && sp.due && sp.interval && sp.due <= today && banks[id])
    .map(([id, sp]) => ({
      id,
      ratio: dayDiff(sp.due!, today) / sp.interval!,
      pool: shuffle([...banks[id].exercises], rng).slice(0, PER_SKILL_MAX),
    }))
    .sort((a, b) => b.ratio - a.ratio)

  const items: ReviewItem[] = []
  let round = 0
  while (items.length < REVIEW_MAX) {
    let took = false
    for (const p of pools) {
      if (items.length >= REVIEW_MAX) break
      const exercise = p.pool[round]
      if (exercise) {
        items.push({ skillId: p.id, exercise })
        took = true
      }
    }
    if (!took) break
    round++
  }
  return items
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
