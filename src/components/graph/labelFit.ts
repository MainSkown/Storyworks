const CHAR_PX = 7.6
const PAD_PX = 28
const MIN_CHARS = 5
export const MAX_LABEL = 24

/**
 * Shortens an edge label so its pill fits in the free space between two nodes
 * (`gapPx`, on screen). Never longer than MAX_LABEL or shorter than MIN_CHARS.
 */
export function fitLabel(label: string, gapPx: number): string {
  const room = Math.floor((gapPx - PAD_PX) / CHAR_PX)
  const max = Math.min(MAX_LABEL, Math.max(MIN_CHARS, room))
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}
