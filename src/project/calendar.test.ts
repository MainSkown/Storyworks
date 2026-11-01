import { describe, expect, it } from 'vitest'
import { gregorianCalendar } from '../calendar/gregorian'
import { calendarSchema } from '../calendar/schema'
import { CALENDAR_FILE, ensureCalendar, loadCalendar, saveCalendar } from './calendar'
import { createMemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import { parseFile } from './serialize'
import type { Env } from './types'

const META = { title: 'B', author: 'A', language: 'en' }

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

async function book(forceReadOnly = false) {
  const io = createMemoryProjectIO()
  const env = makeEnv()
  await createProject(io, META, env)
  const r = await openProject(io, env, forceReadOnly ? { forceReadOnly: 'locked-elsewhere' } : {})
  if (r.status !== 'ok') throw new Error('open failed')
  return { io, env, project: r.project }
}

describe('ensureCalendar', () => {
  it('missing ref: creates a Gregorian calendar.json and lists it', async () => {
    const { io, env, project } = await book()
    await ensureCalendar(project, env)
    const ref = project.manifest.calendar
    expect(ref?.path).toBe(CALENDAR_FILE)
    const r = parseFile(calendarSchema, io.files.get(CALENDAR_FILE) as string, CALENDAR_FILE)
    expect(r.ok && r.value.months).toHaveLength(12)
    expect(r.ok && r.value.id).toBe(ref?.id)
    expect(JSON.parse(io.files.get('project.json') as string).calendar.path).toBe(CALENDAR_FILE)
  })
  it('is idempotent', async () => {
    const { io, env, project } = await book()
    await ensureCalendar(project, env)
    const snap = new Map(io.files)
    await ensureCalendar(project, env)
    expect(io.files).toEqual(snap)
  })
  it('read-only: creates nothing', async () => {
    const { io, env, project } = await book(true)
    const snap = new Map(io.files)
    await ensureCalendar(project, env)
    expect(io.files).toEqual(snap)
    expect(project.manifest.calendar).toBeNull()
  })
  it('does not overwrite an unlisted calendar.json that is already there', async () => {
    const { io, env, project } = await book()
    io.files.set(CALENDAR_FILE, 'precious')
    await ensureCalendar(project, env)
    expect(io.files.get(CALENDAR_FILE)).toBe('precious')
    expect(project.manifest.calendar).toBeNull()
  })
})

describe('loadCalendar', () => {
  it('loads the listed file', async () => {
    const { env, project } = await book()
    await ensureCalendar(project, env)
    const r = await loadCalendar(project)
    expect(r.source).toBe('file')
    expect(r.warning).toBeUndefined()
    expect(r.calendar.months).toHaveLength(12)
  })
  it('no ref: Gregorian in memory, no warning, nothing written', async () => {
    const { io, project } = await book()
    const snap = new Map(io.files)
    const r = await loadCalendar(project)
    expect(r.source).toBe('fallback')
    expect(r.warning).toBeUndefined()
    expect(io.files).toEqual(snap)
  })
  it('ref present, file missing: fallback and warning, nothing written', async () => {
    const { io, env, project } = await book()
    await ensureCalendar(project, env)
    io.files.delete(CALENDAR_FILE)
    const snap = new Map(io.files)
    const r = await loadCalendar(project)
    expect(r.source).toBe('fallback')
    expect(r.warning?.kind).toBe('missing')
    expect(r.calendar.months).toHaveLength(12)
    expect(io.files).toEqual(snap)
  })
  it('invalid file: fallback and warning, file untouched', async () => {
    const { io, env, project } = await book()
    await ensureCalendar(project, env)
    io.files.set(CALENDAR_FILE, '{"version":1,"months":[]}')
    const r = await loadCalendar(project)
    expect(r.source).toBe('fallback')
    expect(r.warning?.kind).toBe('invalid')
    expect(io.files.get(CALENDAR_FILE)).toBe('{"version":1,"months":[]}')
  })
})

describe('saveCalendar', () => {
  it('writes only calendar.json', async () => {
    const { io, env, project } = await book()
    await ensureCalendar(project, env)
    const before = new Map(io.files)
    const { calendar } = await loadCalendar(project)
    await saveCalendar(project, { ...calendar, epochLabel: 'AD' })
    const changed = [...io.files].filter(([p, t]) => before.get(p) !== t).map(([p]) => p)
    expect(changed).toEqual([CALENDAR_FILE])
    expect((await loadCalendar(project)).calendar.epochLabel).toBe('AD')
  })
  it('rejects an invalid calendar without writing', async () => {
    const { io, env, project } = await book()
    await ensureCalendar(project, env)
    const before = io.files.get(CALENDAR_FILE)
    await expect(saveCalendar(project, { ...gregorianCalendar('x'), months: [] })).rejects.toThrow()
    expect(io.files.get(CALENDAR_FILE)).toBe(before)
  })
  it('throws when the project has no calendar entry or is read-only', async () => {
    const a = await book()
    await expect(saveCalendar(a.project, gregorianCalendar('x'))).rejects.toThrow()
    const b = await book(true)
    await expect(saveCalendar(b.project, gregorianCalendar('x'))).rejects.toThrow()
  })
})
