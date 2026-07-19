import { expect, test } from 'vitest'
import {
  assembleReview,
  displayedMastery,
  reviewOutcome,
  scheduleOnComplete,
  type ReviewableSkill,
} from './review'
import type { ExerciseBank } from './content'

const seq = (...vals: number[]) => {
  let i = 0
  return () => vals[i++ % vals.length]
}

const skill = (over: Partial<ReviewableSkill> = {}): ReviewableSkill => ({
  mastery: 3,
  completed: true,
  interval: 2,
  due: '2026-07-19',
  ...over,
})

const bank = (skillId: string, n: number): ExerciseBank => ({
  skillId,
  exercises: Array.from({ length: n }, (_, i) => ({
    id: `${skillId}-${i + 1}`,
    prompt: 'p',
    referenceSql: 'SELECT 1',
    orderMatters: false,
    hints: ['a', 'b', 'c'],
    xp: 10,
  })),
})

test('completing a node schedules first review in 2 days', () => {
  expect(scheduleOnComplete('2026-07-19')).toEqual({ interval: 2, due: '2026-07-21' })
})

test('displayed mastery holds until due, then drops per full overdue interval', () => {
  expect(displayedMastery(skill({ due: '2026-07-20' }), '2026-07-19')).toBe(3)
  expect(displayedMastery(skill({ due: '2026-07-19' }), '2026-07-19')).toBe(2)
  expect(displayedMastery(skill({ due: '2026-07-19' }), '2026-07-20')).toBe(2)
  expect(displayedMastery(skill({ due: '2026-07-19' }), '2026-07-21')).toBe(1)
  expect(displayedMastery(skill({ mastery: 5, due: '2026-07-01', interval: 2 }), '2026-07-19')).toBe(1)
})

test('unscheduled skills never display decay', () => {
  expect(displayedMastery({ mastery: 3, completed: true }, '2026-07-19')).toBe(3)
})

test('successful review raises mastery and doubles interval capped at 30', () => {
  expect(reviewOutcome(skill(), true, '2026-07-19')).toEqual({ mastery: 4, interval: 4, due: '2026-07-23' })
  expect(reviewOutcome(skill({ mastery: 5, interval: 20 }), true, '2026-07-19')).toEqual({
    mastery: 5,
    interval: 30,
    due: '2026-08-18',
  })
})

test('failed review lowers mastery and resets interval', () => {
  expect(reviewOutcome(skill({ mastery: 4, interval: 8 }), false, '2026-07-19')).toEqual({
    mastery: 3,
    interval: 2,
    due: '2026-07-21',
  })
  expect(reviewOutcome(skill({ mastery: 1 }), false, '2026-07-19')).toMatchObject({ mastery: 1 })
})

test('assembly takes only due, completed skills', () => {
  const items = assembleReview(
    {
      a: skill({ due: '2026-07-18' }),
      b: skill({ due: '2026-07-25' }),
      c: { mastery: 0, completed: false, interval: 2, due: '2026-07-01' },
    },
    { a: bank('a', 6), b: bank('b', 6), c: bank('c', 6) },
    '2026-07-19',
    seq(0),
  )
  expect(items.every(i => i.skillId === 'a')).toBe(true)
})

test('assembly caps at 2 exercises per skill and 8 total, most overdue first', () => {
  const skills = {
    fresh: skill({ due: '2026-07-19', interval: 10 }),
    rusty: skill({ due: '2026-07-01', interval: 2 }),
    mid: skill({ due: '2026-07-15', interval: 4 }),
    d4: skill({ due: '2026-07-16', interval: 4 }),
    d5: skill({ due: '2026-07-17', interval: 4 }),
  }
  const banks = Object.fromEntries(Object.keys(skills).map(k => [k, bank(k, 6)]))
  const items = assembleReview(skills, banks, '2026-07-19', seq(0))
  expect(items.length).toBe(8)
  expect(items[0].skillId).toBe('rusty')
  for (const id of Object.keys(skills))
    expect(items.filter(i => i.skillId === id).length).toBeLessThanOrEqual(2)
})

test('assembly with one due skill yields at most 2 items', () => {
  const items = assembleReview({ a: skill({ due: '2026-07-01' }) }, { a: bank('a', 6) }, '2026-07-19', seq(0))
  expect(items.length).toBe(2)
})
