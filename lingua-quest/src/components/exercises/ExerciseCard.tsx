// Runs a single exercise end to end: prompt → input → check → feedback →
// continue. Shared by the Lesson and Review flows. The parent decides what a
// correct answer is worth and whether it finishes the node.

import { useState } from 'react'
import type { Exercise } from '../../lib/content'
import { spokenText } from '../../lib/content'
import { check } from '../../lib/check'
import { BuildInput, ChoiceInput, ListenInput, MatchInput, SpeakButton, TypeInput } from './inputs'

export interface CorrectOutcome {
  gained: number
  finished: boolean
}

type Feedback =
  | { kind: 'correct'; gained: number; finished: boolean; note?: string }
  | { kind: 'wrong' }

export function ExerciseCard({ exercise, voice, label, alreadySolved, onCorrect, onWrong, onContinue }: {
  exercise: Exercise
  voice: string
  label: string
  alreadySolved?: boolean
  onCorrect: (hintsUsed: number, note?: string) => CorrectOutcome
  onWrong?: () => void
  onContinue: () => void
}) {
  const [given, setGiven] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [hintsShown, setHintsShown] = useState(0)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const locked = feedback?.kind === 'correct'
  const hints = exercise.hints ?? []
  const speakText = spokenText(exercise)

  function submit(answer: string | null) {
    if (answer == null || (typeof answer === 'string' && answer.trim() === '')) return
    if (locked) return
    const result = check(exercise, answer)
    if (result.correct) {
      const outcome = onCorrect(hintsShown, result.note)
      setFeedback({ kind: 'correct', gained: outcome.gained, finished: outcome.finished, note: result.note })
    } else {
      setFeedback({ kind: 'wrong' })
      onWrong?.()
    }
  }

  const currentAnswer = exercise.type === 'type' || exercise.type === 'listen' ? text : given

  return (
    <div className="card">
      <div className="prompt">
        <span className="label">{label}</span>
        <Prompt exercise={exercise} voice={voice} />
        {alreadySolved && !feedback && (
          <p className="already-solved">Already solved — replaying is free practice.</p>
        )}
      </div>

      <div className="answer-area">
        {exercise.type === 'choice' && (
          <ChoiceInput ex={exercise} value={given} onChange={setGiven} disabled={locked} />
        )}
        {exercise.type === 'type' && (
          <TypeInput ex={exercise} value={text} onChange={setText} onEnter={() => submit(text)} disabled={locked} />
        )}
        {exercise.type === 'listen' && (
          <ListenInput ex={exercise} voice={voice} value={text} onChange={setText} onEnter={() => submit(text)} disabled={locked} />
        )}
        {exercise.type === 'build' && (
          <BuildInput ex={exercise} voice={voice} onChange={setGiven} disabled={locked} />
        )}
        {exercise.type === 'match' && (
          <MatchInput ex={exercise} voice={voice} onComplete={() => submit('matched')} disabled={locked} />
        )}
      </div>

      {hints.length > 0 && (
        <div className="hints">
          {hints.slice(0, hintsShown).map((h, i) => (
            <div key={i} className="hint">
              <strong>Hint {i + 1}:</strong> {h}
            </div>
          ))}
          {!locked && hintsShown < hints.length && (
            <button type="button" className="hint-btn" onClick={() => setHintsShown(hintsShown + 1)}>
              💡 Hint {hintsShown + 1}/{hints.length} (costs XP)
            </button>
          )}
        </div>
      )}

      {exercise.type !== 'match' && (
        <div className="actions">
          <button
            type="button"
            className="submit"
            disabled={locked || currentAnswer == null || (typeof currentAnswer === 'string' && currentAnswer.trim() === '')}
            onClick={() => submit(currentAnswer)}
          >
            Check
          </button>
        </div>
      )}

      {feedback?.kind === 'correct' && (
        <div className="feedback correct">
          <div className="feedback-body">
            <strong>✓ ¡Correcto!</strong>{' '}
            {feedback.gained > 0 ? `+${feedback.gained} XP` : 'Practice — no XP this time.'}
            {feedback.note && <p className="note">{feedback.note}</p>}
            <Reveal exercise={exercise} voice={voice} />
          </div>
          <button type="button" className="continue" onClick={onContinue}>
            {feedback.finished ? 'Finish →' : 'Continue →'}
          </button>
        </div>
      )}
      {feedback?.kind === 'wrong' && (
        <div className="feedback wrong">
          <span>Not quite — try again{hints.length > hintsShown ? ', or take a hint' : ''}.</span>
          {speakText && <SpeakButton text={speakText} voice={voice} label="🔊 Hear it" />}
        </div>
      )}
    </div>
  )
}

function Prompt({ exercise, voice }: { exercise: Exercise; voice: string }) {
  switch (exercise.type) {
    case 'choice':
      return (
        <p className="prompt-text">
          {exercise.prompt}
          {(exercise.speak ?? (exercise.promptLang === 'es' ? exercise.prompt : undefined)) && (
            <SpeakButton text={exercise.speak ?? exercise.prompt} voice={voice} />
          )}
        </p>
      )
    case 'type':
      return (
        <p className="prompt-text">
          {exercise.prompt}
          {(exercise.speak ?? (exercise.promptLang === 'es' ? exercise.prompt : undefined)) && (
            <SpeakButton text={exercise.speak ?? exercise.prompt} voice={voice} />
          )}
        </p>
      )
    case 'listen':
      return <p className="prompt-text">Listen and type what you hear.</p>
    case 'build':
      return (
        <p className="prompt-text">
          Translate: <em>{exercise.prompt}</em>
        </p>
      )
    case 'match':
      return <p className="prompt-text">Tap the matching pairs.</p>
  }
}

function Reveal({ exercise, voice }: { exercise: Exercise; voice: string }) {
  switch (exercise.type) {
    case 'choice':
      return exercise.explanation ? <p className="reveal">{exercise.explanation}</p> : null
    case 'type':
      return (
        <p className="reveal">
          <strong>{exercise.accept[0]}</strong>
          {exercise.explanation ? ` — ${exercise.explanation}` : ''}
        </p>
      )
    case 'listen':
      return (
        <p className="reveal">
          <strong>{exercise.accept[0]}</strong> <SpeakButton text={exercise.audio} voice={voice} /> — “{exercise.translation}”
        </p>
      )
    case 'build':
      return (
        <p className="reveal">
          <strong>{exercise.answer}</strong> <SpeakButton text={exercise.speak ?? exercise.answer} voice={voice} />
          {exercise.explanation ? ` — ${exercise.explanation}` : ''}
        </p>
      )
    case 'match':
      return null
  }
}
