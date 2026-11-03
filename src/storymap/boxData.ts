import type { RouteRef } from '../project/schemas/route'
import type { StoryBox } from '../project/schemas/storyMap'
import type { GameItem } from './items'
import type { BoxState } from './useItems'

/** What a canvas node carries: the stored box plus what it points at. */
export interface BoxData {
  box: StoryBox
  item: GameItem | null
  state: BoxState | null
  routes: RouteRef[]
}

export const BOX_ICON = {
  script: 'description',
  conversation: 'forum',
  beat: 'sticky_note_2',
} as const
export type BoxKind = keyof typeof BOX_ICON

export function kindOf(d: BoxData): BoxKind {
  return d.box.kind === 'beat'
    ? 'beat'
    : d.item?.type === 'conversation'
      ? 'conversation'
      : 'script'
}
