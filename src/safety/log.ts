// Local diagnostics log: JSON lines in app data, nothing leaves the machine.
// Lines hold only a fixed event name and a short error code: never messages, text or paths.
import { createFileIO, type FileIO } from '../io/fileIO'

export const LOG_FILES = 5
export const LOG_MAX_BYTES = 1024 * 1024
export const LOG_DIR = 'logs'
/** 1 is the newest file. */
export const logPath = (n: number) => `${LOG_DIR}/storyworks-${n}.log`

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogLine {
  ts: string
  level: LogLevel
  event: string
  code?: string
}

export interface Logger {
  info(event: string, err?: unknown): void
  warn(event: string, err?: unknown): void
  error(event: string, err?: unknown): void
  /** Resolves when everything logged so far is written. */
  flush(): Promise<void>
}

const EVENT = /^[a-z][a-z0-9]*(\.[a-z0-9-]+){0,3}$/
const CODE = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/

function codeOf(err: unknown): string | undefined {
  if (err === null || typeof err !== 'object') return undefined
  const o = err as { code?: unknown; name?: unknown }
  for (const c of [o.code, o.name]) if (typeof c === 'string' && CODE.test(c)) return c
  return undefined
}

const enc = new TextEncoder()

export function createLogger(
  io: FileIO,
  opts: { now?: () => number; maxBytes?: number } = {},
): Logger {
  const now = opts.now ?? (() => Date.now())
  const maxBytes = opts.maxBytes ?? LOG_MAX_BYTES
  let current: string | null = null
  let queue: Promise<void> = Promise.resolve()

  async function rotate(): Promise<void> {
    for (let n = LOG_FILES - 1; n >= 1; n--) {
      const text = await io.readText(logPath(n))
      if (text !== null) await io.writeTextAtomic(logPath(n + 1), text)
    }
    current = ''
  }

  function add(level: LogLevel, event: string, err?: unknown): void {
    const line: LogLine = {
      ts: new Date(now()).toISOString(),
      level,
      event: EVENT.test(event) ? event : 'event.invalid',
    }
    const code = codeOf(err)
    if (code) line.code = code
    const text = JSON.stringify(line) + '\n'
    queue = queue.then(async () => {
      try {
        if (current === null) current = (await io.readText(logPath(1))) ?? ''
        const used = enc.encode(current).length
        if (used > 0 && used + enc.encode(text).length > maxBytes) await rotate()
        current += text
        await io.writeTextAtomic(logPath(1), current)
      } catch {
        current = null // logging must never break the app
      }
    })
  }

  return {
    info: (e, err) => add('info', e, err),
    warn: (e, err) => add('warn', e, err),
    error: (e, err) => add('error', e, err),
    flush: () => queue,
  }
}

const silent: Logger = { info() {}, warn() {}, error() {}, flush: async () => {} }
let active: Logger = silent

/** Until this is called (the app does it at startup) log calls do nothing, so tests stay quiet. */
export function installLogger(l: Logger = createLogger(createFileIO())): Logger {
  active = l
  return l
}

export const log: Logger = {
  info: (e, err) => active.info(e, err),
  warn: (e, err) => active.warn(e, err),
  error: (e, err) => active.error(e, err),
  flush: () => active.flush(),
}

/** Logs uncaught errors and rejected promises. Returns a function that removes the listeners. */
export function logWindowErrors(target: Window = window): () => void {
  const onError = (e: ErrorEvent) => log.error('window.error', e.error)
  const onRejection = (e: PromiseRejectionEvent) => log.error('window.unhandledrejection', e.reason)
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
  }
}
