export interface DiffLine {
  type: 'same' | 'add' | 'del'
  text: string
}
export type FoldedLine = DiffLine | { type: 'skip'; count: number }

/** Line diff (longest common subsequence). Deleted lines come before added ones within a change. */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a === '' ? [] : a.split('\n')
  const y = b === '' ? [] : b.split('\n')
  const n = x.length
  const m = y.length
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ type: 'same', text: x[i] }); i++; j++ }
    else if (t[i + 1][j] >= t[i][j + 1]) out.push({ type: 'del', text: x[i++] })
    else out.push({ type: 'add', text: y[j++] })
  }
  while (i < n) out.push({ type: 'del', text: x[i++] })
  while (j < m) out.push({ type: 'add', text: y[j++] })
  return out
}

/** Folds unchanged runs longer than `2 * context` into one "skip" entry, keeping `context` lines beside changes. */
export function collapseSame(lines: DiffLine[], context = 3): FoldedLine[] {
  const out: FoldedLine[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].type !== 'same') { out.push(lines[i++]); continue }
    let j = i
    while (j < lines.length && lines[j].type === 'same') j++
    const run = lines.slice(i, j)
    const before = i === 0 ? 0 : context
    const after = j === lines.length ? 0 : context
    if (run.length > before + after + 1) {
      out.push(...run.slice(0, before), { type: 'skip', count: run.length - before - after }, ...run.slice(run.length - after))
    } else out.push(...run)
    i = j
  }
  return out
}
