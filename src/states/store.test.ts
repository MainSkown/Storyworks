import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { createProject } from '../project/open'
import { codexEntryPath } from '../project/codex'
import { stateKindPath } from '../project/states'
import { useCodexStore } from '../codex/store'
import { useStatesStore } from './store'

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

const date = (year: number) => ({ date: { year, month: 0, day: 1 } })

async function opened() {
  setActivePinia(createPinia())
  const p = useProjectStore()
  expect(await p.create('book', META)).toBe('opened')
  const c = useCodexStore()
  const s = useStatesStore()
  const a = (await c.createEntry({ name: 'Anna' })) as string
  const town = (await c.createEntry({ name: 'Riverton' })) as string
  const [loc, owner, status, title] = s.kinds
  return { p, c, s, a, town, loc, owner, status, title }
}

const json = (path: string) => JSON.parse(io.files.get(path) as string)
const manifest = () => json('project.json')

describe('open', () => {
  it('a new book gets the four starter kinds once', async () => {
    const { p, s } = await opened()
    expect(s.kinds.map((k) => [k.name, k.valueType, k.exclusive])).toEqual([
      ['Location', 'entry', true],
      ['Owner', 'entry', true],
      ['Status', 'text', true],
      ['Title', 'text', false],
    ])
    await p.flush()
    const snap = new Map([...io.files].filter(([k]) => !k.endsWith('.lock') && !k.includes('/backups/')))
    await p.open('book')
    expect(new Map([...io.files].filter(([k]) => !k.endsWith('.lock') && !k.includes('/backups/')))).toEqual(snap)
    expect(useStatesStore().kinds).toHaveLength(4)
  })

  it('an invalid kind file is listed as invalid and never repaired', async () => {
    const { p, s } = await opened()
    await p.flush()
    const id = s.kinds[3].id
    io.files.set(stateKindPath(id), '{"version":1}')
    await p.open('book')
    const s2 = useStatesStore()
    expect(s2.kinds.map((k) => k.id)).not.toContain(id)
    expect(s2.kindList.find((k) => k.id === id)).toMatchObject({ status: 'invalid' })
    expect(io.files.get(stateKindPath(id))).toBe('{"version":1}')
  })
})

describe('kinds', () => {
  it('create, update and rename keep the manifest title in step', async () => {
    const { p, s } = await opened()
    const id = (await s.createKind(' Mood ', { valueType: 'text', exclusive: false })) as string
    expect(s.kinds.at(-1)).toMatchObject({ id, name: 'Mood', valueType: 'text', exclusive: false })
    expect(s.updateKind(id, { name: 'Feeling', exclusive: true })).toEqual({ ok: true })
    await p.flush()
    expect(json(stateKindPath(id))).toMatchObject({ name: 'Feeling', exclusive: true })
    expect(manifest().stateKinds.at(-1)).toMatchObject({ id, title: 'Feeling' })
  })

  it('an empty name is refused; unknown kind is refused', async () => {
    const { s } = await opened()
    expect(await s.createKind(' ', { valueType: 'text', exclusive: false })).toBeNull()
    expect(s.updateKind(s.kinds[0].id, { name: ' ' })).toEqual({ ok: false, reason: 'empty-name' })
    expect(s.updateKind('nope', { name: 'x' })).toEqual({ ok: false, reason: 'unknown-kind' })
  })

  it('the value type cannot change while states use the kind', async () => {
    const { s, a, status } = await opened()
    expect(s.updateKind(status.id, { valueType: 'entry' })).toEqual({ ok: true })
    expect(s.updateKind(status.id, { valueType: 'text' })).toEqual({ ok: true })
    s.addState(a, { kindId: status.id, value: 'alive', from: date(1) })
    expect(s.updateKind(status.id, { valueType: 'entry' })).toEqual({
      ok: false,
      reason: 'kind-in-use',
    })
    expect(s.updateKind(status.id, { exclusive: false })).toEqual({ ok: true })
  })

  it('delete of a used kind needs a target; states are rewritten on disk', async () => {
    const { p, s, a, status, title } = await opened()
    const added = s.addState(a, { kindId: status.id, value: 'alive', from: date(1) })
    if (!added.ok) throw new Error('add failed')
    expect(s.planDeleteKind(status.id)).toEqual({ ok: false, reason: 'target-required' })
    expect(await s.deleteKind(status.id)).toEqual({ ok: false, reason: 'target-required' })
    expect(await s.deleteKind(status.id, status.id)).toEqual({ ok: false, reason: 'bad-target' })
    expect(await s.deleteKind(status.id, title.id)).toEqual({
      ok: true,
      moved: 1,
      valueTypeChanges: 0,
    })
    expect(s.statesFor(a)[0].kindId).toBe(title.id)
    await p.flush()
    expect(json(codexEntryPath(a)).states[0].kindId).toBe(title.id)
    expect(io.files.has(stateKindPath(status.id))).toBe(false)
    expect(manifest().stateKinds.map((k: { id: string }) => k.id)).not.toContain(status.id)
  })

  it('moving between value types is reported', async () => {
    const { s, a, town, loc, status } = await opened()
    s.addState(a, { kindId: loc.id, value: town, from: date(1) })
    expect(s.planDeleteKind(loc.id, status.id)).toMatchObject({ ok: true, valueTypeChanges: 1 })
  })

  it('an unused kind deletes without a target', async () => {
    const { p, s, title } = await opened()
    expect(await s.deleteKind(title.id)).toEqual({ ok: true, moved: 0, valueTypeChanges: 0 })
    await p.flush()
    expect(io.files.has(stateKindPath(title.id))).toBe(false)
    expect(s.kinds).toHaveLength(3)
  })
})

