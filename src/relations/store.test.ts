import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { createProject } from '../project/open'
import {
  groupPath,
  relationshipPath,
  relationTypePath,
  RELATION_LAYOUT_PATH,
} from '../project/relations'
import { useCodexStore } from '../codex/store'
import { useTimelinesStore } from '../timeline/store'
import { useRelationsStore } from './store'

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
  const c = useCodexStore()
  const r = useRelationsStore()
  const a = (await c.createEntry({ name: 'Anna' })) as string
  const b = (await c.createEntry({ name: 'Ben' })) as string
  const d = (await c.createEntry({ name: 'Cara' })) as string
  return { p, c, r, a, b, d }
}

const json = (path: string) => JSON.parse(io.files.get(path) as string)
const manifest = () => json('project.json')

describe('open', () => {
  it('a new book gets the seven starter types once', async () => {
    const { p, r } = await opened()
    expect(r.types.map((t) => t.name)).toEqual([
      'Friend',
      'Enemy',
      'Parent',
      'Sibling',
      'Lover',
      'Located in',
      'Owns',
    ])
    await p.flush()
    const snap = new Map([...io.files].filter(([k]) => !k.endsWith('.lock')))
    await p.open('book')
    expect(new Map([...io.files].filter(([k]) => !k.endsWith('.lock')))).toEqual(snap)
    expect(useRelationsStore().types).toHaveLength(7)
  })

  it('read-only open creates nothing and refuses writes', async () => {
    const { p } = await opened()
    await p.close()
    const bare = createMemoryProjectIO()
    io = bare
    await createProject(bare, META)
    const m = JSON.parse(bare.files.get('project.json') as string)
    bare.files.set('project.json', JSON.stringify({ ...m, kind: 'other' }))
    const before = new Map(bare.files)
    expect(await p.open('book2')).toBe('opened')
    expect(bare.files).toEqual(before)
    const r = useRelationsStore()
    expect(r.types).toEqual([])
    expect(await r.createType('X')).toBeNull()
    expect(await r.createGroup('G', '#000')).toBeNull()
    expect(await r.createRelationship({ fromId: 'a', toId: 'b', typeId: 't' })).toEqual({
      ok: false,
      reason: 'read-only',
    })
    expect(await r.savePositions({ a: { x: 1, y: 2 } })).toBe(false)
    expect(bare.files).toEqual(before)
  })

  it('closing clears the store', async () => {
    const { p, r, a, b } = await opened()
    await r.createRelationship({ fromId: a, toId: b, typeId: r.types[0].id })
    await p.close()
    expect(r.relationships).toEqual([])
    expect(r.types).toEqual([])
    expect(r.groups).toEqual([])
    expect(r.layout).toEqual({})
  })

  it('an invalid relationship file is listed as invalid, others load, file untouched', async () => {
    const { p, r, a, b, d } = await opened()
    const t = r.types[0].id
    const x = await r.createRelationship({ fromId: a, toId: b, typeId: t })
    const y = await r.createRelationship({ fromId: b, toId: d, typeId: t })
    if (!x.ok || !y.ok) throw new Error('create failed')
    await p.flush()
    const bad = JSON.stringify({ ...json(relationshipPath(y.id)), typeId: 5 })
    io.files.set(relationshipPath(y.id), bad)
    await p.open('book')
    const r2 = useRelationsStore()
    expect(r2.relationships.map((q) => q.id)).toEqual([x.id])
    expect(r2.relationshipList.find((q) => q.id === y.id)).toMatchObject({
      status: 'invalid',
      error: { field: 'typeId' },
    })
    expect(r2.updateRelationship(y.id, { note: {} })).toMatchObject({ ok: false })
    await p.flush()
    expect(io.files.get(relationshipPath(y.id))).toBe(bad)
  })
})

