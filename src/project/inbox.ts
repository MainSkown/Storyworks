interface DocNode {
  attrs?: Record<string, unknown>
  content?: DocNode[]
  [key: string]: unknown
}

/** Deep copy where every node that has an attrs.id gets a fresh one. */
function renewIds(node: DocNode, newId: () => string): DocNode {
  const copy: DocNode = { ...node }
  if (node.attrs) {
    copy.attrs = { ...node.attrs }
    if (typeof node.attrs.id === 'string') copy.attrs.id = newId()
  }
  if (node.content) copy.content = node.content.map((c) => renewIds(c, newId))
  return copy
}

const blocks = (doc: unknown): DocNode[] => (doc as DocNode | null)?.content ?? []

/** Scene doc with the note's blocks (fresh ids) added at the end. */
export function appendNoteToScene(sceneDoc: unknown, noteDoc: unknown, newId: () => string): unknown {
  return {
    ...(sceneDoc as DocNode),
    type: 'doc',
    content: [...blocks(sceneDoc), ...blocks(noteDoc).map((b) => renewIds(b, newId))],
  }
}

/** New scene content from a note: same blocks, fresh ids. */
export function noteToSceneContent(noteDoc: unknown, newId: () => string): unknown {
  return { type: 'doc', content: blocks(noteDoc).map((b) => renewIds(b, newId)) }
}
