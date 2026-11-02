import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import {
  brokenMemberships,
  brokenNodeRefs,
  brokenRelationships,
  addMember,
  deleteRelationTypePlan,
  groupsOfEntry,
  loadGroups,
  loadRelationTypes,
  loadRelationships,
  reassignRelationships,
  relationTypePath,
  relationshipPath,
  groupPath,
  RELATION_LAYOUT_PATH,
  relationsOf,
  relationshipsOnNode,
  removeMember,
  seedRelationTypes,
  validateNewRelationship,
} from './relations'
import { groupSchema, type Group } from './schemas/group'
import { relationTypeSchema, type RelationType } from './schemas/relationType'
import { relationshipSchema, type Relationship } from './schemas/relationship'
import { parseFile } from './serialize'
import type { Timeline } from '../timeline/schema'
import type { Env } from './types'

const makeEnv = (): Env => {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const type = (id: string, over: Partial<RelationType> = {}): RelationType =>
  relationTypeSchema.parse({ version: 1, id, name: id, color: '#000', ...over })
const rel = (id: string, fromId: string, toId: string, typeId = 't1', over: Partial<Relationship> = {}) =>
  relationshipSchema.parse({ version: 1, id, fromId, toId, typeId, ...over })
const group = (id: string, memberIds: string[]): Group =>
  groupSchema.parse({ version: 1, id, name: id, color: '#000', memberIds })

const types = [type('t1', { name: 'Parent', reverseLabel: 'Child' }), type('t2', { name: 'Friend' })]

describe('paths', () => {
  it('are stable', () => {
    expect(relationTypePath('x')).toBe('relation-types/x.json')
    expect(relationshipPath('x')).toBe('relationships/x.json')
    expect(groupPath('x')).toBe('groups/x.json')
    expect(RELATION_LAYOUT_PATH).toBe('relationships/layout.json')
  })
})

describe('validateNewRelationship', () => {
  const ctx = { entryIds: new Set(['a', 'b', 'c']), typeIds: new Set(['t1', 't2']) }
  const existing = [rel('r1', 'a', 'b', 't1')]
  const check = (c: Pick<Relationship, 'id' | 'fromId' | 'toId' | 'typeId'>) =>
    validateNewRelationship(existing, c, ctx)

  it('accepts a new pair', () => expect(check({ id: 'n', fromId: 'a', toId: 'c', typeId: 't1' })).toEqual({ ok: true }))
  it('rejects self', () =>
    expect(check({ id: 'n', fromId: 'a', toId: 'a', typeId: 't1' })).toEqual({ ok: false, reason: 'self' }))
  it('rejects an exact duplicate', () =>
    expect(check({ id: 'n', fromId: 'a', toId: 'b', typeId: 't1' })).toEqual({ ok: false, reason: 'duplicate' }))
  it('the reverse direction is not a duplicate', () =>
    expect(check({ id: 'n', fromId: 'b', toId: 'a', typeId: 't1' })).toEqual({ ok: true }))
  it('another type is not a duplicate', () =>
    expect(check({ id: 'n', fromId: 'a', toId: 'b', typeId: 't2' })).toEqual({ ok: true }))
  it('editing a relationship ignores itself', () =>
    expect(check({ id: 'r1', fromId: 'a', toId: 'b', typeId: 't1' })).toEqual({ ok: true }))
  it('rejects unknown type and unknown entry', () => {
    expect(check({ id: 'n', fromId: 'a', toId: 'c', typeId: 'zz' })).toEqual({ ok: false, reason: 'unknown-type' })
    expect(check({ id: 'n', fromId: 'a', toId: 'zz', typeId: 't1' })).toEqual({ ok: false, reason: 'unknown-entry' })
  })
})

describe('deleteRelationTypePlan', () => {
  const ids = ['t1', 't2', 't3']
  const rels = [rel('r1', 'a', 'b', 't1')]

  it('unknown type is refused; an unused type deletes without a target', () => {
    expect(deleteRelationTypePlan(ids, rels, 't9')).toEqual({ ok: false, reason: 'unknown-type' })
    expect(deleteRelationTypePlan(ids, rels, 't3')).toEqual({ ok: true, reassign: [], targetId: null })
  })
  it('a used type needs a valid other target', () => {
    expect(deleteRelationTypePlan(ids, rels, 't1')).toEqual({ ok: false, reason: 'target-required' })
    expect(deleteRelationTypePlan(ids, rels, 't1', 't1')).toEqual({ ok: false, reason: 'bad-target' })
    expect(deleteRelationTypePlan(ids, rels, 't1', 'zz')).toEqual({ ok: false, reason: 'bad-target' })
    expect(deleteRelationTypePlan(ids, rels, 't1', 't2')).toEqual({ ok: true, reassign: ['r1'], targetId: 't2' })
  })
  it('the last type may go only when unused', () => {
    expect(deleteRelationTypePlan(['t1'], [], 't1')).toEqual({ ok: true, reassign: [], targetId: null })
    expect(deleteRelationTypePlan(['t1'], rels, 't1')).toEqual({ ok: false, reason: 'target-required' })
  })
  it('reassignRelationships moves only that type and does not mutate', () => {
    const out = reassignRelationships([...rels, rel('r2', 'a', 'c', 't2')], 't1', 't3')
    expect(out.map((r) => r.typeId)).toEqual(['t3', 't2'])
    expect(rels[0].typeId).toBe('t1')
  })
})

describe('relationsOf', () => {
  const rels = [rel('r1', 'a', 'b', 't1'), rel('r2', 'c', 'a', 't1'), rel('r3', 'a', 'c', 't2'), rel('r4', 'x', 'y', 't1')]
  const rows = relationsOf('a', rels, types)

  it('lists outgoing and incoming in manifest order', () => {
    expect(rows.map((r) => [r.relationship.id, r.otherId, r.direction])).toEqual([
      ['r1', 'b', 'out'],
      ['r2', 'c', 'in'],
      ['r3', 'c', 'out'],
    ])
  })
  it('incoming rows use the reverse label', () => expect(rows[1].label).toBe('Child'))
  it('outgoing rows use the name', () => expect(rows[0].label).toBe('Parent'))
  it('an empty reverse label falls back to the name on the incoming side', () => {
    const r = relationsOf('c', [rel('r3', 'a', 'c', 't2')], types)
    expect(r[0]).toMatchObject({ direction: 'in', label: 'Friend' })
  })
  it('an unknown type gives an empty label, not a crash', () => {
    expect(relationsOf('a', [rel('r9', 'a', 'b', 'zz')], types)[0].label).toBe('')
  })
})

describe('broken relationships and memberships', () => {
  const live = new Set(['a', 'b'])

  it('a missing endpoint on either side is broken', () => {
    const rels = [rel('r1', 'a', 'b'), rel('r2', 'a', 'z'), rel('r3', 'z', 'b')]
    expect(brokenRelationships(rels, live)).toEqual(['r2', 'r3'])
  })
  it('restoring the entry un-breaks', () => {
    const rels = [rel('r2', 'a', 'z')]
    expect(brokenRelationships(rels, new Set([...live, 'z']))).toEqual([])
  })
  it('lists group members that are not live', () => {
    expect(brokenMemberships([group('g1', ['a', 'z']), group('g2', ['b'])], live)).toEqual([
      { groupId: 'g1', entryId: 'z' },
    ])
  })
})

describe('groups', () => {
  const groups = [group('g1', ['a', 'b']), group('g2', ['a']), group('g3', [])]

  it('an entry can be in several groups', () =>
    expect(groupsOfEntry(groups, 'a').map((g) => g.id)).toEqual(['g1', 'g2']))
  it('addMember appends once and does not mutate', () => {
    const g = groups[2]
    const once = addMember(g, 'a')
    expect(once.memberIds).toEqual(['a'])
    expect(addMember(once, 'a')).toBe(once)
    expect(g.memberIds).toEqual([])
  })
  it('removeMember removes and tolerates a non-member', () => {
    expect(removeMember(groups[0], 'a').memberIds).toEqual(['b'])
    expect(removeMember(groups[0], 'zz')).toBe(groups[0])
  })
})

describe('node back-links', () => {
  const tl = (id: string, nodeIds: string[]) => ({ id, nodes: nodeIds.map((n) => ({ id: n })) }) as unknown as Timeline
  const timelines = [tl('tl1', ['n1', 'n2'])]
  const rels = [
    rel('r1', 'a', 'b', 't1', { nodeRef: { timelineId: 'tl1', nodeId: 'n1' } }),
    rel('r2', 'a', 'b', 't2', { nodeRef: { timelineId: 'tl1', nodeId: 'gone' } }),
    rel('r3', 'b', 'a'),
    rel('r4', 'b', 'c', 't1', { nodeRef: { timelineId: 'tlX', nodeId: 'n1' } }),
  ]

  it('relationshipsOnNode finds by timeline and node', () => {
    expect(relationshipsOnNode(rels, 'tl1', 'n1').map((r) => r.id)).toEqual(['r1'])
    expect(relationshipsOnNode(rels, 'tl1', 'n2')).toEqual([])
  })
  it('brokenNodeRefs reports a missing node or timeline', () => {
    expect(brokenNodeRefs(rels, timelines)).toEqual(['r2', 'r4'])
  })
})

describe('seedRelationTypes', () => {
  async function book(language = 'en', forceReadOnly = false) {
    const io = createMemoryProjectIO()
    const env = makeEnv()
    await createProject(io, { title: 'B', author: 'A', language }, env)
    const r = await openProject(io, env, forceReadOnly ? { forceReadOnly: 'locked-elsewhere' } : {})
    if (r.status !== 'ok') throw new Error('open failed')
    return { io, env, project: r.project }
  }
  const read = (io: { files: Map<string, string> }, path: string) => {
    const res = parseFile(relationTypeSchema, io.files.get(path) as string, path)
    return res.ok ? res.value : null
  }

  it('an empty book gets seven starter types with reverse labels, valid on disk', async () => {
    const { io, env, project } = await book()
    await seedRelationTypes(project, env)
    expect(project.manifest.relationTypes).toHaveLength(7)
    const all = project.manifest.relationTypes.map((r) => read(io, r.path))
    expect(all.map((t) => t?.name)).toEqual(['Friend', 'Enemy', 'Parent', 'Sibling', 'Lover', 'Located in', 'Owns'])
    expect(all.map((t) => t?.reverseLabel)).toEqual(['', '', 'Child', '', '', 'Contains', 'Owned by'])
    expect(JSON.parse(io.files.get('project.json') as string).relationTypes).toHaveLength(7)
  })
  it('uses Polish names for a Polish book', async () => {
    const { io, env, project } = await book('pl')
    await seedRelationTypes(project, env)
    const all = project.manifest.relationTypes.map((r) => read(io, r.path))
    expect(all.map((t) => t?.name)).toEqual([
      'Przyjaciel', 'Wróg', 'Rodzic', 'Rodzeństwo', 'Partner', 'Znajduje się w', 'Posiada',
    ])
    expect(all[2]?.reverseLabel).toBe('Dziecko')
  })
  it('is idempotent', async () => {
    const { io, env, project } = await book()
    await seedRelationTypes(project, env)
    const before = new Map(io.files)
    await seedRelationTypes(project, env)
    expect(io.files).toEqual(before)
  })
  it('does nothing when the book already has relationships', async () => {
    const { env, project } = await book()
    project.manifest.relationships = [{ id: 'r1', path: 'relationships/r1.json' }]
    await seedRelationTypes(project, env)
    expect(project.manifest.relationTypes).toEqual([])
  })
  it('does nothing when read-only', async () => {
    const { io, env, project } = await book('en', true)
    const before = new Map(io.files)
    await seedRelationTypes(project, env)
    expect(project.manifest.relationTypes).toEqual([])
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
    await expect(seedRelationTypes(project, env)).rejects.toThrow('disk full')
    expect(project.manifest.relationTypes).toEqual([])
    expect([...io.files.keys()].some((k) => k.startsWith('relation-types/'))).toBe(false)
  })
})

describe('load lists', () => {
  it('loads valid files, reports an invalid one, never repairs it', async () => {
    const io = createMemoryProjectIO()
    const env = makeEnv()
    await createProject(io, { title: 'B', author: 'A', language: 'en' }, env)
    const r = await openProject(io, env)
    if (r.status !== 'ok') throw new Error('open failed')
    const { project } = r
    await project.saveItem(relationTypePath('t1'), relationTypeSchema, type('t1'))
    await project.saveItem(relationshipPath('r1'), relationshipSchema, rel('r1', 'a', 'b'))
    await project.saveItem(groupPath('g1'), groupSchema, group('g1', ['a']))
    io.files.set(groupPath('g2'), '{"version":1,"id":"g2"}')
    project.manifest.relationTypes = [{ id: 't1', path: relationTypePath('t1') }]
    project.manifest.relationships = [{ id: 'r1', path: relationshipPath('r1') }]
    project.manifest.groups = [
      { id: 'g1', path: groupPath('g1') },
      { id: 'g2', path: groupPath('g2') },
      { id: 'g3', path: groupPath('g3') },
    ]
    expect([...(await loadRelationTypes(project)).items.keys()]).toEqual(['t1'])
    expect([...(await loadRelationships(project)).items.keys()]).toEqual(['r1'])
    const g = await loadGroups(project)
    expect([...g.items.keys()]).toEqual(['g1'])
    expect(g.status.get('g2')).toBe('invalid')
    expect(g.status.get('g3')).toBe('missing')
    expect(io.files.get(groupPath('g2'))).toBe('{"version":1,"id":"g2"}')
  })
})
