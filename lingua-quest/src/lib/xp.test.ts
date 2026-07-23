import { describe, expect, it } from 'vitest'
import { addDays, computeXp, dayDiff, todayString, updateStreak } from './xp'

describe('computeXp', () => {
  it('gives full XP with no hints', () => {
    expect(computeXp(10, 0)).toBe(10)
  })
  it('docks 3 XP per hint', () => {
    expect(computeXp(12, 2)).toBe(6)
  })
  it('never drops below a floor of 2', () => {
    expect(computeXp(10, 5)).toBe(2)
  })
})

describe('updateStreak', () => {
  it('starts a streak from nothing', () => {
    expect(updateStreak(null, '2026-07-23')).toEqual({ count: 1, lastDay: '2026-07-23' })
  })
  it('leaves the streak unchanged on the same day', () => {
    const prev = { count: 4, lastDay: '2026-07-23' }
    expect(updateStreak(prev, '2026-07-23')).toBe(prev)
  })
  it('increments on the next day', () => {
    expect(updateStreak({ count: 4, lastDay: '2026-07-23' }, '2026-07-24')).toEqual({ count: 5, lastDay: '2026-07-24' })
  })
  it('resets after a gap', () => {
    expect(updateStreak({ count: 9, lastDay: '2026-07-20' }, '2026-07-24')).toEqual({ count: 1, lastDay: '2026-07-24' })
  })
})

describe('date helpers', () => {
  it('formats today as YYYY-MM-DD', () => {
    expect(todayString(new Date('2026-03-05T12:00:00Z'))).toBe('2026-03-05')
  })
  it('adds and diffs days', () => {
    expect(addDays('2026-07-23', 4)).toBe('2026-07-27')
    expect(dayDiff('2026-07-23', '2026-07-27')).toBe(4)
  })
})
