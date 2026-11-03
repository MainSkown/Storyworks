import type { RouteRef } from '../project/schemas/route'

interface TimelineLike {
  id: string
  name: string
  branches: readonly { id: string; name: string }[]
}

export interface RouteInfo {
  ref: RouteRef
  name: string
  timelineName: string
}

/** Every timeline branch is a route. */
export function listRoutes(timelines: readonly TimelineLike[]): RouteInfo[] {
  return timelines.flatMap((t) =>
    t.branches.map((b) => ({
      ref: { timelineId: t.id, branchId: b.id },
      name: b.name,
      timelineName: t.name,
    })),
  )
}

export const sameRoute = (a: RouteRef, b: RouteRef) =>
  a.timelineId === b.timelineId && a.branchId === b.branchId

/** null = the branch (or its timeline) no longer exists: a broken tag. */
export const resolveRoute = (ref: RouteRef, timelines: readonly TimelineLike[]): RouteInfo | null =>
  listRoutes(timelines).find((r) => sameRoute(r.ref, ref)) ?? null

/** Branch name; with the timeline name added when another route has the same name. */
export function routeLabel(route: RouteInfo, all: readonly RouteInfo[]): string {
  const clash = all.some((r) => !sameRoute(r.ref, route.ref) && r.name.trim().toLowerCase() === route.name.trim().toLowerCase())
  return clash ? `${route.name} (${route.timelineName})` : route.name
}

export function toggleRoute(refs: readonly RouteRef[] | undefined, ref: RouteRef): RouteRef[] {
  const list = refs ?? []
  return list.some((r) => sameRoute(r, ref)) ? list.filter((r) => !sameRoute(r, ref)) : [...list, ref]
}
