import type { QueryResult } from '../compare'
import type { Exercise, Skill } from '../content'
import { createSqlTrack, type SqlDeps } from './sql'
import type { Track } from './types'

// SQL skills route here; other tracks are constructed by their own screens.
export function getTrack(_skill: Skill, deps: SqlDeps): Track<QueryResult, Exercise> {
  return createSqlTrack(deps)
}
