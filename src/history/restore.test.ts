import { describe, expect, it } from 'vitest'
import { manifestSchema } from '../project/schemas/manifest'
import { createSnapshot } from './snapshot'
import { restoreItem, restoreProject } from './restore'
import { chapterNode, makeKit, sceneNode, type Kit } from './testKit'

const snap = async (k: Kit) => (await createSnapshot(k.engine, k.io, k.env, { keys: 'all' })).id
const manifestOf = (k: Kit) => JSON.parse(k.text('project.json')!)
const ids = (nodes: Array<{ id: string }>) => nodes.map((n) => n.id)
const oldVersion = async (k: Kit, include: string[]) => {
  const old = { ...JSON.parse(k.text('project.json')!), version: 10 }
  await k.engine.commit({ message: 'old', include, overrides: { 'project.json': new TextEncoder().encode(JSON.stringify(old)) } })
  return (await k.engine.log())[0].id
}

function deps(k: Kit, over: Partial<{ readOnly: boolean; fail: boolean }> = {}) {
  const calls: string[] = []
  return {
    calls,
    deps: {
      env: k.env,
      readOnly: over.readOnly ?? false,
      makeSafetyBackup: async () => {
        calls.push('backup')
        if (over.fail) throw new Error('disk full')
        return 'safety-1'
      },
    },
  }
}

describe('restoreItem', () => {
  it('brings a scene back to the snapshot text, after the safety backup', async () => {
    const k = await makeKit()
    const id = await snap(k)
    await k.scene('s2', 'edited later')
    const d = deps(k)
    const r = await restoreItem(k.engine, k.io, id, 'node:s2', d.deps)
    expect(k.text('manuscript/s2.json')).toBe('s2-1')
    expect(d.calls).toEqual(['backup'])
    expect(r.safetyBackup).toBe('safety-1')
    expect(r.written).toEqual(['manuscript/s2.json'])
  })

  it('re-adds a scene deleted later at its original place', async () => {
    const k = await makeKit()
    const id = await snap(k)
    k.manifest.manuscript[0].children.splice(1, 1)
    await k.save()
    await k.io.remove('manuscript/s2.json')
    await restoreItem(k.engine, k.io, id, 'node:s2', deps(k).deps)
    expect(ids(manifestOf(k).manuscript[0].children)).toEqual(['s1', 's2', 's3'])
    expect(k.text('manuscript/s2.json')).toBe('s2-1')
    expect(manifestSchema.safeParse(manifestOf(k)).success).toBe(true)
  })

  it('puts the item at the root of its area when its parent is gone', async () => {
    const k = await makeKit()
    k.manifest.manuscript.push(chapterNode('ch2', 'Chapter 2'))
    await k.save()
    const id = await snap(k)
    k.manifest.manuscript = [k.manifest.manuscript[1]]
    await k.save()
    await k.io.remove('manuscript/s2.json')
    await restoreItem(k.engine, k.io, id, 'node:s2', deps(k).deps)
    expect(ids(manifestOf(k).manuscript)).toEqual(['ch2', 's2'])
  })

  it('keeps an existing item where it is and only restores its content and title', async () => {
    const k = await makeKit()
    const id = await snap(k)
    const [s1, s2, s3] = k.manifest.manuscript[0].children
    k.manifest.manuscript[0].children = [s3, s2, { ...s1, title: 'Renamed' }]
    await k.save()
    await k.scene('s1', 'new text')
    await restoreItem(k.engine, k.io, id, 'node:s1', deps(k).deps)
    const kids = manifestOf(k).manuscript[0].children
    expect(ids(kids)).toEqual(['s3', 's2', 's1'])
    expect(kids[2].title).toBe('Scene 1')
    expect(k.text('manuscript/s1.json')).toBe('s1-1')
  })

  it('drops a stale trash entry for the restored item', async () => {
    const k = await makeKit()
    const id = await snap(k)
    k.manifest.manuscript[0].children.pop()
    k.manifest.trash.push({ id: 's3', type: 'scene', title: 'Scene 3', originalPath: 'manuscript/s3.json', trashPath: '.storyworks/trash/s3/s3.json', parentId: 'ch1', index: 2, deletedAt: 'x' })
    await k.save()
    await k.io.rename('manuscript/s3.json', '.storyworks/trash/s3/s3.json')
    await restoreItem(k.engine, k.io, id, 'node:s3', deps(k).deps)
    expect(manifestOf(k).trash).toEqual([])
    expect(k.text('.storyworks/trash/s3/s3.json')).toBeUndefined()
  })

  it('restores a loose file by path', async () => {
    const k = await makeKit()
    await k.io.writeTextAtomic('assets/a.png', 'img1')
    const id = await snap(k)
    await k.io.writeTextAtomic('assets/a.png', 'img2')
    await restoreItem(k.engine, k.io, id, 'file:assets/a.png', deps(k).deps)
    expect(k.text('assets/a.png')).toBe('img1')
  })

  it('refuses a key that is not in the snapshot, without a backup', async () => {
    const k = await makeKit()
    const id = await snap(k)
    const d = deps(k)
    await expect(restoreItem(k.engine, k.io, id, 'node:nope', d.deps)).rejects.toMatchObject({ code: 'not-in-snapshot' })
    expect(d.calls).toEqual([])
  })

  it('aborts with nothing changed when the safety backup fails', async () => {
    const k = await makeKit()
    const id = await snap(k)
    await k.scene('s2', 'edited later')
    await expect(restoreItem(k.engine, k.io, id, 'node:s2', deps(k, { fail: true }).deps)).rejects.toThrow('disk full')
    expect(k.text('manuscript/s2.json')).toBe('edited later')
  })

  it('refuses when the book is read-only', async () => {
    const k = await makeKit()
    const id = await snap(k)
    await k.scene('s2', 'edited later')
    const d = deps(k, { readOnly: true })
    await expect(restoreItem(k.engine, k.io, id, 'node:s2', d.deps)).rejects.toMatchObject({ code: 'read-only' })
    expect(d.calls).toEqual([])
    expect(k.text('manuscript/s2.json')).toBe('edited later')
  })

  it('restores files only when the snapshot has another format version', async () => {
    const k = await makeKit()
    const id = await oldVersion(k, ['manuscript/s1.json', 'manuscript/s2.json', 'manuscript/s3.json'])
    await k.scene('s2', 'edited later')
    const before = k.text('project.json')
    const r = await restoreItem(k.engine, k.io, id, 'node:s2', deps(k).deps)
    expect(k.text('manuscript/s2.json')).toBe('s2-1')
    expect(k.text('project.json')).toBe(before)
    expect(r.manifestChanged).toBe(false)
  })
})

