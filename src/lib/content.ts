export interface WorldSchema {
  world: string
  name: string
  tables: TableSchema[]
  entity?: { table: string; column: string }
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
  skills: Skill[]
}

export interface Skill {
  id: string
  name: string
  world: string
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

export async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`)
  return res.json() as Promise<T>
}
