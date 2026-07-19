import { useEffect, useState } from 'react'
import { HomeScreen } from './components/HomeScreen'
import { ExerciseScreen } from './components/ExerciseScreen'
import { CollectionScreen } from './components/CollectionScreen'
import { ReviewScreen } from './components/ReviewScreen'
import { loadJson, type Curriculum, type ExerciseBank, type WorldSchema } from './lib/content'
import { useProgress } from './lib/progress'
import { assembleReview, displayedMastery, type ReviewItem } from './lib/review'
import { todayString } from './lib/xp'

interface Content {
  curriculum: Curriculum
  banks: Record<string, ExerciseBank>
  schemas: Record<string, WorldSchema>
}

type View =
  | { screen: 'home' }
  | { screen: 'exercise'; skillId: string }
  | { screen: 'collection' }
  | { screen: 'review'; items: ReviewItem[] }

export default function App() {
  const [content, setContent] = useState<Content | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ screen: 'home' })
  const hydrated = useProgress(s => s.hydrated)
  const skills = useProgress(s => s.skills)

  useEffect(() => {
    void useProgress.getState().hydrate()
    loadContent().then(setContent).catch(e => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!content || !hydrated) return
    const store = useProgress.getState()
    for (const region of content.curriculum.regions) {
      for (const sk of region.skills)
        if (store.skills[sk.id]?.completed) useProgress.getState().awardBadge(sk.id)
      if (region.skills.every(sk => useProgress.getState().skills[sk.id]?.completed))
        useProgress.getState().awardBadge(`region:${region.id}`)
    }
  }, [content, hydrated])

  if (error)
    return (
      <div className="load-error">
        <p>Failed to load content: {error}</p>
        <button onClick={() => location.reload()}>Retry</button>
      </div>
    )
  if (!content || !hydrated) return <div className="loading">Loading…</div>

  if (view.screen === 'collection')
    return (
      <CollectionScreen
        schema={content.schemas.pokemon}
        curriculum={content.curriculum}
        onBack={() => setView({ screen: 'home' })}
      />
    )

  if (view.screen === 'review')
    return (
      <ReviewScreen
        items={view.items}
        schemas={content.schemas}
        curriculum={content.curriculum}
        onDone={() => setView({ screen: 'home' })}
      />
    )

  if (view.screen === 'exercise') {
    const skill = content.curriculum.regions.flatMap(r => r.skills).find(s => s.id === view.skillId)
    if (!skill) return <div className="load-error">Unknown skill: {view.skillId}</div>
    const region = content.curriculum.regions.find(r => r.skills.some(s => s.id === view.skillId))!
    return (
      <ExerciseScreen
        key={skill.id}
        skill={skill}
        bank={content.banks[skill.id]}
        schema={content.schemas[skill.world]}
        region={region}
        onBack={() => setView({ screen: 'home' })}
      />
    )
  }
  const today = todayString()
  const reviewItems = assembleReview(skills, content.banks, today)
  const allSkills = content.curriculum.regions.flatMap(r => r.skills)
  let rustiest: { name: string; from: number; to: number } | null = null
  for (const sk of allSkills) {
    const sp = skills[sk.id]
    if (!sp?.completed) continue
    const shown = displayedMastery(sp, today)
    if (shown < sp.mastery && (!rustiest || sp.mastery - shown > rustiest.from - rustiest.to))
      rustiest = { name: sk.name, from: sp.mastery, to: shown }
  }
  return (
    <HomeScreen
      curriculum={content.curriculum}
      onOpenSkill={skillId => setView({ screen: 'exercise', skillId })}
      onOpenCollection={() => setView({ screen: 'collection' })}
      reviewCount={reviewItems.length}
      rustiest={rustiest}
      onStartReview={() => setView({ screen: 'review', items: reviewItems })}
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
