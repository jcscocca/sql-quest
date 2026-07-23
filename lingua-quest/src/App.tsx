import { useEffect, useState } from 'react'
import { HomeScreen } from './components/HomeScreen'
import { LessonScreen } from './components/LessonScreen'
import { ReviewScreen } from './components/ReviewScreen'
import { VocabScreen } from './components/VocabScreen'
import { loadJson, type CourseMeta, type CoursesFile, type Curriculum, type SkillBank } from './lib/content'
import { useProgress } from './lib/progress'
import { assembleReview, displayedMastery, type ReviewItem } from './lib/review'
import { todayString } from './lib/xp'

interface Content {
  courses: CourseMeta[]
  course: CourseMeta
  curriculum: Curriculum
  banks: Record<string, SkillBank>
}

type View =
  | { screen: 'home' }
  | { screen: 'lesson'; skillId: string }
  | { screen: 'vocab' }
  | { screen: 'review'; items: ReviewItem[] }

const DEFAULT_COURSE = 'es'

export default function App() {
  const [content, setContent] = useState<Content | null>(null)
  const [courseId, setCourseId] = useState(DEFAULT_COURSE)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ screen: 'home' })
  const hydrated = useProgress(s => s.hydrated)
  const skills = useProgress(s => s.skills)

  useEffect(() => {
    void useProgress.getState().hydrate()
  }, [])

  useEffect(() => {
    setContent(null)
    setView({ screen: 'home' })
    loadCourse(courseId).then(setContent).catch(e => setError(String(e)))
  }, [courseId])

  // Backfill badges for skills/units already completed (e.g. after import).
  useEffect(() => {
    if (!content || !hydrated) return
    const store = useProgress.getState()
    for (const unit of content.curriculum.units) {
      for (const sk of unit.skills) if (store.skills[sk.id]?.completed) store.awardBadge(sk.id)
      if (unit.skills.every(sk => useProgress.getState().skills[sk.id]?.completed))
        useProgress.getState().awardBadge(`unit:${unit.id}`)
    }
  }, [content, hydrated])

  if (error)
    return (
      <div className="load-error">
        <p>Failed to load content: {error}</p>
        <button onClick={() => location.reload()}>Retry</button>
      </div>
    )
  if (!content || !hydrated) return <div className="loading">Loading… ¡Un momento!</div>

  const allSkills = content.curriculum.units.flatMap(u => u.skills)

  if (view.screen === 'vocab')
    return <VocabScreen course={content.course} curriculum={content.curriculum} onBack={() => setView({ screen: 'home' })} />

  if (view.screen === 'review')
    return (
      <ReviewScreen
        items={view.items}
        curriculum={content.curriculum}
        course={content.course}
        onDone={() => setView({ screen: 'home' })}
      />
    )

  if (view.screen === 'lesson') {
    const skill = allSkills.find(s => s.id === view.skillId)
    const unit = content.curriculum.units.find(u => u.skills.some(s => s.id === view.skillId))
    const bank = content.banks[view.skillId]
    if (!skill || !unit || !bank) return <div className="load-error">Unknown skill: {view.skillId}</div>
    return (
      <LessonScreen
        key={skill.id}
        skill={skill}
        bank={bank}
        unit={unit}
        course={content.course}
        onBack={() => setView({ screen: 'home' })}
      />
    )
  }

  const today = todayString()
  const reviewItems = assembleReview(skills, content.banks, today)
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
      course={content.course}
      courses={content.courses}
      curriculum={content.curriculum}
      onOpenSkill={skillId => setView({ screen: 'lesson', skillId })}
      onOpenVocab={() => setView({ screen: 'vocab' })}
      onSwitchCourse={setCourseId}
      reviewCount={reviewItems.length}
      rustiest={rustiest}
      onStartReview={() => setView({ screen: 'review', items: reviewItems })}
    />
  )
}

async function loadCourse(courseId: string): Promise<Content> {
  const base = import.meta.env.BASE_URL
  const { courses } = await loadJson<CoursesFile>(`${base}content/courses.json`)
  const course = courses.find(c => c.id === courseId) ?? courses[0]
  const curriculum = await loadJson<Curriculum>(`${base}content/${course.id}/curriculum.json`)
  const skills = curriculum.units.flatMap(u => u.skills)
  const banks: Record<string, SkillBank> = {}
  await Promise.all(
    skills.map(async s => {
      banks[s.id] = await loadJson<SkillBank>(`${base}content/${course.id}/skills/${s.id}.json`)
    }),
  )
  return { courses, course, curriculum, banks }
}
