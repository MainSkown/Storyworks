import { newId } from './ids'

type Json = Record<string, unknown>

function nodeText(node: unknown): string {
  if (typeof node !== 'object' || node === null) return ''
  const n = node as { text?: unknown; content?: unknown }
  if (typeof n.text === 'string') return n.text
  return Array.isArray(n.content) ? n.content.map(nodeText).join('') : ''
}

function topLevel(content: Json): unknown[] {
  return Array.isArray(content.content) ? content.content : []
}

/** Scene body as plain text: one line per top-level block. */
export function docToText(content: Json): string {
  return topLevel(content).map(nodeText).join('\n')
}

function idOf(node: unknown): string | undefined {
  const id = (node as { attrs?: { id?: unknown } } | null)?.attrs?.id
  return typeof id === 'string' ? id : undefined
}

/**
 * Plain text back to a scene body. Lines unchanged at the start or end keep their block id;
 * the edited middle reuses old ids by position; only extra lines get new ids.
 */
export function textToDoc(text: string, previous: Json, makeId: () => string = newId): Json {
  const lines = text === '' ? [] : text.split('\n')
  const oldNodes = topLevel(previous)
  const oldLines = oldNodes.map(nodeText)
  const oldIds = oldNodes.map(idOf)

  const assigned: (string | undefined)[] = new Array(lines.length).fill(undefined)
  let head = 0
  while (head < lines.length && head < oldLines.length && lines[head] === oldLines[head]) {
    assigned[head] = oldIds[head]
    head++
  }
  let tail = 0
  while (
    tail < lines.length - head &&
    tail < oldLines.length - head &&
    lines[lines.length - 1 - tail] === oldLines[oldLines.length - 1 - tail]
  ) {
    assigned[lines.length - 1 - tail] = oldIds[oldLines.length - 1 - tail]
    tail++
  }
  for (let i = head; i < lines.length - tail; i++) {
    if (i < oldIds.length - tail) assigned[i] = oldIds[i]
  }

  const used = new Set<string>()
  const content = lines.map((line, i) => {
    let id = assigned[i]
    if (id === undefined || used.has(id)) id = makeId()
    used.add(id)
    return {
      type: 'paragraph',
      attrs: { id },
      ...(line === '' ? {} : { content: [{ type: 'text', text: line }] }),
    }
  })
  return { type: 'doc', content }
}
