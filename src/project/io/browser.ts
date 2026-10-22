import type { ProjectIO } from '../types'

const PREFIX = 'storyworks:project:'
const META = 'storyworks:projectmeta:'

const clean = (p: string) => p.replace(/^\.?\/+|\/+$/g, '').replace(/^\.$/, '')

/** Browser/screenshot-run only: a virtual project folder in localStorage. */
export function createBrowserProjectIO(rootName: string): ProjectIO {
  const key = (p: string) => `${PREFIX}${rootName}/${clean(p)}`
  const metaKey = (p: string) => `${META}${rootName}/${clean(p)}`
  const filePrefix = `${PREFIX}${rootName}/`

  /** root-relative file paths under `dir` ('' = all) */
  const under = (dir: string) => {
    const d = clean(dir)
    const prefix = d === '' ? '' : `${d}/`
    const out: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(filePrefix) && k.slice(filePrefix.length).startsWith(prefix))
        out.push(k.slice(filePrefix.length))
    }
    return out.sort()
  }
  const put = (p: string, text: string) => {
    const prev = Number(localStorage.getItem(metaKey(p)) ?? 0)
    localStorage.setItem(key(p), text)
    localStorage.setItem(metaKey(p), String(Math.max(Date.now(), prev + 1)))
  }
  const drop = (p: string) => {
    localStorage.removeItem(key(p))
    localStorage.removeItem(metaKey(p))
  }

  return {
    async readText(path) {
      return localStorage.getItem(key(path))
    },
    async writeTextAtomic(path, text) {
      put(path, text)
    },
    async exists(path) {
      return localStorage.getItem(key(path)) !== null
    },
    async listFiles(dir) {
      return under(dir)
    },
    async mkdir() {},
    async rename(from, to) {
      const f = clean(from)
      const t = clean(to)
      const text = localStorage.getItem(key(f))
      if (text !== null) {
        put(t, text)
        drop(f)
        return
      }
      const children = under(f).filter((p) => p.startsWith(`${f}/`))
      if (children.length === 0) throw new Error(`rename: ${from} does not exist`)
      for (const c of children) {
        put(t + c.slice(f.length), localStorage.getItem(key(c)) ?? '')
        drop(c)
      }
    },
    async remove(path) {
      const p = clean(path)
      drop(p)
      for (const c of under(p)) if (c.startsWith(`${p}/`)) drop(c)
    },
    async copyTree(from, to) {
      const f = clean(from)
      const t = clean(to)
      for (const c of under(f)) {
        if (c.startsWith(`${f}/`)) put(t + c.slice(f.length), localStorage.getItem(key(c)) ?? '')
      }
    },
    async stat(path) {
      if (localStorage.getItem(key(path)) === null) return null
      return { mtimeMs: Number(localStorage.getItem(metaKey(path)) ?? 0) }
    },
    async watch() {
      return () => {}
    },
  }
}

export function listBrowserProjects(): string[] {
  const names = new Set<string>()
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith(PREFIX)) continue
    const slash = k.indexOf('/', PREFIX.length)
    if (slash > 0) names.add(k.slice(PREFIX.length, slash))
  }
  return [...names].sort()
}
