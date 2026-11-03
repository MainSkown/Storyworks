import type { DictStorage } from './types'

const LS = 'storyworks:globaldicts:'

function createBrowserStorage(): DictStorage {
  const keys = () =>
    Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter((k) =>
      k.startsWith(LS),
    )
  return {
    async readText(path) {
      return localStorage.getItem(LS + path)
    },
    async writeTextAtomic(path, text) {
      localStorage.setItem(LS + path, text)
    },
    async listFiles(dir) {
      const prefix = LS + dir.replace(/\/$/, '') + '/'
      return keys()
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(LS.length))
        .sort()
    },
    async remove(path) {
      const exact = LS + path
      for (const k of keys())
        if (k === exact || k.startsWith(exact + '/')) localStorage.removeItem(k)
    },
  }
}

/** Paths are relative to the Tauri app data dir (`$APPDATA`). */
function createTauriStorage(): DictStorage {
  const fs = () => import('@tauri-apps/plugin-fs')
  const baseDir = async () => (await fs()).BaseDirectory.AppData
  async function walk(dir: string, out: string[]) {
    const { readDir } = await fs()
    for (const e of await readDir(dir, { baseDir: await baseDir() })) {
      if (e.isDirectory) await walk(`${dir}/${e.name}`, out)
      else if (e.isFile) out.push(`${dir}/${e.name}`)
    }
  }
  return {
    async readText(path) {
      const { readTextFile, exists } = await fs()
      const b = { baseDir: await baseDir() }
      return (await exists(path, b)) ? readTextFile(path, b) : null
    },
    async writeTextAtomic(path, text) {
      const { writeTextFile, rename, mkdir } = await fs()
      const b = { baseDir: await baseDir() }
      await mkdir(path.slice(0, path.lastIndexOf('/')), { ...b, recursive: true })
      await writeTextFile(`${path}.tmp`, text, b)
      await rename(`${path}.tmp`, path, { oldPathBaseDir: b.baseDir, newPathBaseDir: b.baseDir })
    },
    async listFiles(dir) {
      const { exists } = await fs()
      if (!(await exists(dir, { baseDir: await baseDir() }))) return []
      const out: string[] = []
      await walk(dir.replace(/\/$/, ''), out)
      return out.sort()
    },
    async remove(path) {
      const { remove, exists } = await fs()
      const b = { baseDir: await baseDir() }
      if (await exists(path, b)) await remove(path, { ...b, recursive: true })
    },
  }
}

export function createGlobalDictStorage(): DictStorage {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? createTauriStorage()
    : createBrowserStorage()
}
