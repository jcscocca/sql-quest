export interface Streak {
  count: number
  lastDay: string
}

/** XP for a solve, reduced per hint used, never below a floor of 2. */
export function computeXp(base: number, hintsUsed: number): number {
  return Math.max(base - 3 * hintsUsed, 2)
}

export function updateStreak(prev: Streak | null, today: string): Streak {
  if (!prev || !prev.lastDay) return { count: 1, lastDay: today }
  const days = (Date.parse(today) - Date.parse(prev.lastDay)) / 86_400_000
  if (days === 0) return prev
  if (days === 1) return { count: prev.count + 1, lastDay: today }
  return { count: 1, lastDay: today }
}

export function todayString(d = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10)
}

export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
}
