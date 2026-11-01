import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import { ensureDefaults, loadTimelines, timelinePath, createTimelineFile } from './timelines'
import { newTimeline } from '../timeline/ops'
import type { Env } from './types'

const META = { title: 'B', author: 'A', language: 'en' }
const makeEnv = (): Env => {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

async function book(forceReadOnly = false) {
  const io = createMemoryProjectIO()
  const env = makeEnv()
  await createProject(io, META, env)
  const r = await openProject(io, env, forceReadOnly ? { forceReadOnly: 'locked-elsewhere' } : {})
  if (r.status !== 'ok') throw new Error('open failed')
  return { io, env, project: r.project, issues: r.issues }
}

describe('ensureDefaults', () => {
  it('a book with no timelines gets Main timeline and a calendar', async () => {
    const { io, env, project } = await book()
    await ensureDefaults(project, env)
    expect(project.manifest.calendar).not.toBeNull()
    expect(project.manifest.timelines).toHaveLength(1)
    const { timelines } = await loadTimelines(project)
    expect([...timelines.values()].map((t) => t.name)).toEqual(['Main timeline'])
    expect(JSON.parse(io.files.get('project.json') as string).timelines).toHaveLength(1)
  })

  it('is idempotent', async () => {
    const { io, env, project } = await book()
    await ensureDefaults(project, env)
    const snap = new Map(io.files)
    await ensureDefaults(project, env)
    expect(io.files).toEqual(snap)
  })

  it('leaves an existing timeline list alone', async () => {
    const { env, project } = await book()
    await createTimelineFile(project, newTimeline('t9', 'Mine'))
    await ensureDefaults(project, env)
    expect(project.manifest.timelines.map((r) => r.id)).toEqual(['t9'])
  })

  it('read-only: nothing is created', async () => {
    const { io, env, project } = await book(true)
    const before = new Map(io.files)
    await ensureDefaults(project, env)
    expect(io.files).toEqual(before)
    expect(project.manifest.timelines).toEqual([])
  })
})

describe('loadTimelines', () => {
  it('reports missing and invalid files; the rest still load', async () => {
    const { io, project } = await book()
    await createTimelineFile(project, newTimeline('a', 'A'))
    await createTimelineFile(project, newTimeline('b', 'B'))
    await createTimelineFile(project, newTimeline('c', 'C'))
    io.files.set(timelinePath('b'), '{"version":1,"id":"b"')
    io.files.delete(timelinePath('c'))
    const r = await loadTimelines(project)
    expect([...r.timelines.keys()]).toEqual(['a'])
    expect(r.status.get('b')).toBe('invalid')
    expect(r.status.get('c')).toBe('missing')
  })

  it('open marks an invalid timeline file so it is never overwritten', async () => {
    const { io, env, project } = await book()
    await createTimelineFile(project, newTimeline('a', 'A'))
    io.files.set(timelinePath('a'), '{"nope":true}')
    const r = await openProject(io, env)
    if (r.status !== 'ok') throw new Error('open failed')
    expect(r.project.isInvalid(timelinePath('a'))).toBe(true)
    expect(r.issues.some((i) => i.kind === 'invalid' && i.path === timelinePath('a'))).toBe(true)
    await expect(r.project.saveItem(timelinePath('a'), (await import('../timeline/schema')).timelineSchema, newTimeline('a', 'X'))).rejects.toThrow()
    expect(io.files.get(timelinePath('a'))).toBe('{"nope":true}')
  })
})

describe('trash and restore', () => {
  async function three() {
    const ctx = await book()
    for (const id of ['a', 'b', 'c']) await createTimelineFile(ctx.project, newTimeline(id, id))
    return ctx
  }

  it('delete moves the file to the trash and unlists it', async () => {
    const { io, project } = await three()
    const entry = await project.trashTimeline('b', 'b')
    expect(entry).toMatchObject({ type: 'timeline', id: 'b', index: 1, originalPath: timelinePath('b') })
    expect(project.manifest.timelines.map((r) => r.id)).toEqual(['a', 'c'])
    expect(io.files.has(timelinePath('b'))).toBe(false)
    expect(io.files.has(entry.trashPath)).toBe(true)
    expect(project.manifest.trash.map((t) => t.id)).toEqual(['b'])
  })

  it('restore puts it back at its original index', async () => {
    const { io, project } = await three()
    await project.trashTimeline('b', 'b')
    await project.restoreTimeline('b')
    expect(project.manifest.timelines.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(io.files.has(timelinePath('b'))).toBe(true)
    expect(project.manifest.trash).toEqual([])
  })

  it('restore refuses when the original path is taken', async () => {
    const { io, project } = await three()
    await project.trashTimeline('b', 'b')
    io.files.set(timelinePath('b'), 'x')
    await expect(project.restoreTimeline('b')).rejects.toThrow()
    expect(project.manifest.trash).toHaveLength(1)
  })

  it('read-only refuses delete', async () => {
    const { project } = await book(true)
    await expect(project.trashTimeline('x', 'x')).rejects.toThrow()
  })
})
