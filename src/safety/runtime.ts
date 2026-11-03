// App-wide wiring of the running marker and the log. Call initSafety() once before mounting.
import { ref } from 'vue'
import { createFileIO } from '../io/fileIO'
import { installLogger, log, LOG_DIR, logPath, logWindowErrors } from './log'
import { beginSession, createSafetyEnv, type SafetySession } from './startup'

/** Set when the previous run did not exit cleanly; the dialog clears it. */
export const crashInfo = ref<{ lastBook: string | null } | null>(null)

let session: SafetySession | null = null

export async function initSafety(): Promise<void> {
  installLogger()
  logWindowErrors()
  try {
    session = await beginSession(createFileIO(), await createSafetyEnv())
  } catch (e) {
    log.error('safety.start-failed', e)
    return
  }
  log.info('app.start')
  if (session.state.kind === 'crashed') {
    log.warn('app.previous-run-crashed')
    crashInfo.value = { lastBook: session.state.lastBook }
  }
  window.addEventListener('beforeunload', () => void session?.end())
}

export function rememberBook(path: string): void {
  void session?.setLastBook(path).catch((e) => log.error('safety.marker-failed', e))
}

/** Clean exit: removes the marker and writes pending log lines. */
export async function endSafety(): Promise<void> {
  log.info('app.exit')
  await log.flush()
  await session?.end().catch(() => {})
}

/** Opens the folder holding the log files (app only). false = not available here. */
export async function openLogFolder(): Promise<boolean> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return false
  await log.flush()
  const io = createFileIO()
  if (!(await io.exists(logPath(1)))) await io.writeTextAtomic(logPath(1), '')
  const [{ appDataDir, join }, { revealItemInDir }] = await Promise.all([
    import('@tauri-apps/api/path'),
    import('@tauri-apps/plugin-opener'),
  ])
  await revealItemInDir(await join(await appDataDir(), LOG_DIR, 'storyworks-1.log'))
  return true
}
