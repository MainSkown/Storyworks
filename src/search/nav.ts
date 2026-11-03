/** Next highlighted row, wrapping at both ends. */
export function moveActive(current: number, delta: number, count: number): number {
  if (count <= 0) return 0
  return (((current + delta) % count) + count) % count
}
