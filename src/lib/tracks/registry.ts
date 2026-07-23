import type { Skill } from '../content'
import { createSqlTrack, type SqlDeps } from './sql'
import type { Track } from './types'

// Phase 0: every skill is a SQL skill. A later phase dispatches on a skill track id.
export function getTrack(_skill: Skill, deps: SqlDeps): Track {
  return createSqlTrack(deps)
}
