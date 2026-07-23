import { useEffect, useState } from 'react'
import { HomeScreen } from './components/HomeScreen'
import { ExerciseScreen } from './components/ExerciseScreen'
import { DrillScreen } from './components/DrillScreen'
import { CaseBuildScreen } from './components/CaseBuildScreen'
import { CodeScreen } from './components/CodeScreen'
import { CollectionScreen } from './components/CollectionScreen'
import { ReviewScreen } from './components/ReviewScreen'
import { createPythonTrack } from './lib/tracks/python'
import { python } from '@codemirror/lang-python'
import { loadJson, type CaseBuildBank, type Curriculum, type DrillBank, type ExerciseBank, type JsBank, type PyBank, type Region, type WorldSchema } from './lib/content'
import { useProgress, type SkillProgress } from './lib/progress'
import { assembleReview, displayedMastery, type ReviewItem } from './lib/review'
import { todayString } from './lib/xp'

interface Content {
  curriculum: Curriculum
  banks: Record<string, ExerciseBank>
  drillBanks: Record<string, DrillBank>
  caseBuilds: Record<string, CaseBuildBank>
  jsBanks: Record<string, JsBank>
  pyBanks: Record<string, PyBank>
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
        curriculum={content.curriculum}
        worldNames={Object.fromEntries(Object.entries(content.schemas).map(([w, s]) => [w, s.name]))}
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
    if (skill.trackId === 'systems-design' && skill.format === 'case')
      return (
        <CaseBuildScreen
          key={skill.id}
          skill={skill}
          bank={content.caseBuilds[skill.id]}
          region={region}
          onBack={() => setView({ screen: 'home' })}
        />
      )
    if (skill.trackId === 'systems-design')
      return (
        <DrillScreen
          key={skill.id}
          skill={skill}
          bank={content.drillBanks[skill.id]}
          region={region}
          onBack={() => setView({ screen: 'home' })}
        />
      )
    if (skill.trackId === 'javascript')
      return (
        <CodeScreen
          key={skill.id}
          skill={skill}
          bank={content.jsBanks[skill.id]}
          region={region}
          onBack={() => setView({ screen: 'home' })}
        />
      )
    if (skill.trackId === 'python')
      return (
        <CodeScreen
          key={skill.id}
          skill={skill}
          bank={content.pyBanks[skill.id]}
          region={region}
          onBack={() => setView({ screen: 'home' })}
          createTrack={createPythonTrack}
          lang={python}
        />
      )
    return (
      <ExerciseScreen
        key={skill.id}
        skill={skill}
        bank={content.banks[skill.id]}
        schema={content.schemas[skill.world!]}
        region={region}
        onBack={() => setView({ screen: 'home' })}
      />
    )
  }
  const today = todayString()
  const reviewItems = assembleReview(skills, content.banks, today)
  const allSkills = content.curriculum.regions.flatMap(r => r.skills)
  const foundationsRegion = content.curriculum.regions.find(r => r.id === 'foundations')
  const worlds = [
    {
      name: 'Pokémon',
      regionName: 'Foundations',
      state: foundationsRegion ? worldState(foundationsRegion, skills) : ('locked' as const),
    },
    ...content.curriculum.regions
      .filter((r): r is Region & { world: string } => !!r.world)
      .map(r => ({
        name: content.schemas[r.world]?.name ?? r.world,
        regionName: r.name,
        state: worldState(r, skills),
      })),
  ]
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
      worlds={worlds}
    />
  )
}

function worldState(region: Region, skills: Record<string, SkillProgress>): 'active' | 'unlocked' | 'locked' {
  const completed = (id: string) => skills[id]?.completed ?? false
  if (region.skills.every(sk => completed(sk.id))) return 'unlocked'
  if (region.skills.some(sk => sk.requires.every(completed) && !completed(sk.id))) return 'active'
  return 'locked'
}

async function loadContent(): Promise<Content> {
  const base = import.meta.env.BASE_URL
  const curriculum = await loadJson<Curriculum>(`${base}content/skills.json`)
  const skills = curriculum.regions.flatMap(r => r.skills)
  const banks: Record<string, ExerciseBank> = {}
  const drillBanks: Record<string, DrillBank> = {}
  const caseBuilds: Record<string, CaseBuildBank> = {}
  const jsBanks: Record<string, JsBank> = {}
  const pyBanks: Record<string, PyBank> = {}
  const schemas: Record<string, WorldSchema> = {}
  await Promise.all(
    skills.map(async s => {
      if (s.trackId === 'systems-design' && s.format === 'case')
        caseBuilds[s.id] = await loadJson<CaseBuildBank>(`${base}content/exercises/${s.id}.json`)
      else if (s.trackId === 'systems-design')
        drillBanks[s.id] = await loadJson<DrillBank>(`${base}content/exercises/${s.id}.json`)
      else if (s.trackId === 'javascript')
        jsBanks[s.id] = await loadJson<JsBank>(`${base}content/exercises/${s.id}.json`)
      else if (s.trackId === 'python')
        pyBanks[s.id] = await loadJson<PyBank>(`${base}content/exercises/${s.id}.json`)
      else banks[s.id] = await loadJson<ExerciseBank>(`${base}content/exercises/${s.id}.json`)
    }),
  )
  const worlds = new Set(skills.map(s => s.world).filter((w): w is string => !!w))
  await Promise.all(
    [...worlds].map(async w => {
      schemas[w] = await loadJson<WorldSchema>(`${base}worlds/${w}/schema.json`)
    }),
  )
  return { curriculum, banks, drillBanks, caseBuilds, jsBanks, pyBanks, schemas }
}