describe('relation types', () => {
  it('create, update and rename keep the manifest title in step', async () => {
    const { p, r } = await opened()
    const id = (await r.createType('  Rival ', { reverseLabel: 'Rival of', color: '#123456' })) as string
    expect(r.types.at(-1)).toMatchObject({ id, name: 'Rival', reverseLabel: 'Rival of', color: '#123456' })
    expect(r.updateType(id, { name: 'Foe', color: '#000' })).toEqual({ ok: true })
    await p.flush()
    expect(json(relationTypePath(id))).toMatchObject({ name: 'Foe', color: '#000' })
    expect(manifest().relationTypes.at(-1)).toMatchObject({ id, title: 'Foe' })
  })

  it('an empty name is refused', async () => {
    const { r } = await opened()
    expect(await r.createType('   ')).toBeNull()
    const id = r.types[0].id
    expect(r.updateType(id, { name: ' ' })).toEqual({ ok: false, reason: 'empty-name' })
    expect(r.updateType('nope', { name: 'x' })).toEqual({ ok: false, reason: 'unknown-type' })
  })

  it('findOrCreateTypeByName matches case-insensitively and creates otherwise', async () => {
    const { r } = await opened()
    const friend = r.types[0].id
    expect(await r.findOrCreateTypeByName(' fRIEND ')).toBe(friend)
    expect(r.types).toHaveLength(7)
    const made = await r.findOrCreateTypeByName('Mentor')
    expect(r.types).toHaveLength(8)
    expect(r.types.at(-1)?.id).toBe(made)
    expect(await r.findOrCreateTypeByName('')).toBeNull()
  })

  it('delete of a used type needs a target; reassign rewrites relationships', async () => {
    const { p, r, a, b } = await opened()
    const [friend, enemy] = r.types
    const rel = await r.createRelationship({ fromId: a, toId: b, typeId: friend.id })
    if (!rel.ok) throw new Error('create failed')
    expect(r.planDeleteType(friend.id)).toEqual({ ok: false, reason: 'target-required' })
    expect(await r.deleteType(friend.id)).toEqual({ ok: false, reason: 'target-required' })
    expect(await r.deleteType(friend.id, friend.id)).toEqual({ ok: false, reason: 'bad-target' })
    expect(r.types).toHaveLength(7)
    expect(await r.deleteType(friend.id, enemy.id)).toEqual({ ok: true, moved: 1 })
    expect(r.relationships[0].typeId).toBe(enemy.id)
    await p.flush()
    expect(json(relationshipPath(rel.id)).typeId).toBe(enemy.id)
    expect(io.files.has(relationTypePath(friend.id))).toBe(false)
    expect(manifest().relationTypes.map((q: { id: string }) => q.id)).not.toContain(friend.id)
  })

  it('an unused type deletes without a target', async () => {
    const { p, r } = await opened()
    const id = r.types[3].id
    expect(await r.deleteType(id)).toEqual({ ok: true, moved: 0 })
    await p.flush()
    expect(io.files.has(relationTypePath(id))).toBe(false)
    expect(r.types).toHaveLength(6)
  })
})

