/** Index in the full order that moves `id` one step up/down among the visible ones; null = nowhere to go. */
export function neighborIndex(
  all: string[],
  visible: string[],
  id: string,
  dir: -1 | 1,
): number | null {
  const at = visible.indexOf(id)
  const other = visible[at + dir]
  if (at < 0 || other === undefined) return null
  return all.indexOf(other)
}
