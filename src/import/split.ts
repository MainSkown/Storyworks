import type { PMNode } from './parse'

/** `h1h2`: H1 = chapter, H2 = scene. `h1`: H1 = chapter only. `break`: scene-break line = new scene. */
export type SplitRule = 'h1h2' | 'h1' | 'break'

export interface RawScene {
  title: string | null
  blocks: PMNode[]
}
export interface RawChapter {
  title: string | null
  scenes: RawScene[]
}

export function headingText(node: PMNode): string | null {
  const t = (node.content ?? []).map((c) => c.text ?? '').join('').trim()
  return t || null
}

const isHeading = (b: PMNode, level: number) => b.type === 'heading' && b.attrs?.level === level

function splitAtBreaks(blocks: PMNode[]): RawScene[] {
  const scenes: RawScene[] = []
  let cur: PMNode[] = []
  for (const b of blocks) {
    if (b.type === 'sceneBreak') {
      if (cur.length) scenes.push({ title: null, blocks: cur })
      cur = []
    } else cur.push(b)
  }
  if (cur.length) scenes.push({ title: null, blocks: cur })
  return scenes
}

/** Splits one file's blocks into chapters and scenes. Chapter/scene titles are null when the file gave none. */
export function splitBlocks(blocks: PMNode[], rule: SplitRule): RawChapter[] {
  if (rule === 'break') {
    let title: string | null = null
    let rest = blocks
    if (blocks[0] && isHeading(blocks[0], 1)) {
      title = headingText(blocks[0])
      rest = blocks.slice(1)
    }
    const scenes = splitAtBreaks(rest)
    return [{ title, scenes: scenes.length ? scenes : [{ title: null, blocks: [] }] }]
  }

  const chapters: RawChapter[] = []
  let chapter: RawChapter | null = null
  let scene: RawScene | null = null
  const ensure = (): RawScene => {
    if (!chapter) chapters.push((chapter = { title: null, scenes: [] }))
    if (!scene) chapter.scenes.push((scene = { title: null, blocks: [] }))
    return scene
  }
  for (const b of blocks) {
    if (isHeading(b, 1)) {
      chapters.push((chapter = { title: headingText(b), scenes: [] }))
      scene = null
    } else if (rule === 'h1h2' && isHeading(b, 2)) {
      if (!chapter) chapters.push((chapter = { title: null, scenes: [] }))
      chapter.scenes.push((scene = { title: headingText(b), blocks: [] }))
    } else ensure().blocks.push(b)
  }
  for (const c of chapters) if (!c.scenes.length) c.scenes.push({ title: null, blocks: [] })
  return chapters
}
