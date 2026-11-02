import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import { codexEntryPath } from './codex'
import {
  brokenStateKinds,
  brokenStateValues,
  deleteStateKindPlan,
  loadStateKinds,
  reassignStates,
  seedStateKinds,
  stateKindPath,
  statesPointingAt,
  validateState,
} from './states'
import { CODEX_ENTRY_VERSION, codexEntrySchema, type CodexEntry } from './schemas/codexEntry'
import { stateKindSchema, type StateKind } from './schemas/stateKind'
import { parseFile } from './serialize'
import type { Env } from './types'

const makeEnv = (): Env => {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const date = (year: number) => ({ date: { year, month: 0, day: 1 } })
const kind = (id: string, over: Partial<StateKind> = {}): StateKind =>
  stateKindSchema.parse({ version: 1, id, name: id, valueType: 'text', exclusive: false, ...over })
const state = (id: string, kindId: string, value: string, over = {}) => ({
  id,
  kindId,
  value,
  from: date(1),
  until: null,
  final: false,
  ...over,
})
const entry = (id: string, states: CodexEntry['states'] = []): CodexEntry =>
  codexEntrySchema.parse({ version: CODEX_ENTRY_VERSION, id, typeId: 't', name: id, states })

const kinds = [
  kind('loc', { valueType: 'entry', exclusive: true }),
  kind('own', { valueType: 'entry' }),
  kind('status'),
]

describe('paths', () => {
  it('state kind files live in state-kinds/', () => {
    expect(stateKindPath('x')).toBe('state-kinds/x.json')
  })
})

describe('validateState', () => {
  const live = new Set(['a', 'b'])
  const check = (kindId: string, value: string, owner = 'a') =>
    validateState({ kindId, value }, kinds, live, owner)

  it('accepts text and a live entry', () => {
    expect(check('status', 'alive')).toEqual({ ok: true })
    expect(check('loc', 'b')).toEqual({ ok: true })
  })
  it('rejects an unknown kind', () => {
    expect(check('nope', 'x')).toEqual({ ok: false, reason: 'unknown-kind' })
  })
  it('rejects an empty value', () => {
    expect(check('status', '  ')).toEqual({ ok: false, reason: 'empty-value' })
    expect(check('loc', '')).toEqual({ ok: false, reason: 'empty-value' })
  })
  it('rejects an entry value that is not live', () => {
    expect(check('loc', 'gone')).toEqual({ ok: false, reason: 'unknown-entry' })
  })
  it('rejects the owner as its own entry value, but not as text', () => {
    expect(check('loc', 'a')).toEqual({ ok: false, reason: 'self' })
    expect(check('status', 'a')).toEqual({ ok: true })
  })
})

describe('deleteStateKindPlan', () => {
  const entries = [
    entry('a', [state('s1', 'loc', 'b'), state('s2', 'status', 'x')]),
    entry('b', [state('s3', 'loc', 'a')]),
  ]
  const plan = (id: string, target?: string | null) =>
    deleteStateKindPlan(kinds, entries, id, target)

  it('an unused kind needs no target', () => {
    expect(plan('own')).toEqual({ ok: true, reassign: [], targetId: null, valueTypeChanges: 0 })
  })
  it('a used kind needs a different, known target', () => {
    expect(plan('loc')).toEqual({ ok: false, reason: 'target-required' })
    expect(plan('loc', 'loc')).toEqual({ ok: false, reason: 'bad-target' })
    expect(plan('loc', 'nope')).toEqual({ ok: false, reason: 'bad-target' })
  })
  it('lists the states to move', () => {
    expect(plan('loc', 'own')).toEqual({
      ok: true,
      reassign: [
        { entryId: 'a', stateId: 's1' },
        { entryId: 'b', stateId: 's3' },
      ],
      targetId: 'own',
      valueTypeChanges: 0,
    })
  })
  it('counts states that change value type', () => {
    const r = plan('loc', 'status')
    expect(r.ok && r.valueTypeChanges).toBe(2)
  })
  it('an unknown kind is refused', () => {
    expect(plan('nope')).toEqual({ ok: false, reason: 'unknown-kind' })
  })
  it('the last kind may go only when no state uses it', () => {
    const one = [kind('only')]
    expect(deleteStateKindPlan(one, [entry('a')], 'only').ok).toBe(true)
    expect(deleteStateKindPlan(one, [entry('a', [state('s', 'only', 'x')])], 'only')).toEqual({
      ok: false,
      reason: 'target-required',
    })
  })
})

describe('reassignStates', () => {
  it('rewrites the kind id and leaves everything else', () => {
    const entries = [entry('a', [state('s1', 'loc', 'b'), state('s2', 'status', 'x')]), entry('b')]
    const out = reassignStates(entries, 'loc', 'own')
    expect(out[0].states.map((s) => s.kindId)).toEqual(['own', 'status'])
    expect(out[0].states[0]).toMatchObject({ id: 's1', value: 'b' })
    expect(out[1]).toBe(entries[1])
    expect(entries[0].states[0].kindId).toBe('loc')
  })
})

describe('statesPointingAt', () => {
  const entries = [
    entry('npc', [
      state('s1', 'loc', 'town', { until: date(5), final: true }),
      state('s2', 'status', 'town'),
    ]),
    entry('sword', [
      state('s3', 'own', 'town'),
      state('s4', 'loc', 'other'),
      state('s5', 'gone', 'town'),
    ]),
  ]
  it('lists entry-valued states whose value is the entry', () => {
    expect(statesPointingAt(entries, kinds, 'town')).toEqual([
      { ownerId: 'npc', stateId: 's1', kindId: 'loc', from: date(1), until: date(5), final: true },
      { ownerId: 'sword', stateId: 's3', kindId: 'own', from: date(1), until: null, final: false },
    ])
  })
  it('lists nothing for an entry nobody points at', () => {
    expect(statesPointingAt(entries, kinds, 'npc')).toEqual([])
  })
})

describe('broken states', () => {
  const entries = [
    entry('a', [
      state('s1', 'loc', 'b'),
      state('s2', 'loc', 'gone'),
      state('s3', 'status', 'gone'),
      state('s4', 'nope', 'x'),
    ]),
  ]
  it('entry values pointing at no live entry', () => {
    expect(brokenStateValues(entries, kinds, new Set(['a', 'b']))).toEqual([
      { entryId: 'a', stateId: 's2' },
    ])
  })
  it('states whose kind is missing', () => {
    expect(brokenStateKinds(entries, kinds)).toEqual([{ entryId: 'a', stateId: 's4' }])
  })
  it('a good book has none', () => {
    const good = [entry('a', [state('s1', 'loc', 'b')])]
    expect(brokenStateValues(good, kinds, new Set(['a', 'b']))).toEqual([])
    expect(brokenStateKinds(good, kinds)).toEqual([])
  })
})

describe('seedStateKinds', () => {
  async function book(language = 'en', forceReadOnly = false) {
    const io = createMemoryProjectIO()
    const env = makeEnv()
    await createProject(io, { title: 'B', author: 'A', language }, env)
    const r = await openProject(io, env, forceReadOnly ? { forceReadOnly: 'locked-elsewhere' } : {})
    if (r.status !== 'ok') throw new Error('open failed')
    return { io, env, project: r.project }
  }
  const read = (io: { files: Map<string, string> }, path: string) => {
    const res = parseFile(stateKindSchema, io.files.get(path) as string, path)
    return res.ok ? res.value : null
  }

  it('an empty book gets four starter kinds, valid on disk', async () => {
    const { io, env, project } = await book()
    await seedStateKinds(project, env)
    const all = project.manifest.stateKinds.map((r) => read(io, r.path))
    expect(all.map((k) => [k?.name, k?.valueType, k?.exclusive])).toEqual([
      ['Location', 'entry', true],
      ['Owner', 'entry', true],
      ['Status', 'text', true],
      ['Title', 'text', false],
    ])
    expect(JSON.parse(io.files.get('project.json') as string).stateKinds).toHaveLength(4)
  })
  it('uses Polish names for a Polish book', async () => {
    const { io, env, project } = await book('pl')
    await seedStateKinds(project, env)
    expect(project.manifest.stateKinds.map((r) => read(io, r.path)?.name)).toEqual([
      'Lokalizacja',
      'Właściciel',
      'Status',
      'Tytuł',
    ])
  })
  it('is idempotent', async () => {
    const { io, env, project } = await book()
    await seedStateKinds(project, env)
    const before = new Map(io.files)
    await seedStateKinds(project, env)
    expect(io.files).toEqual(before)
  })
  it('does nothing when an entry already has states', async () => {
    const { env, project } = await book()
    const e = entry('e1', [state('s1', 'old', 'x')])
    await project.saveItem(codexEntryPath('e1'), codexEntrySchema, e)
    project.manifest.codexEntries = [{ id: 'e1', path: codexEntryPath('e1') }]
    await seedStateKinds(project, env)
    expect(project.manifest.stateKinds).toEqual([])
  })
  it('seeds when entries exist but have no states', async () => {
    const { env, project } = await book()
    await project.saveItem(codexEntryPath('e1'), codexEntrySchema, entry('e1'))
    project.manifest.codexEntries = [{ id: 'e1', path: codexEntryPath('e1') }]
    await seedStateKinds(project, env)
    expect(project.manifest.stateKinds).toHaveLength(4)
  })
  it('does nothing when read-only', async () => {
    const { io, env, project } = await book('en', true)
    const before = new Map(io.files)
    await seedStateKinds(project, env)
    expect(project.manifest.stateKinds).toEqual([])
    expect(io.files).toEqual(before)
  })
  it('writes nothing and keeps the manifest when a write fails', async () => {
    const { io, env, project } = await book()
    const real = project.saveItem
    let n = 0
    project.saveItem = async (...a) => {
      if (++n === 3) throw new Error('disk full')
      return real(...a)
    }
    await expect(seedStateKinds(project, env)).rejects.toThrow('disk full')
    expect(project.manifest.stateKinds).toEqual([])
    expect([...io.files.keys()].some((k) => k.startsWith('state-kinds/'))).toBe(false)
  })
})

describe('loadStateKinds', () => {
  it('loads valid files, reports an invalid or missing one, never repairs it', async () => {
    const io = createMemoryProjectIO()
    const env = makeEnv()
    await createProject(io, { title: 'B', author: 'A', language: 'en' }, env)
    const r = await openProject(io, env)
    if (r.status !== 'ok') throw new Error('open failed')
    const { project } = r
    await project.saveItem(stateKindPath('k1'), stateKindSchema, kind('k1'))
    io.files.set(stateKindPath('k2'), '{"version":1,"id":"k2"}')
    project.manifest.stateKinds = ['k1', 'k2', 'k3'].map((id) => ({ id, path: stateKindPath(id) }))
    const l = await loadStateKinds(project)
    expect([...l.items.keys()]).toEqual(['k1'])
    expect(l.status.get('k2')).toBe('invalid')
    expect(l.status.get('k3')).toBe('missing')
    expect(io.files.get(stateKindPath('k2'))).toBe('{"version":1,"id":"k2"}')
  })
})
