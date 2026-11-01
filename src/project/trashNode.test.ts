import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import { manifestSchema } from './schemas/manifest'
import { trashedNodeSchema } from './schemas/trashedNode'
import { parseFile } from './serialize'
import { createTimelineFile } from './timelines'
import { NodeRestoreError } from './trash'
import { timelineSchema, type Timeline, type TimelineNode } from '../timeline/schema'
import type { Env, OpenProject } from './types'

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const node = (id: string, title = id): TimelineNode =>
  timelineSchema.parse({
    version: 1,
    id: 'x',
    name: 'x',
    nodes: [{ id, title }],
  }).nodes[0]

const edge = (id: string, from: string, to: string) => ({ id, from, to })

/** Timeline "tl" (name "Main") with chain a -> b -> c and an extra edge a -> c. */
function baseTimeline(): Timeline {
  return timelineSchema.parse({
    version: 1,
    id: 'tl',
    name: 'Main',
    nodes: ['a', 'b', 'c', 'd'].map((id) => node(id)),
    edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'a', 'c'), edge('e4', 'c', 'd')],
  })
}

async function seed(): Promise<{ io: MemoryProjectIO; project: OpenProject }> {
  const io = createMemoryProjectIO()
  const env = makeEnv()
  const created = await createProject(io, { title: 'T', author: 'A', language: 'en' }, env)
  await createTimelineFile(created, baseTimeline())
  const r = await openProject(io, env)
  if (r.status !== 'ok') throw new Error('open failed')
  return { io, project: r.project }
}

const trashedOf = (t: Timeline, nodeId: string) => {
  const index = t.nodes.findIndex((n) => n.id === nodeId)
  return {
    version: 1 as const,
    id: nodeId,
    timelineId: t.id,
    node: t.nodes[index],
    edges: t.edges.filter((e) => e.from === nodeId || e.to === nodeId),
    index,
  }
}

const diskManifest = (io: MemoryProjectIO) => {
  const r = parseFile(manifestSchema, io.files.get('project.json') as string, 'project.json')
  if (!r.ok) throw new Error('manifest invalid')
  return r.value
}

