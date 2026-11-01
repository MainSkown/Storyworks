export interface GraphNodeModel<D = unknown> {
  id: string
  x: number
  y: number
  label: string
  width?: number
  height?: number
  data?: D
}

export interface GraphEdgeModel<D = unknown> {
  id: string
  from: string
  to: string
  label?: string
  data?: D
}

export interface GraphStyle {
  /** Any CSS colour or token reference, e.g. `var(--tag-event)`. */
  color?: string
  dashed?: boolean
  /** Shown faded (filtered out), still usable. */
  dimmed?: boolean
}

export type CanConnectResult = { ok: true } | { ok: false; reason: string }
export type CanConnect = (from: string, to: string) => CanConnectResult

export const DEFAULT_NODE_WIDTH = 168
export const DEFAULT_NODE_HEIGHT = 56
