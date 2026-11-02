import { describe, expect, it } from 'vitest'
import { loadChanges, createSnapshot } from './snapshot'
import { chapterNode, makeKit, sceneNode, type Kit } from './testKit'

const snap = (k: Kit) => createSnapshot(k.engine, k.io, k.env, { keys: 'all' })
const find = (items: Awaited<ReturnType<typeof loadChanges>>, key: string) => items.find((i) => i.key === key)

describe('loadChanges', () => {
  it('lists everything as added before the first snapshot', async () => {
    const k = await makeKit()
    const items = await loadChanges(k.engine, k.io)
    expect(items.map((i) => i.key)).toEqual(['node:ch1', 'node:s1', 'node:s2', 'node:s3', 'settings'])
    expect(items.every((i) => i.kinds.includes('added'))).toBe(true)
  })

  it('is empty right after Snapshot all', async () => {
    const k = await makeKit()
    await snap(k)
    expect(await loadChanges(k.engine, k.io)).toEqual([])
  })

  it('reports an edited scene as modified with its chapter as context', async () => {
    const k = await makeKit()
    await snap(k)
    await k.scene('s2', 's2-2')
    const [item, ...rest] = await loadChanges(k.engine, k.io)
    expect(rest).toEqual([])
    expect(item).toMatchObject({ key: 'node:s2', type: 'scene', title: 'Scene 2', kinds: ['modified'], context: ['Chapter 1'], paths: ['manuscript/s2.json'] })
  })

  it('reports an added scene and a deleted scene', async () => {
    const k = await makeKit()
    await snap(k)
    k.manifest.manuscript[0].children = [k.manifest.manuscript[0].children[0], sceneNode('s4', 'Scene 4')]
    await k.save()
    await k.scene('s4', 's4-1')
    await k.io.remove('manuscript/s2.json')
    const items = await loadChanges(k.engine, k.io)
    expect(find(items, 'node:s4')?.kinds).toEqual(['added'])
    expect(find(items, 'node:s2')?.kinds).toEqual(['deleted'])
    expect(find(items, 'node:s3')?.kinds).toEqual(['deleted'])
    expect(find(items, 'node:s1')).toBeUndefined()
  })

  it('reports a rename from the manifest even though no scene file changed', async () => {
    const k = await makeKit()
    await snap(k)
    k.manifest.manuscript[0].title = 'The Quay'
    await k.save()
    const items = await loadChanges(k.engine, k.io)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ key: 'node:ch1', type: 'chapter', kinds: ['renamed'], title: 'The Quay', paths: [] })
  })

  it('flags only the scene that moved, not its neighbours', async () => {
    const k = await makeKit()
    await snap(k)
    const [s1, s2, s3] = k.manifest.manuscript[0].children
    k.manifest.manuscript[0].children = [s3, s1, s2]
    await k.save()
    const items = await loadChanges(k.engine, k.io)
    expect(items.map((i) => [i.key, i.kinds])).toEqual([['node:s3', ['moved']]])
  })

  it('flags a scene moved to another chapter', async () => {
    const k = await makeKit()
    k.manifest.manuscript.push(chapterNode('ch2', 'Chapter 2'))
    await k.save()
    await snap(k)
    const s3 = k.manifest.manuscript[0].children.pop()!
    k.manifest.manuscript[1].children.push(s3)
    await k.save()
    const items = await loadChanges(k.engine, k.io)
    expect(items.map((i) => [i.key, i.kinds, i.context])).toEqual([['node:s3', ['moved'], ['Chapter 2']]])
  })

  it('shows trashed items as deleted and ignores the trash list itself', async () => {
    const k = await makeKit()
    await snap(k)
    k.manifest.manuscript[0].children.pop()
    k.manifest.trash.push({ id: 's3', type: 'scene', title: 'Scene 3', originalPath: 'manuscript/s3.json', trashPath: '.storyworks/trash/s3.json', parentId: 'ch1', index: 2, deletedAt: 'x' })
    await k.save()
    await k.io.rename('manuscript/s3.json', '.storyworks/trash/s3.json')
    const items = await loadChanges(k.engine, k.io)
    expect(items.map((i) => [i.key, i.kinds])).toEqual([['node:s3', ['deleted']]])
  })

  it('reports book settings changes as one item', async () => {
    const k = await makeKit()
    await snap(k)
    k.manifest.title = 'New title'
    await k.save()
    const items = await loadChanges(k.engine, k.io)
    expect(items.map((i) => [i.key, i.kinds])).toEqual([['settings', ['modified']]])
  })

  it('tracks assets, ignores .storyworks and unlisted files', async () => {
    const k = await makeKit()
    await snap(k)
    await k.io.writeTextAtomic('assets/a.png', 'img')
    await k.io.writeTextAtomic('.storyworks/lock', 'x')
    await k.io.writeTextAtomic('README.md', 'user file')
    const items = await loadChanges(k.engine, k.io)
    expect(items.map((i) => [i.key, i.type, i.kinds, i.title])).toEqual([['file:assets/a.png', 'asset', ['added'], 'a.png']])
  })

  it('reports a list item (rule) with its file', async () => {
    const k = await makeKit()
    k.manifest.rules = [{ id: 'r1', path: 'rules/r1.json', title: 'No magic' }]
    await k.save()
    await k.io.writeTextAtomic('rules/r1.json', 'r1')
    await snap(k)
    await k.io.writeTextAtomic('rules/r1.json', 'r1b')
    const items = await loadChanges(k.engine, k.io)
    expect(items[0]).toMatchObject({ key: 'rule:r1', type: 'rule', title: 'No magic', kinds: ['modified'] })
  })

  it('throws a clear error when the saved manifest is broken', async () => {
    const k = await makeKit()
    await snap(k)
    await k.io.writeTextAtomic('project.json', 'not json')
    await expect(loadChanges(k.engine, k.io)).rejects.toMatchObject({ code: 'manifest' })
  })

  it('throws a corrupt error when the last snapshot has an unreadable manifest', async () => {
    const k = await makeKit()
    await k.engine.commit({ message: 'bad', include: [], overrides: { 'project.json': new TextEncoder().encode('{{') } })
    await expect(loadChanges(k.engine, k.io)).rejects.toMatchObject({ code: 'corrupt' })
  })
})
