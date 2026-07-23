import { expect, test } from 'vitest'
import { createSystemsDesignTrack } from './systems-design'
import type { DrillExercise } from '../content'

const drill = {
  id: 'd1',
  prompt: '',
  choices: [{ id: 'a', text: '' }, { id: 'b', text: '' }],
  answer: 'a',
  explanation: '',
  hints: [],
  xp: 15,
} as DrillExercise

test('check is correct when the chosen id is the answer', async () => {
  const track = createSystemsDesignTrack()
  const outcome = await track.check(await track.run('a'), drill)
  expect(outcome.correct).toBe(true)
  expect(outcome.reason).toBeUndefined()
})

test('check is wrong with a reason for a non-answer id', async () => {
  const track = createSystemsDesignTrack()
  const outcome = await track.check(await track.run('b'), drill)
  expect(outcome.correct).toBe(false)
  expect(typeof outcome.reason).toBe('string')
})

test('reward is always empty and example is blank', async () => {
  const track = createSystemsDesignTrack()
  expect(track.id).toBe('systems-design')
  expect(await track.reward('a', drill, { owned: new Set() })).toEqual([])
  expect(track.example({} as never)).toBe('')
})