describe('restoreProject', () => {
  it('moves newer items to the Trash and makes the project equal the snapshot', async () => {
    const k = await makeKit()
    await k.io.writeTextAtomic('assets/a.png', 'img1')
    const id = await snap(k)
    const want = Object.fromEntries((await k.engine.listTree(id)).filter((p) => p !== 'project.json').map((p) => [p, k.text(p)]))

    k.manifest.manuscript[0].children.push(sceneNode('n1', 'New 1'))
    k.manifest.manuscript.push(chapterNode('ch2', 'Chapter 2'))
    await k.save()
    await k.scene('n1', 'n1-1')
    await k.scene('s1', 'edited later')
    await k.io.writeTextAtomic('assets/b.png', 'img-new')

    const d = deps(k)
    const r = await restoreProject(k.engine, k.io, id, d.deps)
    expect(d.calls).toEqual(['backup'])
    for (const [p, text] of Object.entries(want)) expect(k.text(p), p).toBe(text)
    const m = manifestOf(k)
    expect(ids(m.manuscript)).toEqual(['ch1'])
    expect(ids(m.manuscript[0].children)).toEqual(['s1', 's2', 's3'])
    const trash = m.trash.map((t: { id: string; type: string; parentId: string | null; index: number }) => [t.id, t.type, t.parentId, t.index])
    expect(trash.sort()).toEqual([
      ['ch2', 'chapter', null, 1],
      ['n1', 'scene', 'ch1', 3],
    ])
    expect(k.text('.storyworks/trash/n1/n1.json')).toBe('n1-1')
    expect(k.text('manuscript/n1.json')).toBeUndefined()
    expect(k.text('assets/b.png')).toBeUndefined()
    expect(r.trashed).toContain('manuscript/n1.json')
    expect(manifestSchema.safeParse(m).success).toBe(true)
  })

  it('keeps the current trash list, not the snapshot one', async () => {
    const k = await makeKit()
    const id = await snap(k)
    k.manifest.trash.push({ id: 'old', type: 'scene', title: 'Old', originalPath: 'manuscript/old.json', trashPath: '.storyworks/trash/old/old.json', parentId: null, index: 0, deletedAt: 'x' })
    await k.save()
    await restoreProject(k.engine, k.io, id, deps(k).deps)
    expect(manifestOf(k).trash.map((t: { id: string }) => t.id)).toEqual(['old'])
  })

  it('does not rewrite files that already match, and backs up before any write', async () => {
    const k = await makeKit()
    const id = await snap(k)
    await k.scene('s2', 'edited later')
    const order: string[] = []
    k.io.failOn = (op, path) => {
      if (op === 'writeTextAtomic') order.push(`write ${path}`)
      return false
    }
    const d = deps(k)
    await restoreProject(k.engine, k.io, id, { ...d.deps, makeSafetyBackup: async () => { order.push('backup'); return 'b' } })
    expect(order).toEqual(['backup', 'write manuscript/s2.json'])
  })

  it('aborts with nothing changed when the safety backup fails', async () => {
    const k = await makeKit()
    const id = await snap(k)
    await k.scene('s2', 'edited later')
    const before = k.text('project.json')
    await expect(restoreProject(k.engine, k.io, id, deps(k, { fail: true }).deps)).rejects.toThrow('disk full')
    expect(k.text('manuscript/s2.json')).toBe('edited later')
    expect(k.text('project.json')).toBe(before)
  })

  it('refuses when read-only', async () => {
    const k = await makeKit()
    const id = await snap(k)
    await expect(restoreProject(k.engine, k.io, id, deps(k, { readOnly: true }).deps)).rejects.toMatchObject({ code: 'read-only' })
  })

  it('refuses a snapshot from another format version, before any backup', async () => {
    const k = await makeKit()
    const id = await oldVersion(k, ['manuscript/s1.json'])
    const d = deps(k)
    await expect(restoreProject(k.engine, k.io, id, d.deps)).rejects.toMatchObject({ code: 'version' })
    expect(d.calls).toEqual([])
  })
})
