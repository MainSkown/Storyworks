import { describe, expect, it } from 'vitest'
import { makeBackup } from '../history/backups'
import { createMemoryProjectIO } from '../project/io/memory'
import { createProject } from '../project/open'
import type { Env } from '../project/types'
import { verifyBook } from './verify'

let n = 0
const env: Env = { now: () => Date.UTC(2026, 10, 3) + ++n * 60_000, newId: () => `id-${++n}` }

async function book() {
  const io = createMemoryProjectIO()
  const p = await createProject(io, { title: 'T', author: 'A', language: 'en' }, env)
  const scenePath = p.manifest.manuscript[0].children[0].path as string
  return { io, scenePath }
}
const snapshot = (io: { files: Map<string, string> }) => JSON.stringify([...io.files])

describe('verifyBook', () => {
  it('passes a good book', async () => {
    const { io } = await book()
    const r = await verifyBook(io)
    expect(r.invalid).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('reports an invalid and a missing file and leaves everything untouched', async () => {
    const { io, scenePath } = await book()
    io.files.set(scenePath, '{"version": 1, "id": "x"}')
    const before = snapshot(io)
    io.failOn = (op) => ['writeTextAtomic', 'rename', 'remove', 'writeBytes', 'copyTree'].includes(op)
    const r = await verifyBook(io)
    expect(r.ok).toBe(false)
    expect(r.invalid.map((i) => i.path)).toEqual([scenePath])
    expect(snapshot(io)).toBe(before)

    io.failOn = undefined
    io.files.delete(scenePath)
    const r2 = await verifyBook(io)
    expect(r2.invalid).toEqual([{ path: scenePath, reason: 'missing' }])
  })

  it('reports a broken project.json', async () => {
    const { io } = await book()
    io.files.set('project.json', '{oops')
    const r = await verifyBook(io)
    expect(r.invalid.map((i) => i.path)).toEqual(['project.json'])
  })

  it('names the latest automatic backup', async () => {
    const { io } = await book()
    const a = await makeBackup(io, env, 'auto')
    const b = await makeBackup(io, env, 'auto')
    await makeBackup(io, env, 'safety')
    expect(a).not.toBe(b)
    expect((await verifyBook(io)).latestBackup?.name).toBe(b)
  })

  it('has no backup to offer when there is none', async () => {
    const { io } = await book()
    expect((await verifyBook(io)).latestBackup).toBeNull()
  })
})
