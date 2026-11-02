import { describe, expect, it } from 'vitest'
import { makeKit } from './testKit'

const enc = (s: string) => new TextEncoder().encode(s)

describe('memory engine', () => {
  it('status ignores out-of-scope files but sees deletions of recorded ones', async () => {
    const k = await makeKit()
    await k.engine.commit({ message: 'a', include: ['project.json', 'manuscript/s1.json'], overrides: {} })
    await k.io.writeTextAtomic('other.txt', 'x')
    await k.io.remove('manuscript/s1.json')
    expect(await k.engine.status(['project.json'])).toEqual([{ path: 'manuscript/s1.json', status: 'deleted' }])
  })

  it('records overrides instead of the folder bytes and lists the tree', async () => {
    const k = await makeKit()
    const id = await k.engine.commit({ message: 'a', include: ['manuscript/s1.json'], overrides: { 'project.json': enc('{}') } })
    expect(new TextDecoder().decode((await k.engine.readFile(id, 'project.json'))!)).toBe('{}')
    expect((await k.engine.listTree(id)).sort()).toEqual(['manuscript/s1.json', 'project.json'])
    expect(await k.engine.readFile(id, 'nope')).toBeNull()
  })

  it('log is newest first and changedFiles is against the parent', async () => {
    const k = await makeKit()
    const a = await k.engine.commit({ message: 'a', include: ['manuscript/s1.json', 'manuscript/s2.json'], overrides: {} })
    await k.scene('s1', 'changed')
    const b = await k.engine.commit({ message: 'b', include: ['manuscript/s1.json'], overrides: {} })
    expect((await k.engine.log()).map((s) => s.id)).toEqual([b, a])
    expect(await k.engine.changedFiles(b)).toEqual([{ path: 'manuscript/s1.json', status: 'modified' }])
    expect((await k.engine.changedFiles(a)).map((c) => c.status)).toEqual(['added', 'added'])
  })

  it('a corrupt history is reported by check()', async () => {
    const k = await makeKit()
    await k.engine.check()
    await k.engine.commit({ message: 'a', include: ['project.json'], overrides: {} })
    k.engine.breakIt()
    await expect(k.engine.check()).rejects.toMatchObject({ code: 'corrupt' })
    await expect(k.engine.status([])).rejects.toMatchObject({ code: 'corrupt' })
  })
})
