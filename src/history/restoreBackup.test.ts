import { describe, expect, it } from 'vitest'
import { makeBackup } from './backups'
import { folderSource } from './folderSource'
import { restoreBackup } from './restore'
import { makeKit, sceneNode } from './testKit'

describe('folderSource', () => {
  it('lists and reads files relative to the backup folder', async () => {
    const k = await makeKit()
    const name = await makeBackup(k.io, k.env, 'auto')
    const src = folderSource(k.io, `.storyworks/backups/${name}`)
    const tree = await src.listTree(name)
    expect(tree).toContain('project.json')
    expect(tree).toContain('manuscript/s1.json')
    expect(new TextDecoder().decode((await src.readFile(name, 'manuscript/s1.json'))!)).toBe('s1-1')
    expect(await src.readFile(name, 'nope.json')).toBeNull()
  })
})

describe('restoreBackup', () => {
  it('returns files, trashes newer items and makes the safety backup first', async () => {
    const k = await makeKit()
    const name = await makeBackup(k.io, k.env, 'auto')
    await k.scene('s1', 'edited later')
    k.manifest.manuscript[0].children.push(sceneNode('s9', 'New'))
    await k.save()
    await k.scene('s9', 's9-1')
    const calls: string[] = []
    const r = await restoreBackup(k.io, name, {
      env: k.env,
      readOnly: false,
      makeSafetyBackup: async () => { calls.push('backup'); return 'safety-1' },
    })
    expect(calls).toEqual(['backup'])
    expect(k.text('manuscript/s1.json')).toBe('s1-1')
    expect(k.text('manuscript/s9.json')).toBeUndefined()
    expect(r.trashed).toContain('manuscript/s9.json')
    const m = JSON.parse(k.text('project.json')!)
    expect(m.manuscript[0].children.map((c: { id: string }) => c.id)).toEqual(['s1', 's2', 's3'])
    expect(m.trash.map((t: { id: string }) => t.id)).toContain('s9')
  })

  it('is refused when read-only and when the backup folder does not exist', async () => {
    const k = await makeKit()
    const name = await makeBackup(k.io, k.env, 'auto')
    const deps = { env: k.env, readOnly: false, makeSafetyBackup: async () => 'x' }
    await expect(restoreBackup(k.io, name, { ...deps, readOnly: true })).rejects.toMatchObject({ code: 'read-only' })
    await expect(restoreBackup(k.io, 'auto-missing', deps)).rejects.toMatchObject({ code: 'invalid' })
  })
})
