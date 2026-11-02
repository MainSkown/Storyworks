import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { calendarSchema } from '../calendar/schema'
import { parseFile } from '../project/serialize'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { createProject } from '../project/open'
import { timelinePath } from '../project/timelines'
import { timelineSchema } from './schema'
import { useTimelinesStore } from './store'

const META = { title: 'My Book', author: 'Ann', language: 'en' }
let io: MemoryProjectIO

beforeEach(() => {
  io = createMemoryProjectIO()
  setProjectIOFactory(() => io)
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

async function opened() {
  setActivePinia(createPinia())
  const p = useProjectStore()
  expect(await p.create('book', META)).toBe('opened')
  return { p, t: useTimelinesStore() }
}

const disk = (id: string) => {
  const r = parseFile(timelineSchema, io.files.get(timelinePath(id)) as string, 'x')
  if (!r.ok) throw new Error('timeline invalid on disk')
  return r.value
}
const must = <T extends { ok: boolean }>(r: T) => {
  expect(r.ok).toBe(true)
  return r as Extract<T, { ok: true }>
}

describe('open', () => {
  it('a new book gets Main timeline (current) and a calendar', async () => {
    const { p, t } = await opened()
    expect(t.entries.map((e) => e.name)).toEqual(['Main timeline'])
    expect(t.current?.name).toBe('Main timeline')
    expect(p.project?.manifest.calendar).not.toBeNull()
    expect(t.usingFallbackCalendar).toBe(false)
  })

  it('reopening creates nothing more', async () => {
    const { p } = await opened()
    await p.flush()
    const snap = new Map([...io.files].filter(([k]) => !k.endsWith('.lock') && !k.includes('/backups/')))
    await p.open('book')
    expect(new Map([...io.files].filter(([k]) => !k.endsWith('.lock') && !k.includes('/backups/')))).toEqual(snap)
  })

  it('read-only open creates nothing and shows no timelines', async () => {
    const { p } = await opened()
    await p.close()
    const bare = createMemoryProjectIO()
    io = bare
    await createProject(bare, META)
    const m = JSON.parse(bare.files.get('project.json') as string)
    bare.files.set('project.json', JSON.stringify({ ...m, kind: 'other' }))
    const before = new Map(bare.files)
    expect(await p.open('book2')).toBe('opened')
    expect(p.readOnly).not.toBeNull()
    expect(bare.files).toEqual(before)
    expect(useTimelinesStore().entries).toEqual([])
  })

  it('an invalid timeline file is marked invalid, others work, file untouched', async () => {
    const { p, t } = await opened()
    const second = (await t.createTimeline('Second')) as string
    await p.flush()
    const bad = '{"broken":'
    io.files.set(timelinePath(second), bad)
    await p.open('book')
    const t2 = useTimelinesStore()
    expect(t2.entries.map((e) => e.status)).toEqual(['ok', 'invalid'])
    expect(t2.current?.name).toBe('Main timeline')
    expect(t2.select(second)).toBeUndefined()
    expect(t2.currentId).not.toBe(second)
    await p.flush()
    expect(io.files.get(timelinePath(second))).toBe(bad)
  })

  it('a listed timeline whose file is gone is marked missing', async () => {
    const { p, t } = await opened()
    const id = t.entries[0].id
    await p.flush()
    io.files.delete(timelinePath(id))
    await p.open('book')
    expect(useTimelinesStore().entries[0].status).toBe('missing')
  })
})

describe('timelines', () => {
  it('create, rename and edits are saved to the file and manifest', async () => {
    const { p, t } = await opened()
    const id = (await t.createTimeline('Backstory')) as string
    expect(t.currentId).toBe(id)
    expect(t.renameTimeline(id, 'Past')).toBe(true)
    await p.flush()
    expect(disk(id).name).toBe('Past')
    const refs = JSON.parse(io.files.get('project.json') as string).timelines
    expect(refs.map((r: { title: string }) => r.title)).toEqual(['Main timeline', 'Past'])
  })

  it('delete goes to the trash and restore brings it back at the same place', async () => {
    const { p, t } = await opened()
    const a = (await t.createTimeline('A')) as string
    await t.createTimeline('B')
    const main = t.entries[0].id
    expect(await t.deleteTimeline(a)).toBe(true)
    expect(t.entries.map((e) => e.name)).toEqual(['Main timeline', 'B'])
    expect(io.files.has(timelinePath(a))).toBe(false)
    expect(p.trash.map((x) => [x.id, x.type])).toEqual([[a, 'timeline']])
    await t.restoreTimeline(a)
    expect(t.entries.map((e) => e.name)).toEqual(['Main timeline', 'A', 'B'])
    expect(t.entries[0].id).toBe(main)
    expect(p.trash).toEqual([])
    expect(io.files.has(timelinePath(a))).toBe(true)
  })

  it('deleting the current timeline moves to another', async () => {
    const { t } = await opened()
    const b = (await t.createTimeline('B')) as string
    await t.deleteTimeline(b)
    expect(t.current?.name).toBe('Main timeline')
  })
})

describe('nodes, edges, branches', () => {
  it('add node after the selected one, connect, and persist', async () => {
    const { p, t } = await opened()
    const a = must(t.addNode({ title: 'A' })).id
    const b = must(t.addNode({ title: 'B', connect: true })).id
    expect(t.selectedNodeId).toBe(b)
    expect(t.current?.edges.map((e) => [e.from, e.to])).toEqual([[a, b]])
    await p.flush()
    expect(disk(t.currentId as string).nodes.map((n) => n.title)).toEqual(['A', 'B'])
  })

  it('a cycle is rejected and nothing changes', async () => {
    const { t } = await opened()
    const a = must(t.addNode()).id
    const b = must(t.addNode({ connect: true })).id
    const before = t.current
    expect(t.connectNodes(b, a)).toEqual({ ok: false, reason: 'cycle' })
    expect(t.current).toBe(before)
  })

  it('delete node removes its edges and selection', async () => {
    const { t } = await opened()
    const a = must(t.addNode()).id
    const b = must(t.addNode({ connect: true })).id
    must(await t.deleteNode(b))
    expect(t.current?.edges).toEqual([])
    expect(t.selectedNodeId).toBeNull()
    expect(t.current?.nodes.map((n) => n.id)).toEqual([a])
  })

  it('branches, view and tidy are saved', async () => {
    const { p, t } = await opened()
    const a = must(t.addNode()).id
    const br = must(t.addBranch({ name: 'Alt', color: '#c00', dashed: true })).id
    must(t.updateNode(a, { branchId: br }))
    must(t.setView('date'))
    must(t.tidy())
    await p.flush()
    const f = disk(t.currentId as string)
    expect(f.view).toBe('date')
    expect(f.nodes[0].branchId).toBe(br)
    expect(t.deleteBranch(br).ok).toBe(true)
    expect(t.current?.nodes[0].branchId).toBeNull()
  })

  it('filters: tag toggle dims the rest; switching timelines clears the filter', async () => {
    const { t } = await opened()
    const a = must(t.addNode()).id
    const b = must(t.addNode()).id
    t.updateNode(a, { tag: 'war' })
    t.updateNode(b, { tag: 'peace' })
    expect(t.tags).toEqual(['peace', 'war'])
    t.toggleTag('war')
    expect([...(t.filterResult?.matched ?? [])]).toEqual([a])
    await t.createTimeline('Other')
    expect(t.filterActive).toBe(false)
  })

  it('edits are refused on a read-only project', async () => {
    const { p, t } = await opened()
    ;(p.project as { readOnly: unknown }).readOnly = { reason: 'locked-elsewhere' }
    expect(t.addNode()).toEqual({ ok: false, reason: 'read-only' })
  })
})

describe('calendar', () => {
  it('a bad date is flagged, kept, and unflagged when the calendar allows it', async () => {
    const { t } = await opened()
    const a = must(t.addNode()).id
    t.updateNode(a, { date: { year: 2023, month: 1, day: 29 } }) // not a leap year
    expect(t.invalidDates.get(a)).toBe('day')
    expect(t.invalidDateCount).toBe(1)
    expect(t.current?.nodes[0].date).toEqual({ year: 2023, month: 1, day: 29 })
    t.updateNode(a, { date: { year: 2024, month: 1, day: 29 } })
    expect(t.invalidDates.size).toBe(0)
  })

  it('saving a calendar counts dates that no longer fit, keeps them, writes only calendar.json', async () => {
    const { p, t } = await opened()
    const a = must(t.addNode()).id
    t.updateNode(a, { date: { year: 2024, month: 1, day: 29 } })
    await p.flush()
    const before = new Map(io.files)
    const next = { ...t.calendar, leap: null }
    expect(t.datesNoLongerFit(next)).toBe(1)
    const r = must(await t.saveCalendar(next))
    expect(r.noLongerFit).toBe(1)
    expect(t.invalidDates.get(a)).toBe('day')
    expect(t.current?.nodes[0].date).toEqual({ year: 2024, month: 1, day: 29 })
    const changed = [...io.files].filter(([k, v]) => before.get(k) !== v).map(([k]) => k)
    expect(changed).toEqual(['calendar.json'])
    const saved = parseFile(calendarSchema, io.files.get('calendar.json') as string, 'c')
    expect(saved.ok && saved.value.leap).toBeNull()
  })

  it('a listed but invalid calendar.json falls back to Gregorian with a warning, file untouched', async () => {
    const { p } = await opened()
    await p.flush()
    io.files.set('calendar.json', '{"bad":1}')
    await p.open('book')
    const t = useTimelinesStore()
    expect(t.usingFallbackCalendar).toBe(true)
    expect(t.calendarWarning?.kind).toBe('invalid')
    await p.flush()
    expect(io.files.get('calendar.json')).toBe('{"bad":1}')
  })
})

describe('outside changes', () => {
  it('an edited timeline file is picked up after the project store reloads it', async () => {
    const { p, t } = await opened()
    const id = t.currentId as string
    await p.flush()
    const edited = { ...disk(id), name: 'Renamed outside' }
    io.files.set(timelinePath(id), JSON.stringify(edited))
    await p.resolveExternal(timelinePath(id), 'reload')
    await new Promise((r) => setTimeout(r, 10))
    expect(t.entries[0].name).toBe('Renamed outside')
  })
})

describe('node trash', () => {
  async function chain() {
    const { p, t } = await opened()
    const a = must(t.addNode({ title: 'A' })).id
    const b = must(t.addNode({ title: 'B', connect: true })).id
    const c = must(t.addNode({ title: 'C', connect: true })).id
    return { p, t, a, b, c, tl: t.currentId as string }
  }

  it('delete moves the node and its edges to the trash', async () => {
    const { p, t, a, b, c, tl } = await chain()
    must(await t.deleteNode(b))
    expect(t.current?.nodes.map((n) => n.id)).toEqual([a, c])
    expect(t.current?.edges).toEqual([])
    expect(p.trash.map((x) => [x.id, x.type, x.parentId, x.index])).toEqual([[b, 'node', tl, 1]])
    expect(io.files.has(`.storyworks/trash/${b}/node.json`)).toBe(true)
    await p.flush()
    expect(disk(tl).nodes.map((n) => n.id)).toEqual([a, c])
  })

  it('restore brings back the same id, place and edges, and clears the trash', async () => {
    const { p, t, a, b, c, tl } = await chain()
    must(await t.deleteNode(b))
    const r = await t.restoreNode(b)
    expect(r).toEqual({ ok: true, skippedEdges: 0 })
    expect(t.current?.nodes.map((n) => n.id)).toEqual([a, b, c])
    expect(t.current?.edges.map((e) => [e.from, e.to])).toEqual([[a, b], [b, c]])
    expect(p.trash).toEqual([])
    expect(io.files.has(`.storyworks/trash/${b}/node.json`)).toBe(false)
    await p.flush()
    expect(disk(tl).nodes.map((n) => n.id)).toEqual([a, b, c])
  })

  it('restore reports edges it could not bring back', async () => {
    const { t, a, b } = await chain()
    must(await t.deleteNode(b))
    must(await t.deleteNode(a))
    expect(await t.restoreNode(b)).toEqual({ ok: true, skippedEdges: 1 })
  })

  it('restore through the project store works too', async () => {
    const { p, t, b } = await chain()
    must(await t.deleteNode(b))
    const r = await p.restoreItem(b)
    expect(r).toEqual({ skippedEdges: 0 })
    expect(t.current?.nodes.map((n) => n.id)).toContain(b)
  })

  it('restore is refused while the timeline is in the trash', async () => {
    const { p, t, b, tl } = await chain()
    must(await t.deleteNode(b))
    await t.deleteTimeline(tl)
    expect(await t.restoreNode(b)).toEqual({ ok: false, reason: 'timeline-trashed' })
    expect(p.trash.some((x) => x.id === b)).toBe(true)
  })

  it('restore of an invalid trashed file is refused and the file is untouched', async () => {
    const { t, b } = await chain()
    must(await t.deleteNode(b))
    io.files.set(`.storyworks/trash/${b}/node.json`, '{"nope":1}')
    expect(await t.restoreNode(b)).toEqual({ ok: false, reason: 'file-invalid' })
    expect(io.files.get(`.storyworks/trash/${b}/node.json`)).toBe('{"nope":1}')
  })
})
