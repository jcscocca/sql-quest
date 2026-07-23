// The per-type answer inputs. Each is controlled by ExerciseCard except Match,
// which resolves itself and fires onComplete when every pair is joined.

import { useEffect, useMemo, useState } from 'react'
import type { BuildExercise, ChoiceExercise, ListenExercise, MatchExercise, TypeExercise } from '../../lib/content'
import { speak, speechSupported } from '../../lib/speech'

export function SpeakButton({ text, voice, label = '🔊', title = 'Listen' }: {
  text: string
  voice: string
  label?: string
  title?: string
}) {
  if (!speechSupported()) return null
  return (
    <button type="button" className="speak" title={title} onClick={() => speak(text, voice)}>
      {label}
    </button>
  )
}

export function ChoiceInput({ ex, value, onChange, disabled }: {
  ex: ChoiceExercise
  value: string | null
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <div className="choices">
      {ex.choices.map(c => (
        <button
          key={c}
          type="button"
          className={`choice${value === c ? ' selected' : ''}`}
          onClick={() => onChange(c)}
          disabled={disabled}
        >
          {c}
        </button>
      ))}
    </div>
  )
}

export function TypeInput({ ex, value, onChange, onEnter, disabled }: {
  ex: TypeExercise
  value: string
  onChange: (v: string) => void
  onEnter: () => void
  disabled: boolean
}) {
  const placeholder = ex.answerLang === 'es' ? 'Escribe en español…' : 'Type in English…'
  return (
    <input
      className="text-answer"
      lang={ex.answerLang}
      autoFocus
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') onEnter()
      }}
    />
  )
}

export function ListenInput({ ex, voice, value, onChange, onEnter, disabled }: {
  ex: ListenExercise
  voice: string
  value: string
  onChange: (v: string) => void
  onEnter: () => void
  disabled: boolean
}) {
  useEffect(() => {
    speak(ex.audio, voice)
    // Speak once when the exercise first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.audio])

  return (
    <div className="listen">
      <div className="listen-controls">
        <button type="button" className="speak big" title="Play" onClick={() => speak(ex.audio, voice)}>
          🔊 Play
        </button>
        {!speechSupported() && <span className="muted">Audio isn’t available in this browser — the text is: “{ex.audio}”.</span>}
      </div>
      <input
        className="text-answer"
        lang="es"
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="Type what you hear…"
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onEnter()
        }}
      />
    </div>
  )
}

interface Token {
  id: number
  word: string
}

export function BuildInput({ ex, voice, onChange, disabled }: {
  ex: BuildExercise
  voice: string
  onChange: (given: string | null) => void
  disabled: boolean
}) {
  const bank = useMemo<Token[]>(() => ex.tokens.map((word, id) => ({ id, word })), [ex.tokens])
  const [placed, setPlaced] = useState<Token[]>([])

  const placedIds = new Set(placed.map(t => t.id))
  const remaining = bank.filter(t => !placedIds.has(t.id))

  function update(next: Token[]) {
    setPlaced(next)
    onChange(next.length ? next.map(t => t.word).join(' ') : null)
  }

  return (
    <div className="build">
      <div className="build-line" aria-label="Your sentence">
        {placed.length === 0 && <span className="muted">Tap the words in order…</span>}
        {placed.map(t => (
          <button
            key={t.id}
            type="button"
            className="token placed"
            disabled={disabled}
            onClick={() => update(placed.filter(p => p.id !== t.id))}
          >
            {t.word}
          </button>
        ))}
      </div>
      <div className="build-bank">
        {remaining.map(t => (
          <button
            key={t.id}
            type="button"
            className="token"
            disabled={disabled}
            onClick={() => update([...placed, t])}
          >
            {t.word}
          </button>
        ))}
        {remaining.length === 0 && <SpeakButton text={ex.speak ?? ex.answer} voice={voice} label="🔊 Hear it" />}
      </div>
    </div>
  )
}

type Side = 'es' | 'en'
interface MatchCell {
  key: string
  side: Side
  text: string
  pairKey: string
}

export function MatchInput({ ex, voice, onComplete, disabled }: {
  ex: MatchExercise
  voice: string
  onComplete: () => void
  disabled: boolean
}) {
  const cells = useMemo<MatchCell[]>(() => {
    const es = ex.pairs.map((p, i) => ({ key: `es${i}`, side: 'es' as Side, text: p.es, pairKey: `p${i}` }))
    const en = ex.pairs.map((p, i) => ({ key: `en${i}`, side: 'en' as Side, text: p.en, pairKey: `p${i}` }))
    return [...shuffle(es), ...shuffle(en)]
  }, [ex.pairs])

  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<MatchCell | null>(null)
  const [wrong, setWrong] = useState<string | null>(null)

  function tap(cell: MatchCell) {
    if (disabled || matched.has(cell.key)) return
    if (cell.side === 'es') speak(cell.text, voice)
    if (!sel) {
      setSel(cell)
      setWrong(null)
      return
    }
    if (sel.key === cell.key) {
      setSel(null)
      return
    }
    if (sel.pairKey === cell.pairKey && sel.side !== cell.side) {
      const next = new Set(matched)
      next.add(sel.key)
      next.add(cell.key)
      setMatched(next)
      setSel(null)
      if (next.size === cells.length) onComplete()
    } else {
      setWrong(cell.key)
      const missed = sel.key
      setSel(null)
      setTimeout(() => setWrong(w => (w === cell.key || w === missed ? null : w)), 350)
    }
  }

  return (
    <div className="match">
      {cells.map(cell => {
        const cls = matched.has(cell.key)
          ? 'matched'
          : sel?.key === cell.key
            ? 'selected'
            : wrong === cell.key
              ? 'wrong'
              : ''
        return (
          <button
            key={cell.key}
            type="button"
            className={`match-cell ${cls}`}
            disabled={disabled || matched.has(cell.key)}
            onClick={() => tap(cell)}
          >
            {cell.text}
          </button>
        )
      })}
    </div>
  )
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
