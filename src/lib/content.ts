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
  trackId?: 'sql' | 'javascript' | 'python'
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

export interface CodeTest {
  setup?: string   // statements run first, in the solution's scope
  expr: string     // expression whose value is checked
  expect?: string  // expression giving the expected value; omit iff `raises` is set
  raises?: string  // instead of expect: the error-type name expr must throw
}

export interface JsExercise {
  id: string
  prompt: string
  functionName: string
  starter: string
  /** Reference implementation, used only by validate — never shown in the UI. */
  solution: string
  fixture?: string   // statements prepended to every test's setup in this exercise
  tests: CodeTest[]
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
  fixture?: string   // statements prepended to every test's setup in this exercise
  tests: CodeTest[]
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
