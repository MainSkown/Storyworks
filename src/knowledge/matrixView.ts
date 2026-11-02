import type { CellState } from './logic'

export interface MatrixEntry {
  id: string
  typeId: string
}
export interface MatrixType {
  id: string
}
export interface MatrixItem {
  id: string
  learnings: readonly { entryId: string }[]
}

/**
 * Entries that learn at least one item, grouped in type order (types no longer listed last), entries
 * keep their order. `typeId` limits the rows to one type.
 */
export function matrixEntryIds(
  entries: readonly MatrixEntry[],
  types: readonly MatrixType[],
  items: readonly MatrixItem[],
  typeId: string | null,
): string[] {
  const learners = new Set(items.flatMap((i) => i.learnings.map((l) => l.entryId)))
  const rank = new Map(types.map((t, i) => [t.id, i]))
  return entries
    .filter((e) => learners.has(e.id) && (!typeId || e.typeId === typeId))
    .map((e, index) => ({ id: e.id, rank: rank.get(e.typeId) ?? types.length, index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((e) => e.id)
}

export type GridKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End' | 'PageUp' | 'PageDown'

/** Next focused cell of a grid after a key; ctrl = jump to the grid's corner. Stays inside the grid. */
export function nextCell(
  at: { r: number; c: number },
  key: GridKey,
  size: { rows: number; cols: number },
  opts: { ctrl?: boolean; page?: number } = {},
): { r: number; c: number } {
  const lastR = Math.max(0, size.rows - 1)
  const lastC = Math.max(0, size.cols - 1)
  const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n))
  const page = opts.page ?? 10
  switch (key) {
    case 'ArrowUp':
      return { r: clamp(at.r - 1, lastR), c: at.c }
    case 'ArrowDown':
      return { r: clamp(at.r + 1, lastR), c: at.c }
    case 'ArrowLeft':
      return { r: at.r, c: clamp(at.c - 1, lastC) }
    case 'ArrowRight':
      return { r: at.r, c: clamp(at.c + 1, lastC) }
    case 'Home':
      return { r: opts.ctrl ? 0 : at.r, c: 0 }
    case 'End':
      return { r: opts.ctrl ? lastR : at.r, c: lastC }
    case 'PageUp':
      return { r: clamp(at.r - page, lastR), c: at.c }
    case 'PageDown':
      return { r: clamp(at.r + page, lastR), c: at.c }
  }
}

/** i18n key suffix and Material icon of a cell state. */
export const CELL_LOOK: Record<CellState, { key: string; icon: string }> = {
  known: { key: 'known', icon: 'check_circle' },
  'not-yet': { key: 'notYet', icon: 'schedule' },
  forgotten: { key: 'forgotten', icon: 'history' },
  unknown: { key: 'unknown', icon: 'help_outline' },
  none: { key: 'none', icon: '' },
}
