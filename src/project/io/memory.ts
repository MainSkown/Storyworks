import type { ProjectIO } from '../types'
import { fromBase64, toBase64 } from './base64'

export type MemoryProjectIO = ProjectIO & {
  files: Map<string, string>
  /** Set to make an op throw. op is the ProjectIO method name, e.g. 'writeTextAtomic', 'rename'. */
  failOn?: (op: string, path: string) => boolean
  /** Simulates an outside change notification for subscribers of watch(). */
  emit(paths: string[]): void
  /** Bumps the mtime of a path (as if edited outside the app). */
  touch(path: string): void
}

export function createMemoryProjectIO(initial: Record<string, string> = {}): MemoryProjectIO {
  const files = new Map(Object.entries(initial))
  const mtimes = new Map<string, number>()
  const listeners = new Set<(paths: string[]) => void>()
  let clock = 0
  const touch = (path: string) => mtimes.set(path, ++clock)
  for (const path of files.keys()) touch(path)

  const io: MemoryProjectIO = {
    files,
    touch,
    emit(paths) {
      for (const l of [...listeners]) l(paths)
    },
    async readText(path) {
      check('readText', path)
      return files.get(path) ?? null
    },
    async writeTextAtomic(path, text) {
      check('writeTextAtomic', path)
      files.set(path, text)
      touch(path)
    },
    async writeBytes(path, bytes) {
      check('writeBytes', path)
      files.set(path, toBase64(bytes))
      touch(path)
    },
    async readBytes(path) {
      check('readBytes', path)
      const text = files.get(path)
      return text === undefined ? null : fromBase64(text)
    },
    async exists(path) {
      check('exists', path)
      return files.has(path)
    },
    async listFiles(dir) {
      check('listFiles', dir)
      const prefix = dir === '' || dir === '.' ? '' : dir.replace(/\/$/, '') + '/'
      return [...files.keys()].filter((p) => p.startsWith(prefix)).sort()
    },
    async mkdir(dir) {
      check('mkdir', dir)
    },
    async rename(from, to) {
      check('rename', from)
      const text = files.get(from)
      if (text === undefined) throw new Error(`rename: ${from} does not exist`)
      files.delete(from)
      mtimes.delete(from)
      files.set(to, text)
      touch(to)
    },
    async remove(path) {
      check('remove', path)
      const prefix = path.replace(/\/$/, '') + '/'
      for (const p of [...files.keys()]) {
        if (p === path || p.startsWith(prefix)) {
          files.delete(p)
          mtimes.delete(p)
        }
      }
    },
    async copyTree(from, to) {
      check('copyTree', from)
      const prefix = from.replace(/\/$/, '') + '/'
      const dest = to.replace(/\/$/, '') + '/'
      for (const [p, text] of [...files]) {
        if (p.startsWith(prefix)) {
          files.set(dest + p.slice(prefix.length), text)
          touch(dest + p.slice(prefix.length))
        }
      }
    },
    async stat(path) {
      check('stat', path)
      const m = mtimes.get(path)
      return files.has(path) && m !== undefined ? { mtimeMs: m } : null
    },
    async watch(onChange) {
      check('watch', '')
      listeners.add(onChange)
      return () => {
        listeners.delete(onChange)
      }
    },
  }

  function check(op: string, path: string) {
    if (io.failOn?.(op, path)) throw new Error(`injected failure: ${op} ${path}`)
  }

  return io
}
