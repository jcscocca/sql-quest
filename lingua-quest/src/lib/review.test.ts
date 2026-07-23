import { describe, expect, it } from 'vitest'
import {
  assembleReview,
  displayedMastery,
  reviewOutcome,
  scheduleOnComplete,
  type ReviewableSkill,
} from './review'
import type { SkillBank } from './content'

function bank(skillId: string, n: number): SkillBank {
  return {
    skillId,
    exercises: Array.from({ length: n }, (_, i) => ({
      type: 'choice' as const, id: `${skillId}-${i}`, xp: 10, prompt: 'p', promptLang: 'en' as const,
      choices: ['a', 'b'], answer: 'a',
    })),
  }
}

describe('scheduleOnComplete', () => {
  it('schedules the first review two days out', () => {
    expect(scheduleOnComplete('2026-07-23')).toEqual({ interval: 2, due: '2026-07-25' })
  })
})

describe('displayedMastery', () => {
  const sp: ReviewableSkill = { mastery: 4, completed: true, interval: 2, due: '2026-07-25' }
  it('shows full mastery before the due date', () => {
    expect(displayedMastery(sp, '2026-07-24')).toBe(4)
  })
  it('decays by one as soon as it is due', () => {
    expect(displayedMastery(sp, '2026-07-25')).toBe(3)
  })
  it('decays further the more overdue it is, flooring at 1', () => {
    expect(displayedMastery(sp, '2026-07-29')).toBe(1)
  })
})

describe('reviewOutcome', () => {
  it('doubles the interval and raises mastery on success', () => {
    expect(reviewOutcome({ mastery: 3, completed: true, interval: 2 }, true, '2026-07-23')).toEqual({
      mastery: 4, interval: 4, due: '2026-07-27',
    })
  })
  it('caps mastery at 5 and interval at 30', () => {
    expect(reviewOutcome({ mastery: 5, completed: true, interval: 30 }, true, '2026-07-23')).toEqual({
      mastery: 5, interval: 30, due: '2026-08-22',
    })
  })
  it('resets the interval and drops mastery on failure', () => {
    expect(reviewOutcome({ mastery: 3, completed: true, interval: 8 }, false, '2026-07-23')).toEqual({
      mastery: 2, interval: 2, due: '2026-07-25',
    })
  })
})

describe('assembleReview', () => {
  const today = '2026-07-23'
  const skills: Record<string, ReviewableSkill> = {
    a: { mastery: 3, completed: true, interval: 2, due: '2026-07-22' }, // overdue
    b: { mastery: 3, completed: true, interval: 2, due: '2026-07-23' }, // due today
    c: { mastery: 3, completed: true, interval: 2, due: '2026-07-30' }, // not due yet
    d: { mastery: 0, completed: false }, // not completed
  }
  const banks = { a: bank('a', 5), b: bank('b', 5), c: bank('c', 5) }

  it('only surfaces completed, due skills', () => {
    const items = assembleReview(skills, banks, today, () => 0)
    const ids = new Set(items.map(i => i.skillId))
    expect(ids.has('c')).toBe(false)
    expect(ids.has('d')).toBe(false)
    expect([...ids].every(id => id === 'a' || id === 'b')).toBe(true)
  })

  it('caps per skill and overall', () => {
    const items = assembleReview(skills, banks, today, () => 0)
    expect(items.length).toBeLessThanOrEqual(8)
    expect(items.filter(i => i.skillId === 'a').length).toBeLessThanOrEqual(2)
    expect(items.filter(i => i.skillId === 'b').length).toBeLessThanOrEqual(2)
  })

  it('puts the most-overdue skill first', () => {
    const items = assembleReview(skills, banks, today, () => 0)
    expect(items[0].skillId).toBe('a')
  })

  it('returns nothing when no skill is due', () => {
    expect(assembleReview({ c: skills.c }, { c: banks.c }, today, () => 0)).toEqual([])
  })
})
