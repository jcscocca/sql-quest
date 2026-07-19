import { useEffect, useState } from 'react'
import { HomeScreen } from './components/HomeScreen'
import { ExerciseScreen } from './components/ExerciseScreen'
import { loadJson, type Curriculum, type ExerciseBank, type WorldSchema } from './lib/content'
import { useProgress } from './lib/progress'

interface Content {
  curriculum: Curriculum
  banks: Record<string, ExerciseBank>
  schemas: Record<string, WorldSchema>
}

type View = { screen: 'home' } | { screen: 'exercise'; skillId: string }

export default function App() {
  const [content, setContent] = useState<Content | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ screen: 'home' })
  const hydrated = useProgress(s => s.hydrated)

  useEffect(() => {
    void useProgress.getState().hydrate()
    loadContent().then(setContent).catch(e => setError(String(e)))
  }, [])

  if (error)
    return (
      <div className="load-error">
        <p>Failed to load content: {error}</p>
        <button onClick={() => location.reload()}>Retry</button>
      </div>
    )
  if (!content || !hydrated) return <div className="loading">Loading…</div>

  if (view.screen === 'exercise') {
    const skill = content.curriculum.regions.flatMap(r => r.skills).find(s => s.id === view.skillId)
    if (!skill) return <div className="load-error">Unknown skill: {view.skillId}</div>
    return (
      <ExerciseScreen
        key={skill.id}
        skill={skill}
        bank={content.banks[skill.id]}
        schema={content.schemas[skill.world]}
        onBack={() => setView({ screen: 'home' })}
      />
    )
  }
  return (
    <HomeScreen
      curriculum={content.curriculum}
      onOpenSkill={skillId => setView({ screen: 'exercise', skillId })}
    />
  )
}

async function loadContent(): Promise<Content> {
  const base = import.meta.env.BASE_URL
  const curriculum = await loadJson<Curriculum>(`${base}content/skills.json`)
  const skills = curriculum.regions.flatMap(r => r.skills)
  const banks: Record<string, ExerciseBank> = {}
  const schemas: Record<string, WorldSchema> = {}
  await Promise.all(
    skills.map(async s => {
      banks[s.id] = await loadJson<ExerciseBank>(`${base}content/exercises/${s.id}.json`)
    }),
  )
  await Promise.all(
    [...new Set(skills.map(s => s.world))].map(async w => {
      schemas[w] = await loadJson<WorldSchema>(`${base}worlds/${w}/schema.json`)
    }),
  )
  return { curriculum, banks, schemas }
}