describe('relationships', () => {
  it('create, update and delete', async () => {
    const { p, r, a, b, d } = await opened()
    const [friend, enemy] = r.types
    const res = await r.createRelationship({ fromId: a, toId: b, typeId: friend.id })
    if (!res.ok) throw new Error('create failed')
    expect(r.relationships.map((q) => q.id)).toEqual([res.id])
    await p.flush()
    expect(manifest().relationships.map((q: { id: string }) => q.id)).toEqual([res.id])
    expect(r.updateRelationship(res.id, { toId: d, typeId: enemy.id })).toEqual({ ok: true })
    await p.flush()
    expect(json(relationshipPath(res.id))).toMatchObject({ fromId: a, toId: d, typeId: enemy.id })
    expect(await r.deleteRelationship(res.id)).toBe(true)
    await p.flush()
    expect(r.relationships).toEqual([])
    expect(io.files.has(relationshipPath(res.id))).toBe(false)
    expect(manifest().relationships).toEqual([])
    expect(await r.deleteRelationship(res.id)).toBe(false)
  })

  it('self, duplicate, unknown type and unknown entry are refused', async () => {
    const { r, a, b } = await opened()
    const t = r.types[0].id
    expect(await r.createRelationship({ fromId: a, toId: a, typeId: t })).toEqual({ ok: false, reason: 'self' })
    expect(await r.createRelationship({ fromId: a, toId: b, typeId: 'nope' })).toEqual({
      ok: false,
      reason: 'unknown-type',
    })
    expect(await r.createRelationship({ fromId: a, toId: 'nope', typeId: t })).toEqual({
      ok: false,
      reason: 'unknown-entry',
    })
    expect((await r.createRelationship({ fromId: a, toId: b, typeId: t })).ok).toBe(true)
    expect(await r.createRelationship({ fromId: a, toId: b, typeId: t })).toEqual({
      ok: false,
      reason: 'duplicate',
    })
    // the reverse direction is a different relationship
    expect((await r.createRelationship({ fromId: b, toId: a, typeId: t })).ok).toBe(true)
    expect(r.relationships).toHaveLength(2)
  })

  it('update re-validates but ignores itself; a duplicate target is refused', async () => {
    const { r, a, b, d } = await opened()
    const t = r.types[0].id
    const x = await r.createRelationship({ fromId: a, toId: b, typeId: t })
    const y = await r.createRelationship({ fromId: a, toId: d, typeId: t })
    if (!x.ok || !y.ok) throw new Error('create failed')
    expect(r.updateRelationship(x.id, { typeId: t })).toEqual({ ok: true })
    expect(r.updateRelationship(y.id, { toId: b })).toEqual({ ok: false, reason: 'duplicate' })
    expect(r.updateRelationship(y.id, { toId: a })).toEqual({ ok: false, reason: 'self' })
    expect(r.updateRelationship('nope', { toId: b })).toEqual({ ok: false, reason: 'unknown-relationship' })
    expect(r.relationships.find((q) => q.id === y.id)?.toId).toBe(d)
  })

  it('relationsFor gives outgoing and incoming rows with the reverse label', async () => {
    const { r, a, b } = await opened()
    const parent = r.types.find((t) => t.name === 'Parent')!
    await r.createRelationship({ fromId: a, toId: b, typeId: parent.id })
    expect(r.relationsFor(a).map((x) => [x.direction, x.otherId, x.label])).toEqual([
      ['out', b, 'Parent'],
    ])
    expect(r.relationsFor(b).map((x) => [x.direction, x.otherId, x.label])).toEqual([
      ['in', a, 'Child'],
    ])
  })

  it('a trashed entry breaks its relationships; restore fixes them', async () => {
    const { p, c, r, a, b, d } = await opened()
    const t = r.types[0].id
    const x = await r.createRelationship({ fromId: a, toId: b, typeId: t })
    const y = await r.createRelationship({ fromId: b, toId: d, typeId: t })
    if (!x.ok || !y.ok) throw new Error('create failed')
    expect(r.brokenRelationshipIds).toEqual([])
    await c.deleteEntry(b)
    expect(r.brokenRelationshipIds.sort()).toEqual([x.id, y.id].sort())
    expect(r.relationships).toHaveLength(2) // kept
    // editing the note of a broken relationship still works
    expect(r.updateRelationship(x.id, { note: { type: 'doc', content: [] } })).toEqual({ ok: true })
    // but no new relationship to a trashed entry
    expect(await r.createRelationship({ fromId: a, toId: b, typeId: r.types[1].id })).toEqual({
      ok: false,
      reason: 'unknown-entry',
    })
    await p.restoreItem(b)
    expect(r.brokenRelationshipIds).toEqual([])
  })

  it('node links: listed per node, broken when the node is gone', async () => {
    const { r, a, b } = await opened()
    const tl = useTimelinesStore()
    const node = tl.addNode()
    if (!node.ok) throw new Error('no node')
    const timelineId = tl.current!.id
    const t = r.types[0].id
    const res = await r.createRelationship({
      fromId: a,
      toId: b,
      typeId: t,
      nodeRef: { timelineId, nodeId: node.id },
    })
    if (!res.ok) throw new Error('create failed')
    expect(r.relationshipsOnNode(timelineId, node.id).map((q) => q.id)).toEqual([res.id])
    expect(r.relationshipsOnNode(timelineId, 'other')).toEqual([])
    expect(r.brokenNodeRefIds).toEqual([])
    expect(
      await r.createRelationship({
        fromId: b,
        toId: a,
        typeId: t,
        nodeRef: { timelineId, nodeId: 'missing' },
      }),
    ).toEqual({ ok: false, reason: 'unknown-node' })
    await tl.deleteNode(node.id)
    expect(r.brokenNodeRefIds).toEqual([res.id])
  })
})

