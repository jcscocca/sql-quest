export interface WorldSchema {
  world: string
  name: string
  tables: TableSchema[]
  entity?: { table: string; column: string; labelColumn?: string }
}

export interface TableSchema {
  name: string
  description: string
  columns: { name: string; type: string; description: string }[]
}

export interface Curriculum {
  regions: Region[]
}

export interface Region {
  id: string
  name: string
  world?: string
  skills: Skill[]
}

export interface Skill {
  id: string
  name: string
  world?: string
  trackId?: 'sql' | 'systems-design' | 'javascript' | 'python'
  format?: 'drills' | 'case'
  requires: string[]
  lesson: { intro: string; exampleSql: string; wrapUp?: string }
}

export interface Exercise {
  id: string
  prompt: string
  referenceSql: string
  orderMatters: boolean
  hints: string[]
  xp: number
  collectibles?: string[]
}

export interface ExerciseBank {
  skillId: string
  exercises: Exercise[]
}

export interface DrillChoice {
  id: string
  text: string
}

export interface DrillExercise {
  id: string
  prompt: string
  scenario?: string
  choices: DrillChoice[]
  answer: string
  explanation: string
  hints: string[]
  xp: number
}

export interface DrillBank {
  skillId: string
  exercises: DrillExercise[]
}

export interface CaseStep {
  id: string
  label: string
  prompt: string
  choices: DrillChoice[]
  answer: string
  explanation: string
  hints: string[]
  xp: number
}

export interface CaseBuildBank {
  skillId: string
  title: string
  scenario: string
  steps: CaseStep[]
}

export interface JsTest {
  input: unknown[]
  expected: unknown
}

export interface JsExercise {
  id: string
  prompt: string
  functionName: string
  starter: string
  /** Reference implementation, used only by validate — never shown in the UI. */
  solution: string
  tests: JsTest[]
  hints: string[]
  xp: number
}

export interface JsBank {
  skillId: string
  exercises: JsExercise[]
}

export interface PyExercise {
  id: string
  prompt: string
  functionName: string
  starter: string
  /** Reference implementation, used only by validate — never shown in the UI. */
  solution: string
  tests: JsTest[]
  hints: string[]
  xp: number
}

export interface PyBank {
  skillId: string
  exercises: PyExercise[]
}

export async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`)
  return res.json() as Promise<T>
}
