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

export interface Track {
  id: string
  /** Load any engine state the exercises in this skill need. SQL: load the world's tables. */
  prepare(skill: Skill | undefined, schema: WorldSchema | undefined): Promise<void>
  /** Run the learner's submission and return the result the UI grid renders. */
  run(submission: string): Promise<QueryResult>
  /** Judge a run result against the exercise. SQL: run the reference query and diff. */
  check(result: QueryResult, exercise: Exercise): Promise<CheckOutcome>
  /** Collectibles earned from a correct solve. SQL: entities in the result cells. Others: []. */
  reward(result: QueryResult, exercise: Exercise, ctx: RewardContext): Promise<Catch[]>
  /** Starter text to prefill the editor. */
  example(skill: Skill): string
}
