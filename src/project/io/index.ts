import type { ProjectIO } from '../types'
import { createBrowserProjectIO } from './browser'
import { createTauriProjectIO } from './tauri'

/** `root` is an absolute folder in the app, a virtual project name in the browser. */
export function createProjectIO(root: string): ProjectIO {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? createTauriProjectIO(root)
    : createBrowserProjectIO(root)
}
