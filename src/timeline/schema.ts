import { z } from 'zod'
import { hasCycle } from './graph'

export const TIMELINE_VERSION = 1

/** Calendar date stored on a node: absolute year, 0-based month index, 1-based day. */
export const timelineDateSchema = z.strictObject({
  year: z.number().int(),
  month: z.number().int().min(0),
  day: z.number().int().min(1),
})

export const branchSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  dashed: z.boolean().default(false),
})

export const timelineNodeSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  description: z.record(z.string(), z.unknown()).default({ type: 'doc', content: [] }),
  date: timelineDateSchema.nullable().default(null),
  color: z.string().nullable().default(null),
  tag: z.string().nullable().default(null),
  branchId: z.string().nullable().default(null),
  pos: z.strictObject({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  codexIds: z.array(z.string()).default([]),
  ruleIds: z.array(z.string()).default([]),
})

export const timelineEdgeSchema = z.strictObject({
  id: z.string(),
  from: z.string(),
  to: z.string(),
})

const hasDuplicates = (ids: string[]) => new Set(ids).size !== ids.length

export const timelineSchema = z
  .strictObject({
    version: z.literal(TIMELINE_VERSION),
    id: z.string(),
    name: z.string(),
    view: z.enum(['flow', 'date']).default('flow'),
    branches: z.array(branchSchema).default([]),
    nodes: z.array(timelineNodeSchema).default([]),
    edges: z.array(timelineEdgeSchema).default([]),
  })
  .superRefine((t, ctx) => {
    const fail = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message })
    if (hasDuplicates(t.branches.map((b) => b.id))) fail(['branches'], 'Duplicate branch id')
    if (hasDuplicates(t.nodes.map((n) => n.id))) fail(['nodes'], 'Duplicate node id')
    if (hasDuplicates(t.edges.map((e) => e.id))) fail(['edges'], 'Duplicate edge id')

    const branchIds = new Set(t.branches.map((b) => b.id))
    t.nodes.forEach((n, i) => {
      if (n.branchId !== null && !branchIds.has(n.branchId))
        fail(['nodes', i, 'branchId'], 'Node points at a missing branch')
    })

    const nodeIds = new Set(t.nodes.map((n) => n.id))
    const pairs = new Set<string>()
    let edgesOk = true
    t.edges.forEach((e, i) => {
      if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) {
        edgesOk = false
        fail(['edges', i], 'Edge points at a missing node')
      } else if (e.from === e.to) {
        edgesOk = false
        fail(['edges', i], 'Edge connects a node to itself')
      } else if (pairs.has(`${e.from}\0${e.to}`)) {
        edgesOk = false
        fail(['edges', i], 'Duplicate edge')
      }
      pairs.add(`${e.from}\0${e.to}`)
    })
    if (edgesOk && hasCycle([...nodeIds], t.edges)) fail(['edges'], 'Edges form a cycle')
  })

export type Timeline = z.infer<typeof timelineSchema>
export type TimelineNode = z.infer<typeof timelineNodeSchema>
export type TimelineEdge = z.infer<typeof timelineEdgeSchema>
export type Branch = z.infer<typeof branchSchema>
export type TimelineDate = z.infer<typeof timelineDateSchema>