describe('states', () => {
  it('add, update and remove are saved on the entry file', async () => {
    const { p, s, a, town, loc } = await opened()
    const added = s.addState(a, { kindId: loc.id, value: town, from: date(1), until: date(5) })
    if (!added.ok) throw new Error('add failed')
    expect(s.statesFor(a)).toEqual([
      { id: added.id, kindId: loc.id, value: town, from: date(1), until: date(5), final: false },
    ])
    expect(s.updateState(a, added.id, { until: null, final: true })).toEqual({ ok: true })
    await p.flush()
    expect(json(codexEntryPath(a)).states[0]).toMatchObject({
      id: added.id,
      until: null,
      final: true,
    })
    expect(s.removeState(a, added.id)).toEqual({ ok: true })
    await p.flush()
    expect(json(codexEntryPath(a)).states).toEqual([])
    expect(s.removeState(a, added.id)).toEqual({ ok: false, reason: 'unknown-state' })
  })

  it('refuses a bad kind, empty value, missing entry, itself and an unknown owner', async () => {
    const { s, a, loc, status } = await opened()
    const add = (kindId: string, value: string, owner = a) =>
      s.addState(owner, { kindId, value, from: date(1) })
    expect(add('nope', 'x')).toEqual({ ok: false, reason: 'unknown-kind' })
    expect(add(status.id, ' ')).toEqual({ ok: false, reason: 'empty-value' })
    expect(add(loc.id, 'gone')).toEqual({ ok: false, reason: 'unknown-entry' })
    expect(add(loc.id, a)).toEqual({ ok: false, reason: 'self' })
    expect(add(status.id, 'x', 'nobody')).toEqual({ ok: false, reason: 'unknown-owner' })
    expect(s.statesFor(a)).toEqual([])
  })

  it('refuses an until that is before from, as judged by the injected order function', async () => {
    const { s, a, status } = await opened()
    const before = (from: unknown, until: unknown) => JSON.stringify(until) < JSON.stringify(from)
    const input = { kindId: status.id, value: 'x', from: date(5), until: date(1) }
    expect(s.addState(a, input, before)).toEqual({ ok: false, reason: 'until-before-from' })
    expect(s.addState(a, input).ok).toBe(true)
    const ok = s.addState(a, { ...input, until: date(9) }, before)
    if (!ok.ok) throw new Error('add failed')
    expect(s.updateState(a, ok.id, { until: date(2) }, before)).toEqual({
      ok: false,
      reason: 'until-before-from',
    })
  })

  it('a broken entry value stays editable; changing the value is re-checked', async () => {
    const { c, s, a, town, loc } = await opened()
    const added = s.addState(a, { kindId: loc.id, value: town, from: date(1) })
    if (!added.ok) throw new Error('add failed')
    await c.deleteEntry(town)
    expect(s.brokenStateValueIds).toEqual([{ entryId: a, stateId: added.id }])
    expect(s.updateState(a, added.id, { final: true })).toEqual({ ok: true })
    expect(s.updateState(a, added.id, { value: 'gone' })).toEqual({
      ok: false,
      reason: 'unknown-entry',
    })
  })

  it('the reverse view lists entry-valued states pointing at an entry', async () => {
    const { s, a, town, loc, owner } = await opened()
    const x = s.addState(a, { kindId: loc.id, value: town, from: date(1) })
    const y = s.addState(a, { kindId: owner.id, value: town, from: date(2), final: true })
    if (!x.ok || !y.ok) throw new Error('add failed')
    expect(s.statesPointingAt(town).map((r) => [r.ownerId, r.stateId, r.kindId, r.final])).toEqual([
      [a, x.id, loc.id, false],
      [a, y.id, owner.id, true],
    ])
    expect(s.statesPointingAt(a)).toEqual([])
  })

  it('a state whose kind was lost is reported', async () => {
    const { p, s, a, status } = await opened()
    const added = s.addState(a, { kindId: status.id, value: 'x', from: date(1) })
    if (!added.ok) throw new Error('add failed')
    await p.flush()
    io.files.set(stateKindPath(status.id), '{"version":1}')
    await p.open('book')
    expect(useStatesStore().brokenStateKindIds).toEqual([{ entryId: a, stateId: added.id }])
  })

  it('read-only refuses writes', async () => {
    const { p, s, a, status } = await opened()
    await p.close()
    const bare = createMemoryProjectIO()
    io = bare
    await createProject(bare, META)
    const m = JSON.parse(bare.files.get('project.json') as string)
    bare.files.set('project.json', JSON.stringify({ ...m, kind: 'other' }))
    const before = new Map(bare.files)
    expect(await p.open('book2')).toBe('opened')
    expect(bare.files).toEqual(before)
    expect(s.kinds).toEqual([])
    expect(await s.createKind('X', { valueType: 'text', exclusive: false })).toBeNull()
    expect(s.addState(a, { kindId: status.id, value: 'x', from: date(1) })).toEqual({
      ok: false,
      reason: 'read-only',
    })
  })
})
