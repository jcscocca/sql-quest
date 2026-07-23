import { useMemo, useState } from 'react'
import type { CourseMeta, Curriculum } from '../lib/content'
import { useProgress } from '../lib/progress'
import { SpeakButton } from './exercises/inputs'

export function VocabScreen({ course, curriculum, onBack }: {
  course: CourseMeta
  curriculum: Curriculum
  onBack: () => void
}) {
  const progress = useProgress()
  const [q, setQ] = useState('')

  const words = useMemo(
    () => progress.vocab.filter(v => v.course === course.id),
    [progress.vocab, course.id],
  )
  const filtered = words.filter(
    v => v.es.toLowerCase().includes(q.toLowerCase()) || v.en.toLowerCase().includes(q.toLowerCase()),
  )

  const skillNames = useMemo(() => {
    const m: Record<string, string> = {}
    for (const u of curriculum.units) {
      m[`unit:${u.id}`] = u.name
      for (const s of u.skills) m[s.id] = s.name
    }
    return m
  }, [curriculum])

  return (
    <div className="collection">
      <header className="topbar">
        <button className="back" onClick={onBack}>← Back</button>
        <h2>📖 Vocabulary · {course.flag} {course.name}</h2>
        <span className="progress-count">{words.length} words</span>
      </header>

      {progress.badges.length > 0 && (
        <div className="badge-shelf">
          <span className="label">Badges</span>
          {progress.badges.map(b => (
            <span key={b} className="badge-token">🏅 {skillNames[b] ?? b}</span>
          ))}
        </div>
      )}

      {words.length === 0 ? (
        <p className="empty">No words yet — complete an exercise to start your collection. ¡Buena suerte!</p>
      ) : (
        <>
          <div className="vocab-search">
            <input
              className="text-answer"
              placeholder="Search your words…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <div className="vocab-grid">
            {filtered.map(v => (
              <div key={`${v.es}`} className="vocab-card">
                <div className="vocab-es">
                  {v.es} <SpeakButton text={v.es} voice={course.voice} />
                </div>
                <div className="vocab-en">{v.en}</div>
                {v.pos && <div className="vocab-pos">{v.pos}</div>}
              </div>
            ))}
            {filtered.length === 0 && <p className="empty">No matches for “{q}”.</p>}
          </div>
        </>
      )}
    </div>
  )
}