describe('trashNode', () => {
  it('writes the node file and a node entry', async () => {
    const { io, project } = await seed()
    const entry = await project.trashNode(trashedOf(baseTimeline(), 'b'))
    expect(entry).toMatchObject({ id: 'b', type: 'node', title: 'b', parentId: 'tl', index: 1 })
    const file = io.files.get('.storyworks/trash/b/node.json') as string
    const r = parseFile(trashedNodeSchema, file, 'node.json')
    expect(r.ok && r.value.edges.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(diskManifest(io).trash.map((t) => [t.id, t.type])).toEqual([['b', 'node']])
  })

  it('refuses when read-only and writes nothing', async () => {
    const { io } = await seed()
    const m = JSON.parse(io.files.get('project.json') as string)
    io.files.set('project.json', JSON.stringify({ ...m, version: 99 }))
    const r = await openProject(io, makeEnv())
    if (r.status !== 'ok') throw new Error('open failed')
    const before = new Map(io.files)
    await expect(r.project.trashNode(trashedOf(baseTimeline(), 'b'))).rejects.toThrow()
    expect(io.files).toEqual(before)
  })
})

describe('restoreNode', () => {
  const afterDelete = (t: Timeline, id: string): Timeline => ({
    ...t,
    nodes: t.nodes.filter((n) => n.id !== id),
    edges: t.edges.filter((e) => e.from !== id && e.to !== id),
  })

  it('same id, same position, edges back', async () => {
    const { project } = await seed()
    const full = baseTimeline()
    await project.trashNode(trashedOf(full, 'b'))
    const r = await project.restoreNode('b', new Map([['tl', afterDelete(full, 'b')]]))
    expect(r.timeline.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(r.timeline.edges.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(r.skipped).toEqual([])
    expect(timelineSchema.safeParse(r.timeline).success).toBe(true)
  })

  it('skips an edge whose other end was deleted meanwhile', async () => {
    const { project } = await seed()
    const full = baseTimeline()
    await project.trashNode(trashedOf(full, 'b'))
    const now = afterDelete(afterDelete(full, 'b'), 'a')
    const r = await project.restoreNode('b', new Map([['tl', now]]))
    expect(r.skipped.map((e) => e.id)).toEqual(['e1'])
    expect(r.timeline.edges.map((e) => e.id).sort()).toEqual(['e2', 'e4'])
  })

  it('skips an edge that would now form a cycle', async () => {
    const { project } = await seed()
    const full = baseTimeline()
    await project.trashNode(trashedOf(full, 'b'))
    // meanwhile the user connected c -> a, so a -> b -> c would loop
    const now = { ...afterDelete(full, 'b'), edges: [...afterDelete(full, 'b').edges] }
    now.edges = now.edges.filter((e) => e.id !== 'e3')
    now.edges.push(edge('e9', 'c', 'a'))
    const r = await project.restoreNode('b', new Map([['tl', now]]))
    expect(r.skipped.length).toBe(1)
    expect(timelineSchema.safeParse(r.timeline).success).toBe(true)
  })

  it('clears a branch that no longer exists', async () => {
    const { project } = await seed()
    const full = baseTimeline()
    const item = trashedOf(full, 'b')
    await project.trashNode({ ...item, node: { ...item.node, branchId: 'gone' } })
    const r = await project.restoreNode('b', new Map([['tl', afterDelete(full, 'b')]]))
    expect(r.timeline.nodes[1].branchId).toBeNull()
    expect(timelineSchema.safeParse(r.timeline).success).toBe(true)
  })

  it('is refused while the timeline is in the trash', async () => {
    const { project } = await seed()
    const full = baseTimeline()
    await project.trashNode(trashedOf(full, 'b'))
    await project.trashTimeline('tl', 'Main')
    await expect(project.restoreNode('b', new Map())).rejects.toMatchObject({
      code: 'timeline-trashed',
    })
  })

  it('is refused when the timeline is gone', async () => {
    const { project } = await seed()
    await project.trashNode(trashedOf(baseTimeline(), 'b'))
    project.manifest.timelines = []
    const err = await project.restoreNode('b', new Map()).catch((e) => e)
    expect(err).toBeInstanceOf(NodeRestoreError)
    expect(err.code).toBe('timeline-gone')
  })

  it('is refused when the node id is already in the timeline', async () => {
    const { project } = await seed()
    const full = baseTimeline()
    await project.trashNode(trashedOf(full, 'b'))
    await expect(project.restoreNode('b', new Map([['tl', full]]))).rejects.toMatchObject({
      code: 'node-exists',
    })
  })

  it('is refused for an invalid trashed file, which stays untouched', async () => {
    const { io, project } = await seed()
    const full = baseTimeline()
    await project.trashNode(trashedOf(full, 'b'))
    const path = '.storyworks/trash/b/node.json'
    io.files.set(path, '{"version":1,"id":5}')
    const before = new Map(io.files)
    await expect(
      project.restoreNode('b', new Map([['tl', afterDelete(full, 'b')]])),
    ).rejects.toMatchObject({ code: 'file-invalid' })
    expect(io.files).toEqual(before)
  })

  it('is refused for a missing trashed file', async () => {
    const { io, project } = await seed()
    const full = baseTimeline()
    await project.trashNode(trashedOf(full, 'b'))
    io.files.delete('.storyworks/trash/b/node.json')
    await expect(
      project.restoreNode('b', new Map([['tl', afterDelete(full, 'b')]])),
    ).rejects.toMatchObject({ code: 'file-missing' })
  })

  it('dropTrashedNode removes the entry and the file', async () => {
    const { io, project } = await seed()
    await project.trashNode(trashedOf(baseTimeline(), 'b'))
    await project.dropTrashedNode('b')
    expect(diskManifest(io).trash).toEqual([])
    expect(io.files.has('.storyworks/trash/b/node.json')).toBe(false)
  })
})
