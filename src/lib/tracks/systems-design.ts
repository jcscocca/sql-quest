import type { DrillExercise } from '../content'
import type { CheckOutcome, Track } from './types'

export function createSystemsDesignTrack(): Track<string, DrillExercise> {
  return {
    id: 'systems-design',

    prepare() {
      return Promise.resolve()
    },

    run(submission: string) {
      return Promise.resolve(submission)
    },

    check(choiceId: string, drill: DrillExercise): Promise<CheckOutcome> {
      return Promise.resolve(
        choiceId === drill.answer
          ? { correct: true }
          : { correct: false, reason: 'not the best fit here' },
      )
    },

    reward() {
      return Promise.resolve([])
    },

    example() {
      return ''
    },
  }
}
