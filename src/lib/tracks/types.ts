import type { QueryResult } from '../compare'
import type { Exercise, Skill, WorldSchema } from '../content'

export interface CheckOutcome {
  correct: boolean
  reason?: string
}

export interface Catch {
  name: string
  label: string
}

export interface RewardContext {
  owned: Set<string>
}

export interface Track<R = QueryResult, E = Exercise> {
  id: string
  /** Load any engine state the exercises in this skill need. SQL: load the world's tables. */
  prepare(skill: Skill | undefined, schema: WorldSchema | undefined): Promise<void>
  /** Run the learner's submission and return the result the UI renders. */
  run(submission: string): Promise<R>
  /** Judge a run result against the exercise. SQL: run the reference query and diff. */
  check(result: R, exercise: E): Promise<CheckOutcome>
  /** Collectibles earned from a correct solve. SQL: entities in the result cells. Others: []. */
  reward(result: R, exercise: E, ctx: RewardContext): Promise<Catch[]>
  /** Starter text to prefill the editor. */
  example(skill: Skill): string
}
