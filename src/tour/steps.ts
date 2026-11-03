import { type SectionId } from '../sections'
import { isKindId, type KindId } from '../project/kinds'

export interface TourStep {
  id: string
  kind: KindId
  /** Sidebar section the popover points at. */
  section: SectionId
  /** CSS selector of the anchor; the popover is centred when it is not on screen. */
  target: string
  titleKey: string
  bodyKey: string
}

/** Marks a sidebar section row as a tour anchor. */
export const tourAnchorAttr = 'data-tour-section'

const step = (kind: KindId, id: string, section: SectionId): TourStep => ({
  id,
  kind,
  section,
  target: `[${tourAnchorAttr}="${section}"]`,
  titleKey: `tour.steps.${id}.title`,
  bodyKey: `tour.steps.${id}.body`,
})
const book = (id: string, section: SectionId) => step('book', id, section)
const script = (id: string, section: SectionId) => step('screenplay', id, section)
const game = (id: string, section: SectionId) => step('game', id, section)

/** Steps per kind; a step may only point at a section that kind shows. */
export const tourStepsByKind: Record<KindId, readonly TourStep[]> = {
  book: [
    book('manuscript', 'write'),
    book('timelines', 'timelines'),
    book('rules', 'rules'),
    book('codex', 'codex'),
    book('checks', 'checks'),
  ],
  screenplay: [
    script('screenplayElements', 'write'),
    script('screenplaySceneNumbers', 'write'),
    script('screenplayPages', 'write'),
    script('screenplayFountain', 'export'),
    script('screenplayChecks', 'checks'),
  ],
  game: [
    game('gameVariables', 'write'),
    game('gameConversations', 'write'),
    game('gameStoryMap', 'storymap'),
    game('gameRoutes', 'timelines'),
    game('gameDocument', 'gamedoc'),
    game('gameChecks', 'checks'),
  ],
}

/** The tour for a project kind; an unknown or missing kind gets the book tour. */
export const tourStepsFor = (kind: string | null | undefined): readonly TourStep[] =>
  tourStepsByKind[kind && isKindId(kind) ? kind : 'book']
