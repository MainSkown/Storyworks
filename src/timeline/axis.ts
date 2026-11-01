export interface AxisTick {
  x: number
  label: string
}

/** Drops ticks closer than `minGap` to the previous kept one; the last tick always stays. */
export function thinTicks(ticks: AxisTick[], minGap: number): AxisTick[] {
  const sorted = [...ticks].sort((a, b) => a.x - b.x)
  const out: AxisTick[] = []
  for (const t of sorted) {
    const prev = out[out.length - 1]
    if (!prev || t.x - prev.x >= minGap) out.push(t)
  }
  const last = sorted[sorted.length - 1]
  if (last && out[out.length - 1] !== last && last.x > out[out.length - 1]!.x) {
    // Replace a too-close predecessor so the end of the axis is labelled.
    if (out.length > 1 && last.x - out[out.length - 1]!.x < minGap) out.pop()
    out.push(last)
  }
  return out
}
