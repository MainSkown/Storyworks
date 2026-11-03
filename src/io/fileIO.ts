export interface FileIO {
  /** Returns null when the file does not exist. */
  readText(path: string): Promise<string | null>
  /** Writes to a temp file, then renames over the target. */
  writeTextAtomic(path: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  /** Deletes the file; no error when it does not exist. */
  remove(path: string): Promise<void>
}

export interface MemoryFileIO extends FileIO {
  files: Map<string, string>
}

export function createMemoryFileIO(initial: Record<string, string> = {}): MemoryFileIO {
  const files = new Map(Object.entries(initial))
  return {
    files,
    async readText(path) {
      return files.get(path) ?? null
    },
    async writeTextAtomic(path, text) {
      files.set(path, text)
    },
    async exists(path) {
      return files.has(path)
    },
    async remove(path) {
      files.delete(path)
    },
  }
}

const LS_PREFIX = 'storyworks:'

/** Browser-only fallback (no Tauri). */
export function createLocalStorageFileIO(): FileIO {
  return {
    async readText(path) {
      return localStorage.getItem(LS_PREFIX + path)
    },
    async writeTextAtomic(path, text) {
      localStorage.setItem(LS_PREFIX + path, text)
    },
    async exists(path) {
      return localStorage.getItem(LS_PREFIX + path) !== null
    },
    async remove(path) {
      localStorage.removeItem(LS_PREFIX + path)
    },
  }
}

/** Paths are relative to the app data directory. */
export function createTauriFileIO(): FileIO {
  const fs = () => import('@tauri-apps/plugin-fs')
  return {
    async readText(path) {
      const { readTextFile, exists, BaseDirectory } = await fs()
      if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return null
      return readTextFile(path, { baseDir: BaseDirectory.AppData })
    },
    async writeTextAtomic(path, text) {
      const { writeTextFile, rename, mkdir, BaseDirectory } = await fs()
      const baseDir = BaseDirectory.AppData
      const slash = path.lastIndexOf('/')
      await mkdir(slash > 0 ? path.slice(0, slash) : '.', { baseDir, recursive: true })
      const tmp = `${path}.tmp`
      await writeTextFile(tmp, text, { baseDir })
      await rename(tmp, path, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir })
    },
    async exists(path) {
      const { exists, BaseDirectory } = await fs()
      return exists(path, { baseDir: BaseDirectory.AppData })
    },
    async remove(path) {
      const { remove, exists, BaseDirectory } = await fs()
      if (await exists(path, { baseDir: BaseDirectory.AppData })) {
        await remove(path, { baseDir: BaseDirectory.AppData })
      }
    },
  }
}

export function createFileIO(): FileIO {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? createTauriFileIO()
    : createLocalStorageFileIO()
}
