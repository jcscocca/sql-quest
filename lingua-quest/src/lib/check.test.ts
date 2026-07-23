import { describe, expect, it } from 'vitest'
import { check, checkText, foldAccents, normalize } from './check'
import type { BuildExercise, ChoiceExercise, ListenExercise, MatchExercise, TypeExercise } from './content'

describe('normalize', () => {
  it('lowercases, trims, collapses whitespace and drops punctuation', () => {
    expect(normalize('  Hola,   ¿Cómo   estás?  ')).toBe('hola cómo estás')
  })
  it('keeps accents intact', () => {
    expect(normalize('CAFÉ')).toBe('café')
  })
})

describe('foldAccents', () => {
  it('folds vowel accents but preserves ñ', () => {
    expect(foldAccents('cómo estás')).toBe('como estas')
    expect(foldAccents('español')).toBe('español')
    expect(foldAccents('año')).toBe('año')
  })
})

describe('checkText', () => {
  it('accepts an exact (normalized) match', () => {
    expect(checkText('Buenas tardes', ['buenas tardes'])).toEqual({ correct: true })
  })
  it('accepts a missing-accent answer but adds a note', () => {
    const r = checkText('como estas', ['cómo estás'])
    expect(r.correct).toBe(true)
    expect(r.note).toContain('cómo estás')
  })
  it('rejects a wrong answer', () => {
    expect(checkText('hola', ['adiós']).correct).toBe(false)
  })
  it('rejects an empty answer', () => {
    expect(checkText('   ', ['hola']).correct).toBe(false)
  })
  it('does not treat ñ and n as interchangeable when an exact match exists', () => {
    // "ano" != "año"; only the lenient path could match, and here it should
    // still flag the accent-fold difference rather than silently pass as exact.
    expect(checkText('año', ['año'])).toEqual({ correct: true })
  })
})

describe('check dispatch', () => {
  const choice: ChoiceExercise = {
    type: 'choice', id: 'x', xp: 10, prompt: 'hi', promptLang: 'en',
    choices: ['Hola', 'Adiós'], answer: 'Hola',
  }
  const type: TypeExercise = {
    type: 'type', id: 'x', xp: 10, prompt: 'p', promptLang: 'en', answerLang: 'es', accept: ['gracias'],
  }
  const listen: ListenExercise = {
    type: 'listen', id: 'x', xp: 10, audio: 'Lo siento.', accept: ['lo siento'], translation: 'sorry',
  }
  const build: BuildExercise = {
    type: 'build', id: 'x', xp: 10, prompt: 'p', answer: 'Buenos días', tokens: ['Buenos', 'días', 'noches'],
  }
  const match: MatchExercise = {
    type: 'match', id: 'x', xp: 10, pairs: [{ es: 'hola', en: 'hello' }, { es: 'sí', en: 'yes' }],
  }

  it('grades a choice', () => {
    expect(check(choice, 'Hola').correct).toBe(true)
    expect(check(choice, 'Adiós').correct).toBe(false)
  })
  it('grades a typed answer leniently', () => {
    expect(check(type, 'Gracias').correct).toBe(true)
  })
  it('grades a listen answer', () => {
    expect(check(listen, 'lo siento').correct).toBe(true)
  })
  it('grades a built sentence, order-sensitive', () => {
    expect(check(build, 'Buenos días').correct).toBe(true)
    expect(check(build, 'días Buenos').correct).toBe(false)
  })
  it('grades a completed match', () => {
    expect(check(match, 'matched').correct).toBe(true)
    expect(check(match, 'nope').correct).toBe(false)
  })
})
