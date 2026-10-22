import type { ProjectIO } from '../types'

const norm = (p: string) => p.replace(/\\/g, '/')

/** ProjectIO over absolute paths in `rootDir`. Needs the fs scope to cover the root. */
export function createTauriProjectIO(rootDir: string): ProjectIO {
  const root = norm(rootDir).replace(/\/+$/, '')
  const fs = () => import('@tauri-apps/plugin-fs')
  const abs = (rel: string) => {
    const r = norm(rel).replace(/^\.?\/+|\/+$/g, '')
    return r === '' || r === '.' ? root : `${root}/${r}`
  }
  const parentOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf('/'), 0)) || '/'

  /** relative file paths under an absolute dir */
  async function walk(dir: string, prefix = ''): Promise<string[]> {
    const { readDir } = await fs()
    const out: string[] = []
    for (const e of await readDir(dir)) {
      const rel = prefix + e.name
      if (e.isDirectory) out.push(...(await walk(`${dir}/${e.name}`, `${rel}/`)))
      else out.push(rel)
    }
    return out
  }

  return {
    async readText(path) {
      const { readTextFile, exists } = await fs()
      const p = abs(path)
      if (!(await exists(p))) return null
      return readTextFile(p)
    },
    async writeTextAtomic(path, text) {
      const { writeTextFile, rename, mkdir } = await fs()
      const p = abs(path)
      await mkdir(parentOf(p), { recursive: true })
      const tmp = `${p}.tmp`
      await writeTextFile(tmp, text)
      await rename(tmp, p)
    },
    async exists(path) {
      const { exists } = await fs()
      return exists(abs(path))
    },
    async listFiles(dir) {
      const { exists } = await fs()
      const d = abs(dir)
      if (!(await exists(d))) return []
      const rel = norm(dir).replace(/^\.?\/+|\/+$/g, '')
      const prefix = rel === '' || rel === '.' ? '' : `${rel}/`
      return (await walk(d, prefix)).sort()
    },
    async mkdir(dir) {
      const { mkdir } = await fs()
      await mkdir(abs(dir), { recursive: true })
    },
    async rename(from, to) {
      const { rename, mkdir } = await fs()
      const dest = abs(to)
      await mkdir(parentOf(dest), { recursive: true })
      await rename(abs(from), dest)
    },
    async remove(path) {
      const { remove, exists } = await fs()
      const p = abs(path)
      if (await exists(p)) await remove(p, { recursive: true })
    },
    async copyTree(from, to) {
      const { copyFile, mkdir, readDir } = await fs()
      const copyDir = async (src: string, dst: string) => {
        await mkdir(dst, { recursive: true })
        for (const e of await readDir(src)) {
          if (e.isDirectory) await copyDir(`${src}/${e.name}`, `${dst}/${e.name}`)
          else await copyFile(`${src}/${e.name}`, `${dst}/${e.name}`)
        }
      }
      await copyDir(abs(from), abs(to))
    },
    async stat(path) {
      const { stat, exists } = await fs()
      const p = abs(path)
      if (!(await exists(p))) return null
      const info = await stat(p)
      return { mtimeMs: info.mtime?.getTime() ?? 0 }
    },
    async watch(onChange) {
      const { watch } = await fs()
      return watch(
        root,
        (event) => {
          const rels = new Set<string>()
          for (const raw of event.paths) {
            const p = norm(raw)
            if (p.startsWith(`${root}/`)) rels.add(p.slice(root.length + 1))
          }
          if (rels.size > 0) onChange([...rels])
        },
        { recursive: true, delayMs: 100 },
      )
    },
  }
}
