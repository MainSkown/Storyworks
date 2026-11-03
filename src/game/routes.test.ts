import { describe, expect, it } from 'vitest'
import { listRoutes, resolveRoute, routeLabel, sameRoute, toggleRoute } from './routes'

const timelines = [
  { id: 't1', name: 'Main', branches: [{ id: 'b1', name: 'Route A' }, { id: 'b2', name: 'Route B' }] },
  { id: 't2', name: 'Side', branches: [{ id: 'b3', name: 'Route A' }] },
  { id: 't3', name: 'Empty', branches: [] },
]

describe('routes', () => {
  it('lists every branch of every timeline as a route, in order', () => {
    expect(listRoutes(timelines).map((r) => r.ref)).toEqual([
      { timelineId: 't1', branchId: 'b1' },
      { timelineId: 't1', branchId: 'b2' },
      { timelineId: 't2', branchId: 'b3' },
    ])
  })

  it('no timelines, no routes', () => {
    expect(listRoutes([])).toEqual([])
  })

  it('resolves a ref to its branch, or null when the branch or timeline is gone', () => {
    expect(resolveRoute({ timelineId: 't1', branchId: 'b2' }, timelines)?.name).toBe('Route B')
    expect(resolveRoute({ timelineId: 't1', branchId: 'zz' }, timelines)).toBeNull()
    expect(resolveRoute({ timelineId: 'zz', branchId: 'b1' }, timelines)).toBeNull()
  })

  it('the label is the branch name, plus the timeline name only when two routes share a name', () => {
    const all = listRoutes(timelines)
    expect(routeLabel(all[1], all)).toBe('Route B')
    expect(routeLabel(all[0], all)).toBe('Route A (Main)')
    expect(routeLabel(all[2], all)).toBe('Route A (Side)')
  })

  it('a route resolved separately (not the list object) is not its own clash', () => {
    const all = listRoutes(timelines)
    const copy = resolveRoute({ timelineId: 't1', branchId: 'b2' }, timelines)!
    expect(routeLabel(copy, all)).toBe('Route B')
  })

  it('toggleRoute adds a missing ref and removes a present one, without mutating', () => {
    const a = { timelineId: 't1', branchId: 'b1' }
    const b = { timelineId: 't1', branchId: 'b2' }
    const start = [a]
    expect(toggleRoute(start, b)).toEqual([a, b])
    expect(toggleRoute([a, b], a)).toEqual([b])
    expect(toggleRoute(undefined, a)).toEqual([a])
    expect(start).toEqual([a])
  })

  it('sameRoute compares both ids', () => {
    expect(sameRoute({ timelineId: 't1', branchId: 'b1' }, { timelineId: 't1', branchId: 'b1' })).toBe(true)
    expect(sameRoute({ timelineId: 't1', branchId: 'b1' }, { timelineId: 't2', branchId: 'b1' })).toBe(false)
  })
})
