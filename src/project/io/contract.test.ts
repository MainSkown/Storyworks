import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectIO } from '../types'
import { createBrowserProjectIO, listBrowserProjects } from './browser'
import { createMemoryProjectIO } from './memory'

function stubLocalStorage() {
  const m = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    get length() {
      return m.size
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  })
}

const impls: [string, () => ProjectIO][] = [
  ['memory', () => createMemoryProjectIO()],
  [
    'browser',
    () => {
      stubLocalStorage()
      return createBrowserProjectIO('demo')
    },
  ],
]

describe.each(impls)('ProjectIO contract: %s', (_name, make) => {
  let io: ProjectIO
  beforeEach(() => {
    io = make()
  })

  it('writes, reads and reports existence', async () => {
    expect(await io.readText('a/b.json')).toBeNull()
    expect(await io.exists('a/b.json')).toBe(false)
    await io.writeTextAtomic('a/b.json', 'one')
    expect(await io.readText('a/b.json')).toBe('one')
    expect(await io.exists('a/b.json')).toBe(true)
  })

  it('round-trips binary bytes and reads null when missing', async () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 200, 255])
    expect(await io.readBytes('assets/a.png')).toBeNull()
    await io.writeBytes('assets/a.png', bytes)
    expect(await io.readBytes('assets/a.png')).toEqual(bytes)
    expect(await io.exists('assets/a.png')).toBe(true)
  })

  it('overwrites an existing file', async () => {
    await io.writeTextAtomic('f.json', 'old')
    await io.writeTextAtomic('f.json', 'new')
    expect(await io.readText('f.json')).toBe('new')
    expect(await io.listFiles('')).toEqual(['f.json'])
  })

  it('lists files recursively as root-relative paths', async () => {
    await io.writeTextAtomic('project.json', '{}')
    await io.writeTextAtomic('scenes/a/1.json', 'x')
    await io.writeTextAtomic('scenes/2.json', 'y')
    expect(await io.listFiles('scenes')).toEqual(['scenes/2.json', 'scenes/a/1.json'])
    expect(await io.listFiles('')).toEqual(['project.json', 'scenes/2.json', 'scenes/a/1.json'])
  })

  it('renames a file', async () => {
    await io.writeTextAtomic('a.json', 'x')
    await io.rename('a.json', 'b/a.json')
    expect(await io.exists('a.json')).toBe(false)
    expect(await io.readText('b/a.json')).toBe('x')
  })

  it('removes a directory with its files', async () => {
    await io.writeTextAtomic('d/1.json', 'x')
    await io.writeTextAtomic('d/sub/2.json', 'y')
    await io.writeTextAtomic('keep.json', 'z')
    await io.remove('d')
    expect(await io.listFiles('')).toEqual(['keep.json'])
  })

  it('copies a tree and leaves the source', async () => {
    await io.writeTextAtomic('src/1.json', 'x')
    await io.writeTextAtomic('src/sub/2.json', 'y')
    await io.copyTree('src', 'backup/src')
    expect(await io.listFiles('backup')).toEqual(['backup/src/1.json', 'backup/src/sub/2.json'])
    expect(await io.readText('backup/src/sub/2.json')).toBe('y')
    expect(await io.exists('src/1.json')).toBe(true)
  })

  it('stat is null for missing and has mtime for existing', async () => {
    expect(await io.stat('nope.json')).toBeNull()
    await io.writeTextAtomic('a.json', 'x')
    const first = (await io.stat('a.json'))!.mtimeMs
    await io.writeTextAtomic('a.json', 'y')
    expect((await io.stat('a.json'))!.mtimeMs).toBeGreaterThan(first)
  })
})

describe('listBrowserProjects', () => {
  it('lists root names that have files', async () => {
    stubLocalStorage()
    await createBrowserProjectIO('b').writeTextAtomic('project.json', '{}')
    await createBrowserProjectIO('a').writeTextAtomic('x/y.json', '{}')
    expect(listBrowserProjects()).toEqual(['a', 'b'])
  })
})
