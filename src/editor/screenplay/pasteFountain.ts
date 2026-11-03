import { parseFountain } from '../../import/fountain'
import type { ScriptElement } from './layout'

/**
 * Elements of pasted text when it looks like Fountain: it has a scene heading, or a cue directly
 * followed by dialogue. Anything else (null) is pasted as plain action lines. Sections, notes and
 * other unsupported constructs are dropped.
 */
export function fountainElements(text: string): ScriptElement[] | null {
  // The parser treats a file without headings as plain action, and wants a blank line before a
  // cue: a throwaway heading in front gives a snippet normal file context.
  const r = parseFountain('.X\n\n' + text)
  const els = (r.sequences.flatMap((s) => s.scenes.flatMap((sc) => sc.elements)) as ScriptElement[]).slice(1)
  const heading = els.some((e) => e.type === 'sceneHeading')
  const speech = els.some((e, i) => e.type === 'character' && els[i + 1]?.type === 'dialogue')
  return heading || speech ? els : null
}
