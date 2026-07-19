import { expect, test } from 'vitest'
import { addDays, computeXp, dayDiff, todayString, updateStreak } from './xp'

test('full XP with no hints', () => {
  expect(computeXp(10, 0)).toBe(10)
})

test('each hint costs 3 XP', () => {
  expect(computeXp(10, 1)).toBe(7)
  expect(computeXp(10, 2)).toBe(4)
})

test('XP never drops below 2', () => {
  expect(computeXp(10, 3)).toBe(2)
  expect(computeXp(10, 5)).toBe(2)
})

test('first ever practice starts a streak of 1', () => {
  expect(updateStreak(null, '2026-07-18')).toEqual({ count: 1, lastDay: '2026-07-18' })
})

test('same-day practice leaves streak unchanged', () => {
  expect(updateStreak({ count: 4, lastDay: '2026-07-18' }, '2026-07-18')).toEqual({ count: 4, lastDay: '2026-07-18' })
})

test('next-day practice increments streak', () => {
  expect(updateStreak({ count: 4, lastDay: '2026-07-17' }, '2026-07-18')).toEqual({ count: 5, lastDay: '2026-07-18' })
})

test('a gap resets the streak to 1', () => {
  expect(updateStreak({ count: 9, lastDay: '2026-07-10' }, '2026-07-18')).toEqual({ count: 1, lastDay: '2026-07-18' })
})

test('todayString formats as YYYY-MM-DD', () => {
  expect(todayString(new Date(2026, 6, 18))).toBe('2026-07-18')
})

test('future lastDay (clock rollback) resets to 1', () => {
  expect(updateStreak({ count: 4, lastDay: '2026-07-20' }, '2026-07-18')).toEqual({ count: 1, lastDay: '2026-07-18' })
})

test('malformed lastDay resets to 1', () => {
  expect(updateStreak({ count: 4, lastDay: 'banana' }, '2026-07-18')).toEqual({ count: 1, lastDay: '2026-07-18' })
})

test('todayString pads single-digit day and month', () => {
  expect(todayString(new Date(2026, 2, 5))).toBe('2026-03-05')
})

test('addDays walks forward across month boundaries', () => {
  expect(addDays('2026-07-30', 2)).toBe('2026-08-01')
  expect(addDays('2026-07-19', 30)).toBe('2026-08-18')
})

test('dayDiff counts whole days between ISO dates', () => {
  expect(dayDiff('2026-07-19', '2026-07-21')).toBe(2)
  expect(dayDiff('2026-07-21', '2026-07-19')).toBe(-2)
  expect(dayDiff('2026-07-19', '2026-07-19')).toBe(0)
})
