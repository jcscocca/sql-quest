// Content gate. Runs structurally over every course, curriculum and exercise
// bank, and — crucially — replays each exercise's *intended* answer through the
// real checker to prove the content is internally consistent. Run before every
// commit: `npm run validate`.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { CoursesFile, Curriculum, Exercise, SkillBank } from '../src/lib/content'
import { check, normalize } from '../src/lib/check'

const CONTENT = fileURLToPath(new URL('../public/content/', import.meta.url))

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(CONTENT + rel, 'utf8')) as T
}

export interface Issue {
  where: string
  msg: string
}

const VALID_TYPES = new Set(['choice', 'type', 'listen', 'build', 'match'])

export function validateAll(): Issue[] {
  const issues: Issue[] = []
  const add = (where: string, msg: string) => issues.push({ where, msg })

  let courses
  try {
    courses = readJson<CoursesFile>('courses.json').courses
  } catch (e) {
    add('courses.json', `unreadable: ${String(e)}`)
    return issues
  }
  if (!Array.isArray(courses) || courses.length === 0) add('courses.json', 'no courses defined')

  for (const course of courses ?? []) {
    for (const f of ['id', 'name', 'nativeName', 'flag', 'voice'] as const)
      if (!course[f]) add(`courses.json:${course.id}`, `missing ${f}`)
    validateCourse(course.id, add)
  }
  return issues
}

function validateCourse(courseId: string, add: (where: string, msg: string) => void): void {
  let curriculum: Curriculum
  try {
    curriculum = readJson<Curriculum>(`${courseId}/curriculum.json`)
  } catch (e) {
    add(`${courseId}/curriculum.json`, `unreadable: ${String(e)}`)
    return
  }

  const skillIds = new Set<string>()
  const seenSoFar = new Set<string>()
  const skills = curriculum.units.flatMap(u => u.skills)

  for (const s of skills) {
    if (skillIds.has(s.id)) add(courseId, `duplicate skill id: ${s.id}`)
    skillIds.add(s.id)
  }

  for (const unit of curriculum.units) {
    if (!unit.id || !unit.name) add(courseId, `unit missing id/name`)
    for (const skill of unit.skills) {
      const where = `${courseId}/${skill.id}`
      if (!skill.name) add(where, 'skill missing name')
      if (!skill.lesson?.intro) add(where, 'skill missing lesson.intro')
      for (const req of skill.requires) {
        if (!skillIds.has(req)) add(where, `requires unknown skill: ${req}`)
        else if (!seenSoFar.has(req)) add(where, `requires "${req}" which is defined later (ordering)`)
      }
      seenSoFar.add(skill.id)
      validateBank(courseId, skill.id, add)
    }
  }
}

function validateBank(courseId: string, skillId: string, add: (where: string, msg: string) => void): void {
  let bank: SkillBank
  try {
    bank = readJson<SkillBank>(`${courseId}/skills/${skillId}.json`)
  } catch (e) {
    add(`${courseId}/skills/${skillId}.json`, `unreadable (is the bank file present?): ${String(e)}`)
    return
  }
  if (bank.skillId !== skillId) add(`${courseId}/${skillId}`, `bank.skillId "${bank.skillId}" != "${skillId}"`)
  if (!Array.isArray(bank.exercises) || bank.exercises.length === 0) {
    add(`${courseId}/${skillId}`, 'no exercises')
    return
  }

  const ids = new Set<string>()
  for (const ex of bank.exercises) {
    const where = `${courseId}/${skillId}#${ex.id ?? '?'}`
    if (!ex.id) add(where, 'exercise missing id')
    if (ids.has(ex.id)) add(where, 'duplicate exercise id')
    ids.add(ex.id)
    if (!VALID_TYPES.has(ex.type)) {
      add(where, `unknown exercise type: ${ex.type}`)
      continue
    }
    if (typeof ex.xp !== 'number' || ex.xp <= 0) add(where, 'xp must be a positive number')
    validateExercise(where, ex, add)
  }
}

function validateExercise(where: string, ex: Exercise, add: (where: string, msg: string) => void): void {
  switch (ex.type) {
    case 'choice': {
      if (!ex.prompt) add(where, 'choice missing prompt')
      if (!Array.isArray(ex.choices) || ex.choices.length < 2) add(where, 'choice needs ≥2 choices')
      if (new Set(ex.choices).size !== ex.choices.length) add(where, 'duplicate choices')
      if (!ex.choices.includes(ex.answer)) add(where, `answer "${ex.answer}" is not among the choices`)
      break
    }
    case 'type':
    case 'listen': {
      const accept = ex.accept
      if (ex.type === 'listen' && !ex.audio) add(where, 'listen missing audio')
      if (ex.type === 'listen' && !ex.translation) add(where, 'listen missing translation')
      if (!Array.isArray(accept) || accept.length === 0) add(where, 'needs a non-empty accept list')
      else if (accept.some(a => !a || !a.trim())) add(where, 'accept contains an empty string')
      break
    }
    case 'build': {
      if (!ex.answer) add(where, 'build missing answer')
      if (!Array.isArray(ex.tokens) || ex.tokens.length === 0) add(where, 'build missing tokens')
      else if (!buildable(ex.answer, ex.tokens)) add(where, `answer "${ex.answer}" cannot be built from the token bank`)
      for (const alt of ex.accept ?? [])
        if (!buildable(alt, ex.tokens)) add(where, `accept alt "${alt}" cannot be built from the token bank`)
      break
    }
    case 'match': {
      if (!Array.isArray(ex.pairs) || ex.pairs.length < 2) add(where, 'match needs ≥2 pairs')
      else if (ex.pairs.some(p => !p.es || !p.en)) add(where, 'match pair missing es/en')
      break
    }
  }

  // The intended answer must actually pass the checker.
  const intended = canonicalAnswer(ex)
  if (intended != null && !check(ex, intended).correct)
    add(where, `intended answer "${intended}" does not pass the checker`)

  // teach entries must be complete.
  for (const t of ex.teach ?? [])
    if (!t.es || !t.en) add(where, 'teach entry missing es/en')
}

function canonicalAnswer(ex: Exercise): string | null {
  switch (ex.type) {
    case 'choice':
      return ex.answer
    case 'type':
    case 'listen':
      return ex.accept[0] ?? null
    case 'build':
      return ex.answer
    case 'match':
      return 'matched'
  }
}

/** Can `sentence` be assembled from the `tokens` bank (respecting multiplicity)? */
function buildable(sentence: string, tokens: string[]): boolean {
  const need = new Map<string, number>()
  for (const w of normalize(sentence).split(' ').filter(Boolean)) need.set(w, (need.get(w) ?? 0) + 1)
  const have = new Map<string, number>()
  for (const t of tokens) {
    const w = normalize(t)
    if (w) have.set(w, (have.get(w) ?? 0) + 1)
  }
  for (const [w, n] of need) if ((have.get(w) ?? 0) < n) return false
  return true
}

// Run as a CLI (tsx scripts/validate-content.ts); stays silent when imported by
// a test (Vitest sets process.env.VITEST).
if (!process.env.VITEST) {
  const issues = validateAll()
  if (issues.length === 0) {
    console.log('✓ content valid — all courses, skills and exercises pass.')
  } else {
    console.error(`✗ ${issues.length} content issue(s):`)
    for (const i of issues) console.error(`  [${i.where}] ${i.msg}`)
    process.exit(1)
  }
}
