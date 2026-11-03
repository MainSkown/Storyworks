import { Notify } from 'quasar'
import { i18n } from '../i18n'
import { openLogFolder } from '../safety/runtime'
import { startTour } from '../tour/state'
import { overlayOpen } from '../shortcuts/useShortcuts'

export interface HelpItem {
  id: string
  icon: string
  /** vue-i18n key */
  labelKey: string
  run(): void | Promise<void>
}

/** Entries of the Help menu in the sidebar. Add new ones here. */
export const helpItems: HelpItem[] = [
  { id: 'log-folder', icon: 'folder_open', labelKey: 'help.openLogFolder', run: runOpenLogFolder },
]

helpItems.unshift(
  { id: 'tour', icon: 'tour', labelKey: 'help.tour', run: startTour },
  {
    id: 'shortcuts',
    icon: 'keyboard',
    labelKey: 'help.shortcuts',
    run: () => void (overlayOpen.value = true),
  },
)

async function runOpenLogFolder(): Promise<void> {
  const t = i18n.global.t
  try {
    if (!(await openLogFolder())) Notify.create({ message: t('help.logOnlyInApp'), type: 'info' })
  } catch {
    Notify.create({ message: t('help.logFailed'), type: 'negative' })
  }
}
