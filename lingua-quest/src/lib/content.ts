// Content model for Lingua Quest.
//
// A *course* is one target language (Spanish to start). Each course has a
// *curriculum* — units → skills — and a *bank* of exercises per skill. All
// content lives in public/content/ as JSON, so adding a language or a lesson
// never touches app code.

export type Lang = 'en' | 'es'

/** A word/phrase that a correct solve adds to the learner's vocabulary. */
export interface Vocab {
  es: string
  en: string
  /** part of speech: noun, verb, adjective, phrase, number, … */
  pos?: string
}

interface ExerciseBase {
  id: string
  xp: number
  /** Words caught into the vocabulary collection the first time this is solved. */
  teach?: Vocab[]
  hints?: string[]
}

/** Pick the correct option (translation, meaning, or fill-in). */
export interface ChoiceExercise extends ExerciseBase {
  type: 'choice'
  prompt: string
  promptLang: Lang
  /** Spanish text to read aloud (defaults to prompt when promptLang is 'es'). */
  speak?: string
  choices: string[]
  /** The correct option — must be one of `choices`. */
  answer: string
  explanation?: string
}

/** Type the translation. Matched leniently against `accept`. */
export interface TypeExercise extends ExerciseBase {
  type: 'type'
  prompt: string
  promptLang: Lang
  speak?: string
  /** Which language the learner types in (drives the input hint). */
  answerLang: Lang
  /** Acceptable answers; the first is the canonical/preferred form. */
  accept: string[]
  explanation?: string
}

/** Listen to Spanish audio (Web Speech TTS) and type what you hear. */
export interface ListenExercise extends ExerciseBase {
  type: 'listen'
  /** Spanish text spoken aloud. */
  audio: string
  /** Acceptable transcriptions (Spanish). */
  accept: string[]
  /** English translation revealed after answering. */
  translation: string
}

/** Assemble the target sentence by tapping words from a bank. */
export interface BuildExercise extends ExerciseBase {
  type: 'build'
  prompt: string
  /** Target Spanish sentence. */
  answer: string
  /** Word bank: the answer's words plus a few distractors, in display order. */
  tokens: string[]
  /** Alternate acceptable sentences, if word order can legitimately vary. */
  accept?: string[]
  speak?: string
  explanation?: string
}

/** Match Spanish words to their English meanings. */
export interface MatchExercise extends ExerciseBase {
  type: 'match'
  pairs: { es: string; en: string }[]
}

export type Exercise =
  | ChoiceExercise
  | TypeExercise
  | ListenExercise
  | BuildExercise
  | MatchExercise

export interface SkillBank {
  skillId: string
  exercises: Exercise[]
}

export interface Skill {
  id: string
  name: string
  icon?: string
  /** skill ids that must be completed before this one unlocks */
  requires: string[]
  lesson: { intro: string; tips?: string[] }
}

export interface Unit {
  id: string
  name: string
  subtitle?: string
  skills: Skill[]
}

export interface Curriculum {
  units: Unit[]
}

export interface CourseMeta {
  /** language code, e.g. 'es' */
  id: string
  /** English name, e.g. 'Spanish' */
  name: string
  /** endonym, e.g. 'Español' */
  nativeName: string
  flag: string
  /** BCP-47 locale for speech synthesis, e.g. 'es-ES' */
  voice: string
  blurb: string
}

export interface CoursesFile {
  courses: CourseMeta[]
}

export async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`)
  return res.json() as Promise<T>
}

/** Every Spanish word this exercise can speak aloud, if any. */
export function spokenText(ex: Exercise): string | undefined {
  switch (ex.type) {
    case 'choice':
      return ex.speak ?? (ex.promptLang === 'es' ? ex.prompt : undefined)
    case 'type':
      return ex.speak ?? (ex.promptLang === 'es' ? ex.prompt : undefined)
    case 'listen':
      return ex.audio
    case 'build':
      return ex.speak ?? ex.answer
    case 'match':
      return undefined
  }
}

/** The vocabulary an exercise contributes to the collection. */
export function exerciseVocab(ex: Exercise): Vocab[] {
  if (ex.teach && ex.teach.length) return ex.teach
  if (ex.type === 'match') return ex.pairs.map(p => ({ es: p.es, en: p.en }))
  return []
}
