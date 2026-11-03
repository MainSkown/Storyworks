import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { LOCK_PATH } from '../project/lock'
import { statsSchema } from '../project/schemas/stats'
import { parseFile } from '../project/serialize'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { countWords } from '../editor/wordCount'
import { IDLE_MS } from './sessions'
import { useStatsStore } from './store'

const META = { title: 'My Book', author: 'Ann', language: 'en' }
let io: MemoryProjectIO
const at = (d: number, h = 12, m = 0) => new Date(2026, 5, d, h, m).getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at(1))
  io = createMemoryProjectIO()
  setProjectIOFactory(() => io)
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
})
afterEach(() => {
  vi.useRealTimers()
  resetProjectIOFactory()
  resetFileIOFactory()
})

const doc = (words: number) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: Array(words).fill('w').join(' ') }] }],
})

async function opened() {
  setActivePinia(createPinia())
  const project = useProjectStore()
  expect(await project.create('book', META)).toBe('opened')
  const stats = useStatsStore()
  const scene = project.tree[0].children[0]
  const write = (words: number) => project.setSceneContent(scene.id, doc(words), countWords(doc(words)))
  return { project, stats, scene, write }
}

const disk = () => {
  const r = parseFile(statsSchema, io.files.get('stats.json') as string, 'stats.json')
  if (!r.ok) throw new Error('stats.json invalid')
  return r.value
}

describe('stats store', () => {
  it('no stats.json until the first edit; then it is created and registered', async () => {
    const { project, stats, write } = await opened()
    await project.flush()
    expect(io.files.has('stats.json')).toBe(false)
    expect(project.project?.manifest.stats).toBeNull()
    await write(5)
    await project.flush()
    expect(project.project?.manifest.stats?.path).toBe('stats.json')
    expect(JSON.parse(io.files.get('project.json') as string).stats.path).toBe('stats.json')
    expect(disk().days).toEqual([{ date: '2026-06-01', net: 5 }])
    expect(stats.todayNet).toBe(5)
  })

  it('opening and switching scenes records nothing', async () => {
    const { project, scene } = await opened()
    await project.loadScene(scene.path as string)
    project.selectedId = scene.id
    await project.flush()
    expect(io.files.has('stats.json')).toBe(false)
  })

  it('deleting words subtracts; the displayed value never goes below 0', async () => {
    const { project, stats, write } = await opened()
    await write(10)
    await write(4)
    expect(stats.todayNet).toBe(4)
    await write(0)
    await write(0)
    expect(stats.days).toEqual([{ date: '2026-06-01', net: 0 }])
    await write(0)
    expect(stats.todayNet).toBe(0)
    await project.flush()
    expect(disk().days[0].net).toBe(0)
  })

  it('a session spans edits under 10 min apart; a longer gap starts a new one', async () => {
    const { project, stats, write } = await opened()
    await write(3)
    vi.setSystemTime(at(1, 12, 5))
    await write(8)
    vi.setSystemTime(at(1, 12, 5) + IDLE_MS)
    await write(9)
    await project.flush()
    expect(disk().sessions.map((s) => s.net)).toEqual([8, 1])
    expect(stats.sessions).toHaveLength(2)
  })

  it('midnight rollover puts edits on the day they happened', async () => {
    const { stats, write } = await opened()
    vi.setSystemTime(at(1, 23, 58))
    await write(5)
    vi.setSystemTime(at(2, 0, 2))
    await write(12)
    expect(stats.days).toEqual([
      { date: '2026-06-01', net: 5 },
      { date: '2026-06-02', net: 7 },
    ])
    expect(stats.todayNet).toBe(7)
  })

  it('goal progress and streak use the daily goal', async () => {
    const { project, stats, write } = await opened()
    ;(project.project as NonNullable<typeof project.project>).manifest.goals = { daily: 10, book: 100 }
    project.revision++
    await write(4)
    expect(stats.goalProgress).toMatchObject({ done: 4, goal: 10, met: false })
    expect(stats.streaks).toEqual({ current: 0, longest: 0 })
    await write(10)
    expect(stats.goalProgress).toMatchObject({ done: 10, goal: 10, met: true })
    expect(stats.streaks).toEqual({ current: 1, longest: 1 })
    expect(stats.bookProgress).toMatchObject({ done: 10, goal: 100 })
  })

  it('survives closing and reopening', async () => {
    const { project, stats, write } = await opened()
    await write(6)
    await project.flush()
    await project.close()
    expect(stats.days).toEqual([])
    await project.open('book')
    expect(stats.todayNet).toBe(6)
    await write(9) // 6 -> 9 on the same day, new session
    expect(stats.todayNet).toBe(9)
  })

  it('an invalid stats.json warns and is left untouched', async () => {
    const { project, stats, write } = await opened()
    await write(2)
    await project.flush()
    await project.close()
    const bad = '{"version":1,"days":[{"date":"x"}]}'
    io.files.set('stats.json', bad)
    await project.open('book')
    expect(stats.invalid).toBe(true)
    expect(await write(7)).toBe(true) // the scene itself still saves
    await project.flush()
    expect(io.files.get('stats.json')).toBe(bad)
    expect(stats.todayNet).toBe(0)
  })

  it('a read-only book writes nothing', async () => {
    const { project, stats } = await opened()
    await project.flush()
    await project.close()
    io.files.set(LOCK_PATH, JSON.stringify({ machine: 'elsewhere', pid: 1, timestamp: Date.now() }))
    await project.open('book')
    await project.resolveLockPrompt('readOnly')
    expect(await stats.recordEdit(5)).toBe(false)
    await project.flush()
    expect(io.files.has('stats.json')).toBe(false)
  })
})
