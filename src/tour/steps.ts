import type { SectionId } from '../sections'

export interface TourStep {
  id: string
  /** Book-kind steps today; a later milestone appends script-kind steps with their own kind. */
  kind: 'book'
  /** Sidebar section the popover points at. */
  section: SectionId
  /** CSS selector of the anchor; the popover is centred when it is not on screen. */
  target: string
  titleKey: string
  bodyKey: string
}

/** Marks a sidebar section row as a tour anchor. */
export const tourAnchorAttr = 'data-tour-section'

const bookStep = (id: string, section: SectionId): TourStep => ({
  id,
  kind: 'book',
  section,
  target: `[${tourAnchorAttr}="${section}"]`,
  titleKey: `tour.steps.${id}.title`,
  bodyKey: `tour.steps.${id}.body`,
})

export const tourSteps: readonly TourStep[] = [
  bookStep('manuscript', 'write'),
  bookStep('timelines', 'timelines'),
  bookStep('rules', 'rules'),
  bookStep('codex', 'codex'),
  bookStep('checks', 'checks'),
]
