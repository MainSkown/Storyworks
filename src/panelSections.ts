import type { SectionId } from './sections'

export interface PanelSection {
  /** Namespaced `<section>.<name>`; also the key for remembered collapse state. */
  id: string
  /** Key under `contextSections.*`. */
  i18nKey: string
}

const ps = (section: SectionId, name: string): PanelSection => ({
  id: `${section}.${name}`,
  i18nKey: `contextSections.${section}.${name}`,
})

export const panelSections: Partial<Record<SectionId, readonly PanelSection[]>> = {
  write: [
    ps('write', 'thisScene'),
    ps('write', 'thisParagraph'),
    ps('write', 'inThisScene'),
    ps('write', 'problems'),
  ],
  timelines: [
    ps('timelines', 'selectedEvent'),
    ps('timelines', 'writtenIn'),
    ps('timelines', 'whoLearnsWhat'),
    ps('timelines', 'linked'),
  ],
  rules: [ps('rules', 'usedIn')],
  codex: [ps('codex', 'links')],
}