describe('groups', () => {
  it('create, update, delete', async () => {
    const { p, r } = await opened()
    const id = (await r.createGroup(' Family ', '#aa0000')) as string
    expect(await r.createGroup('', '#000')).toBeNull()
    expect(r.groups[0]).toMatchObject({ id, name: 'Family', color: '#aa0000', memberIds: [] })
    expect(r.updateGroup(id, { name: 'Clan' })).toEqual({ ok: true })
    expect(r.updateGroup(id, { name: ' ' })).toEqual({ ok: false, reason: 'empty-name' })
    await p.flush()
    expect(json(groupPath(id))).toMatchObject({ name: 'Clan' })
    expect(manifest().groups[0]).toMatchObject({ id, title: 'Clan' })
    expect(await r.deleteGroup(id)).toBe(true)
    await p.flush()
    expect(r.groups).toEqual([])
    expect(io.files.has(groupPath(id))).toBe(false)
  })

  it('members: add once, remove, an entry may be in several groups', async () => {
    const { p, r, a, b } = await opened()
    const g1 = (await r.createGroup('One', '#111')) as string
    const g2 = (await r.createGroup('Two', '#222')) as string
    expect(r.addMember(g1, a)).toEqual({ ok: true })
    expect(r.addMember(g1, a)).toEqual({ ok: true })
    expect(r.addMember(g2, a)).toEqual({ ok: true })
    expect(r.addMember(g1, b)).toEqual({ ok: true })
    expect(r.addMember(g1, 'nope')).toEqual({ ok: false, reason: 'unknown-entry' })
    expect(r.addMember('nope', a)).toEqual({ ok: false, reason: 'unknown-group' })
    expect(r.groups[0].memberIds).toEqual([a, b])
    expect(r.groupsOfEntry(a).map((g) => g.id)).toEqual([g1, g2])
    expect(r.removeMember(g1, a)).toEqual({ ok: true })
    expect(r.groups[0].memberIds).toEqual([b])
    await p.flush()
    expect(json(groupPath(g1)).memberIds).toEqual([b])
  })

  it('a trashed member is broken but kept; restore fixes it', async () => {
    const { p, c, r, a } = await opened()
    const g = (await r.createGroup('One', '#111')) as string
    r.addMember(g, a)
    expect(r.brokenMembershipsList).toEqual([])
    await c.deleteEntry(a)
    expect(r.brokenMembershipsList).toEqual([{ groupId: g, entryId: a }])
    expect(r.groups[0].memberIds).toEqual([a])
    await p.restoreItem(a)
    expect(r.brokenMembershipsList).toEqual([])
  })
})

describe('layout', () => {
  it('first save creates the file and manifest ref; later saves merge; reset clears', async () => {
    const { p, r, a, b } = await opened()
    expect(r.layout).toEqual({})
    expect(manifest().relationLayout).toBeNull()
    expect(await r.savePositions({ [a]: { x: 1, y: 2 } })).toBe(true)
    await p.flush()
    expect(manifest().relationLayout).toMatchObject({ path: RELATION_LAYOUT_PATH })
    expect(await r.savePositions({ [b]: { x: 3, y: 4 } })).toBe(true)
    expect(r.layout).toEqual({ [a]: { x: 1, y: 2 }, [b]: { x: 3, y: 4 } })
    await p.flush()
    expect(json(RELATION_LAYOUT_PATH)).toEqual({
      version: 1,
      positions: { [a]: { x: 1, y: 2 }, [b]: { x: 3, y: 4 } },
    })
    expect(await r.resetLayout()).toBe(true)
    await p.flush()
    expect(r.layout).toEqual({})
    expect(json(RELATION_LAYOUT_PATH).positions).toEqual({})
  })

  it('a saved layout loads on reopen', async () => {
    const { p, r, a } = await opened()
    await r.savePositions({ [a]: { x: 5, y: 6 } })
    await p.flush()
    await p.open('book')
    expect(useRelationsStore().layout).toEqual({ [a]: { x: 5, y: 6 } })
  })

  it('an invalid layout file is ignored, reported and left untouched', async () => {
    const { p, r, a } = await opened()
    await r.savePositions({ [a]: { x: 5, y: 6 } })
    await p.flush()
    const bad = '{"version":1,"positions":{"x":{"x":"no"}}}'
    io.files.set(RELATION_LAYOUT_PATH, bad)
    await p.open('book')
    const r2 = useRelationsStore()
    expect(r2.layout).toEqual({})
    expect(r2.layoutStatus).toBe('invalid')
    expect(await r2.savePositions({ [a]: { x: 1, y: 1 } })).toBe(false)
    await p.flush()
    expect(io.files.get(RELATION_LAYOUT_PATH)).toBe(bad)
  })

  it('non-finite positions are refused', async () => {
    const { r, a } = await opened()
    expect(await r.savePositions({ [a]: { x: Number.NaN, y: 0 } })).toBe(false)
    expect(manifest().relationLayout).toBeNull()
  })
})
