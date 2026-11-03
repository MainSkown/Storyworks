/** Script element types, in Tab order. */
export const ELEMENTS = [
  'sceneHeading',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition',
] as const

export type ElementType = (typeof ELEMENTS)[number]

export const isElement = (name: string): name is ElementType =>
  (ELEMENTS as readonly string[]).includes(name)

const NEXT: Record<ElementType, ElementType> = {
  sceneHeading: 'action',
  action: 'action',
  character: 'dialogue',
  dialogue: 'action',
  parenthetical: 'dialogue',
  transition: 'sceneHeading',
}

// "Previous natural element": the element Enter would have come from; where none
// exists (character, transition, sceneHeading) the block falls back to action.
const EMPTY: Record<ElementType, ElementType> = {
  sceneHeading: 'action',
  action: 'sceneHeading',
  character: 'action',
  dialogue: 'character',
  parenthetical: 'character',
  transition: 'action',
}

/** Type of the block Enter creates at the end of a block with text. */
export const nextElement = (type: ElementType): ElementType => NEXT[type]

/** New type of an empty block when Enter is pressed in it. */
export const emptyFallback = (type: ElementType): ElementType => EMPTY[type]

/** Tab (1) / Shift+Tab (-1), wrapping. */
export function cycle(type: ElementType, dir: 1 | -1): ElementType {
  const i = ELEMENTS.indexOf(type)
  return ELEMENTS[(i + dir + ELEMENTS.length) % ELEMENTS.length]!
}
